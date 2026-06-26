// GAM-129 UI capture: settings screen + in-game play screen (desktop 1280 + mobile 390).
// PW_LIB=<playwright> node tests/e2e/yaniv-ui-capture.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");
const BASE = process.env.LIVE_BASE_URL ?? "https://your-host.example:7842";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const HARD = setTimeout(() => { log("HARD-TIMEOUT"); process.exit(2); }, 90000);
HARD.unref?.();

async function run(label, vp) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: vp });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE + "/play/yaniv", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Game Settings/i }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/ycap-${label}-settings.png`, fullPage: true });
  log(`[${label}] settings captured`);

  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByLabel(/draw deck with \d+ card/i).first().waitFor({ timeout: 15000 });
  await sleep(800);
  await page.screenshot({ path: `${SHOTS}/ycap-${label}-play.png`, fullPage: true });
  log(`[${label}] play screen captured`);

  // Try selecting two cards to look for multi-select summary UI (when on our turn)
  const discardBtn = page.getByRole("button", { name: /Discard & Draw from Deck/i });
  for (let i = 0; i < 40 && !(await discardBtn.isVisible().catch(() => false)); i++) await sleep(150);
  if (await discardBtn.isVisible().catch(() => false)) {
    const hand = page.getByRole("button", { name: / of (hearts|diamonds|clubs|spades)$/i });
    const n = await hand.count();
    let sel = 0;
    for (let c = 0; c < n && sel < 2; c++) {
      if (await hand.nth(c).isEnabled().catch(() => false)) { await hand.nth(c).click().catch(() => {}); sel++; await sleep(120); }
    }
    await page.screenshot({ path: `${SHOTS}/ycap-${label}-multiselect.png`, fullPage: true });
    log(`[${label}] selected ${sel} cards for multi-select capture`);
  }
  log(`[${label}] console errors: ${errors.length} ${errors.slice(0,4).join(" | ")}`);
  await browser.close();
}

(async () => {
  await run("desktop", { width: 1280, height: 860 });
  await run("mobile", { width: 390, height: 844 });
  clearTimeout(HARD);
  process.exit(0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
