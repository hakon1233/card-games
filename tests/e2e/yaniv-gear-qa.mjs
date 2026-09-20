// GAM-115 live verification — in-game display controls collapsed behind a gear,
// hidden over round-end / game-over overlays.
// Asserts: (1) gear "Display settings" visible mid-game; (2) the old always-on
// Animation/Card-color rows are NOT pinned on the table; (3) opening the gear
// reveals both controls; (4) gear is gone while a round-end overlay is open.
// PW_LIB=<playwright> node tests/e2e/yaniv-gear-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");
const BASE = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:3001";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const cardRe = /^Select ([A-Za-z0-9]+) of (hearts|diamonds|clubs|spades), card \d+ of \d+$/i;
const HARD = setTimeout(() => { log("HARD-TIMEOUT"); process.exit(2); }, 110000);
HARD.unref?.();

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + "/play/yaniv", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "1", exact: true }).first().click().catch(() => {});
  await page.getByRole("button", { name: "13", exact: true }).first().click().catch(() => {}); // high threshold → rounds end fast
  await page.getByRole("button", { name: "100", exact: true }).first().click().catch(() => {});
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByLabel(/draw deck with \d+ card/i).first().waitFor({ timeout: 15000 });
  await sleep(500);

  const gear = page.getByRole("button", { name: /Display settings/i });
  const panel = page.getByRole("dialog", { name: /Display settings/i });

  // (1) gear present mid-game
  const gearVisible = await gear.isVisible().catch(() => false);
  check("gear 'Display settings' visible mid-game", gearVisible);
  await page.screenshot({ path: `${SHOTS}/yz-gear-ingame.png`, fullPage: true });

  // (2) controls NOT pinned on the table — with the gear closed the popover
  // (and thus both controls) is absent from the DOM.
  const panelClosed = await panel.count();
  check("controls NOT pinned on table when gear closed", panelClosed === 0, `dialogs=${panelClosed}`);

  // (3) opening gear reveals both controls
  if (gearVisible) {
    await gear.click();
    await sleep(300);
    const panelOpen = await panel.isVisible().catch(() => false);
    const panelText = panelOpen ? ((await panel.innerText().catch(() => "")) || "") : "";
    const hasAnim = /animation speed/i.test(panelText);
    const hasDeck = /card colors/i.test(panelText);
    check("opening gear reveals Animation + Card-color controls", panelOpen && hasAnim && hasDeck,
      `open=${panelOpen} anim=${hasAnim} deck=${hasDeck}`);
    await page.screenshot({ path: `${SHOTS}/yz-gear-open.png`, fullPage: true });
    // close again (Escape)
    await page.keyboard.press("Escape");
    await sleep(200);
    const afterEsc = await panel.count();
    check("Escape closes the gear popover", afterEsc === 0, `dialogs=${afterEsc}`);
  }

  // (4) drive to a round-end overlay, assert gear gone
  const discardBtn = page.getByRole("button", { name: /Discard & Draw from Deck/i });
  const yanivBtn = page.getByRole("button", { name: /Call Yaniv/i });
  const nextRound = page.getByRole("button", { name: /^Next Round$/i });
  const rematch = page.getByRole("button", { name: /^Rematch$/i });
  let overlayChecked = false, gameOverChecked = false;

  for (let i = 0; i < 800 && !(overlayChecked && gameOverChecked); i++) {
    if (await rematch.isVisible().catch(() => false)) {
      if (!gameOverChecked) {
        const gearOnGameOver = await gear.isVisible().catch(() => false);
        check("gear hidden over GAME-OVER overlay", !gearOnGameOver);
        await page.screenshot({ path: `${SHOTS}/yz-gear-gameover.png`, fullPage: true });
        gameOverChecked = true;
      }
      break;
    }
    if (await nextRound.isVisible().catch(() => false)) {
      if (!overlayChecked) {
        const gearOnRoundEnd = await gear.isVisible().catch(() => false);
        check("gear hidden over ROUND-END overlay", !gearOnRoundEnd);
        await page.screenshot({ path: `${SHOTS}/yz-gear-roundend.png`, fullPage: true });
        overlayChecked = true;
      }
      await nextRound.click();
      await sleep(500);
      continue;
    }
    const myTurn = await discardBtn.isVisible().catch(() => false);
    if (!myTurn) { await sleep(140); continue; }
    if (await yanivBtn.isVisible().catch(() => false) && await yanivBtn.isEnabled().catch(() => false)) {
      await yanivBtn.click(); await sleep(700); continue;
    }
    const hand = page.getByRole("button", { name: cardRe });
    const n = await hand.count();
    if (!n) { await sleep(150); continue; }
    const val = (r) => r === "A" ? 1 : ["J", "Q", "K"].includes(r) ? 10 : parseInt(r, 10) || 0;
    let best = -1, bi = 0;
    for (let c = 0; c < n; c++) {
      const lbl = ((await hand.nth(c).getAttribute("aria-label")) ?? "").replace(/^Draw /, "");
      const r = (lbl.match(/([A-Za-z0-9]+) of/) || [])[1];
      if (await hand.nth(c).isEnabled().catch(() => false) && val(r) > best) { best = val(r); bi = c; }
    }
    await hand.nth(bi).click().catch(() => {});
    await sleep(120);
    if (await discardBtn.isEnabled().catch(() => false)) { await discardBtn.click(); await sleep(350); }
    else await sleep(120);
  }

  log("\n==== RESULT ====");
  const failed = results.filter((r) => !r.ok);
  log(`checks: ${results.length} | passed: ${results.length - failed.length} | failed: ${failed.length}`);
  log("round-end overlay checked:", overlayChecked, "| game-over checked:", gameOverChecked);
  log("console errors:", errors.length, errors.slice(0, 5).join(" | "));
  await browser.close();
  clearTimeout(HARD);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
