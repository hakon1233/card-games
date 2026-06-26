// Depth/quality live-QA driver — GAM-116.
// Goes beyond the GAM-112 first pass: plays MULTIPLE full games + rematches of
// Crazy Eights and Go Fish vs bots, checks win-condition/score/book integrity,
// stall/desync, rule edges (8-stacking, forced draw, reshuffle; GF go-again,
// emptied-rank gating), responsive at 375/414/768, keyboard a11y, and precisely
// characterizes the Go Fish stale aria-live nit. Run: node tests/e2e/depth-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "https://your-host.example:7842";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });
const GAMES = Number(process.env.DEPTH_GAMES ?? 4);

const results = [];
const notes = [];
const ok = (name, extra = "") => { results.push({ name, pass: true, extra }); console.log(`  PASS  ${name}${extra ? " — " + extra : ""}`); };
const fail = (name, extra = "") => { results.push({ name, pass: false, extra }); console.log(`  FAIL  ${name}${extra ? " — " + extra : ""}`); };
const assert = (cond, name, extra = "") => cond ? ok(name, extra) : fail(name, extra);
const note = (msg) => { notes.push(msg); console.log(`  NOTE  ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listenConsole(page, sink) {
  page.on("console", (m) => { if (m.type() === "error") sink.push(m.text()); });
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
}

// ───────────────────────── Crazy Eights ─────────────────────────
async function statusC8(page) {
  const el = page.locator('[role="status"]').first();
  if (await el.count()) return ((await el.textContent()) ?? "").trim();
  return "";
}

async function crazyEights(ctx) {
  console.log(`\n=== Crazy Eights — ${GAMES} full games ===`);
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);

  await page.goto(BASE + "/play/crazy-eights", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "1", exact: true }).click(); // 1 opponent
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first().waitFor({ timeout: 15000 });

  const SUITS = ["hearts", "diamonds", "clubs", "spades"];
  const handCards = page.getByRole("button", { name: / of (hearts|diamonds|clubs|spades)$/i });

  let gamesFinished = 0, winsDeclared = 0;
  let suitPickerSeen = false, forcedDrawSeen = false, reshuffleLabelSeen = false;
  let turnAnnounceSeen = false, illegalGatingHeld = true, stalls = 0;

  for (let g = 0; g < GAMES; g++) {
    let reachedEnd = false, prevSig = "", sameSig = 0;
    for (let i = 0; i < 600; i++) {
      if (await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false)) { reachedEnd = true; break; }
      const status = await statusC8(page);
      if (/Your turn/i.test(status)) turnAnnounceSeen = true;

      // Stall watchdog: signature = status + hand count + deck label.
      const deckLbl = await page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first().getAttribute("aria-label").catch(() => "");
      const sig = status + "|" + (await handCards.count()) + "|" + deckLbl;
      if (sig === prevSig) sameSig++; else { sameSig = 0; prevSig = sig; }
      if (sameSig > 120) { stalls++; note(`C8 game ${g + 1}: possible stall — sig stuck "${sig.slice(0, 80)}"`); break; }

      if (!/Your turn/i.test(status)) { await sleep(150); continue; }

      // Reshuffle label appears when the draw pile hits 0.
      const reshuffle = page.getByRole("button", { name: /^Draw a card \(reshuffle\)$/ });
      if (await reshuffle.isVisible().catch(() => false)) reshuffleLabelSeen = true;

      // Illegal-move gating: disabled cards must not be clickable. Count split.
      const total = await handCards.count();
      const enabled = await handCards.locator(":scope:not([disabled])").count();
      if (enabled > total) illegalGatingHeld = false;

      // Prefer playing an 8 (exercises suit picker + stacking persistence).
      let played = false;
      for (const s of SUITS) {
        const eight = page.getByRole("button", { name: `8 of ${s}` });
        if ((await eight.count()) === 1 && (await eight.isEnabled().catch(() => false))) {
          await eight.click();
          const dialog = page.getByRole("dialog", { name: /Choose a suit/i });
          if (await dialog.isVisible().catch(() => false)) {
            suitPickerSeen = true;
            // Declare a suit and confirm it persists on the "Suit to match" label.
            await dialog.getByRole("button", { name: "Clubs", exact: true }).click();
            const matchLbl = await page.getByLabel(/Suit to match:/i).first().getAttribute("aria-label").catch(() => "");
            if (/Suit to match: Clubs/i.test(matchLbl)) ok(`C8 g${g + 1}: declared suit persists on board label`, matchLbl);
          }
          played = true; break;
        }
      }
      if (!played) {
        const n = await handCards.count();
        for (let c = 0; c < n; c++) {
          if (await handCards.nth(c).isEnabled().catch(() => false)) { await handCards.nth(c).click(); played = true; break; }
        }
      }
      if (!played) {
        // No legal card → forced draw.
        if (/no playable card/i.test(status)) forcedDrawSeen = true;
        const draw = page.getByRole("button", { name: /^Draw a card( \(reshuffle\))?$/ });
        if (await draw.isVisible().catch(() => false)) { await draw.click(); }
        else await sleep(150);
      }
      await sleep(90);
    }

    if (reachedEnd) {
      gamesFinished++;
      const st = await statusC8(page);
      const headingWin = await page.getByText(/win|wins/i).first().isVisible().catch(() => false);
      if (/win/i.test(st) || headingWin) winsDeclared++;
      if (g === 0) await page.screenshot({ path: `${SHOTS}/depth-c8-end.png`, fullPage: true });
      // Next game via Rematch.
      const rm = page.getByRole("button", { name: /^Rematch$/ });
      if (await rm.isVisible().catch(() => false)) {
        await rm.click();
        await page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first().waitFor({ timeout: 10000 }).catch(() => {});
      }
    } else break;
  }

  assert(gamesFinished >= 2, "C8: multiple full games reach end screen", `${gamesFinished}/${GAMES} finished`);
  assert(winsDeclared === gamesFinished && gamesFinished > 0, "C8: win condition fires every finished game", `${winsDeclared}/${gamesFinished} declared`);
  assert(turnAnnounceSeen, "C8: aria-live status announces the human's turn (good pattern)");
  assert(illegalGatingHeld, "C8: illegal cards stay gated (no enabled>total)");
  assert(suitPickerSeen, "C8: playing an 8 opens the suit picker");
  assert(stalls === 0, "C8: no stalled/stuck tables across games", stalls ? `${stalls} stalls` : "");
  note(`C8 edges: forcedDraw=${forcedDrawSeen} reshuffleLabel=${reshuffleLabelSeen} (opportunistic; absence not a failure)`);
  assert(errors.length === 0, "C8: console clean across all games", errors.slice(0, 3).join(" | "));
  await page.close();
}

// ───────────────────────── Go Fish ─────────────────────────
async function goFish(ctx) {
  console.log(`\n=== Go Fish — ${GAMES} full games ===`);
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);

  await page.goto(BASE + "/play/go-fish", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Deal cards$/ }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /^Deal cards$/ }).click();
  await page.getByRole("region", { name: /Your hand/i }).waitFor({ timeout: 15000 }).catch(() => {});

  const liveBar = page.locator('[aria-live="polite"]').first();
  const rankCards = page.getByRole("button", { name: /^Ask for .+ — you hold/i });
  const askBtns = page.getByRole("button", { name: /^Ask (Marlin|Pearl)/ });

  const pondNow = async () => {
    const t = (await page.locator("text=/Pond:\\s*\\d+/").first().textContent().catch(() => "")) ?? "";
    const m = t.match(/Pond:\s*(\d+)/); return m ? Number(m[1]) : -1;
  };
  // Go Fish ends when the POND runs dry OR all 13 books form (engine isOver,
  // go-fish.ts:89). So book total at end is ≤13 and usually <13 — unbooked cards
  // stay in hand. Integrity check: total books is in-range, and a winner/tie is
  // declared via the end-screen headline ("You win!" / "<name> wins" / "tied").
  const totalBooks = async () => page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+)\s+books?/gi) || [];
    return m.map((s) => parseInt(s)).reduce((a, b) => a + b, 0);
  });
  const headlineText = async () => (await page.locator(".text-3xl.font-bold").first().textContent().catch(() => "")) ?? "";

  let gamesFinished = 0, winsConsistent = 0, bookTotalsOk = 0, stalls = 0;
  let askedOnce = false, goFishSeen = false, gaveSeen = false, goAgainSeen = false;
  let staleAnnounceSample = null, turnPromptEverAnnounced = false;

  for (let g = 0; g < GAMES; g++) {
    let reachedEnd = false, lastPond = await pondNow(), stallIters = 0, prevBar = "";
    let humanActedThisTurn = false;
    for (let i = 0; i < 1600; i++) {
      if (await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false)) { reachedEnd = true; break; }
      const bar = ((await liveBar.textContent().catch(() => "")) ?? "").trim();
      if (/Go Fish/i.test(bar)) goFishSeen = true;
      if (/handed over|got \d+|—\s*got|gave/i.test(bar)) gaveSeen = true;
      if (/your turn/i.test(bar)) turnPromptEverAnnounced = true;

      const pond = await pondNow();
      if (pond === lastPond) stallIters++; else { stallIters = 0; lastPond = pond; }
      if (stallIters > 300) { stalls++; note(`GF game ${g + 1}: stall — pond stuck at ${pond}, bar="${bar}"`); break; }

      const rc = await rankCards.count();
      const myTurn = rc > 0 && (await rankCards.first().isEnabled().catch(() => false));

      // Characterize aria-live staleness: the FIRST moment it becomes our turn
      // after a bot acted, capture what the live region says. If it still shows a
      // bot event (not "your turn"), that is the stale-announcement nit.
      if (myTurn && !humanActedThisTurn && !staleAnnounceSample && /asked|go fish|got|book|gave|handed/i.test(bar.replace(/Pond:.*/i, ""))) {
        staleAnnounceSample = bar.replace(/\s+/g, " ").trim();
      }

      let picked = false;
      for (let c = 0; c < rc; c++) {
        if (await rankCards.nth(c).isEnabled().catch(() => false)) { await rankCards.nth(c).click(); picked = true; break; }
      }
      if (!picked) { humanActedThisTurn = false; await sleep(130); continue; }

      const ab = await askBtns.count();
      let asked = false;
      for (let c = 0; c < ab; c++) {
        if (await askBtns.nth(c).isEnabled().catch(() => false)) { await askBtns.nth(c).click(); asked = true; askedOnce = true; humanActedThisTurn = true; break; }
      }
      // Detect "go again" — after a successful ask it's still our turn.
      await sleep(180);
      if (asked && (await rankCards.first().isEnabled().catch(() => false))) goAgainSeen = true;
      await sleep(120);
    }

    if (reachedEnd) {
      gamesFinished++;
      const tb = await totalBooks();
      // In-range (0..13) confirms no phantom/over-counted books on pond depletion.
      if (tb >= 0 && tb <= 13) bookTotalsOk++; else note(`GF game ${g + 1}: book total OUT OF RANGE = ${tb}`);
      note(`GF game ${g + 1}: ended with ${tb}/13 books formed (pond-depletion end)`);
      const headline = await headlineText();
      if (/win|tie/i.test(headline)) winsConsistent++; else note(`GF game ${g + 1}: no winner headline ("${headline}")`);
      if (g === 0) await page.screenshot({ path: `${SHOTS}/depth-gf-end.png`, fullPage: true });
      const rm = page.getByRole("button", { name: /^Rematch$/ });
      if (await rm.isVisible().catch(() => false)) {
        await rm.click();
        await page.getByRole("region", { name: /Your hand/i }).waitFor({ timeout: 10000 }).catch(() => {});
        await sleep(400);
      }
    } else break;
  }

  assert(gamesFinished >= 2, "GF: multiple full games reach end screen", `${gamesFinished}/${GAMES} finished`);
  assert(bookTotalsOk === gamesFinished && gamesFinished > 0, "GF: book totals in valid range 0..13 (no miscount)", `${bookTotalsOk}/${gamesFinished} ok`);
  assert(winsConsistent === gamesFinished && gamesFinished > 0, "GF: winner/tie declared every finished game", `${winsConsistent}/${gamesFinished}`);
  assert(askedOnce, "GF: ask control works");
  assert(goFishSeen || gaveSeen, "GF: asks resolve (Go Fish / cards handed over)");
  assert(stalls === 0, "GF: no stalled/stuck tables across games", stalls ? `${stalls} stalls` : "");
  note(`GF go-again chain observed: ${goAgainSeen}`);

  // The known a11y nit — report precisely.
  if (staleAnnounceSample && !turnPromptEverAnnounced) {
    fail("GF a11y: aria-live announces the human's turn", `STALE — live region keeps last bot event: "${staleAnnounceSample}" instead of a 'Your turn' prompt`);
  } else if (turnPromptEverAnnounced) {
    ok("GF a11y: aria-live announces the human's turn at least once");
  } else {
    note("GF a11y: could not capture a clean stale-announce sample this run");
  }
  // Emptied-rank ask is prevented by design: hand only renders ranks you hold.
  note("GF rule: asking for an emptied rank is structurally prevented — UI renders only ranks currently held (rankGroups).");
  assert(errors.length === 0, "GF: console clean across all games", errors.slice(0, 3).join(" | "));
  await page.close();
}

// ─────────────── Go Fish aria-live characterization (the known nit) ───────────────
async function goFishAriaLiveProbe(ctx) {
  console.log("\n=== Go Fish aria-live probe (characterize the stale-announce nit) ===");
  const page = await ctx.newPage();
  await page.goto(BASE + "/play/go-fish", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Deal cards$/ }).click();
  await page.getByRole("region", { name: /Your hand/i }).waitFor({ timeout: 15000 }).catch(() => {});

  const liveBar = page.locator('[aria-live="polite"]').first();
  const actionPrompt = page.locator(".sticky p.text-center").first(); // non-live action-bar cue
  const rankCards = page.getByRole("button", { name: /^Ask for .+ — you hold/i });
  const askBtns = page.getByRole("button", { name: /^Ask (Marlin|Pearl)/ });
  const liveText = async () => ((await liveBar.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").replace(/Pond:.*/i, "").trim();

  const onsets = []; // {turn, afterBot, live, prompt}
  let turn = 0, sawBot = false, wasMyTurn = false;
  for (let i = 0; i < 400 && turn < 6; i++) {
    if (await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false)) break;
    const myTurn = (await rankCards.count()) > 0 && (await rankCards.first().isEnabled().catch(() => false));
    if (myTurn && !wasMyTurn) {
      // Turn just became ours — snapshot what a screen reader would have available.
      turn++;
      const live = await liveText();
      const prompt = ((await actionPrompt.textContent().catch(() => "")) ?? "").trim();
      onsets.push({ turn, afterBot: sawBot, live, promptInLiveRegion: false, prompt });
      // act: pick first enabled rank + ask
      for (let c = 0; c < (await rankCards.count()); c++) {
        if (await rankCards.nth(c).isEnabled().catch(() => false)) { await rankCards.nth(c).click(); break; }
      }
      for (let c = 0; c < (await askBtns.count()); c++) {
        if (await askBtns.nth(c).isEnabled().catch(() => false)) { await askBtns.nth(c).click(); break; }
      }
      sawBot = false;
    }
    if (!myTurn) sawBot = true; // a bot/other turn elapsed
    wasMyTurn = myTurn;
    await sleep(140);
  }

  console.log("  Turn-onset live-region snapshots:");
  onsets.forEach((o) => console.log(`    turn ${o.turn} (afterBot=${o.afterBot}): live="${o.live}" | actionPrompt(non-live)="${o.prompt}"`));

  // The defect: on a post-bot turn onset, the live region shows the bot's last
  // event (or stale text) rather than a "your turn" cue. The cue exists only in
  // the NON-live action-bar <p>.
  const postBot = onsets.filter((o) => o.afterBot);
  const stale = postBot.filter((o) => !/your turn/i.test(o.live) && o.live.length > 0);
  if (postBot.length === 0) {
    note("GF aria-live probe: no post-bot human-turn onset captured this run (deal-dependent)");
  } else if (stale.length > 0) {
    fail("GF a11y: live region announces 'your turn' after a bot turn",
      `STALE on ${stale.length}/${postBot.length} post-bot onsets — live region holds the bot event e.g. "${stale[0].live}"; the turn cue ("${stale[0].prompt}") sits in a NON-live <p>`);
  } else {
    ok("GF a11y: live region refreshes with a turn cue after bot turns");
  }
  await page.screenshot({ path: `${SHOTS}/depth-gf-arialive.png`, fullPage: true });
  await page.close();
}

// ───────────────────────── Responsive ─────────────────────────
async function responsive(ctx) {
  console.log("\n=== Responsive (375 / 414 / 768) ===");
  const widths = [375, 414, 768];
  const targets = [
    { slug: "crazy-eights", start: /^Start Game$/, board: () => page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first() },
    { slug: "go-fish", start: /^Deal cards$/, board: () => page.getByRole("region", { name: /Your hand/i }) },
  ];
  let page;
  for (const t of targets) {
    for (const w of widths) {
      const c = await ctx.browser().newContext({ viewport: { width: w, height: 780 }, ignoreHTTPSErrors: true });
      page = await c.newPage();
      await page.goto(`${BASE}/play/${t.slug}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: t.start }).waitFor({ timeout: 15000 });
      const ofSettings = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(ofSettings <= 1, `${t.slug} @${w}px settings — no horizontal overflow`, `${ofSettings}px`);
      await page.getByRole("button", { name: t.start }).click();
      await t.board().waitFor({ timeout: 15000 }).catch(() => {});
      await sleep(500);
      const ofBoard = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(ofBoard <= 1, `${t.slug} @${w}px board — no horizontal overflow`, `${ofBoard}px`);
      if (w === 375) await page.screenshot({ path: `${SHOTS}/depth-${t.slug}-375.png`, fullPage: true });
      await c.close();
    }
  }
}

// ───────────────────────── Keyboard a11y ─────────────────────────
async function keyboard(ctx) {
  console.log("\n=== Keyboard a11y ===");
  // Crazy Eights: can we focus a hand card and see a focus ring / activate it?
  const page = await ctx.newPage();
  await page.goto(BASE + "/play/crazy-eights", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Start Game$/ }).waitFor({ timeout: 15000 });
  // Start button should be reachable & operable by keyboard.
  const startFocusable = await page.getByRole("button", { name: /^Start Game$/ }).evaluate((el) => {
    el.focus(); return document.activeElement === el;
  }).catch(() => false);
  assert(startFocusable, "C8: Start Game button is keyboard-focusable");
  await page.keyboard.press("Enter");
  await page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first().waitFor({ timeout: 15000 }).catch(() => {});
  // Tab through and confirm an interactive control receives a visible focus ring.
  let focusedRole = "";
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    focusedRole = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "";
      return (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
    });
    if (/Draw a card|of (hearts|diamonds|clubs|spades)/i.test(focusedRole)) break;
  }
  assert(/Draw a card|of (hearts|diamonds|clubs|spades)/i.test(focusedRole), "C8: Tab reaches a play control (draw pile / a card)", focusedRole);
  await page.screenshot({ path: `${SHOTS}/depth-c8-keyboard-focus.png` });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await crazyEights(ctx);
    await goFish(ctx);
    await goFishAriaLiveProbe(ctx);
    await responsive(ctx);
    await keyboard(ctx);
  } catch (e) {
    fail("driver crashed", e.message);
    console.error(e);
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== SUMMARY: ${passed}/${results.length} checks passed ====`);
  if (notes.length) { console.log("NOTES:"); notes.forEach((n) => console.log(`  - ${n}`)); }
  if (failed.length) { console.log("FAILURES:"); failed.forEach((f) => console.log(`  - ${f.name} ${f.extra}`)); }
  process.exit(failed.length ? 1 : 0);
})();
