// Batch 7 browser check: card physics without layout change.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4173/solitaire/";
const SH = process.env.SHOTS_DIR || "/tmp/solitaire-batch7";
mkdirSync(SH, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results = [];
const ok = (P, name, cond, note = "") => {
  results.push({ P, name, pass: !!cond, note });
  console.log(`${cond ? "PASS" : "FAIL"} [${P}] ${name}${note ? " — " + note : ""}`);
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

function near(a, b, eps = 0.6) {
  return Math.abs(a - b) <= eps;
}

async function readMotion(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const num = (name) => parseFloat(root.getPropertyValue(name));
    const card = document.querySelector("#table .card.face-up");
    const lift = card?.querySelector(".card-lift");
    if (lift) lift.style.transition = "none";
    if (card) card.classList.add("selected");
    const cs = lift ? getComputedStyle(lift) : null;
    const transform = cs?.transform || "none";
    const m = transform.startsWith("matrix") ? transform.slice(transform.indexOf("(") + 1, -1).split(",").map(Number) : [];
    const scale = transform === "none" ? 1 : m[0];
    const sample = card || document.querySelector("#table .card");
    sample?.classList.add("is-settling");
    const settle = sample ? getComputedStyle(sample.querySelector(".card-lift")).animationName : "";
    if (card) card.classList.remove("selected");
    if (sample) sample.classList.remove("is-settling");
    return {
      scaleVar: num("--card-lift-scale"),
      tiltMax: num("--card-tilt-max"),
      liftY: num("--card-lift-y"),
      curl: num("--card-curl-rx"),
      motionMs: num("--card-motion-ms"),
      settleMs: num("--card-settle-ms"),
      theme: document.documentElement.dataset.theme,
      transform,
      scale,
      settle,
    };
  });
}

for (const P of ["desktop", "phone"]) {
  let [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(500);

  const faces = await page.evaluate(async () => {
    const card = document.querySelector("#table .card.face-up");
    const down = document.querySelector("#table .card.face-down");
    const front = card?.querySelector(".card-face.front");
    const back = card?.querySelector(".card-face.back");
    const fs = front ? getComputedStyle(front) : null;
    const bs = back ? getComputedStyle(back) : null;
    const href = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((link) => link.href)
      .find((url) => url.includes("/assets/"));
    const sheet = href ? await fetch(href).then((r) => r.text()) : "";
    return {
      front: !!front,
      back: !!back,
      downFront: !!down?.querySelector(".card-face.front"),
      downBack: !!down?.querySelector(".card-face.back"),
      frontBackface: fs?.backfaceVisibility || "",
      backBackface: bs?.backfaceVisibility || "",
      webkit: sheet.includes("-webkit-backface-visibility"),
      preserve: sheet.includes("preserve-3d"),
      perspective: sheet.includes("perspective"),
      isolation: getComputedStyle(card).isolation,
      frontZ: /translateZ\(\s*(?:0)?\.1px\s*\)/.test(sheet),
      backTransform: /rotateY\(180deg\) translateZ\(\s*(?:0)?\.1px\s*\)/.test(sheet),
      corner: !!card?.querySelector(".corner"),
      rank: card?.querySelector(".corner")?.textContent || "",
      label: card?.getAttribute("aria-label") || "",
      downClass: down?.classList.contains("face-down") === true,
      downLabel: down?.getAttribute("aria-label") || "",
      downRank: down?.querySelector(".corner")?.textContent || "",
    };
  });
  ok(
    P,
    "front and back faces hide their backs",
    faces.front &&
      faces.back &&
      faces.downFront &&
      faces.downBack &&
      faces.frontBackface === "hidden" &&
      faces.backBackface === "hidden" &&
      faces.webkit &&
      faces.preserve &&
      faces.perspective &&
      faces.isolation === "isolate" &&
      faces.frontZ &&
      faces.backTransform &&
      faces.corner &&
      faces.rank.length > 0 &&
      faces.label.length > 0 &&
      faces.downClass &&
      faces.downLabel === "Face-down card" &&
      faces.downRank === "",
    JSON.stringify(faces),
  );

  const layout = await page.evaluate(() => {
    const card = document.querySelector('#table .card[data-zone="tableau"].face-up');
    const box = () => {
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      return {
        w: card.offsetWidth,
        h: card.offsetHeight,
        t: card.offsetTop,
        l: card.offsetLeft,
        x: r.x,
        y: r.y,
        rw: r.width,
        rh: r.height,
        width: cs.width,
        height: cs.height,
        marginTop: cs.marginTop,
        top: cs.top,
        left: cs.left,
      };
    };
    const before = box();
    card.classList.add("selected");
    const during = box();
    card.classList.remove("selected");
    const after = box();
    return { before, during, after };
  });
  const same = (a, b) =>
    near(a.w, b.w) &&
    near(a.h, b.h) &&
    near(a.t, b.t) &&
    near(a.l, b.l) &&
    near(a.x, b.x) &&
    near(a.y, b.y) &&
    near(a.rw, b.rw) &&
    near(a.rh, b.rh) &&
    a.width === b.width &&
    a.height === b.height &&
    a.marginTop === b.marginTop &&
    a.top === b.top &&
    a.left === b.left;
  ok(P, "selection does not change the card box", same(layout.before, layout.during) && same(layout.before, layout.after), JSON.stringify(layout));

  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [c("spades", 6)];
    s.tableau[1] = [c("hearts", 1, false), c("diamonds", 5)];
    s.foundations = [[], [], [], []];
    s.stock = [];
    s.waste = [];
    s.moves = 3;
    s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(50);
  const flip = await page.evaluate(() => {
    const result = window.__solitaire.move({ zone: "tableau", index: 1 }, { zone: "tableau", index: 0 });
    const el = document.querySelector('.card[data-id="hearts-1"]');
    const rot = el?.querySelector(".card-rotator");
    const cs = rot ? getComputedStyle(rot) : null;
    return {
      ok: result?.ok === true,
      turning: el?.classList.contains("is-turning") === true || el?.dataset.turning === "1",
      faceUp: el?.classList.contains("face-up") === true,
      name: cs?.animationName || "",
      duration: cs?.animationDuration || "",
      transition: cs?.transitionDuration || "",
    };
  });
  const flipMs = parseFloat(flip.duration) || 0;
  ok(
    P,
    "face-up flip runs",
    flip.ok && flip.turning && flip.faceUp && flip.name.includes("card-flip") && flipMs > 0,
    JSON.stringify(flip),
  );
  await page.screenshot({ path: `${SH}/${P}-flip.png` });

  const night = await readMotion(page);
  ok(P, "bedtime theme is night", night.theme === "night", night.theme);
  await page.click("#btn-theme");
  await page.waitForTimeout(80);
  const classic = await readMotion(page);
  ok(
    P,
    "bedtime lift and tilt are smaller",
    night.theme === "night" &&
      classic.theme === "classic" &&
      night.scaleVar < classic.scaleVar &&
      night.scaleVar <= 1.025 &&
      classic.scaleVar >= 1.04 &&
      near(night.scale, night.scaleVar, 0.02) &&
      near(classic.scale, classic.scaleVar, 0.02) &&
      night.tiltMax < classic.tiltMax &&
      night.tiltMax <= 3 &&
      classic.tiltMax >= 6 &&
      Math.abs(night.liftY) < Math.abs(classic.liftY) &&
      night.curl < classic.curl &&
      night.motionMs > classic.motionMs &&
      night.settle === "none" &&
      classic.settle.includes("card-settle"),
    JSON.stringify({ night, classic }),
  );

  async function swipeTilt() {
    const box = await page.locator("#table .card.face-up").last().boundingBox();
    const max = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-tilt-max")));
    await page.mouse.move(box.x + 8, box.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 8 + i * 70, box.y + 12, { steps: 1 });
    const sample = await page.evaluate(() => ({
      value: parseFloat(document.querySelector("#drag-layer .ghost")?.dataset.tilt || "0"),
      ghost: !!document.querySelector("#drag-layer .ghost"),
    }));
    await page.mouse.up();
    await page.waitForTimeout(40);
    return { ...sample, max };
  }
  const classicTilt = await swipeTilt();
  await page.click("#btn-theme");
  await page.waitForTimeout(40);
  const nightTilt = await swipeTilt();
  const tilt = { classicTilt, nightTilt };
  ok(
    P,
    "drag tilt stays inside the theme clamp",
    Math.abs(tilt.classicTilt.value) <= tilt.classicTilt.max + 0.05 &&
      Math.abs(tilt.nightTilt.value) <= tilt.nightTilt.max + 0.05 &&
      Math.abs(tilt.classicTilt.value) > Math.abs(tilt.nightTilt.value) &&
      Math.abs(tilt.nightTilt.value) > 0.5,
    JSON.stringify(tilt),
  );
  ok(P, "no console errors", !page.errs.length, page.errs.join("|"));
  await ctx.close();

  [ctx, page] = await newPage(P, { reducedMotion: "reduce" });
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(400);
  const reduced = await page.evaluate(() => {
    const card = document.querySelector("#table .card.face-up");
    card.classList.add("selected");
    const nodes = [card, card.querySelector(".card-lift"), card.querySelector(".card-rotator"), ...document.querySelectorAll("#table .card")];
    const bad = [];
    for (const el of nodes) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      const times = `${cs.animationDuration} ${cs.transitionDuration}`.match(/[\d.]+/g)?.map(Number) || [];
      if (times.some((n) => n !== 0)) bad.push({ id: el.dataset?.id || el.className, times });
    }
    const lift = getComputedStyle(card.querySelector(".card-lift")).transform;
    return { bad: bad.slice(0, 4), lift, n: nodes.length };
  });
  ok(P, "reduced motion has no card duration and no lift", reduced.bad.length === 0 && reduced.lift === "none", JSON.stringify(reduced));
  await page.screenshot({ path: `${SH}/${P}-reduced.png` });
  await ctx.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
if (failed.length) process.exit(1);
