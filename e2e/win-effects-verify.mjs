// Win effects v1.2.0. Desktop 1280×800 and phone 390×844.
// GITHUB_PAGES=true npx vite build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173 --strictPort
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
const SH = "/workspace/sol-wineffects/evidence";
mkdirSync(SH, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, note = "") => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${note ? " — " + note : ""}`);
};

const VPS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

async function newPage(P, extra = {}) {
  const ctx = await browser.newContext({ ...VPS[P], ...extra });
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") page.errs.push(m.text());
  });
  return [ctx, page];
}

async function setTheme(page, night) {
  const cur = await page.evaluate(() => document.documentElement.dataset.theme);
  if ((cur === "night") !== night) {
    if (await page.locator("#overlay:not([hidden]) .modal").isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(180);
    }
    await page.click("#btn-theme");
    await page.waitForTimeout(180);
  }
}

async function openGame(page, game, query = "") {
  await page.goto(`${BASE}?game=${game}${query}`);
  await page.waitForSelector("#btn-theme");
  await page.waitForTimeout(250);
}

async function readFx(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas[data-testid="win-fx"]')];
    const canvas = canvases[0];
    const modal = document.querySelector("[data-testid='win-modal']");
    const celebrate = document.querySelector("[data-testid='celebrate']");
    const fx = window.__winFx;
    return {
      canvases: canvases.length,
      kind: canvas?.dataset.kind || "",
      gentle: canvas?.dataset.gentle || "",
      particles: Number(canvas?.dataset.particles || 0),
      game: canvas?.dataset.game || "",
      pe: canvas ? getComputedStyle(canvas).pointerEvents : "",
      raf: !!fx?.raf?.(),
      active: !!fx?.active?.(),
      glow: !!modal?.classList.contains("win-glow"),
      win: !!modal?.classList.contains("win"),
      cascade: celebrate?.dataset.cascade ?? "",
      cards: document.querySelectorAll(".cascade-card").length,
      dim: !!celebrate?.classList.contains("dim"),
      duration: fx?.plan?.()?.durationMs ?? 0,
      planKind: fx?.plan?.()?.kind || "",
      won: !!window.__solitaire?.getState?.()?.won,
      over: !!window.__solitaire?.getState?.()?.over,
    };
  });
}

async function winKlondike(page, extra = {}) {
  return page.evaluate((extra) => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()];
    const by = Object.fromEntries(all.map((c) => [c.id, { ...c, faceUp: true }]));
    const suits = ["spades", "hearts", "diamonds", "clubs"];
    s.foundations = suits.map((su) => Array.from({ length: su === "spades" ? 12 : 13 }, (_, i) => by[`${su}-${i + 1}`]));
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [by["spades-13"]];
    s.stock = [];
    s.waste = [];
    s.won = false;
    s.wonAt = null;
    s.moves = Math.max(s.moves || 0, 41);
    if (extra.drawCount) s.drawCount = extra.drawCount;
    if (extra.pick) s.pick = extra.pick;
    else delete s.pick;
    if (extra.keepDaily) s.daily = s.daily || extra.keepDaily;
    else delete s.daily;
    window.__solitaire.setState(s);
    return window.__solitaire.move({ zone: "tableau", index: 0 }, { zone: "foundation", index: 0 });
  }, extra);
}

async function winFreeCell(page) {
  return page.evaluate(() => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.cascades.flat(), ...s.freecells.filter(Boolean), ...s.foundations.flat()];
    const by = Object.fromEntries(all.map((c) => [c.id, { ...c, faceUp: true }]));
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    s.freecells = [null, null, null, null];
    s.cascades = Array.from({ length: 8 }, () => []);
    s.foundations = suits.map((su) => Array.from({ length: su === "spades" ? 12 : 13 }, (_, i) => by[`${su}-${i + 1}`]));
    s.cascades[0] = [by["spades-13"]];
    s.won = false;
    s.wonAt = null;
    delete s.pick;
    delete s.daily;
    window.__solitaire.setState(s);
    return window.__solitaire.move({ zone: "cascade", index: 0 }, { zone: "foundation", index: 3 });
  });
}

async function winGolf(page) {
  return page.evaluate(() => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [];
    for (const su of ["spades", "hearts", "diamonds", "clubs"]) {
      for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    }
    const by = Object.fromEntries(all.map((c) => [c.id, { ...c }]));
    const rest = all.filter((c) => c.id !== "diamonds-5" && c.id !== "hearts-4");
    s.columns = Array.from({ length: 7 }, () => []);
    s.columns[3] = [{ ...by["diamonds-5"], faceUp: true }];
    s.waste = [...rest.slice(0, 30).map((c) => ({ ...c, faceUp: true })), { ...by["hearts-4"], faceUp: true }];
    s.stock = rest.slice(30, 32).map((c) => ({ ...c, faceUp: false }));
    s.over = false;
    s.wonAt = null;
    delete s.pick;
    delete s.daily;
    window.__solitaire.setState(s);
    return window.__solitaire.move({ type: "play", col: 3 });
  });
}

async function winKings(page) {
  return page.evaluate(() => {
    const s = structuredClone(window.__solitaire.getState());
    const mk = (su, r) => ({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const corner = (a, b) => Array.from({ length: 13 }, (_, i) => mk(i % 2 === 0 ? a : b, 13 - i));
    s.corners = [corner("spades", "hearts"), corner("hearts", "spades"), corner("clubs", "diamonds"), corner("diamonds", "clubs")];
    const ace = s.corners[0].pop();
    s.sides = [[ace], [], [], []];
    s.stock = [];
    s.waste = [];
    s.won = false;
    s.wonAt = null;
    s.stuck = false;
    s.idlePasses = 0;
    delete s.pick;
    delete s.daily;
    window.__solitaire.setState(s);
    return window.__solitaire.move({ zone: "side", index: 0, count: 1 }, { zone: "corner", index: 0 });
  });
}

async function hitButton(page, act) {
  const btn = page.locator(`[data-testid="win-modal"] [data-act="${act}"]`).first();
  await btn.scrollIntoViewIfNeeded();
  return btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 2);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 2);
    const top = document.elementFromPoint(x, y);
    const canvas = document.querySelector('canvas[data-testid="win-fx"]');
    return {
      pe: canvas ? getComputedStyle(canvas).pointerEvents : "none",
      hit: !!(top && (top === el || el.contains(top))),
      tag: top?.tagName || "",
      act: top?.closest?.("[data-act]")?.dataset?.act || "",
    };
  });
}

function note(fx) {
  return JSON.stringify({
    canvases: fx.canvases, kind: fx.kind, gentle: fx.gentle, particles: fx.particles,
    raf: fx.raf, active: fx.active, cascade: fx.cascade, cards: fx.cards, glow: fx.glow, pe: fx.pe,
  });
}

const classicParticles = { desktop: 90, phone: 55 };
const bedtimeParticles = { desktop: 30, phone: 18 };

for (const P of ["desktop", "phone"]) {
  let [ctx, page] = await newPage(P);
  if (P === "desktop") {
    await page.goto(BASE);
    await page.waitForSelector("[data-testid='app-version']");
    const ver = (await page.locator("[data-testid='app-version']").textContent())?.trim() || "";
    ok("i menu shows v1.2.0", ver.startsWith("v1.2.0 · "), ver);
  }
  await openGame(page, "klondike");
  await setTheme(page, false);
  const move = await winKlondike(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SH}/win-classic-${P === "phone" ? "390x844" : "1280x800"}.png` });
  let fx = await readFx(page);
  ok(`${P} a classic klondike confetti`, move?.ok === true && fx.canvases === 1 && fx.kind === "confetti" && fx.gentle === "0" && fx.raf && fx.particles === classicParticles[P] && fx.cascade === "16" && fx.cards === 16 && fx.pe === "none", `${note(fx)} move ${move?.ok}`);
  const hit = await hitButton(page, "again");
  ok(`${P} e play again is clickable`, hit.pe === "none" && hit.hit, JSON.stringify(hit));
  await page.locator('[data-testid="win-modal"] [data-act="again"]').click();
  await page.waitForTimeout(250);
  fx = await readFx(page);
  ok(`${P} e play again stops effects`, fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));

  await winKlondike(page);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(50);
  fx = await readFx(page);
  ok(`${P} f visibility hidden stops effects`, fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  if (P === "desktop") {
    await winKlondike(page);
    await page.waitForTimeout(200);
    const wait = await page.evaluate(() => (window.__winFx.plan()?.durationMs || 3200) + 1500);
    await page.waitForTimeout(wait);
    fx = await readFx(page);
    ok("g effect ends on its own", fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  }

  await setTheme(page, true);
  await winKlondike(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SH}/win-bedtime-${P === "phone" ? "390x844" : "1280x800"}.png` });
  fx = await readFx(page);
  ok(`${P} c bedtime is gentler`, fx.canvases === 1 && fx.gentle === "1" && fx.kind === "confetti" && fx.particles === bedtimeParticles[P] && fx.particles < classicParticles[P] && fx.cascade === "7" && fx.dim, note(fx));
  await setTheme(page, false);

  if (P === "desktop") {
    await winKlondike(page, { drawCount: 3 });
    await page.waitForTimeout(200);
    fx = await readFx(page);
    ok("b klondike draw 3 is both", fx.kind === "both" && fx.canvases === 1 && fx.particles === 90 + 5 + 5 * 36, note(fx));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await page.waitForTimeout(250);
    fx = await readFx(page);
    ok("e navigation (popstate) stops effects", fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  }
  ok(`${P} h no console errors (klondike)`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();

  [ctx, page] = await newPage(P);
  await openGame(page, "freecell");
  await setTheme(page, false);
  const fc = await winFreeCell(page);
  await page.waitForTimeout(300);
  fx = await readFx(page);
  ok(`${P} b freecell fireworks`, fc?.ok === true && fx.canvases === 1 && fx.kind === "fireworks" && fx.game === "freecell" && fx.gentle === "0", `${note(fx)} ${fc?.reason || ""}`);
  const fcHit = await hitButton(page, "new");
  ok(`${P} e freecell new deal is clickable`, fcHit.pe === "none" && fcHit.hit, JSON.stringify(fcHit));
  await page.locator('[data-testid="win-modal"] [data-act="new"]').click();
  await page.waitForTimeout(250);
  fx = await readFx(page);
  ok(`${P} e freecell new deal stops effects`, fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  ok(`${P} h no console errors (freecell)`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();

  [ctx, page] = await newPage(P);
  await openGame(page, "golf");
  await setTheme(page, false);
  const golf = await winGolf(page);
  await page.waitForTimeout(300);
  fx = await readFx(page);
  ok(`${P} b golf confetti`, golf?.ok === true && fx.canvases === 1 && fx.kind === "confetti" && fx.game === "golf" && fx.cascade === "16", `${note(fx)} ${golf?.reason || ""}`);
  const replayHit = await hitButton(page, "replay");
  ok(`${P} e golf replay is clickable`, replayHit.pe === "none" && replayHit.hit, JSON.stringify(replayHit));
  await page.locator('[data-testid="win-modal"] [data-act="replay"]').click();
  await page.waitForTimeout(250);
  fx = await readFx(page);
  ok(`${P} e golf replay stops effects`, fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  ok(`${P} h no console errors (golf)`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();

  [ctx, page] = await newPage(P);
  await openGame(page, "kings");
  await setTheme(page, false);
  const kings = await winKings(page);
  await page.waitForTimeout(300);
  fx = await readFx(page);
  ok(`${P} b kings confetti`, kings?.ok === true && fx.canvases === 1 && fx.kind === "confetti" && fx.game === "kings", `${note(fx)} ${kings?.reason || ""}`);
  await page.locator('[data-testid="win-modal"] [data-act="replay"]').click();
  await page.waitForTimeout(250);
  fx = await readFx(page);
  ok(`${P} e kings replay stops effects`, fx.canvases === 0 && fx.raf === false && fx.active === false, note(fx));
  ok(`${P} h no console errors (kings)`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();

  [ctx, page] = await newPage(P, { reducedMotion: "reduce" });
  await openGame(page, "klondike");
  await setTheme(page, false);
  await winKlondike(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SH}/win-reduced-${P === "phone" ? "390x844" : "1280x800"}.png` });
  fx = await readFx(page);
  ok(`${P} d reduced motion is glow only`, fx.canvases === 0 && fx.glow && fx.win && fx.raf === false && fx.cascade === "0" && fx.cards === 0 && fx.planKind === "glow", note(fx));
  ok(`${P} h no console errors (reduced)`, !page.errs.length, page.errs.join(" | "));
  await ctx.close();
}

{
  const [ctx, page] = await newPage("desktop");
  await openGame(page, "klondike", "&daily=1");
  await setTheme(page, false);
  const daily = await winKlondike(page, { keepDaily: "2026-11-20" });
  await page.waitForTimeout(250);
  const fx = await readFx(page);
  const dailyOn = await page.evaluate(() => window.__solitaire.getState().daily);
  ok("b daily deal fireworks", daily?.ok === true && !!dailyOn && fx.kind === "fireworks" && fx.canvases === 1 && fx.game === "klondike", `${note(fx)} daily ${dailyOn || ""}`);
  ok("h no console errors (daily)", !page.errs.length, page.errs.join(" | "));
  await ctx.close();
}

{
  const [ctx, page] = await newPage("desktop");
  await page.goto(BASE);
  await page.waitForSelector("[data-testid='app-version']");
  const today = await page.evaluate(() => window.__solitaire.pickToday());
  if (today?.game === "klondike") {
    await openGame(page, "klondike", "&pick=1");
    await setTheme(page, false);
    const moved = await winKlondike(page, { pick: today.date || "1" });
    await page.waitForTimeout(250);
    const fx = await readFx(page);
    ok("b grok pick is both", moved?.ok === true && fx.kind === "both" && fx.canvases === 1, note(fx));
  } else {
    console.log(`NOTE today's Grok's pick is ${today?.game || "unknown"} (${today?.date || ""}), not klondike. Injecting state.pick for a Klondike both.`);
    await openGame(page, "klondike");
    await setTheme(page, false);
    const moved = await winKlondike(page, { pick: "2026-11-18" });
    await page.waitForTimeout(250);
    const fx = await readFx(page);
    ok("b grok pick is both", moved?.ok === true && fx.kind === "both" && fx.canvases === 1 && fx.particles === 90 + 5 + 5 * 36, `${note(fx)} ${moved?.reason || ""}`);
  }
  ok("h no console errors (pick)", !page.errs.length, page.errs.join(" | "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
