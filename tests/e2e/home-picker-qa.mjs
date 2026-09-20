// Self-contained live-QA driver (no @playwright/test dep) — GAM-126.
// Drives the deployed shell BEFORE any game: home/landing, game picker, the
// mode-selector dialog, onboarding clarity, keyboard nav/focus order, and a
// responsive sweep (375/414/768/1280). Reports defects; does not fix.
// Run: PW_LIB=<path> node tests/e2e/home-picker-qa.mjs
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_LIB || "playwright");

const BASE = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:3001";
const SHOTS = "tests/e2e/.artifacts";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (n, x = "") => { results.push({ n, pass: true, x }); console.log(`  PASS  ${n}${x ? " — " + x : ""}`); };
const fail = (n, x = "") => { results.push({ n, pass: false, x }); console.log(`  FAIL  ${n}${x ? " — " + x : ""}`); };
const assert = (c, n, x = "") => c ? ok(n, x) : fail(n, x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function listenConsole(page, sink) {
  page.on("console", (m) => { if (m.type() === "error") sink.push(m.text()); });
  page.on("pageerror", (e) => sink.push("pageerror: " + e.message));
}

const GAMES = [
  { slug: "blackjack", name: "Blackjack" },
  { slug: "crazy-eights", name: "Crazy Eights" },
  { slug: "go-fish", name: "Go Fish" },
  { slug: "yaniv", name: "Yaniv" },
];

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function homeStructure(ctx) {
  console.log("\n=== Home / picker structure ===");
  const page = await ctx.newPage();
  const errors = [];
  listenConsole(page, errors);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  // Onboarding copy: a brand-new visitor should see how to start.
  const bodyText = (await page.locator("body").textContent()) ?? "";
  assert(/Pick a game and play against a bot/i.test(bodyText), "Home: onboarding instruction copy present");

  // Each game tile reachable, has an accessible name including the game name.
  for (const g of GAMES) {
    const tile = page.getByRole("button", { name: new RegExp(g.name, "i") });
    const count = await tile.count();
    assert(count >= 1, `Home: "${g.name}" tile present`, `${count} match`);
    if (count >= 1) {
      const accName = (await tile.first().getAttribute("aria-label"))
        ?? (await tile.first().textContent()) ?? "";
      assert(new RegExp(g.name, "i").test(accName), `Home: "${g.name}" tile has accessible name`, accName.trim().slice(0, 50));
    }
  }
  assert((await page.getByRole("button").count()) >= 4, "Home: at least 4 interactive tiles");

  // Brand logo links home and has an accessible name.
  const logo = page.getByRole("link", { name: /home/i });
  assert((await logo.count()) >= 1, "Home: brand logo is a labeled home link");

  // No broken images (naturalWidth 0 = failed art).
  const brokenImgs = await page.evaluate(() =>
    Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
  assert(brokenImgs.length === 0, "Home: no broken images / art", brokenImgs.join(", ").slice(0, 120));

  await page.screenshot({ path: `${SHOTS}/home-01-desktop.png`, fullPage: true });
  assert(errors.length === 0, "Home: console clean", errors.slice(0, 3).join(" | "));
  await page.close();
}

async function keyboardNav(ctx) {
  console.log("\n=== Keyboard nav / focus order ===");
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  // Tab through and record the focus order of interactive elements.
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return { tag: el.tagName.toLowerCase(), label: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) };
    });
    if (info) order.push(info);
  }
  console.log("  focus order:", JSON.stringify(order));
  const labels = order.map((o) => o.label.toLowerCase());
  // Every game name should appear in tab order (all tiles focusable).
  for (const g of GAMES) {
    assert(labels.some((l) => l.includes(g.name.toLowerCase())), `Kbd: "${g.name}" tile reachable via Tab`);
  }
  // Logo (home link) should come before the game tiles (DOM order).
  const firstTileIdx = order.findIndex((o) => GAMES.some((g) => o.label.toLowerCase().includes(g.name.toLowerCase())));
  const logoIdx = order.findIndex((o) => o.tag === "a" && /home|pip/i.test(o.label));
  assert(firstTileIdx >= 0, "Kbd: a game tile receives focus");

  // Activate a focused tile with Enter → mode dialog should open.
  // Re-tab to the first game tile.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  let landed = false;
  for (let i = 0; i < 8 && !landed; i++) {
    await page.keyboard.press("Tab");
    landed = await page.evaluate(() => {
      const el = document.activeElement;
      const t = (el?.textContent || "").toLowerCase();
      return el?.tagName === "BUTTON" && /blackjack|crazy eights|go fish|yaniv/.test(t);
    });
  }
  assert(landed, "Kbd: reached a game tile via Tab");
  if (landed) {
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const opened = await dialog.first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    assert(opened, "Kbd: Enter on a tile opens the mode dialog");
    if (opened) {
      // a11y: aria-modal dialog SHOULD move focus into itself (focus trap).
      const focusInsideDialog = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && dlg.contains(document.activeElement) && document.activeElement !== document.body;
      });
      assert(focusInsideDialog, "Kbd[a11y]: focus moves INTO the open dialog (focus trap)",
        focusInsideDialog ? "" : "focus left on background trigger — keyboard/SR users land outside the modal");
      // Escape closes.
      await page.keyboard.press("Escape");
      const closed = await dialog.first().waitFor({ state: "detached", timeout: 3000 }).then(() => true).catch(() => false);
      assert(closed, "Kbd: Escape closes the mode dialog");
    }
  }
  await page.close();
}

async function tileLaunch(ctx) {
  console.log("\n=== Tile launch + back-nav per game ===");
  for (const g of GAMES) {
    const page = await ctx.newPage();
    const errors = [];
    listenConsole(page, errors);
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const tile = page.getByRole("button", { name: new RegExp(g.name, "i") });
    await tile.first().click();
    const dlg = page.getByRole("dialog");
    const dlgOpen = await dlg.first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    assert(dlgOpen, `${g.name}: tile opens mode dialog`);
    // Dialog title should name the game.
    if (dlgOpen) {
      const title = (await dlg.first().textContent()) ?? "";
      assert(new RegExp(g.name, "i").test(title), `${g.name}: dialog titled with game name`);
    }
    await page.getByRole("button", { name: /Play vs Bot/i }).click();
    const navOk = await page.waitForURL(new RegExp(`/play/${g.slug}`), { timeout: 15000 }).then(() => true).catch(() => false);
    assert(navOk, `${g.name}: "Play vs Bot" navigates to /play/${g.slug}`, page.url());

    // Back navigation returns to home cleanly.
    await page.goBack({ waitUntil: "networkidle" }).catch(() => {});
    const backHome = /\/$|\/$/.test(new URL(page.url()).pathname) || new URL(page.url()).pathname === "/";
    assert(new URL(page.url()).pathname === "/", `${g.name}: back-nav returns to home`, page.url());
    const tileAgain = await page.getByRole("button", { name: new RegExp(g.name, "i") }).count();
    assert(tileAgain >= 1, `${g.name}: home picker intact after back-nav`);
    assert(errors.length === 0, `${g.name}: console clean through launch`, errors.slice(0, 2).join(" | "));
    await page.close();
  }
}

async function responsive(ctx) {
  console.log("\n=== Responsive sweep (home + picker) ===");
  const widths = [
    { w: 375, h: 740, label: "375 (iPhone SE)" },
    { w: 414, h: 896, label: "414 (iPhone XR)" },
    { w: 768, h: 1024, label: "768 (tablet)" },
    { w: 1280, h: 800, label: "1280 (desktop)" },
  ];
  for (const { w, h, label } of widths) {
    const c = await ctx.browser().newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
    const page = await c.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const of = await overflow(page);
    assert(of <= 1, `Resp ${label}: no horizontal overflow on home`, `${of}px`);
    await page.screenshot({ path: `${SHOTS}/home-resp-${w}.png`, fullPage: true });

    // Tap-target size of game tiles on mobile widths (>=44px is the usable min).
    if (w <= 414) {
      const sizes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("main button")).map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
      });
      const tooSmall = sizes.filter((s) => s.h < 44 || s.w < 44);
      assert(tooSmall.length === 0, `Resp ${label}: tile tap targets >= 44px`, JSON.stringify(sizes.slice(0, 4)));
    }

    // Open the dialog at this width — check it fits and doesn't overflow.
    await page.getByRole("button", { name: /Blackjack/i }).first().click();
    const dlg = page.getByRole("dialog");
    if (await dlg.first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) {
      const ofd = await overflow(page);
      assert(ofd <= 1, `Resp ${label}: no overflow with mode dialog open`, `${ofd}px`);
      await page.screenshot({ path: `${SHOTS}/home-resp-${w}-dialog.png` });
    }
    await c.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await homeStructure(ctx);
    await keyboardNav(ctx);
    await tileLaunch(ctx);
    await responsive(ctx);
  } catch (e) {
    fail("driver crashed", e.message);
    console.error(e);
  } finally {
    await browser.close();
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n==== SUMMARY: ${passed}/${results.length} checks passed ====`);
  if (failed.length) { console.log("FAILURES:"); failed.forEach((f) => console.log(`  - ${f.n} ${f.x}`)); }
  process.exit(failed.length ? 1 : 0);
})();
