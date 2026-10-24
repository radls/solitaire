// Batch 7 browser check: card physics without layout change.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173
import { mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { chromium, devices, webkit } from "playwright-core";

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
      cardTransform: getComputedStyle(card).transform,
      cardPerspective: getComputedStyle(card).perspective,
      cardPreserve: getComputedStyle(card).transformStyle,
      liftIsFlipper: card.querySelector(".card-lift") === card.querySelector(".card-rotator"),
      flipperPreserve: getComputedStyle(card.querySelector(".card-rotator")).transformStyle,
      facesDirect: card.querySelector(".card-face.front")?.parentElement === card.querySelector(".card-rotator") &&
        card.querySelector(".card-face.back")?.parentElement === card.querySelector(".card-rotator"),
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
      faces.isolation === "auto" &&
      faces.cardTransform === "none" &&
      faces.cardPerspective !== "none" &&
      faces.cardPreserve === "flat" &&
      faces.liftIsFlipper &&
      faces.flipperPreserve === "preserve-3d" &&
      faces.facesDirect &&
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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buf) {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
  let o = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    o += 4;
    const type = buf.toString("ascii", o, o + 4);
    o += 4;
    const data = buf.subarray(o, o + len);
    o += len + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idats.push(data);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png ${width}x${height} depth ${bitDepth} type ${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  let p = 0;
  let prev = Buffer.alloc(stride);
  let red = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride);
    p += stride;
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (filter === 1) v = (v + left) & 255;
      else if (filter === 2) v = (v + up) & 255;
      else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) v = (v + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new Error(`png filter ${filter}`);
      cur[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      const r = cur[i];
      const g = cur[i + 1];
      const b = cur[i + 2];
      n++;
      if (r > 80 && r > g + 35 && r > b + 35 && g < 140 && b < 150) red++;
    }
    prev = cur;
  }
  return { width, height, red, n, redR: n ? red / n : 0 };
}

function absYaw(transform) {
  if (!transform || transform === "none") return 0;
  const m3 = transform.match(/matrix3d\(\s*([^)]+)\)/);
  if (m3) {
    const p = m3[1].split(",").map((s) => Number(s.trim()));
    let deg = (Math.atan2(-p[2], p[0]) * 180) / Math.PI;
    if (Number.isNaN(deg)) return null;
    deg = Math.abs(deg) % 360;
    if (deg > 180) deg = 360 - deg;
    return deg;
  }
  const m2 = transform.match(/matrix\(\s*([^)]+)\)/);
  if (m2) {
    const p = m2[1].split(",").map((s) => Number(s.trim()));
    const cos = Math.min(1, Math.max(-1, p[0]));
    return (Math.acos(cos) * 180) / Math.PI;
  }
  return null;
}

function transparentBg(bg) {
  if (!bg || bg === "transparent") return true;
  const m = bg.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(",").map((s) => Number(s.trim()));
  return parts.length === 4 && parts[3] === 0;
}

async function readFlipFrame(page, time) {
  return page.evaluate(async (time) => {
    const el = document.querySelector('.card[data-id="hearts-1"]');
    const rot = el?.querySelector(".card-rotator");
    const anims = el?.getAnimations({ subtree: true }).filter((a) => String(a.animationName || "").startsWith("card-flip")) || [];
    const anim = anims.find((a) => a.animationName === "card-flip");
    if (!el || !rot || !anim) return { missing: true, hasEl: !!el, hasRot: !!rot, hasAnim: !!anim };
    for (const item of anims) {
      item.pause();
      item.currentTime = time;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cs = getComputedStyle(el);
    const front = el.querySelector(".card-face.front");
    const back = el.querySelector(".card-face.back");
    const lift = el.querySelector(".card-lift");
    const between = lift ? getComputedStyle(lift) : null;
    return {
      transform: getComputedStyle(rot).transform,
      turning: el.classList.contains("is-turning") || el.dataset.turning === "1",
      bg: cs.backgroundColor,
      image: cs.backgroundImage,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      shadow: cs.boxShadow,
      frontBack: getComputedStyle(front).backfaceVisibility,
      backBack: getComputedStyle(back).backfaceVisibility,
      liftPreserve: between?.transformStyle || "",
      liftOpacity: between?.opacity || "",
      liftFilter: between?.filter || "",
      liftOverflow: between?.overflow || "",
      liftIsolation: between?.isolation || "",
      flipperPreserve: getComputedStyle(rot).transformStyle,
    };
  }, time);
}

async function shotCard(page) {
  const box = await page.locator('.card[data-id="hearts-1"]').boundingBox();
  if (!box) return null;
  const png = await page.screenshot({
    type: "png",
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    },
  });
  return decodePNG(png);
}

async function verifyFlip(engine, page) {
  await page.goto(`${BASE}?game=klondike&seed=12345`);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["night", "classic"]) {
    if (theme === "classic") {
      await page.click("#btn-theme");
      await page.waitForTimeout(80);
    }
    const swept = await page.evaluate(async () => {
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
      const result = window.__solitaire.move({ zone: "tableau", index: 1 }, { zone: "tableau", index: 0 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const el = document.querySelector('.card[data-id="hearts-1"]');
      const rot = el?.querySelector(".card-rotator");
      const anims = el?.getAnimations({ subtree: true }).filter((a) => String(a.animationName || "").startsWith("card-flip")) || [];
      const anim = anims.find((a) => a.animationName === "card-flip");
      for (const item of anims) item.pause();
      const timing = anim?.effect?.getTiming?.() || {};
      const dur = Number(timing.duration) || 0;
      const frames = [];
      if (anim && dur) {
        for (const p of [0, 0.12, 0.28, 0.45, 0.62, 0.78, 0.9, 0.97]) {
          const at = Math.min(dur - 1, Math.round(dur * p));
          for (const item of anims) item.currentTime = at;
          const cs = getComputedStyle(el);
          frames.push({
            time: anim.currentTime,
            transform: getComputedStyle(rot).transform,
            turning: el.classList.contains("is-turning") || el.dataset.turning === "1",
            bg: cs.backgroundColor,
            image: cs.backgroundImage,
            border: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
            shadow: cs.boxShadow,
          });
        }
        anim.currentTime = 0;
      }
      return {
        ok: result?.ok === true,
        hasAnim: !!anim,
        dur,
        turning: !!(el?.classList.contains("is-turning") || el?.dataset.turning === "1"),
        direct: el?.querySelector(".card-face.front")?.parentElement?.classList.contains("card-rotator") === true,
        frames,
      };
    });
    const frames = swept.frames.map((f) => ({ ...f, yaw: absYaw(f.transform) }));
    const frontTime = frames.find((f) => f.yaw != null && f.yaw <= 55)?.time;
    const backTime = frames.find((f) => f.yaw != null && f.yaw >= 120)?.time;
    let frontShot = null;
    let backShot = null;
    if (frontTime != null) {
      await readFlipFrame(page, frontTime);
      frontShot = await shotCard(page);
    }
    if (backTime != null) {
      await readFlipFrame(page, backTime);
      backShot = await shotCard(page);
    }
    const turningFrames = frames.filter((f) => f.turning);
    const clearChrome = turningFrames.length > 0 && turningFrames.every(
      (f) => transparentBg(f.bg) && f.image === "none" && f.border.split(" ")[1] === "none" && f.shadow === "none",
    );
    const frontOk = frontShot != null && frontShot.redR > 0.015;
    const backOk = backShot != null && backShot.redR < 0.008;
    ok(
      engine,
      `${theme} flip shows the front before 90deg and a clear outer card`,
      swept.ok && swept.hasAnim && swept.turning && swept.direct && clearChrome && frontOk && backOk,
      JSON.stringify({
        swept: { ok: swept.ok, hasAnim: swept.hasAnim, dur: swept.dur, turning: swept.turning, direct: swept.direct },
        frames,
        frontRed: frontShot?.redR,
        backRed: backShot?.redR,
      }),
    );
    const finalState = await page.evaluate(async () => {
      const el = document.querySelector('.card[data-id="hearts-1"]');
      for (const anim of el.getAnimations({ subtree: true })) {
        try { anim.finish(); } catch { /* already finished */ }
      }
      const t0 = performance.now();
      while (performance.now() - t0 < 1600) {
        if (!el.classList.contains("is-turning") && el.dataset.turning !== "1") break;
        await new Promise((r) => setTimeout(r, 30));
      }
      return {
        faceUp: el.classList.contains("face-up"),
        turning: el.classList.contains("is-turning") || el.dataset.turning === "1",
        label: el.getAttribute("aria-label"),
        rank: el.querySelector(".corner")?.textContent || "",
      };
    });
    const finalShot = await shotCard(page);
    ok(
      engine,
      `${theme} flip ends face-up`,
      finalState.faceUp &&
        !finalState.turning &&
        finalState.label === "A of hearts" &&
        finalState.rank.includes("A") &&
        finalShot &&
        finalShot.redR > 0.015,
      JSON.stringify({ finalState, redR: finalShot?.redR }),
    );
  }
}

async function verifyReducedClear(engine, page) {
  await page.goto(`${BASE}?game=klondike&seed=12345`);
  await page.waitForTimeout(300);
  const reduced = await page.evaluate(async () => {
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
    const t0 = performance.now();
    const result = window.__solitaire.move({ zone: "tableau", index: 1 }, { zone: "tableau", index: 0 });
    const el = document.querySelector('.card[data-id="hearts-1"]');
    const seen = [];
    const read = () => {
      seen.push({
        t: performance.now() - t0,
        turning: !!(el?.classList.contains("is-turning") || el?.dataset.turning === "1"),
      });
    };
    read();
    await new Promise((resolve) => {
      const tick = () => {
        read();
        if (performance.now() - t0 < 100) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return {
      ok: result?.ok === true,
      match: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      seen,
      faceUp: el?.classList.contains("face-up") === true,
      label: el?.getAttribute("aria-label") || "",
    };
  });
  const onTime = reduced.seen.filter((s) => s.t <= 100);
  const after = reduced.seen.filter((s) => s.t >= 90);
  ok(
    engine,
    "reduced motion clears turning within 100ms",
    reduced.ok &&
      reduced.match &&
      reduced.faceUp &&
      reduced.label === "A of hearts" &&
      onTime.some((s) => !s.turning) &&
      after.length > 0 &&
      after.every((s) => !s.turning),
    JSON.stringify(reduced),
  );
}

const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;

const flipChrome = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
{
  const ctx = await flipChrome.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await verifyFlip("chromium", page);
  await ctx.close();
  const rctx = await flipChrome.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const rpage = await rctx.newPage();
  await verifyReducedClear("chromium", rpage);
  await rctx.close();
  await flipChrome.close();
}

const flipWebkit = await webkit.launch();
{
  const ctx = await flipWebkit.newContext(iphone);
  const page = await ctx.newPage();
  await verifyFlip("webkit", page);
  await ctx.close();
  const rctx = await flipWebkit.newContext({ ...iphone, reducedMotion: "reduce" });
  const rpage = await rctx.newPage();
  await verifyReducedClear("webkit", rpage);
  await rctx.close();
  await flipWebkit.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
if (failed.length) process.exit(1);
