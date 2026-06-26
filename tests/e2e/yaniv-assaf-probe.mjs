// GAM-129 probe: aggressive human Yaniv calls to surface Assaf + save-rule + multi-round UI.
// Threshold 7, score limit 50, 1 bot. Calls Yaniv the instant the button is enabled.
// PW_LIB=<playwright> node tests/e2e/yaniv-assaf-probe.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");
const BASE = process.env.LIVE_BASE_URL ?? "https://your-host.example:7842";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const cardRe = / of (hearts|diamonds|clubs|spades)$/i;
const HARD = setTimeout(() => { log("HARD-TIMEOUT"); process.exit(2); }, 110000);
HARD.unref?.();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + "/play/yaniv", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "1", exact: true }).first().click().catch(() => {});
  await page.getByRole("button", { name: "7", exact: true }).first().click().catch(() => {}); // threshold 7
  await page.getByRole("button", { name: "50", exact: true }).first().click().catch(() => {}); // elim score 50
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByLabel(/draw deck with \d+ card/i).first().waitFor({ timeout: 15000 });

  const discardBtn = page.getByRole("button", { name: /Discard & Draw from Deck/i });
  const yanivBtn = page.getByRole("button", { name: /Call Yaniv/i });
  const nextRound = page.getByRole("button", { name: /^Next Round$/i });
  const rematch = page.getByRole("button", { name: /^Rematch$/i });

  let rounds = 0, calls = 0, assaf = 0, save = 0, gameOver = false;
  const heads = [];

  for (let i = 0; i < 1200; i++) {
    if (await rematch.isVisible().catch(() => false)) {
      gameOver = true;
      const txt = await page.locator(".fixed.inset-0.z-50").last().innerText().catch(() => "");
      log("GAME-OVER:\n" + txt);
      await page.screenshot({ path: `${SHOTS}/yap-gameover.png`, fullPage: true });
      break;
    }
    if (await nextRound.isVisible().catch(() => false)) {
      rounds++;
      const txt = await page.locator(".fixed.inset-0.z-50").last().innerText().catch(() => "");
      const head = (txt.split("\n")[0] || "").trim();
      heads.push(head);
      const isAssaf = /assaf/i.test(txt);
      const isSave = /save|saved|→\s*(50|25|100)/i.test(txt);
      if (isAssaf) { assaf++; await page.screenshot({ path: `${SHOTS}/yap-assaf-${assaf}.png`, fullPage: true }); }
      if (isSave) { save++; await page.screenshot({ path: `${SHOTS}/yap-save-${save}.png`, fullPage: true }); }
      log(`ROUND ${rounds} head="${head}" assaf=${isAssaf} save=${isSave}`);
      if (isAssaf || isSave || rounds <= 2) log("  " + txt.split("\n").slice(0, 20).join(" | "));
      await nextRound.click();
      await sleep(400);
      continue;
    }
    const myTurn = await discardBtn.isVisible().catch(() => false);
    if (!myTurn) { await sleep(130); continue; }
    // Call Yaniv the instant it's allowed (forces low-hand calls -> Assaf chances)
    if (await yanivBtn.isVisible().catch(() => false) && await yanivBtn.isEnabled().catch(() => false)) {
      await yanivBtn.click(); calls++; await sleep(700); continue;
    }
    // otherwise discard highest single to drive hand total down toward threshold
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
    await sleep(110);
    if (await discardBtn.isEnabled().catch(() => false)) { await discardBtn.click(); await sleep(320); }
    else await sleep(110);
  }

  log("\n==== RESULT ====");
  log("rounds:", rounds, "| human Yaniv calls:", calls, "| assaf:", assaf, "| save:", save, "| gameOver:", gameOver);
  log("headlines:", JSON.stringify(heads));
  log("console errors:", errors.length, errors.slice(0, 6).join(" | "));
  await browser.close();
  clearTimeout(HARD);
  process.exit(0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
