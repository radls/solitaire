// Table themes v1.3.0. Desktop 1280×800 and phone 390×844.
// GITHUB_PAGES=true npx vite build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173 --strictPort
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
const SH = process.env.SHOTS_DIR || join(dirname(fileURLToPath(import.meta.url)), "../evidence");
mkdirSync(SH, { recursive: true });

const IDS = [
  "classic-felt",
  "pub-fire",
  "coffee-shop",
  "library-desk",
  "train-dining",
  "beach-cabana",
  "midnight-casino",
];
const VPS = [
  { name: "390x844", viewport: { width: 390, height: 844 } },
  { name: "1280x800", viewport: { width: 1280, height: 800 } },
];
const SCHEMES = ["classic", "night"];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});
const results = [];
const ok = (name, cond, note = "") => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};

async function contextWith(store, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript((data) => {
    // Only seed once per tab so a reload can keep the app's own writes.
    if (sessionStorage.getItem("sol-table-init")) return;
    sessionStorage.setItem("sol-table-init", "1");
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
  }, store);
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  return [ctx, page];
}

async function ready(page, url = BASE) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('[data-testid="picker"], .card');
  await page.evaluate(async () => {
    document.documentElement.dataset.cardBack = "lattice";
    if (document.fonts?.ready) await document.fonts.ready;
  });
  const version = page.locator('[data-testid="app-version"]');
  if (await version.count()) {
    await version.evaluate((el) => {
      el.style.visibility = "hidden";
    });
  }
  await page.addStyleTag({
    content: `body::before { animation: none !important; opacity: var(--table-fx-still, 0) !important; transform: none !important; }`,
  });
  await page.waitForTimeout(80);
}

for (const id of IDS) {
  for (const scheme of SCHEMES) {
    for (const vp of VPS) {
      const store = {
        "grok-solitaire:theme-migration": "classic-1",
        "grok-solitaire:table": id,
        "grok-solitaire:prefs": JSON.stringify({ theme: scheme === "night" ? "night" : "classic" }),
      };
      const [ctx, page] = await contextWith(store, vp.viewport);
      await ready(page, `${BASE}?game=klondike&seed=100&draw=1`);
      const info = await page.evaluate(() => ({
        table: document.documentElement.getAttribute("data-table"),
        theme: document.documentElement.getAttribute("data-theme"),
      }));
      const file = join(SH, `table-${id}-${scheme}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      ok(`shot ${id} ${scheme} ${vp.name}`, info.table === id && info.theme === scheme, file);
      await ctx.close();
    }
  }
}

// Settings row, pin persistence, existing-player note, reduced motion.
{
  const [ctx, page] = await contextWith(
    {
      "grok-solitaire:theme-migration": "classic-1",
      "grok-solitaire:table": "random",
    },
    { width: 390, height: 844 },
  );
  await ready(page, BASE);
  ok("settings row on picker", await page.locator('[data-testid="table-settings"]').isVisible());
  ok("select has Random plus 7 themes", (await page.locator('[data-testid="table-select"] option').count()) === 8);
  await page.selectOption('[data-testid="table-select"]', "midnight-casino");
  await page.waitForTimeout(120);
  const pinned = await page.evaluate(() => ({
    table: document.documentElement.getAttribute("data-table"),
    pref: localStorage.getItem("grok-solitaire:table"),
  }));
  ok("pin applies immediately", pinned.table === "midnight-casino" && pinned.pref === "midnight-casino");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="table-select"]');
  const after = await page.evaluate(() => ({
    table: document.documentElement.getAttribute("data-table"),
    pref: localStorage.getItem("grok-solitaire:table"),
    selected: document.querySelector('[data-testid="table-select"]')?.value,
  }));
  ok("pin survives reload", after.table === "midnight-casino" && after.pref === "midnight-casino" && after.selected === "midnight-casino");
  await ctx.close();
}

{
  const [ctx, page] = await contextWith(
    {
      "grok-solitaire:theme-migration": "classic-1",
      "grok-solitaire:prefs": JSON.stringify({ theme: "classic" }),
    },
    { width: 390, height: 844 },
  );
  await ready(page, BASE);
  const state = await page.evaluate(() => ({
    table: document.documentElement.getAttribute("data-table"),
    pref: localStorage.getItem("grok-solitaire:table"),
    note: !!document.querySelector('[data-testid="table-themes-note"]'),
  }));
  ok("existing player is pinned to classic-felt", state.table === "classic-felt" && state.pref === "classic-felt");
  ok("existing player sees the new-themes note", state.note);
  await page.click('[data-testid="table-themes-random"]');
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({
    pref: localStorage.getItem("grok-solitaire:table"),
    note: !!document.querySelector('[data-testid="table-themes-note"]'),
    table: document.documentElement.getAttribute("data-table"),
    flag: localStorage.getItem("grok-solitaire:table-note"),
  }));
  ok("note switches to Random in one tap", after.pref === "random" && !after.note && after.flag === "dismissed");
  ok("random from the note applies a table", IDS.includes(after.table));
  await ctx.close();
}

{
  const [ctx, page] = await contextWith(
    {
      "grok-solitaire:theme-migration": "classic-1",
      "grok-solitaire:table": "pub-fire",
      "grok-solitaire:prefs": JSON.stringify({ theme: "classic" }),
    },
    { width: 1280, height: 800 },
  );
  await ctx.addInitScript(() => {});
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}?game=klondike&seed=100&draw=1`, { waitUntil: "networkidle" });
  await page.waitForSelector(".card");
  const motion = await page.evaluate(() => {
    const fx = getComputedStyle(document.body, "::before");
    const running = document.getAnimations?.() || [];
    return {
      anim: fx.animationName,
      play: fx.animationPlayState,
      running: running.filter((a) => a.playState === "running").length,
    };
  });
  ok(
    "reduced motion stops living table animations",
    motion.anim === "none" || motion.play === "paused" || motion.running === 0,
    JSON.stringify(motion),
  );
  await ctx.close();
}

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
if (failed.length) process.exit(1);
