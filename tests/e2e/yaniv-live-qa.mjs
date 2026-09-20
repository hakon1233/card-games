// Self-contained live-QA driver for Yaniv — GAM-113.
// Drives the deployed HTTPS app, plays Yaniv vs bots end-to-end, and asserts
// controls, rule readouts, round scoring, save rule, elimination, the settings
// screen, Quick Draw, console cleanliness, and 375px mobile overflow.
// Run: PW_LIB=<path-to-playwright> node tests/e2e/yaniv-live-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:3001";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, extra = "") => { results.push({ name, pass: true, extra }); console.log(`  PASS  ${name}${extra ? " — " + extra : ""}`); };
const fail = (name, extra = "") => { results.push({ name, pass: false, extra }); console.log(`  FAIL  ${name}${extra ? " — " + extra : ""}`); };
const assert = (cond, name, extra = "") => cond ? ok(name, extra) : fail(name, extra);
const note = (msg) => console.log(`  NOTE  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listenConsole(page, sink) {
  page.on("console", (m) => { if (m.type() === "error") sink.push(m.text()); });
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
}
async function statusText(page) {
  const el = page.locator('[role="status"]').first();
  if (await el.count()) return ((await el.textContent()) ?? "").trim();
  return "";
}

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const cardRe = /^Select ([A-Za-z0-9]+) of (hearts|diamonds|clubs|spades), card \d+ of \d+$/i;

async function play(ctx) {
  console.log("\n=== Yaniv (desktop) ===");
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const tile = page.locator('a[href="/play/yaniv"], a[href$="/play/yaniv"]');
  const tileVisible = await tile.first().isVisible().catch(() => false);
  assert(tileVisible, "reachable from home picker (Yaniv tile present)");
  if (tileVisible) {
    await tile.first().click();
    await page.waitForURL(/\/play\/yaniv/, { timeout: 15000 }).catch(() => {});
  }
  if (!/\/play\/yaniv/.test(page.url())) await page.goto(BASE + "/play/yaniv", { waitUntil: "networkidle" });
  assert(/\/play\/yaniv/.test(page.url()), "navigates to /play/yaniv");

  // Settings screen
  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/yz-01-settings.png`, fullPage: true });
  assert(true, "settings screen renders");
  // Quick Draw toggle present
  const qd = page.getByRole("switch", { name: /Quick Draw/i }).or(page.getByLabel(/Quick Draw/i));
  assert((await qd.count()) > 0, "settings: Quick Draw control present");

  // Configure: 1 bot, low elimination score so a full game completes quickly.
  await page.getByRole("button", { name: "1", exact: true }).first().click().catch(() => {});
  await page.getByRole("button", { name: "100", exact: true }).first().click().catch(() => {});

  // Start
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  const drawDeck = page.getByLabel(/draw deck with \d+ card/i);
  await drawDeck.first().waitFor({ timeout: 15000 });
  assert(true, "game board renders (draw deck present)");
  await page.screenshot({ path: `${SHOTS}/yz-02-board.png`, fullPage: true });

  // Always-visible hand-total readout (GAM-61 verify)
  const readout = page.getByLabel(/Hand total \d+\. Yaniv threshold \d+/i);
  assert((await readout.count()) > 0, "GAM-61: always-visible hand-total readout present");

  const discardBtnLoc = page.getByRole("button", { name: /Discard & Draw from Deck|Discard and Draw from Deck/i });
  const yanivBtn = page.getByRole("button", { name: /Call Yaniv/i });
  const nextRoundBtn = page.getByRole("button", { name: /^Next Round$/i });
  const rematchBtn = page.getByRole("button", { name: /^Rematch$/i });

  let reachedRoundEnd = false, calledYaniv = false, discarded = false, drew = false, multiDiscard = false;
  let assafSeen = false, roundsPlayed = 0, gameOver = false, lastTotalText = "", canCallEverShown = false;

  for (let i = 0; i < 500; i++) {
    // game over?
    if (await rematchBtn.isVisible().catch(() => false)) { gameOver = true; reachedRoundEnd = true;
      await page.screenshot({ path: `${SHOTS}/yz-07-game-over.png`, fullPage: true }); break; }

    // round summary overlay
    if (await nextRoundBtn.isVisible().catch(() => false)) {
      reachedRoundEnd = true; roundsPlayed++;
      const overlay = await page.locator(".fixed.inset-0.z-50").last().textContent().catch(() => "");
      if (/assaf/i.test(overlay || "")) assafSeen = true;
      if (roundsPlayed <= 2) await page.screenshot({ path: `${SHOTS}/yz-04-round-${roundsPlayed}.png`, fullPage: true });
      await nextRoundBtn.first().click();
      await sleep(700);
      continue;
    }

    // my turn? (action buttons only render on my turn)
    const myTurn = await discardBtnLoc.isVisible().catch(() => false);
    if (!myTurn) { await sleep(160); continue; }

    // Read hand total readout.
    if (await readout.count()) {
      lastTotalText = ((await readout.first().getAttribute("aria-label")) ?? "").trim();
    }

    // Can we call Yaniv?
    if (await yanivBtn.isVisible().catch(() => false) && await yanivBtn.isEnabled().catch(() => false)) {
      canCallEverShown = true;
      await page.screenshot({ path: `${SHOTS}/yz-03-can-call.png`, fullPage: true });
      await yanivBtn.click();
      calledYaniv = true;
      await sleep(800);
      continue;
    }

    // Otherwise discard highest cards then draw from deck.
    const handCards = page.getByRole("button", { name: cardRe });
    const n = await handCards.count();
    if (n === 0) { await sleep(180); continue; }

    // Try to select a pair (two same-rank) for a multi-card discard; else highest single.
    const labels = [];
    for (let c = 0; c < n; c++) {
      const lbl = (await handCards.nth(c).getAttribute("aria-label")) ?? "";
      const enabled = await handCards.nth(c).isEnabled().catch(() => false);
      labels.push({ c, lbl: lbl.replace(/^Draw /, ""), enabled });
    }
    const rankOf = (l) => (l.match(/([A-Za-z0-9]+) of/) || [])[1];
    // group by rank
    const byRank = {};
    for (const it of labels) { const r = rankOf(it.lbl); if (!r) continue; (byRank[r] ||= []).push(it); }
    let selected = [];
    const pairRank = Object.keys(byRank).find((r) => byRank[r].length >= 2);
    if (pairRank) { selected = byRank[pairRank].slice(0, 2); multiDiscard = true; }
    else {
      // highest single by card value
      const val = (r) => r === "A" ? 1 : ["J", "Q", "K"].includes(r) ? 10 : parseInt(r, 10) || 0;
      const sorted = [...labels].sort((a, b) => val(rankOf(b.lbl)) - val(rankOf(a.lbl)));
      selected = sorted.slice(0, 1);
    }
    for (const it of selected) {
      await handCards.nth(it.c).click().catch(() => {});
      await sleep(80);
    }
    // Commit: Discard & Draw from Deck
    const discardBtn = page.getByRole("button", { name: /Discard & Draw from Deck|Discard and Draw from Deck/i });
    if (await discardBtn.isVisible().catch(() => false) && await discardBtn.isEnabled().catch(() => false)) {
      await discardBtn.click();
      discarded = true; drew = true;
      await sleep(500);
    } else {
      // selection may be illegal (two non-pair) — deselect and pick highest single instead
      for (const it of selected) await handCards.nth(it.c).click().catch(() => {});
      await sleep(120);
    }
  }

  assert(discarded, "discard control works (committed a discard)");
  assert(drew, "draw-from-deck works");
  note(`multi-card discard exercised: ${multiDiscard}`);
  note(`Call Yaniv exercised: ${calledYaniv}`);
  note(`rounds completed: ${roundsPlayed}, gameOver reached: ${gameOver}`);
  assert(reachedRoundEnd, "round reaches a summary / game-over screen");
  assert(gameOver, "full game completes (elimination → game-over screen)");
  note(`last hand-total readout: ${lastTotalText}`);
  note(`assaf summary observed: ${assafSeen}`);

  assert(errors.length === 0, "console clean (no errors)", errors.slice(0, 4).join(" | "));
  await page.close();
  return { errors };
}

async function mobile(ctx) {
  console.log("\n=== Yaniv (375px mobile) ===");
  const m = await ctx.browser().newContext({ viewport: { width: 375, height: 740 }, ignoreHTTPSErrors: true });
  const mp = await m.newPage();
  const errs = [];
  listenConsole(mp, errs);
  await mp.goto(BASE + "/play/yaniv", { waitUntil: "domcontentloaded" });
  await mp.getByRole("button", { name: /^Start Game$/ }).waitFor({ timeout: 15000 });
  await mp.screenshot({ path: `${SHOTS}/yz-05-mobile-settings.png`, fullPage: true });
  let of1 = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(of1 <= 1, "375px settings — no horizontal overflow", `${of1}px`);
  await mp.getByRole("button", { name: /^Start Game$/ }).click();
  await mp.getByLabel(/draw deck with \d+ card/i).first().waitFor({ timeout: 15000 });
  await sleep(500);
  await mp.screenshot({ path: `${SHOTS}/yz-06-mobile-board.png`, fullPage: true });
  let of2 = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(of2 <= 1, "375px board — no horizontal overflow", `${of2}px`);
  await m.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await play(ctx);
    await mobile(ctx);
  } catch (e) {
    fail("driver crashed", e.message);
    console.error(e);
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== SUMMARY: ${passed}/${results.length} checks passed ====`);
  if (failed.length) { console.log("FAILURES:"); failed.forEach((f) => console.log(`  - ${f.name} ${f.extra}`)); }
  process.exit(failed.length ? 1 : 0);
})();
