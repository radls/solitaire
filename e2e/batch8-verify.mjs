// Batch 8 browser check: cards slide instead of snapping.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173 --strictPort
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { chromium, devices, webkit } from "playwright-core";

const BASE = "http://127.0.0.1:4173/solitaire/";
const SH = process.env.SHOTS_DIR || "/workspace/qa/b8";
mkdirSync(SH, { recursive: true });

const results = [];
const ok = (P, name, cond, note = "") => {
  results.push({ P, name, pass: !!cond, note });
  console.log(`${cond ? "PASS" : "FAIL"} [${P}] ${name}${note ? " — " + note : ""}`);
};

const card = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
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
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`png ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let p = 0;
  let prev = Buffer.alloc(stride);
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
      cur[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      const o = (y * width + x) * 4;
      rgba[o] = cur[i];
      rgba[o + 1] = cur[i + 1];
      rgba[o + 2] = cur[i + 2];
      rgba[o + 3] = bpp === 4 ? cur[i + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, rgba };
}

function concatFrames(frames) {
  const height = Math.max(...frames.map((f) => f.height));
  const width = frames.reduce((n, f) => n + f.width, 0);
  const rgba = Buffer.alloc(width * height * 4);
  let x0 = 0;
  for (const frame of frames) {
    for (let y = 0; y < frame.height; y++) {
      frame.rgba.copy(rgba, (y * width + x0) * 4, y * frame.width * 4, (y + 1) * frame.width * 4);
    }
    x0 += frame.width;
  }
  return encodePNG(width, height, rgba);
}

function between(start, end, point, slack = 6, minLength = 24) {
  const ab = Math.hypot(end.x - start.x, end.y - start.y);
  const ap = Math.hypot(point.x - start.x, point.y - start.y);
  const pb = Math.hypot(end.x - point.x, end.y - point.y);
  return ab > minLength && ap > 2 && pb > 2 && ap + pb <= ab + slack;
}

async function launchChrome() {
  return chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
}

async function boot(page) {
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") page.errs.push(m.text());
  });
}

async function openGame(page, game) {
  await page.goto(`${BASE}?game=${game}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#table .card");
  await page.waitForTimeout(450);
}

async function domMatches(page) {
  return page.evaluate(() => {
    const game = window.__solitaire.game();
    const state = window.__solitaire.getState();
    const places = [];
    const add = (card, zone, index) => {
      if (card) places.push({ id: card.id, zone, index: index == null ? "" : String(index) });
    };
    if (game === "klondike") {
      state.tableau.forEach((pile, index) => pile.forEach((c) => add(c, "tableau", index)));
      state.foundations.forEach((pile, index) => pile.forEach((c) => add(c, "foundation", index)));
      state.waste.forEach((c) => add(c, "waste", null));
      state.stock.forEach((c) => add(c, "stock", null));
    } else if (game === "freecell") {
      state.cascades.forEach((pile, index) => pile.forEach((c) => add(c, "cascade", index)));
      state.foundations.forEach((pile, index) => pile.forEach((c) => add(c, "foundation", index)));
      state.freecells.forEach((c, index) => add(c, "freecell", index));
    } else if (game === "golf") {
      state.columns.forEach((pile, index) => pile.forEach((c) => add(c, "column", index)));
      state.waste.forEach((c) => add(c, "waste", null));
      state.stock.forEach((c) => add(c, "stock", null));
    } else if (game === "kings") {
      state.sides.forEach((pile, index) => pile.forEach((c) => add(c, "side", index)));
      state.corners.forEach((pile, index) => pile.forEach((c) => add(c, "corner", index)));
      state.waste.forEach((c) => add(c, "waste", null));
      state.stock.forEach((c) => add(c, "stock", null));
    }
    const byId = new Map(places.map((p) => [p.id, p]));
    const dom = [...document.querySelectorAll("#table .card")].map((el) => ({
      id: el.dataset.id,
      zone: el.dataset.zone,
      index: el.dataset.index ?? "",
    }));
    const bad = dom.filter((el) => {
      const loc = byId.get(el.id);
      return !loc || loc.zone !== el.zone || loc.index !== el.index;
    });
    return { ok: bad.length === 0, bad: bad.slice(0, 4), n: dom.length };
  });
}

async function layoutKlondike(page, spec) {
  await page.evaluate((spec) => {
    const state = window.__solitaire.getState();
    const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    state.tableau = Array.from({ length: 7 }, () => []);
    state.foundations = [[], [], [], []];
    state.stock = [];
    state.waste = [];
    state.won = false;
    state.stuck = false;
    state.moves = 4;
    for (const item of spec.tableau || []) state.tableau[item.index].push(c(item.suit, item.rank, item.faceUp !== false));
    for (const item of spec.foundations || []) state.foundations[item.index].push(c(item.suit, item.rank));
    for (const item of spec.stock || []) state.stock.push(c(item.suit, item.rank, false));
    for (const item of spec.waste || []) state.waste.push(c(item.suit, item.rank, true));
    window.__solitaire.setState(state);
  }, spec);
  await page.waitForFunction(() => !window.__solitaire.isAnimating(), null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(60);
}

async function clickControl(page, id) {
  await page.evaluate((id) => {
    const name = id.replace(/^btn-/, "");
    const thumb = document.querySelector(`[data-testid="thumb-${name}"]`);
    const btn = document.getElementById(id);
    const shown = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
    (shown(thumb) ? thumb : btn)?.click();
  }, id);
}

async function sampleSlide(page, id) {
  return page.evaluate(async (id) => {
    const sel = `#table .card[data-id="${id}"]`;
    const started = performance.now();
    let host = null;
    let card = null;
    let anim = null;
    while (performance.now() - started < 500) {
      card = document.querySelector(sel);
      host = card?.parentElement?.classList.contains("card-slide") ? card.parentElement : null;
      const anims = host?.getAnimations?.() || [];
      anim = anims.find((a) => a.playState === "running" || a.playState === "pending") || null;
      if (anim) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!card || !host || !anim) {
      return { missing: true, sliding: !!host?.classList.contains("is-sliding"), waited: performance.now() - started };
    }
    const dur = Number(anim.effect?.getTiming?.().duration) || 200;
    let first = null;
    try {
      anim.pause();
      anim.currentTime = 0;
      first = card.getBoundingClientRect();
    } catch {
      /* no seek */
    }
    const target = Math.min(110, Math.max(50, dur * 0.42));
    try {
      anim.pause();
      anim.currentTime = target;
    } catch {
      /* keep the natural time */
    }
    const visual = card.getBoundingClientRect();
    try {
      anim.cancel();
    } catch {
      /* already gone */
    }
    host.style.transform = "none";
    const end = card.getBoundingClientRect();
    const cardCs = getComputedStyle(card);
    return {
      missing: false,
      x: visual.x,
      y: visual.y,
      endX: end.x,
      endY: end.y,
      time: target,
      sliding: host.classList.contains("is-sliding"),
      cardTransform: cardCs.transform,
      ease: host.dataset.slideEase || "",
      firstX: first?.x,
      firstY: first?.y,
      ms: Number(host.dataset.slideMs || "0"),
      gentle: host.dataset.slideGentle === "1",
      turning: card.classList.contains("is-turning"),
    };
  }, id);
}

async function dismissOverlay(page) {
  await page.evaluate(() => {
    document.querySelector("#overlay [data-testid='confirm-cancel'], #overlay [data-act='close']")?.click();
    const overlay = document.getElementById("overlay");
    if (overlay && !overlay.hidden) {
      overlay.hidden = true;
      overlay.innerHTML = "";
    }
  });
}

async function dragOnto(page, cardSel, dropSel) {
  const src = await page.locator(cardSel).boundingBox();
  const dst = await page.locator(dropSel).boundingBox();
  if (!src || !dst) return null;
  const sx = src.x + src.width / 2;
  const sy = src.y + Math.min(16, src.height * 0.25);
  const rx = Math.min(dst.x + dst.width - 4, dst.x + dst.width * 0.82);
  const ry = Math.min(dst.y + dst.height - 4, dst.y + Math.max(18, dst.height * 0.62));
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(rx, ry, { steps: 12 });
  const ghost = await page.evaluate(() => {
    const el = document.querySelector("#drag-layer .card");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, id: el.dataset.id };
  });
  await page.mouse.up();
  return ghost;
}

async function moveAndSample(page, from, to, id) {
  const start = await page.evaluate((id) => {
    const r = document.querySelector(`#table .card[data-id="${id}"]`).getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, id);
  const moved = page.evaluate(({ from, to }) => window.__solitaire.move(from, to), { from, to });
  const sample = await sampleSlide(page, id);
  const result = await moved;
  return { start, sample, ok: result?.ok === true };
}

const iphone = { ...devices["iPhone 13"] };
delete iphone.defaultBrowserType;

async function runEngine(name, browser, contextOptions, { shots = false } = {}) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  await boot(page);
  await openGame(page, "klondike");

  await layoutKlondike(page, {
    tableau: [
      { index: 0, suit: "spades", rank: 13 },
      { index: 1, suit: "hearts", rank: 6 },
    ],
  });
  const parked = await page.evaluate(() => {
    const el = document.querySelector('#table .card[data-id="hearts-6"]');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  const slide = await moveAndSample(page, { zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 6 }, "spades-13");
  const point = { x: slide.sample.x, y: slide.sample.y };
  const end = { x: slide.sample.endX, y: slide.sample.endY };
  const still = await page.evaluate(() => {
    const el = document.querySelector('#table .card[data-id="hearts-6"]');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, wrapped: !!el.closest(".card-slide") };
  });
  ok(
    name,
    "card is mid-path during a move",
    slide.ok &&
      slide.sample.sliding &&
      slide.sample.cardTransform === "none" &&
      between(slide.start, end, point) &&
      !still.wrapped &&
      Math.abs(still.x - parked.x) < 2 &&
      Math.abs(still.y - parked.y) < 2,
    JSON.stringify({ start: slide.start, point, end, still, parked, sample: slide.sample }),
  );

  if (shots) {
    await layoutKlondike(page, { tableau: [{ index: 0, suit: "diamonds", rank: 12 }] });
    const clip = await page.evaluate(() => {
      const a = document.querySelector('#table .card[data-id="diamonds-12"]').getBoundingClientRect();
      const slot = document.querySelector('[data-drop="tableau:6"]').getBoundingClientRect();
      const x = Math.max(0, Math.min(a.x, slot.x) - 8);
      const y = Math.max(0, Math.min(a.y, slot.y) - 8);
      const right = Math.max(a.right, slot.right) + 8;
      const bottom = Math.max(a.bottom, slot.bottom) + 8;
      return { x, y, width: right - x, height: bottom - y };
    });
    const frames = [];
    const go = page.evaluate(() => window.__solitaire.move({ zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 6 }));
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(i === 0 ? 30 : 22);
      const png = await page.screenshot({ clip, type: "png" });
      writeFileSync(`${SH}/frame-${String(i).padStart(2, "0")}.png`, png);
      frames.push(decodePNG(png));
    }
    await go;
    writeFileSync(`${SH}/slide-strip.png`, concatFrames(frames));
    ok(name, "saved a 10-frame slide strip", frames.length === 10 && frames.every((f) => f.width > 8), `${SH}/slide-strip.png`);
  }

  await layoutKlondike(page, {
    foundations: [{ index: 0, suit: "hearts", rank: 1 }],
    tableau: [
      { index: 0, suit: "hearts", rank: 2 },
      { index: 1, suit: "diamonds", rank: 1 },
      { index: 2, suit: "clubs", rank: 1 },
      { index: 3, suit: "spades", rank: 1 },
    ],
  });
  const chain = await page.evaluate(async () => {
    const seen = [];
    let stop = false;
    const watch = (async () => {
      const t0 = performance.now();
      while (!stop && performance.now() - t0 < 1400) {
        seen.push(document.querySelectorAll("#table .card-slide.is-sliding").length);
        await new Promise((r) => setTimeout(r, 30));
      }
    })();
    document.getElementById("btn-finish").click();
    await new Promise((r) => setTimeout(r, 700));
    stop = true;
    await watch;
    return { seen, max: Math.max(0, ...seen), hits: seen.filter((n) => n === 1).length };
  });
  ok(
    name,
    "chained auto-moves do not overlap",
    chain.max <= 1 && chain.hits >= 2,
    JSON.stringify(chain),
  );

  await layoutKlondike(page, {
    foundations: [{ index: 0, suit: "hearts", rank: 1 }],
    tableau: [
      { index: 0, suit: "hearts", rank: 2 },
      { index: 1, suit: "diamonds", rank: 1 },
      { index: 2, suit: "clubs", rank: 1 },
      { index: 3, suit: "spades", rank: 1 },
    ],
  });
  await page.evaluate(() => document.getElementById("btn-finish").click());
  await page.waitForTimeout(40);
  await clickControl(page, "btn-undo");
  await page.waitForTimeout(80);
  const afterUndo = await domMatches(page);
  ok(name, "undo during a chain matches state", afterUndo.ok && !page.errs.length, JSON.stringify(afterUndo));

  await layoutKlondike(page, {
    foundations: [{ index: 0, suit: "hearts", rank: 1 }],
    tableau: [
      { index: 0, suit: "hearts", rank: 2 },
      { index: 1, suit: "diamonds", rank: 1 },
      { index: 2, suit: "clubs", rank: 1 },
    ],
  });
  await page.evaluate(() => document.getElementById("btn-finish").click());
  await page.waitForTimeout(40);
  await clickControl(page, "btn-new");
  await page.waitForTimeout(60);
  const afterNew = await domMatches(page);
  ok(name, "new during a chain matches state", afterNew.ok, JSON.stringify(afterNew));
  await dismissOverlay(page);
  await page.waitForTimeout(40);

  await layoutKlondike(page, {
    foundations: [{ index: 0, suit: "hearts", rank: 1 }],
    tableau: [
      { index: 0, suit: "hearts", rank: 2 },
      { index: 4, suit: "clubs", rank: 4 },
    ],
  });
  await page.evaluate(() => document.getElementById("btn-finish").click());
  await page.waitForTimeout(30);
  const cardBox = await page.locator('#table .card[data-id="clubs-4"]').boundingBox();
  if (cardBox) await page.mouse.click(cardBox.x + 4, cardBox.y + 8);
  await page.waitForTimeout(60);
  const afterClick = await domMatches(page);
  ok(name, "click during a chain matches state", afterClick.ok, JSON.stringify(afterClick));

  await layoutKlondike(page, {
    tableau: [{ index: 2, suit: "clubs", rank: 9, faceUp: false }, { index: 2, suit: "hearts", rank: 8 }],
    stock: [{ suit: "diamonds", rank: 3 }],
  });
  const flipMove = page.evaluate(() => window.__solitaire.draw());
  const flip = await sampleSlide(page, "diamonds-3");
  await flipMove;
  ok(
    name,
    "a slide that also flips keeps the outer card untransformed",
    flip.sliding && flip.turning && flip.cardTransform === "none",
    JSON.stringify(flip),
  );

  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await layoutKlondike(page, {
    tableau: [
      { index: 0, suit: "spades", rank: 13 },
      { index: 6, suit: "hearts", rank: 12 },
    ],
  });
  const nightSlide = await moveAndSample(page, { zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 5 }, "spades-13");
  await dismissOverlay(page);
  if (theme === "night") await page.evaluate(() => document.getElementById("btn-theme").click());
  await page.waitForTimeout(40);
  await layoutKlondike(page, { tableau: [{ index: 0, suit: "spades", rank: 13 }] });
  const daySlide = await moveAndSample(page, { zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 5 }, "spades-13");
  // Fraction of the path still ahead at the sample time, and how far frame 0 sits from the real start.
  const frac = (s) => {
    const full = Math.hypot(s.start.x - s.sample.endX, s.start.y - s.sample.endY);
    const left = Math.hypot(s.sample.x - s.sample.endX, s.sample.y - s.sample.endY);
    return full ? left / full : 1;
  };
  const jump = (s) => Math.hypot(s.sample.firstX - s.start.x, s.sample.firstY - s.start.y);
  const nightFrac = frac(nightSlide);
  const dayFrac = frac(daySlide);
  const nightJump = jump(nightSlide);
  const dayJump = jump(daySlide);
  ok(
    name,
    "bedtime motion is gentler",
    theme === "night" &&
      nightSlide.sample.gentle &&
      !daySlide.sample.gentle &&
      nightJump < 3 &&
      dayJump < 3 &&
      nightSlide.sample.ms > daySlide.sample.ms &&
      nightSlide.sample.ms >= 150 &&
      daySlide.sample.ms >= 150 &&
      nightSlide.sample.ms <= 260 &&
      !nightSlide.sample.ease.includes("1.12") &&
      daySlide.sample.ease.includes("1.12") &&
      nightFrac < 0.9 &&
      nightFrac > dayFrac,
    JSON.stringify({ theme, nightJump, dayJump, nightFrac, dayFrac, night: nightSlide.sample, day: daySlide.sample }),
  );

  await ctx.close();

  const reducedCtx = await browser.newContext({ ...contextOptions, reducedMotion: "reduce" });
  const reducedPage = await reducedCtx.newPage();
  await boot(reducedPage);
  await openGame(reducedPage, "klondike");
  await layoutKlondike(reducedPage, { tableau: [{ index: 0, suit: "spades", rank: 13 }] });
  const reduced = await reducedPage.evaluate(async () => {
    const before = document.querySelector('#table .card[data-id="spades-13"]').getBoundingClientRect();
    const result = window.__solitaire.move({ zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 6 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = document.querySelector('#table .card[data-id="spades-13"]');
    const now = el.getBoundingClientRect();
    const host = el.parentElement;
    return {
      ok: result?.ok === true,
      match: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      sliding: !!document.querySelector(".card-slide.is-sliding"),
      wrapped: host?.classList.contains("card-slide") === true,
      dx: Math.abs(now.x - before.x),
      dy: Math.abs(now.y - before.y),
      zone: el.dataset.zone,
      index: el.dataset.index,
    };
  });
  ok(
    name,
    "reduced-motion moves are instant",
    reduced.ok && reduced.match && !reduced.sliding && !reduced.wrapped && reduced.zone === "tableau" && reduced.index === "6" && reduced.dx > 40,
    JSON.stringify(reduced),
  );
  await reducedCtx.close();

  const tapCtx = await browser.newContext(contextOptions);
  const tapPage = await tapCtx.newPage();
  await boot(tapPage);
  await openGame(tapPage, "klondike");
  await layoutKlondike(tapPage, { tableau: [{ index: 0, suit: "hearts", rank: 1 }] });
  const fromBox = await tapPage.locator('#table .card[data-id="hearts-1"]').boundingBox();
  const startTap = await tapPage.evaluate(() => {
    const r = document.querySelector('#table .card[data-id="hearts-1"]').getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  const target = await tapPage.locator('[data-drop="foundation:0"]').boundingBox();
  if (name === "webkit") {
    await tapPage.touchscreen.tap(fromBox.x + fromBox.width / 2, fromBox.y + 12);
    await tapPage.waitForTimeout(80);
    await tapPage.touchscreen.tap(target.x + target.width / 2, target.y + target.height / 2);
  } else {
    await tapPage.mouse.click(fromBox.x + fromBox.width / 2, fromBox.y + 12);
    await tapPage.waitForTimeout(80);
    await tapPage.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  }
  const tapped = await sampleSlide(tapPage, "hearts-1");
  ok(
    name,
    "tap move slides from the old spot",
    tapped.sliding && between(startTap, { x: tapped.endX, y: tapped.endY }, { x: tapped.x, y: tapped.y }),
    JSON.stringify({ startTap, tapped }),
  );

  await layoutKlondike(tapPage, {
    tableau: [
      { index: 0, suit: "spades", rank: 7 },
      { index: 3, suit: "hearts", rank: 8 },
      { index: 6, suit: "hearts", rank: 1 },
    ],
  });
  const ghost = await dragOnto(tapPage, '#table .card[data-id="spades-7"]', '[data-drop="tableau:3"]');
  const glide = ghost ? await sampleSlide(tapPage, ghost.id) : { missing: true };
  const glideOk =
    ghost &&
    glide.sliding &&
    between(ghost, { x: glide.endX, y: glide.endY }, { x: glide.x, y: glide.y }, 14, 8);
  ok(name, "drag-drop glides from the ghost", glideOk, JSON.stringify({ ghost, glide }));
  const glideState = await domMatches(tapPage);
  ok(name, "drag-drop ends matched to state", glideState.ok, JSON.stringify(glideState));

  // A drag that starts while the card is still sliding must still land.
  const race = [];
  for (const wait of [0, 0, 10, 30, 50, 70, 90, 120, 160, 220]) {
    await tapPage.goto(BASE + "?game=klondike&seed=12345");
    await tapPage.waitForTimeout(600);
    const mv = (await tapPage.evaluate(() => window.__solitaire.listMoves())).find(
      (m) => m.kind !== "draw" && m.from.zone === "tableau",
    );
    await tapPage.evaluate((m) => window.__solitaire.move(m.from, m.to), mv);
    await tapPage.waitForTimeout(400);
    const before = await tapPage.evaluate(() => window.__solitaire.historyLength());
    await tapPage.click('#btn-undo:visible, #thumb-undo:visible');
    if (wait) await tapPage.waitForTimeout(wait);
    const sb = await tapPage
      .locator(`.card[data-zone="tableau"][data-index="${mv.from.index}"][data-count="${mv.from.count}"]`)
      .boundingBox();
    const db = await tapPage.locator(`[data-drop="${mv.to.zone}:${mv.to.index}"]`).boundingBox();
    await tapPage.mouse.move(sb.x + sb.width / 2, sb.y + Math.min(12, sb.height / 2));
    await tapPage.mouse.down();
    await tapPage.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 12 });
    await tapPage.mouse.up();
    await tapPage.waitForTimeout(300);
    const after = await tapPage.evaluate(() => window.__solitaire.historyLength());
    race.push({ wait, landed: after === before });
  }
  const lost = race.filter((r) => !r.landed);
  ok(name, "a drag started mid-slide still lands", lost.length === 0, JSON.stringify(lost.length ? race : { tries: race.length }));

  // A press on a card in a column the slide crosses must never grab the sliding
  // card unless the card was actually over that point within the aim window
  // (100 ms back, plus a frame of slack for the timer's frame-quantized log;
  // the live box at the press itself is logged by a capture listener).
  // Presses at the start column (4) are not checked: it is claimed by design.
  // A 1 ms timer logs the card's live box so the oracle does not depend on rAF.
  const cross = [];
  for (const wait of [0, 2, 20, 40, 60, 100, 150, 200, 260]) {
    for (const col of [1, 2, 3]) {
      await tapPage.goto(BASE + "?game=klondike&seed=12345");
      await tapPage.waitForTimeout(600);
      const mv = (await tapPage.evaluate(() => window.__solitaire.listMoves())).find(
        (m) => m.kind !== "draw" && m.from.zone === "tableau",
      );
      await tapPage.evaluate((m) => window.__solitaire.move(m.from, m.to), mv);
      await tapPage.waitForTimeout(400);
      const pick = await tapPage.evaluate(({ from, col }) => {
        const moving = document.querySelector(`#table .card[data-zone="tableau"][data-index="${from.index}"]`)
          || [...document.querySelectorAll('#table .card[data-zone="tableau"][data-index="4"]')].pop();
        const cards = [...document.querySelectorAll(`#table .card[data-zone="tableau"][data-index="${col}"]:not(.face-down)`)];
        const top = cards[cards.length - 1];
        const r = top.getBoundingClientRect();
        const id = [...document.querySelectorAll('#table .card[data-zone="tableau"]:not(.face-down)')]
          .filter((e) => e.dataset.index === "4").pop().dataset.id;
        const el = () => document.querySelector(`#table .card[data-id="${id}"]`);
        const log = [];
        window.__crossLog = log;
        const timer = setInterval(() => {
          const r2 = el()?.getBoundingClientRect();
          if (r2) log.push({ t: performance.now(), x: r2.x, y: r2.y, w: r2.width, h: r2.height });
        }, 1);
        setTimeout(() => clearInterval(timer), 1500);
        window.addEventListener("pointerdown", (e) => {
          if (!e.target.closest?.("#table")) return;
          window.__pressT = performance.now();
          const r2 = el()?.getBoundingClientRect(); // the live box this press hit-tests against
          if (r2) log.push({ t: window.__pressT, x: r2.x, y: r2.y, w: r2.width, h: r2.height });
        }, { capture: true });
        return { id, x: r.x + r.width / 2, y: r.y + r.height * 0.85, target: top.dataset.id };
      }, { from: mv.from, col });
      await tapPage.click("#btn-undo:visible, #thumb-undo:visible");
      if (wait) await tapPage.waitForTimeout(wait);
      await tapPage.mouse.click(pick.x, pick.y);
      await tapPage.waitForTimeout(300);
      const after = await tapPage.evaluate(({ id, x, y }) => {
        const t = window.__pressT;
        const near = window.__crossLog.filter((s) => s.t >= t - 141 && s.t <= t);
        const covered = near.some((s) => x >= s.x - 1 && x <= s.x + s.w + 1 && y >= s.y - 1 && y <= s.y + s.h + 1);
        return {
          covered,
          samples: near.length,
          selected: document.querySelector("#table .card.selected")?.dataset.id || null,
          dragging: !!document.querySelector("#drag-layer .card"),
        };
      }, pick);
      const grabbed = after.selected === pick.id || after.dragging;
      cross.push({ wait, col, covered: after.covered, grabbed, selected: after.selected, samples: after.samples });
    }
  }
  const wrong = cross.filter((c) => c.grabbed && !c.covered);
  const clear = cross.filter((c) => !c.covered).length;
  ok(
    name,
    "a press on a crossed column never grabs the sliding card",
    wrong.length === 0 && clear >= 6,
    JSON.stringify(wrong.length || clear < 6 ? cross : { tries: cross.length, offPath: clear, onPath: cross.length - clear }),
  );

  for (const game of ["freecell", "golf", "kings"]) {
    await openGame(tapPage, game);
    const primed = await tapPage.evaluate((game) => {
      const state = window.__solitaire.getState();
      const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
      state.moves = 3;
      state.won = false;
      if (game === "freecell") {
        state.cascades = Array.from({ length: 8 }, () => []);
        state.cascades[0] = [c("hearts", 1)];
        state.cascades[1] = [c("spades", 5)];
        state.freecells = [null, null, null, null];
        state.foundations = [[], [], [], []];
        window.__solitaire.setState(state);
        return { id: "hearts-1", from: { zone: "cascade", index: 0, count: 1 }, to: { zone: "foundation", index: 0 }, dragTo: "freecell:0", dragId: "spades-5" };
      }
      if (game === "golf") {
        state.columns = Array.from({ length: 7 }, () => []);
        state.columns[0] = [c("hearts", 7)];
        state.columns[1] = [c("clubs", 8)];
        state.waste = [c("spades", 6)];
        state.stock = [];
        state.over = false;
        window.__solitaire.setState(state);
        return { id: "hearts-7", action: { type: "play", col: 0 }, dragId: "clubs-8" };
      }
      state.sides = [[c("spades", 10), c("diamonds", 9)], [c("hearts", 6), c("clubs", 4)], [], [c("diamonds", 5)]];
      state.corners = [[], [], [], []];
      state.stock = [];
      state.waste = [];
      state.stuck = false;
      window.__solitaire.setState(state);
      return {
        id: "diamonds-9",
        from: { zone: "side", index: 0, count: 1 },
        to: { zone: "side", index: 2 },
        dragId: "clubs-4",
        dragFrom: { zone: "side", index: 1, count: 1 },
        dragTo: { zone: "side", index: 3 },
      };
    }, game);
    await tapPage.waitForFunction(() => !window.__solitaire.isAnimating(), null, { timeout: 2000 }).catch(() => {});
    await tapPage.waitForTimeout(40);
    let moved;
    if (game === "golf") {
      const start = await tapPage.evaluate((id) => {
        const r = document.querySelector(`#table .card[data-id="${id}"]`).getBoundingClientRect();
        return { x: r.x, y: r.y };
      }, primed.id);
      const pending = tapPage.evaluate((action) => window.__solitaire.move(action), primed.action);
      const sample = await sampleSlide(tapPage, primed.id);
      moved = { ok: (await pending)?.ok === true, start, sample };
    } else {
      moved = await moveAndSample(tapPage, primed.from, primed.to, primed.id);
    }
    ok(
      name,
      `${game} move slides`,
      moved.ok && moved.sample.sliding && between(moved.start, { x: moved.sample.endX, y: moved.sample.endY }, { x: moved.sample.x, y: moved.sample.y }),
      JSON.stringify(moved.sample),
    );
    const dragSel = game === "freecell"
      ? { card: `#table .card[data-id="${primed.dragId}"]`, drop: `[data-drop="${primed.dragTo}"]` }
      : game === "golf"
        ? { card: `#table .card[data-id="${primed.dragId}"]`, drop: `[data-drop="waste"]` }
        : { card: `#table .card[data-id="${primed.dragId}"]`, drop: `[data-drop="side:3"]` };
    await tapPage.waitForTimeout(300); // let the sampled move finish so the drag starts from rest
    const g = await dragOnto(tapPage, dragSel.card, dragSel.drop);
    const gSlide = g ? await sampleSlide(tapPage, g.id) : { missing: true };
    ok(
      name,
      `${game} drag glides`,
      !!(g && gSlide.sliding && between(g, { x: gSlide.endX, y: gSlide.endY }, { x: gSlide.x, y: gSlide.y }, 14, 8)),
      JSON.stringify({ g, gSlide }),
    );
  }

  ok(name, "no console errors", !tapPage.errs.length, tapPage.errs.join(" | "));
  await tapCtx.close();
}

const chrome = await launchChrome();
await runEngine("chromium", chrome, { viewport: { width: 1280, height: 800 } }, { shots: true });
await chrome.close();

const web = await webkit.launch();
await runEngine("webkit", web, iphone, { shots: false });
await web.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
