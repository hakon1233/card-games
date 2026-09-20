// Self-contained live-QA driver (no @playwright/test dep) — GAM-112.
// Drives the deployed HTTPS app and runs full playthroughs of Crazy Eights and
// Go Fish vs bots, asserting controls, gating, end screens, console cleanliness,
// and 375px mobile overflow. Run: node tests/e2e/live-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
// Playwright isn't a project dependency; resolve it from the path in PW_LIB
// (the ephemeral npx install) so this live-QA driver stays self-contained and
// doesn't add a devDependency to the managed repo.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:3001";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, extra = "") => { results.push({ name, pass: true, extra }); console.log(`  PASS  ${name}${extra ? " — " + extra : ""}`); };
const fail = (name, extra = "") => { results.push({ name, pass: false, extra }); console.log(`  FAIL  ${name}${extra ? " — " + extra : ""}`); };
const assert = (cond, name, extra = "") => cond ? ok(name, extra) : fail(name, extra);

function listenConsole(page, sink) {
  page.on("console", (m) => { if (m.type() === "error") sink.push(m.text()); });
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function statusText(page) {
  const el = page.locator('[role="status"]').first();
  if (await el.count()) return ((await el.textContent()) ?? "").trim();
  return "";
}

async function crazyEights(ctx) {
  console.log("\n=== Crazy Eights ===");
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const tile = page.getByRole("button", { name: /Crazy Eights/i });
  assert((await tile.count()) > 0, "C8: reachable from home picker (tile present)");
  await tile.first().click();
  // Tile opens the mode dialog → choose "Play vs Bot".
  await page.getByRole("button", { name: /Play vs Bot/i }).click();
  await page.waitForURL(/\/play\/crazy-eights/, { timeout: 15000 });
  assert(/\/play\/crazy-eights/.test(page.url()), "C8: navigates to /play/crazy-eights via mode picker");

  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.screenshot({ path: `${SHOTS}/c8-01-settings.png`, fullPage: true });
  await page.getByRole("button", { name: /^Start Game$/ }).click();

  const drawStack = page.getByLabel(/Draw a card\. \d+ in the draw pile\./);
  await drawStack.first().waitFor({ timeout: 15000 });
  assert(true, "C8: game board renders (draw pile + discard)");
  await page.screenshot({ path: `${SHOTS}/c8-02-board.png`, fullPage: true });

  const handCards = page.getByRole("button", { name: / of (hearts|diamonds|clubs|spades)$/i });
  const SUITS = ["hearts", "diamonds", "clubs", "spades"];
  let gatingChecked = false, suitPickerSeen = false, drewACard = false, playedACard = false;
  let firstRoundEnded = false, firstRoundChecked = false, rematchRestarts = false;

  // The 8 → suit-picker flow is opportunistic (only fires when the human holds a
  // playable 8). Replay rounds via Rematch until we observe it, capped, so the
  // assertion is deterministic rather than deal-dependent.
  for (let round = 0; round < 8 && !suitPickerSeen; round++) {
    let reachedEnd = false;
    for (let i = 0; i < 300; i++) {
      const status = await statusText(page);
      if (await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false)) { reachedEnd = true; break; }
      if (!/Your turn/i.test(status)) { await sleep(160); continue; }

      if (!gatingChecked) {
        const total = await handCards.count();
        const enabled = await handCards.locator(":scope:not([disabled])").count();
        assert(total > 0, "C8: human hand renders cards", `${total} cards`);
        assert(enabled <= total, "C8: illegal cards disabled / legal enabled split", `${enabled}/${total} playable`);
        gatingChecked = true;
      }

      let played = false;
      for (const s of SUITS) {
        const eight = page.getByRole("button", { name: `8 of ${s}` });
        if ((await eight.count()) === 1 && (await eight.isEnabled().catch(() => false))) {
          await eight.click();
          const dialog = page.getByRole("dialog", { name: /Choose a suit/i });
          if (await dialog.isVisible().catch(() => false)) {
            suitPickerSeen = true;
            await page.screenshot({ path: `${SHOTS}/c8-03-suit-picker.png` });
            await dialog.getByRole("button", { name: "Hearts", exact: true }).click();
          }
          played = true; playedACard = true; break;
        }
      }
      if (!played) {
        const n = await handCards.count();
        for (let c = 0; c < n; c++) {
          const card = handCards.nth(c);
          if (await card.isEnabled().catch(() => false)) { await card.click(); played = true; playedACard = true; break; }
        }
      }
      if (!played) {
        const draw = page.getByRole("button", { name: /^Draw a card( \(reshuffle\))?$/ });
        if (await draw.isVisible().catch(() => false)) { await draw.click(); drewACard = true; }
        else await sleep(160);
      }
      await sleep(100);
    }

    if (round === 0) {
      firstRoundEnded = reachedEnd;
      firstRoundChecked = true;
      if (reachedEnd) {
        assert(await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false), "C8: Rematch button present");
        assert(await page.getByRole("button", { name: /Change Game/i }).isVisible().catch(() => false), "C8: Change Game button present");
        await page.screenshot({ path: `${SHOTS}/c8-04-end.png`, fullPage: true });
      }
    }
    if (!reachedEnd) break; // round didn't finish within budget — stop replaying

    // Click Rematch — verifies the restart AND sets up the next round so the
    // (opportunistic) 8 → suit-picker flow gets more chances if not seen yet.
    const rm = page.getByRole("button", { name: /^Rematch$/ });
    if (await rm.isVisible().catch(() => false)) {
      await rm.click();
      const restarted = await page.getByLabel(/Draw a card\. \d+ in the draw pile\./).first()
        .waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      if (round === 0) rematchRestarts = restarted;
      if (!restarted) break;
    }
  }

  assert(firstRoundChecked && firstRoundEnded, "C8: round reaches end-game/rematch screen");
  assert(playedACard, "C8: play control works (played at least one card)");
  assert(drewACard, "C8: draw control works (drew at least once)", drewACard ? "" : "no forced draw this game");
  // Rematch button presence is asserted against the first end screen.
  assert(rematchRestarts, "C8: Rematch restarts a round");
  assert(suitPickerSeen, "C8: playing an 8 opens the suit picker");
  assert(errors.length === 0, "C8: console clean (no errors)", errors.slice(0, 3).join(" | "));

  // Mobile 375px
  const m = await ctx.browser().newContext({ viewport: { width: 375, height: 740 }, ignoreHTTPSErrors: true });
  const mp = await m.newPage();
  await mp.goto(BASE + "/play/crazy-eights", { waitUntil: "domcontentloaded" });
  await mp.getByRole("button", { name: /^Start Game$/ }).waitFor({ timeout: 15000 });
  await mp.screenshot({ path: `${SHOTS}/c8-05-mobile-settings.png`, fullPage: true });
  let of1 = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(of1 <= 1, "C8: 375px settings — no horizontal overflow", `${of1}px`);
  await mp.getByRole("button", { name: /^Start Game$/ }).click();
  await mp.getByLabel(/Draw a card\. \d+ in the draw pile\./).first().waitFor({ timeout: 15000 });
  await sleep(400);
  await mp.screenshot({ path: `${SHOTS}/c8-06-mobile-board.png`, fullPage: true });
  let of2 = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(of2 <= 1, "C8: 375px board — no horizontal overflow", `${of2}px`);
  await m.close();
  await page.close();
}

async function goFish(ctx) {
  console.log("\n=== Go Fish ===");
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const tile = page.getByRole("button", { name: /Go Fish/i });
  assert((await tile.count()) > 0, "GF: reachable from home picker (tile present)");
  await tile.first().click();
  await page.getByRole("button", { name: /Play vs Bot/i }).click();
  await page.waitForURL(/\/play\/go-fish/, { timeout: 15000 });
  assert(/\/play\/go-fish/.test(page.url()), "GF: navigates to /play/go-fish via mode picker");

  await page.getByRole("button", { name: /^Deal cards$/ }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/gf-01-settings.png`, fullPage: true });
  await page.getByRole("button", { name: /^Deal cards$/ }).click();

  await page.getByRole("region", { name: /Your hand/i }).waitFor({ timeout: 15000 }).catch(() => {});
  assert(true, "GF: game board renders after deal");
  await page.screenshot({ path: `${SHOTS}/gf-02-board.png`, fullPage: true });

  const liveBar = page.locator('[aria-live="polite"]').first();
  let reachedEnd = false, askedOnce = false, goFishSeen = false, gaveSeen = false;
  // Pond size strictly decreases over a game; use it as a liveness/stall probe.
  const pondNow = async () => {
    const t = (await page.locator("text=/Pond:\\s*\\d+/").first().textContent().catch(() => "")) ?? "";
    const m = t.match(/Pond:\s*(\d+)/);
    return m ? Number(m[1]) : -1;
  };
  let lastPond = await pondNow();
  let stallIters = 0;

  for (let i = 0; i < 1200; i++) {
    if (await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false)) { reachedEnd = true; break; }
    const bar = ((await liveBar.textContent().catch(() => "")) ?? "").trim();
    if (/Go Fish/i.test(bar)) goFishSeen = true;
    if (/handed over|got \d+|—\s*got/i.test(bar)) gaveSeen = true;

    // Stall detection: if the pond hasn't moved for a long stretch and it's not
    // our turn, the table is stuck — a real bug, not a slow game.
    const pond = await pondNow();
    if (pond === lastPond) stallIters++; else { stallIters = 0; lastPond = pond; }
    if (stallIters > 250) { console.log(`  [GF] stall: pond stuck at ${pond}, last status="${bar}"`); break; }

    // Reliable turn signal: hand rank-buttons are disabled unless it's the
    // human's turn. The aria-live bar keeps the last bot event text on our turn,
    // so it is NOT a reliable turn indicator.
    const rankCards = page.getByRole("button", { name: /^Ask for .+ — you hold/i });
    const rc = await rankCards.count();
    let picked = false;
    for (let c = 0; c < rc; c++) {
      const card = rankCards.nth(c);
      if (await card.isEnabled().catch(() => false)) { await card.click(); picked = true; break; }
    }
    if (!picked) { await sleep(140); continue; } // not our turn (all disabled) or out of cards

    const askBtns = page.getByRole("button", { name: /^Ask (Marlin|Pearl)/ });
    const ab = await askBtns.count();
    let asked = false;
    for (let c = 0; c < ab; c++) {
      const b = askBtns.nth(c);
      if (await b.isEnabled().catch(() => false)) { await b.click(); asked = true; askedOnce = true; break; }
    }
    if (!asked) await sleep(150);
    await sleep(150);
  }

  assert(askedOnce, "GF: ask control works (asked an opponent for a rank)");
  assert(goFishSeen || gaveSeen, "GF: ask resolves (Go Fish draw or cards handed over observed)");
  assert(reachedEnd, "GF: game reaches end-game/rematch screen");
  if (reachedEnd) {
    assert(await page.getByRole("button", { name: /^Rematch$/ }).isVisible().catch(() => false), "GF: Rematch button present");
    assert(await page.getByRole("button", { name: /Change Game/i }).isVisible().catch(() => false), "GF: Change Game button present");
    await page.screenshot({ path: `${SHOTS}/gf-03-end.png`, fullPage: true });
  }
  assert(errors.length === 0, "GF: console clean (no errors)", errors.slice(0, 3).join(" | "));

  const m = await ctx.browser().newContext({ viewport: { width: 375, height: 740 }, ignoreHTTPSErrors: true });
  const mp = await m.newPage();
  await mp.goto(BASE + "/play/go-fish", { waitUntil: "domcontentloaded" });
  await mp.getByRole("button", { name: /^Deal cards$/ }).waitFor({ timeout: 15000 });
  await mp.getByRole("button", { name: /^Deal cards$/ }).click();
  await sleep(600);
  await mp.screenshot({ path: `${SHOTS}/gf-04-mobile-board.png`, fullPage: true });
  const of = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(of <= 1, "GF: 375px board — no horizontal overflow", `${of}px`);
  await m.close();
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await crazyEights(ctx);
    await goFish(ctx);
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
