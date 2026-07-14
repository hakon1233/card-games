// Deterministic Yaniv live rule-path gate - GAM-253.
// Requires the target server to run with YANIV_ENABLE_QA_FIXTURES=true.
// PW_LIB=<playwright> node tests/e2e/yaniv-rule-gates.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "https://your-host.example:7842";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, extra = "") => {
  results.push({ name, pass: true, extra });
  console.log(`  PASS  ${name}${extra ? " - " + extra : ""}`);
};
const fail = (name, extra = "") => {
  results.push({ name, pass: false, extra });
  console.log(`  FAIL  ${name}${extra ? " - " + extra : ""}`);
};
const assert = (cond, name, extra = "") => cond ? ok(name, extra) : fail(name, extra);

const expectations = {
  "save-50": { from: 50, to: 25 },
  "save-100": { from: 100, to: 50 },
};

async function createFixture(request, scenario) {
  const res = await request.post(`${BASE}/api/yaniv/qa`, { data: { scenario } });
  const body = await res.json().catch(() => ({}));
  assert(res.ok(), `${scenario}: QA fixture route enabled`, res.ok() ? "" : JSON.stringify(body));
  return body;
}

async function assertApiTransition(request, scenario) {
  const fixture = await createFixture(request, scenario);
  if (!fixture.gameId) return;

  const res = await request.post(`${BASE}/api/yaniv/${fixture.gameId}/action`, {
    data: { type: "CALL_YANIV", playerId: fixture.playerId },
  });
  const body = await res.json().catch(() => ({}));
  assert(res.ok(), `${scenario}: CALL_YANIV API action succeeds`, res.ok() ? "" : JSON.stringify(body));

  const expected = expectations[scenario];
  const save = body.state?.roundResult?.savedScores?.["bot-1"];
  assert(
    save?.from === expected.from && save?.to === expected.to,
    `${scenario}: savedScores records ${expected.from}->${expected.to}`,
    JSON.stringify(save ?? null),
  );

  const bot = body.state?.players?.find((player) => player.id === "bot-1");
  assert(
    bot?.score === expected.to,
    `${scenario}: bot cumulative score is saved to ${expected.to}`,
    bot ? `score=${bot.score}` : "bot missing",
  );
}

async function assertUiTransition(browser, request, scenario) {
  const fixture = await createFixture(request, scenario);
  if (!fixture.gameId) return;

  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`${BASE}/play/yaniv?qaGameId=${fixture.gameId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Call Yaniv/i }).click();
  await page.getByRole("button", { name: /^Next Round$/i }).waitFor({ timeout: 15000 });

  const overlay = (await page.locator(".fixed.inset-0.z-50").last().innerText().catch(() => "")).trim();
  const expected = expectations[scenario];
  assert(
    new RegExp(`Save rule|halved ${expected.from} to ${expected.to}|${expected.from}.*${expected.to}`, "i").test(overlay),
    `${scenario}: browser overlay explains ${expected.from}->${expected.to} save`,
    overlay.split("\n").slice(0, 8).join(" | "),
  );
  assert(errors.length === 0, `${scenario}: browser console clean`, errors.slice(0, 4).join(" | "));

  await page.screenshot({ path: `${SHOTS}/yaniv-${scenario}-rule-gate.png`, fullPage: true });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const request = await browser.newContext({ ignoreHTTPSErrors: true }).then((context) => context.request);

  try {
    for (const scenario of Object.keys(expectations)) {
      console.log(`\n=== Yaniv ${scenario} rule gate ===`);
      await assertApiTransition(request, scenario);
      await assertUiTransition(browser, request, scenario);
    }
  } catch (error) {
    fail("driver crashed", error.message);
    console.error(error);
  } finally {
    await browser.close();
  }

  const passed = results.filter((result) => result.pass).length;
  const failed = results.filter((result) => !result.pass);
  console.log(`\n==== SUMMARY: ${passed}/${results.length} checks passed ====`);
  if (failed.length) {
    console.log("FAILURES:");
    failed.forEach((failure) => console.log(`  - ${failure.name} ${failure.extra}`));
  }
  process.exit(failed.length ? 1 : 0);
})();
