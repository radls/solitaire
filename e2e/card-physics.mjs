// Card physics: pile skew, backs, sheen permission, drag landing.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173 --strictPort
// BASE=http://127.0.0.1:4173/solitaire/ node e2e/card-physics.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
const SHOTS = process.env.SHOTS_DIR || "/workspace/sol-physics/evidence";
mkdirSync(SHOTS, { recursive: true });

const BACKS = ["lattice", "diamond", "waves", "medallion", "stars", "herringbone"];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failed = 0;
const check = (name, cond, note) => {
  if (!cond) failed += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${note == null || note === "" ? "" : " — " + note}`);
};

function skewKey(card) {
  return `${card.id}|${card.zone}|${card.index}|${card.rot}|${card.dx}|${card.dy}`;
}

async function ready(page) {
  await page.waitForFunction(() => typeof window.__solitaire?.getState === "function", null, { timeout: 8000 });
  await page.waitForSelector("#table .card", { timeout: 8000 });
}

async function readSkew(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".pile .card")].map((el) => ({
      id: el.dataset.id,
      zone: el.dataset.zone,
      index: el.dataset.index,
      rot: el.style.getPropertyValue("--pile-rot"),
      dx: el.style.getPropertyValue("--pile-dx"),
      dy: el.style.getPropertyValue("--pile-dy"),
    })),
  );
}

async function dismissOverlay(page) {
  await page.evaluate(() => {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.innerHTML = "";
  });
}

async function waitReadyBoard(page) {
  await page.waitForFunction(() => !window.__solitaire?.isAnimating?.(), null, { timeout: 2000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".card.is-turning"), null, { timeout: 2000 }).catch(() => {});
  await dismissOverlay(page);
  await page.waitForTimeout(60);
}

async function layoutKlondike(page, spec) {
  await page.evaluate((spec) => {
    const state = window.__solitaire.getState();
    const card = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    state.tableau = Array.from({ length: 7 }, () => []);
    state.foundations = [[], [], [], []];
    state.stock = [];
    state.waste = [];
    state.won = false;
    state.stuck = false;
    state.moves = 4;
    for (const item of spec.tableau || []) state.tableau[item.index].push(card(item.suit, item.rank, item.faceUp !== false));
    for (const item of spec.foundations || []) state.foundations[item.index].push(card(item.suit, item.rank));
    for (const item of spec.stock || []) state.stock.push(card(item.suit, item.rank, false));
    for (const item of spec.waste || []) state.waste.push(card(item.suit, item.rank, true));
    window.__solitaire.setState(state);
  }, spec);
  await waitReadyBoard(page);
}

async function dragOnto(page, cardSel, dropSel, { shot } = {}) {
  const src = await page.locator(cardSel).boundingBox();
  const dst = await page.locator(dropSel).boundingBox();
  if (!src || !dst) return { missing: true, src: !!src, dst: !!dst };
  const sx = src.x + src.width / 2;
  const sy = src.y + Math.min(16, src.height * 0.25);
  const rx = Math.min(dst.x + dst.width - 4, dst.x + dst.width * 0.82);
  const ry = Math.min(dst.y + dst.height - 4, dst.y + Math.max(18, dst.height * 0.62));
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 90, sy - 16, { steps: 4 });
  const pose = await page.evaluate(() => {
    const ghost = document.querySelector("#drag-layer .ghost");
    const card = ghost?.querySelector(".card");
    const lift = card?.querySelector(".card-lift");
    if (!ghost || !card) return null;
    const box = card.getBoundingClientRect();
    return {
      id: card.dataset.id,
      tilt: ghost.style.getPropertyValue("--card-tilt"),
      bend: ghost.style.getPropertyValue("--card-drag-rx"),
      lean: ghost.style.getPropertyValue("--card-drag-ry"),
      transform: lift ? getComputedStyle(lift).transform : "",
      y: box.y,
    };
  });
  if (shot && pose) await page.screenshot({ path: shot });
  await page.mouse.move(rx, ry, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const landed = await page.evaluate((id) => {
    const el = document.querySelector(`#table .card[data-id="${id}"]`);
    return el ? { zone: el.dataset.zone, index: el.dataset.index, id } : null;
  }, pose?.id || "");
  return { pose, landed, src, dst };
}

const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

const freshThemeCtx = await browser.newContext(desktop);
const freshThemePage = await freshThemeCtx.newPage();
await freshThemePage.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(freshThemePage);
const freshTheme = await freshThemePage.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  color: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
  pref: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").theme,
}));
check(
  "a fresh profile starts in Classic",
  freshTheme.theme === "classic" && freshTheme.color === "#0a3324" && (freshTheme.pref == null || freshTheme.pref === "classic"),
  JSON.stringify(freshTheme),
);
await freshThemeCtx.close();

const savedNightCtx = await browser.newContext(desktop);
await savedNightCtx.addInitScript(() => {
  try {
    localStorage.setItem("grok-solitaire:prefs", JSON.stringify({ theme: "night", sound: false }));
  } catch {}
});
const savedNightPage = await savedNightCtx.newPage();
await savedNightPage.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(savedNightPage);
const savedNight = await savedNightPage.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  color: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "",
  pref: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").theme,
}));
check(
  "a saved night theme is still night after load",
  savedNight.theme === "night" && savedNight.color === "#080c0b" && savedNight.pref === "night",
  JSON.stringify(savedNight),
);
await savedNightPage.reload({ waitUntil: "domcontentloaded" });
await ready(savedNightPage);
const savedNightReload = await savedNightPage.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  pref: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").theme,
}));
check(
  "a saved night theme stays night after reload",
  savedNightReload.theme === "night" && savedNightReload.pref === "night",
  JSON.stringify(savedNightReload),
);
await savedNightCtx.close();

const ctx = await browser.newContext(desktop);
const page = await ctx.newPage();
page.on("pageerror", (error) => page.errs.push(String(error)));
page.errs = [];

await page.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(page);
const opened = await page.evaluate(() => document.documentElement.dataset.cardBack);
check("a deal shows one of the six backs", BACKS.includes(opened), opened);

const storedBack = await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem("grok-solitaire-v1") || "{}");
  return data.saved?.cardBack || data.dailySaved?.cardBack || null;
});
check("the dealt back is written into the save", storedBack === opened, storedBack);

// Fresh context so the live deal page cannot persist() over the patched back
// when this tab is hidden or a second page in the same context loads.
const packed = await page.evaluate(() => localStorage.getItem("grok-solitaire-v1"));
const resumeCtx = await browser.newContext(desktop);
await resumeCtx.addInitScript((raw) => {
  const data = JSON.parse(raw || "{}");
  if (data.saved) data.saved.cardBack = "stars";
  if (data.dailySaved) data.dailySaved.cardBack = "stars";
  localStorage.setItem("grok-solitaire-v1", JSON.stringify(data));
}, packed);
const resumePage = await resumeCtx.newPage();
await resumePage.goto(`${BASE}?game=klondike`, { waitUntil: "domcontentloaded" });
await ready(resumePage);
const resumed = await resumePage.evaluate(() => document.documentElement.dataset.cardBack);
check("resume keeps the saved back", resumed === "stars", resumed);
await resumeCtx.close();

const beforeSkew = await readSkew(page);
check("pile cards carry skew variables", beforeSkew.length > 3 && beforeSkew.every((card) => /^-?\d+\.\d+$/.test(card.rot)), String(beforeSkew.length));
const spread = new Set(beforeSkew.map((card) => card.rot)).size;
check("skew is not one shared angle", spread > 1, String(spread));
await page.evaluate(() => window.__solitaire.setState(structuredClone(window.__solitaire.getState())));
await page.waitForTimeout(80);
const rerendered = await readSkew(page);
check("skew is stable across re-render", beforeSkew.map(skewKey).join("\n") === rerendered.map(skewKey).join("\n"));

const move = await page.evaluate(() => {
  const found = window.__solitaire.listMoves().find((item) => item.kind !== "draw" && item.from?.zone === "tableau");
  if (!found) return null;
  const result = window.__solitaire.move(found.from, found.to);
  return { ok: result?.ok === true, from: found.from, to: found.to };
});
check("a tableau move lands before undo", !!move?.ok, JSON.stringify(move));
await page.evaluate(() => window.__solitaire.undo());
await page.waitForTimeout(80);
const undone = await readSkew(page);
check("skew is stable across undo", beforeSkew.map(skewKey).join("\n") === undone.map(skewKey).join("\n"));

const stockBefore = await page.evaluate(() => window.__solitaire.getState().waste.length);
const stockBox = await page.locator(".slot.stock").boundingBox();
if (stockBox) await page.mouse.click(stockBox.x + stockBox.width / 2, stockBox.y + stockBox.height / 2);
await page.waitForTimeout(250);
const stockAfter = await page.evaluate(() => window.__solitaire.getState().waste.length);
check("stock press still draws", stockAfter > stockBefore, `${stockBefore} -> ${stockAfter}`);

await page.evaluate(() => {
  document.documentElement.dataset.theme = "classic";
});
await layoutKlondike(page, {
  tableau: [
    { index: 0, suit: "spades", rank: 7 },
    { index: 3, suit: "hearts", rank: 8 },
    { index: 6, suit: "hearts", rank: 1 },
  ],
  stock: [{ suit: "clubs", rank: 5 }],
});
await page.screenshot({ path: `${SHOTS}/pile-skew.png` });
const drag = await dragOnto(page, '#table .card[data-id="spades-7"]', '[data-drop="tableau:3"]', {
  shot: `${SHOTS}/drag-lift-desktop.png`,
});
const tilt = Number.parseFloat(drag.pose?.tilt || "0");
check(
  "desktop drag lifts and lands on the pile",
  drag.landed?.zone === "tableau" && drag.landed?.index === "3" && Math.abs(tilt) > 0.2,
  JSON.stringify({ pose: drag.pose, landed: drag.landed }),
);

await layoutKlondike(page, {
  tableau: [{ index: 1, suit: "hearts", rank: 1 }],
  stock: [{ suit: "clubs", rank: 5 }],
});
const ace = await page.locator('#table .card[data-id="hearts-1"]').boundingBox();
if (ace) {
  const ax = ace.x + ace.width / 2;
  const ay = ace.y + 12;
  await page.mouse.click(ax, ay);
  await page.waitForTimeout(80);
  await page.mouse.click(ax, ay);
}
await page.waitForFunction(
  () => document.querySelector('#table .card[data-id="hearts-1"]')?.dataset.zone === "foundation",
  null,
  { timeout: 2000 },
).catch(() => {});
const aceHome = await page.evaluate(() => document.querySelector('#table .card[data-id="hearts-1"]')?.dataset.zone);
check("double-tap still sends an ace home", aceHome === "foundation", aceHome);

for (const back of BACKS) {
  await page.evaluate((id) => {
    document.documentElement.dataset.cardBack = id;
    document.documentElement.dataset.sheen = "idle";
  }, back);
  const card = page.locator(".card.face-down").first();
  await card.screenshot({ path: `${SHOTS}/back-${back}.png` });
}
await page.evaluate(() => {
  document.documentElement.dataset.cardBack = "waves";
  document.documentElement.dataset.sheen = "pointer";
  document.documentElement.style.setProperty("--sheen-x", "48%");
  document.documentElement.style.setProperty("--sheen-y", "8%");
});
await page.mouse.move(200, 120);
await page.locator(".card.face-down").first().screenshot({ path: `${SHOTS}/sheen-pointer.png` });
await page.screenshot({ path: `${SHOTS}/board-waves.png` });

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(page);
if (await page.locator("#overlay:not([hidden]) .modal").isVisible().catch(() => false)) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}
await page.evaluate(() => {
  document.documentElement.dataset.theme = "classic";
  document.documentElement.dataset.sheen = "idle";
  delete document.documentElement.dataset.sheenPaused;
});
const shimmer = await page.evaluate(() => {
  const downs = [...document.querySelectorAll("#table .card.face-down")];
  const ups = [...document.querySelectorAll("#table .card.face-up")];
  const name = (el, pseudo) => (el ? getComputedStyle(el, pseudo).animationName : "");
  return {
    down: downs.slice(0, 8).map((el) => name(el, "::before")),
    upBack: ups.slice(0, 8).map((el) => name(el.querySelector(".card-face.back"), "::before")),
  };
});
check(
  "idle shimmer runs on visible face-down cards",
  shimmer.down.length > 1 && shimmer.down.every((name) => name.includes("back-shimmer")),
  JSON.stringify(shimmer.down),
);
check(
  "idle shimmer does not run on hidden face-up backs",
  shimmer.upBack.length > 1 && shimmer.upBack.every((name) => name === "none" || name === ""),
  JSON.stringify(shimmer.upBack),
);
await page.evaluate(() => {
  document.documentElement.dataset.sheenPaused = "1";
});
const paused = await page.evaluate(() =>
  [...document.querySelectorAll("#table .card.face-down")].slice(0, 6).map((el) => getComputedStyle(el, "::before").animationPlayState),
);
check("idle shimmer pauses when the tab is marked hidden", paused.length > 1 && paused.every((state) => state === "paused"), JSON.stringify(paused));
await page.evaluate(() => {
  delete document.documentElement.dataset.sheenPaused;
});
await page.mouse.move(240, 80);
await page.waitForTimeout(40);
const sheenBefore = await page.evaluate(() => {
  const card = document.querySelector("#table .card.face-down");
  return {
    mode: document.documentElement.dataset.sheen,
    x: getComputedStyle(card).getPropertyValue("--sheen-x").trim(),
    y: getComputedStyle(card).getPropertyValue("--sheen-y").trim(),
  };
});
await page.evaluate(() => {
  window.__solitaire.setState(window.__solitaire.getState());
});
await page.waitForTimeout(50);
const sheenAfter = await page.evaluate(() => {
  const card = document.querySelector("#table .card.face-down");
  return {
    mode: document.documentElement.dataset.sheen,
    x: getComputedStyle(card).getPropertyValue("--sheen-x").trim(),
    y: getComputedStyle(card).getPropertyValue("--sheen-y").trim(),
    id: card?.dataset.id || "",
  };
});
check(
  "sheen position survives a board render",
  sheenBefore.mode === "pointer" &&
    sheenBefore.x !== "" &&
    sheenBefore.x !== "0%" &&
    sheenAfter.x === sheenBefore.x &&
    sheenAfter.y === sheenBefore.y,
  JSON.stringify({ sheenBefore, sheenAfter }),
);

await page.locator("#btn-help").click();
const desktopHelp = await page.evaluate(() => !!document.querySelector("[data-testid='tilt-sheen']"));
check("desktop Help hides the tilt control", desktopHelp === false);
await page.keyboard.press("Escape");

check("desktop board does not scroll sideways", overflow <= 1, String(overflow));
check("desktop page has no script errors", page.errs.length === 0, page.errs.join(" | "));
await ctx.close();

const phoneCtx = await browser.newContext(phone);
const phonePage = await phoneCtx.newPage();
phonePage.errs = [];
phonePage.on("pageerror", (error) => phonePage.errs.push(String(error)));
await phonePage.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(phonePage);
const phoneOverflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("390px board does not scroll sideways", phoneOverflow <= 1, String(phoneOverflow));
await layoutKlondike(phonePage, {
  tableau: [
    { index: 0, suit: "spades", rank: 7 },
    { index: 3, suit: "hearts", rank: 8 },
    { index: 6, suit: "hearts", rank: 1 },
  ],
  stock: [{ suit: "clubs", rank: 5 }],
});
const phoneDrag = await dragOnto(phonePage, '#table .card[data-id="spades-7"]', '[data-drop="tableau:3"]', {
  shot: `${SHOTS}/drag-lift-phone.png`,
});
check(
  "390px drag lands on the pile",
  phoneDrag.landed?.zone === "tableau" && phoneDrag.landed?.index === "3",
  JSON.stringify({ pose: phoneDrag.pose, landed: phoneDrag.landed }),
);
await phonePage.evaluate(() => {
  document.documentElement.dataset.theme = "classic";
  document.documentElement.dataset.sheen = "idle";
});
await phonePage.locator("#btn-help").click();
const phoneHelp = await phonePage.evaluate(() => {
  const help = document.querySelector("[data-testid='help-modal']");
  const wrap = help?.querySelector("[data-testid='tilt-sheen-wrap']");
  const stats = [...(help?.querySelectorAll("p") || [])].find((node) => /Won /.test(node.textContent || ""));
  return {
    shown: !!wrap,
    copy: wrap?.querySelector("p")?.textContent || "",
    beforeStats: !!(wrap && stats && wrap.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
});
check(
  "phone Help explains tilt above the stats",
  phoneHelp.shown && phoneHelp.copy.includes("Tilt the phone") && phoneHelp.beforeStats,
  JSON.stringify(phoneHelp),
);
await phonePage.keyboard.press("Escape");
await phonePage.waitForTimeout(50);
await phonePage.evaluate(() => {
  window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 90 }));
});
const afterTouch = await phonePage.evaluate(() => document.documentElement.dataset.sheen);
check("a touch move turns the sheen to pointer", afterTouch === "pointer", afterTouch);
await phonePage.evaluate(() => {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 90 }));
});
const afterRelease = await phonePage.evaluate(() => document.documentElement.dataset.sheen);
check("the sheen returns to idle when the touch ends", afterRelease === "idle", afterRelease);
check("390px page has no script errors", phonePage.errs.length === 0, phonePage.errs.join(" | "));
await phoneCtx.close();

const reduceCtx = await browser.newContext({ ...desktop, reducedMotion: "reduce" });
const reducePage = await reduceCtx.newPage();
await reducePage.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(reducePage);
const reduced = await reducePage.evaluate(() => {
  const downs = [...document.querySelectorAll(".card.face-down")];
  return {
    motion: document.documentElement.dataset.motion,
    reduceClass: document.documentElement.classList.contains("reduce-motion"),
    media: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    count: downs.length,
    cards: downs.map((card) => {
      const sheen = getComputedStyle(card, "::before");
      return { animation: sheen.animationName || "", transform: sheen.transform || "" };
    }),
  };
});
check(
  "reduced motion turns the sheen animation off on every face-down card",
  reduced.media &&
    reduced.motion === "reduce" &&
    reduced.reduceClass &&
    reduced.count > 1 &&
    reduced.cards.every((card) => card.animation === "none" || card.animation === ""),
  JSON.stringify({ count: reduced.count, motion: reduced.motion, sample: reduced.cards.slice(0, 4) }),
);
await layoutKlondike(reducePage, {
  tableau: [
    { index: 0, suit: "spades", rank: 7 },
    { index: 3, suit: "hearts", rank: 8 },
    { index: 6, suit: "hearts", rank: 1 },
  ],
  stock: [{ suit: "clubs", rank: 5 }],
});
const still = await dragOnto(reducePage, '#table .card[data-id="spades-7"]', '[data-drop="tableau:3"]');
check(
  "reduced motion drag stays level and still lands",
  still.landed?.zone === "tableau" && still.landed?.index === "3" && Number.parseFloat(still.pose?.tilt || "1") === 0,
  JSON.stringify({ pose: still.pose, landed: still.landed }),
);
await reduceCtx.close();

const tiltCtx = await browser.newContext({ ...desktop, hasTouch: true });
await tiltCtx.addInitScript(() => {
  window.__tiltCalls = 0;
  function DeviceOrientationEvent() {}
  DeviceOrientationEvent.requestPermission = () => {
    window.__tiltCalls += 1;
    return Promise.resolve("granted");
  };
  window.DeviceOrientationEvent = DeviceOrientationEvent;
});
const tiltPage = await tiltCtx.newPage();
await tiltPage.goto(`${BASE}?game=klondike&seed=7`, { waitUntil: "domcontentloaded" });
await ready(tiltPage);
const beforeTap = await tiltPage.evaluate(() => window.__tiltCalls);
check("iOS tilt permission is not requested on load", beforeTap === 0, String(beforeTap));
await tiltPage.locator("#btn-help").click();
await tiltPage.locator("[data-testid='tilt-sheen']").click();
await tiltPage.waitForTimeout(50);
const afterTap = await tiltPage.evaluate(() => ({
  calls: window.__tiltCalls,
  listening: document.documentElement.dataset.sheen,
  pressed: document.querySelector("[data-testid='tilt-sheen']")?.getAttribute("aria-pressed"),
}));
check("iOS tilt permission runs after the Help tap", afterTap.calls === 1 && afterTap.pressed === "true", JSON.stringify(afterTap));
await tiltPage.reload({ waitUntil: "domcontentloaded" });
await ready(tiltPage);
const reloaded = await tiltPage.evaluate(() => ({
  calls: window.__tiltCalls,
  pref: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").tiltSheen,
}));
check("a saved tilt opt-in does not prompt on reload", reloaded.calls === 0 && reloaded.pref === true, JSON.stringify(reloaded));
const downCalls = await tiltPage.evaluate(() => {
  const card = document.querySelector("#table .card");
  card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 80 }));
  return window.__tiltCalls;
});
check("a board pointerdown does not request tilt", downCalls === 0, String(downCalls));
const upCalls = await tiltPage.evaluate(() => {
  const card = document.querySelector("#table .card");
  card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 80 }));
  return window.__tiltCalls;
});
check("the first board pointerup re-requests tilt after reload", upCalls === 1, String(upCalls));
await tiltPage.locator("#btn-help").click();
const pressedAfterReload = await tiltPage.locator("[data-testid='tilt-sheen']").getAttribute("aria-pressed");
check("Help still shows tilt on after reload", pressedAfterReload === "true", pressedAfterReload);
await tiltPage.keyboard.press("Escape");
await tiltCtx.close();

const denyCtx = await browser.newContext({ ...desktop, hasTouch: true });
await denyCtx.addInitScript(() => {
  try {
    localStorage.setItem("grok-solitaire:prefs", JSON.stringify({ tiltSheen: true }));
  } catch {}
  window.__tiltCalls = 0;
  function DeviceOrientationEvent() {}
  DeviceOrientationEvent.requestPermission = () => {
    window.__tiltCalls += 1;
    return Promise.resolve("denied");
  };
  window.DeviceOrientationEvent = DeviceOrientationEvent;
});
const denyPage = await denyCtx.newPage();
await denyPage.goto(`${BASE}?game=klondike&seed=7`, { waitUntil: "domcontentloaded" });
await ready(denyPage);
await denyPage.evaluate(() => {
  const card = document.querySelector("#table .card");
  card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 80 }));
});
const denyDown = await denyPage.evaluate(() => window.__tiltCalls);
check("a denied path does not request tilt on pointerdown", denyDown === 0, String(denyDown));
await denyPage.evaluate(() => {
  const card = document.querySelector("#table .card");
  card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 80 }));
});
await denyPage.waitForTimeout(50);
const denied = await denyPage.evaluate(() => ({
  calls: window.__tiltCalls,
  pref: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").tiltSheen,
  sheen: document.documentElement.dataset.sheen,
}));
check("a denied re-request keeps the tilt pref and stays off tilt", denied.calls === 1 && denied.pref === true && denied.sheen !== "tilt", JSON.stringify(denied));
await denyPage.evaluate(() => {
  const card = document.querySelector("#table .card");
  card.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: 40, clientY: 80 }));
});
const deniedAgain = await denyPage.evaluate(() => window.__tiltCalls);
check("an explicit deny is not retried later in the session", deniedAgain === 1, String(deniedAgain));
await denyPage.locator("#btn-help").click();
const deniedPressed = await denyPage.locator("[data-testid='tilt-sheen']").getAttribute("aria-pressed");
check("Help still shows tilt on after a denied re-request", deniedPressed === "true", deniedPressed);
await denyCtx.close();

const bedCtx = await browser.newContext(desktop);
const bedPage = await bedCtx.newPage();
await bedPage.goto(`${BASE}?game=klondike&seed=42`, { waitUntil: "domcontentloaded" });
await ready(bedPage);
await bedPage.evaluate(() => {
  document.documentElement.dataset.theme = "night";
});
const bedtime = await bedPage.evaluate(() => {
  const card = document.querySelector(".card.face-down");
  const sheen = card ? getComputedStyle(card, "::before") : null;
  const up = document.querySelector(".card.face-up");
  const liftEl = up?.querySelector(".card-lift");
  if (liftEl) liftEl.style.transition = "none";
  up?.classList.add("selected");
  const lift = liftEl ? getComputedStyle(liftEl) : null;
  const selected = {
    transform: lift?.transform || "",
    shadow: lift?.boxShadow || "",
  };
  up?.classList.remove("selected");
  if (liftEl) liftEl.style.transition = "";
  return {
    theme: document.documentElement.dataset.theme,
    animation: sheen?.animationName || "",
    duration: parseFloat(sheen?.animationDuration || "0"),
    opacity: parseFloat(sheen?.opacity || "1"),
    selected,
  };
});
check(
  "bedtime keeps a dim, slow sheen and a pickup lift",
  bedtime.theme === "night" &&
    bedtime.animation.includes("back-shimmer") &&
    bedtime.duration >= 10 &&
    bedtime.opacity > 0 &&
    bedtime.opacity <= 0.3 &&
    bedtime.selected.transform !== "none" &&
    bedtime.selected.shadow !== "none" && !bedtime.selected.shadow.includes("0px 0px 0px 0px"),
  JSON.stringify(bedtime),
);
await layoutKlondike(bedPage, {
  tableau: [
    { index: 0, suit: "spades", rank: 7 },
    { index: 3, suit: "hearts", rank: 8 },
  ],
});
const calm = await dragOnto(bedPage, '#table .card[data-id="spades-7"]', '[data-drop="tableau:3"]');
check(
  "bedtime drag stays level, keeps a lift, and still lands",
  calm.landed?.zone === "tableau" &&
    calm.landed?.index === "3" &&
    Number.parseFloat(calm.pose?.tilt || "1") === 0 &&
    calm.pose?.transform &&
    calm.pose.transform !== "none",
  JSON.stringify({ pose: calm.pose, landed: calm.landed }),
);
await bedCtx.close();

await browser.close();
console.log(failed ? `FAILED ${failed}` : "ALL PASS");
console.log(`shots ${SHOTS}`);
process.exit(failed ? 1 : 0);
