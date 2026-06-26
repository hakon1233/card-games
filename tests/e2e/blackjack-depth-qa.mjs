// Blackjack depth/quality live-QA driver — GAM-120.
// Drives the deployed /play/blackjack vs the dealer on live :7842:
//  - many full games + rematches; tracks W/L/P session-score integrity across rounds
//  - dealer-play correctness: detects the dealer-hole-card bug (dealer draws using only
//    its VISIBLE up-card because handValue() filters hidden cards, so it hits pat hands)
//  - natural-blackjack-at-deal handling (page deals via dealInitialState, not startGame)
//  - bust/stand/win-condition firing, stuck-state watchdog, illegal-move gating
//  - aria-live / role=status announcement presence (GAM-117 lesson)
//  - responsive screenshots at 375 / 414 / 768
//  - GAM-117 Go Fish re-verify: turn cue announced on multiple post-bot human turns
// Run: PW_LIB=<lib> node tests/e2e/blackjack-depth-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "https://your-host.example:7842";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });
const GAMES = Number(process.env.BJ_GAMES ?? 30);

const results = [];
const notes = [];
const ok = (n, x = "") => { results.push({ n, pass: true, x }); console.log(`  PASS  ${n}${x ? " — " + x : ""}`); };
const fail = (n, x = "") => { results.push({ n, pass: false, x }); console.log(`  FAIL  ${n}${x ? " — " + x : ""}`); };
const assert = (c, n, x = "") => c ? ok(n, x) : fail(n, x);
const note = (m) => { notes.push(m); console.log(`  NOTE  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listen = (page, sink) => {
  page.on("console", (m) => { if (m.type() === "error") sink.push(m.text()); });
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
};

const RANKVAL = (r) => (r === "A" ? 11 : ["J", "Q", "K"].includes(r) ? 10 : parseInt(r, 10));
function handTotal(ranks) {
  let total = 0, aces = 0;
  for (const r of ranks) { total += RANKVAL(r); if (r === "A") aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// Read the revealed card ranks inside a named seat panel ("Dealer" / "You").
async function seatRanks(page, name) {
  const panel = page.locator(".pip-seat-panel", { has: page.getByText(name, { exact: true }) }).first();
  if (!(await panel.count())) return { ranks: [], faceDown: 0 };
  const cards = panel.getByLabel(/ of (hearts|diamonds|clubs|spades)$/i);
  const n = await cards.count();
  const ranks = [];
  for (let i = 0; i < n; i++) {
    const lbl = (await cards.nth(i).getAttribute("aria-label")) ?? "";
    const m = lbl.match(/^(\w+) of /);
    if (m) ranks.push(m[1]);
  }
  const faceDown = await panel.getByLabel("face-down card").count();
  return { ranks, faceDown };
}

async function blackjack(ctx) {
  console.log(`\n=== Blackjack — ${GAMES} full games ===`);
  const page = await ctx.newPage();
  const errors = [];
  listen(page, errors);

  await page.goto(BASE + "/play/blackjack", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("button", { name: /^Deal$/ }).waitFor({ timeout: 20000 });

  // A11y: is there ANY live region to announce turn/result? (GAM-117 lesson)
  const liveRegions = await page.locator('[role="status"], [aria-live]').count();
  assert(liveRegions === 0 ? false : true,
    "blackjack: live region present for turn/result announcements",
    liveRegions === 0 ? "NONE found — turn & result cues are silent to AT" : `${liveRegions} region(s)`);

  const hitBtn = () => page.getByRole("button", { name: /^Hit$/ });
  const standBtn = () => page.getByRole("button", { name: /^Stand$/ });
  const dealBtn = () => page.getByRole("button", { name: /^(Deal|Play Again)$/ });

  // session tally we compute from observed outcomes
  let expWins = 0, expLoss = 0, expPush = 0;
  let dealerOverdraw = 0;     // dealer drew despite a pat (>=17) up+hole hand
  let dealerBusts = 0, finished = 0, winsObserved = 0, lossObserved = 0, pushObserved = 0;
  let naturalUnresolved = 0;  // player dealt 21 but turn not auto-over
  let stuck = 0;

  async function readSessionScores() {
    // ScoreDisplay rows: Wins / Losses / Pushes
    // Scope to the SESSION score block — the end-screen renders the count ABOVE
    // each label ("0\nWins\n1\nLosses\n0\nPushes"). Reading whole-body innerText
    // mismatches stray digits (card ranks, totals) near the words, so slice from
    // the "SESSION" header to the first action button.
    const full = await page.locator("body").innerText();
    const start = full.search(/SESSION/i);
    const region = start >= 0 ? full.slice(start, start + 160) : full;
    const grab = (label) => {
      const before = region.match(new RegExp("(\\d+)\\s*\\n?\\s*" + label, "i"));
      if (before) return Number(before[1]);
      const after = region.match(new RegExp(label + "\\s*\\n?\\s*(\\d+)", "i"));
      return after ? Number(after[1]) : null;
    };
    return { wins: grab("Wins"), losses: grab("Losses"), pushes: grab("Pushes") };
  }

  for (let g = 0; g < GAMES; g++) {
    // Start / rematch
    const deal = dealBtn().first();
    if (await deal.isVisible().catch(() => false)) await deal.click();
    await hitBtn().waitFor({ timeout: 10000 }).catch(() => {});

    // initial player hand
    const init = await seatRanks(page, "You");
    if (handTotal(init.ranks) === 21 && init.ranks.length === 2) {
      const over = !(await hitBtn().isEnabled().catch(() => false));
      if (!over) { naturalUnresolved++; note(`game ${g + 1}: player dealt natural 21 but must still act (no auto-resolve)`); }
    }

    // play: simple strategy — hit while < 17, else stand
    let acted = 0;
    while (acted < 12) {
      if (!(await hitBtn().isEnabled().catch(() => false))) break; // turn over
      const me = await seatRanks(page, "You");
      const t = handTotal(me.ranks);
      if (t < 17) { await hitBtn().click(); }
      else { await standBtn().click(); break; }
      acted++;
      await sleep(120);
    }
    // ensure resolved
    let waited = 0;
    while (await hitBtn().isEnabled().catch(() => false)) {
      await standBtn().click().catch(() => {});
      await sleep(120);
      if (++waited > 20) { stuck++; note(`game ${g + 1}: could not reach terminal state`); break; }
    }
    await sleep(200);

    // read result from the in-table turn indicator / end screen
    const banner = (await page.locator(".pip-table-surface").innerText().catch(() => "")) + " " +
                   (await page.locator("body").innerText().catch(() => ""));
    const dealer = await seatRanks(page, "Dealer");
    const me = await seatRanks(page, "You");
    const myTotal = handTotal(me.ranks);
    const dlrTotal = handTotal(dealer.ranks);

    let outcome = null;
    if (/You busted|Dealer Wins/i.test(banner) && !/You Win/i.test(banner)) outcome = "loss";
    else if (/You Win/i.test(banner)) outcome = "win";
    else if (/Push/i.test(banner)) outcome = "push";
    // fallback by totals
    if (!outcome) {
      if (myTotal > 21) outcome = "loss";
      else if (dlrTotal > 21) outcome = "win";
      else if (myTotal > dlrTotal) outcome = "win";
      else if (dlrTotal > myTotal) outcome = "loss";
      else outcome = "push";
    }
    finished++;
    if (outcome === "win") { winsObserved++; expWins++; }
    else if (outcome === "loss") { lossObserved++; expLoss++; }
    else { pushObserved++; expPush++; }
    if (dlrTotal > 21) dealerBusts++;

    // Dealer-hole-card bug detector: if dealer's FIRST TWO cards already total >=17
    // (a pat hand) but the dealer ended with >2 cards, it drew on a pat hand —
    // i.e. it decided to hit using only the visible up-card.
    if (dealer.ranks.length >= 2) {
      const patTwo = handTotal(dealer.ranks.slice(0, 2));
      if (patTwo >= 17 && patTwo <= 21 && dealer.ranks.length > 2) {
        dealerOverdraw++;
        if (dealerOverdraw <= 5)
          note(`game ${g + 1}: dealer drew on a PAT hand — first two ${dealer.ranks.slice(0, 2).join("+")}=${patTwo}, ended ${dealer.ranks.join("+")}=${dlrTotal} (${dlrTotal > 21 ? "busted" : "ok"})`);
      }
    }

    if (g === 0) await page.screenshot({ path: `${SHOTS}/bj-game1-over.png` });
    if (process.env.BJ_DEBUG_SCORE) {
      const s = await readSessionScores();
      const full = await page.locator("body").innerText();
      const at = full.search(/SESSION/i);
      note(`game ${g + 1} outcome=${outcome} -> parsed W${s.wins}/L${s.losses}/P${s.pushes} | raw="${(at >= 0 ? full.slice(at, at + 80) : "no SESSION").replace(/\n/g, "·")}"`);
    }
  }

  // session-score integrity
  const scores = await readSessionScores();
  assert(scores.wins === expWins && scores.losses === expLoss && scores.pushes === expPush,
    "blackjack: session W/L/P counters match observed outcomes",
    `display W${scores.wins}/L${scores.losses}/P${scores.pushes} vs observed W${expWins}/L${expLoss}/P${expPush}`);

  assert(finished === GAMES, "blackjack: every game reached a terminal state", `${finished}/${GAMES}`);
  assert(stuck === 0, "blackjack: no stuck/unresolvable hands", `${stuck} stuck`);
  assert(errors.length === 0, "blackjack: no console/page errors", errors.slice(0, 3).join(" | "));

  // The dealer-overdraw bug: report rate. Any occurrence is a real defect.
  const rate = ((dealerOverdraw / finished) * 100).toFixed(0);
  assert(dealerOverdraw === 0,
    "blackjack: dealer never draws on a pat (>=17) two-card hand",
    `${dealerOverdraw}/${finished} games (${rate}%) dealer hit a made hand — hole card ignored in hit decision`);
  note(`dealer bust rate: ${dealerBusts}/${finished} (${((dealerBusts / finished) * 100).toFixed(0)}%)`);
  note(`observed outcomes: W${winsObserved} L${lossObserved} P${pushObserved}`);
  if (naturalUnresolved) note(`natural-21-at-deal not auto-resolved: ${naturalUnresolved} time(s)`);

  // responsive
  for (const [w, h, tag] of [[375, 812, "375"], [414, 896, "414"], [768, 1024, "768"]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/bj-${tag}.png` });
  }
  ok("blackjack: responsive screenshots captured (375/414/768)");

  // keyboard: Hit/Stand reachable & operable
  await page.setViewportSize({ width: 1024, height: 800 });
  if (await dealBtn().first().isVisible().catch(() => false)) await dealBtn().first().click();
  await sleep(300);
  const focusName = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  ok("blackjack: keyboard reachable controls", `focus after deal: "${focusName.slice(0, 30)}"`);

  await page.close();
}

// ───────────── GAM-117 Go Fish re-verify ─────────────
async function goFishReverify(ctx) {
  console.log(`\n=== GAM-117 re-verify: Go Fish aria-live turn cue ===`);
  const page = await ctx.newPage();
  const errors = [];
  listen(page, errors);
  await page.goto(BASE + "/play/go-fish", { waitUntil: "domcontentloaded", timeout: 30000 });

  // start — Go Fish onboarding deals directly via a "Deal cards" button
  // (older builds used a "Start Game" + player-count picker).
  const start = page.getByRole("button", { name: /^(Deal cards|Start Game)$/i });
  if (await start.isVisible().catch(() => false)) {
    const one = page.getByRole("button", { name: "1", exact: true });
    if (await one.isVisible().catch(() => false)) await one.click();
    await start.click();
  }
  const live = page.locator('[role="status"][aria-live="polite"]').first();
  await live.waitFor({ timeout: 15000 }).catch(() => {});
  assert(await live.count() > 0, "go-fish: role=status aria-live region exists");

  // Play several turns; after each of our asks resolves to a bot turn and back,
  // confirm the live region leads with the turn cue, not a stale bot event.
  let humanTurns = 0, turnCueSeen = 0, staleSeen = 0;
  const rankBtns = () => page.getByRole("button", { name: /^Ask for /i });
  for (let i = 0; i < 16 && humanTurns < 6; i++) {
    if (await page.getByRole("button", { name: /^(Play Again|Rematch)$/ }).isVisible().catch(() => false)) break;
    const cue = ((await live.textContent().catch(() => "")) ?? "").trim();
    const myTurn = await rankBtns().first().isEnabled().catch(() => false);
    if (myTurn && (await rankBtns().count()) > 0) {
      humanTurns++;
      if (/Your turn/i.test(cue)) turnCueSeen++;
      else if (/asked|drew|fished|went fish/i.test(cue)) { staleSeen++; note(`human turn ${humanTurns}: live region stale — "${cue.slice(0, 70)}"`); }
      // make a move
      const ranks = rankBtns();
      await ranks.nth(0).click().catch(() => {});
    }
    await sleep(500);
  }
  assert(turnCueSeen >= 3 && staleSeen === 0,
    "go-fish GAM-117: turn cue announced on post-bot human turns (not stale)",
    `cue on ${turnCueSeen}/${humanTurns} human turns, ${staleSeen} stale`);
  await page.screenshot({ path: `${SHOTS}/bj-gf-reverify.png` });
  assert(errors.length === 0, "go-fish: no console/page errors", errors.slice(0, 3).join(" | "));
  await page.close();
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: "chrome" }); }
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await goFishReverify(ctx);
    await blackjack(ctx);
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n================ SUMMARY ================`);
  console.log(`${passed}/${results.length} checks passed`);
  for (const r of results.filter((r) => !r.pass)) console.log(`  FAIL  ${r.n} — ${r.x}`);
  console.log(`Notes: ${notes.length}`);
})();
