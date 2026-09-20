// Fast Yaniv playthrough — GAM-113. High call-threshold so rounds end quickly,
// driving round scoring and elimination within ~60s. Deterministic save-rule
// coverage lives in yaniv-rule-gates.mjs.
// PW_LIB=<playwright> node tests/e2e/yaniv-quick.mjs
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
const failed = [];
const assert = (cond, name, extra = "") => {
  if (cond) log(`PASS ${name}${extra ? " - " + extra : ""}`);
  else { failed.push({ name, extra }); log(`FAIL ${name}${extra ? " - " + extra : ""}`); }
};

// hard kill so the process can never hang a heartbeat
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
  await page.getByRole("button", { name: "13", exact: true }).first().click().catch(() => {}); // high threshold
  await page.getByRole("button", { name: "100", exact: true }).first().click().catch(() => {}); // low elim score
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByLabel(/draw deck with \d+ card/i).first().waitFor({ timeout: 15000 });

  const discardBtn = page.getByRole("button", { name: /Discard & Draw from Deck/i });
  const yanivBtn = page.getByRole("button", { name: /Call Yaniv/i });
  const nextRound = page.getByRole("button", { name: /^Next Round$/i });
  const rematch = page.getByRole("button", { name: /^Rematch$/i });

  const headlines = [];
  let rounds = 0, calls = 0, discards = 0, gameOver = false, assaf = false;
  let lastReadout = "", elimMentioned = false;
  const readout = page.getByLabel(/Hand total \d+\. Yaniv threshold \d+/i);

  for (let i = 0; i < 800; i++) {
    if (await rematch.isVisible().catch(() => false)) {
      gameOver = true;
      const txt = await page.locator(".fixed.inset-0.z-50").last().innerText().catch(() => "");
      log("GAME-OVER overlay:\n" + txt);
      await page.screenshot({ path: `${SHOTS}/yzq-gameover.png`, fullPage: true });
      break;
    }
    if (await nextRound.isVisible().catch(() => false)) {
      rounds++;
      const txt = await page.locator(".fixed.inset-0.z-50").last().innerText().catch(() => "");
      const head = (txt.split("\n")[0] || "").trim();
      headlines.push(head);
      if (/assaf/i.test(txt)) assaf = true;
      if (/busted|near bust|eliminat|out\b/i.test(txt)) elimMentioned = true;
      if (rounds <= 3) await page.screenshot({ path: `${SHOTS}/yzq-round-${rounds}.png`, fullPage: true });
      log(`ROUND ${rounds} overlay head: "${head}"`);
      if (rounds <= 2) log("  full:\n" + txt.split("\n").slice(0, 18).map(s => "    " + s).join("\n"));
      await nextRound.click();
      await sleep(500);
      continue;
    }
    const myTurn = await discardBtn.isVisible().catch(() => false);
    if (!myTurn) { await sleep(140); continue; }

    if (await readout.count()) lastReadout = ((await readout.first().getAttribute("aria-label")) ?? "").trim();

    if (await yanivBtn.isVisible().catch(() => false) && await yanivBtn.isEnabled().catch(() => false)) {
      await yanivBtn.click(); calls++; await sleep(700); continue;
    }
    // discard highest single
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
    if (await discardBtn.isEnabled().catch(() => false)) { await discardBtn.click(); discards++; await sleep(350); }
    else await sleep(120);
  }

  log("\n==== RESULT ====");
  log("rounds completed:", rounds, "| Yaniv calls:", calls, "| discards:", discards);
  log("gameOver:", gameOver, "| assaf observed:", assaf, "| elim/bust text:", elimMentioned);
  log("headlines:", JSON.stringify(headlines));
  log("last hand readout:", lastReadout);
  log("console errors:", errors.length, errors.slice(0, 5).join(" | "));
  assert(rounds > 0, "round scoring path observed", `rounds=${rounds}`);
  assert(calls > 0, "Call Yaniv path exercised", `calls=${calls}`);
  assert(discards > 0, "discard path exercised", `discards=${discards}`);
  assert(gameOver, "game reaches game-over screen");
  assert(elimMentioned, "elimination/bust UI text observed");
  assert(errors.length === 0, "console clean", errors.slice(0, 5).join(" | "));
  await browser.close();
  clearTimeout(HARD);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
