// Tap the stock while hearts-8 slides west → east across it.
// Caught only when that press lands on hearts-8 while it overlaps the stock.
// Usage: N=20 MIN_CAUGHT=10 BASE=http://127.0.0.1:4173/solitaire/ node e2e/kings-stock-cross.mjs
import { chromium } from "playwright-core";

const N = Number(process.env.N || 20);
const MIN_CAUGHT = process.env.MIN_CAUGHT != null && process.env.MIN_CAUGHT !== ""
  ? Number(process.env.MIN_CAUGHT)
  : Math.ceil(N / 2);
const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";

// Phone and desktop cross the stock at different clocks. Wait until the
// hearts-8 slide rect contains the stock center, then tap. Jitter is extra
// frames after that entry. Phone is [0] only: on 390px the card leaves the
// stock center within a frame. Desktop keeps [0, 1, 2].
const jitters = {
  desktop: [0, 1, 2],
  phone: [0],
};

const viewports = [
  { name: "desktop", touch: false, ctx: { viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" } },
  {
    name: "phone",
    touch: true,
    ctx: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    },
  },
];

function gameUrl() {
  const url = new URL(BASE);
  url.searchParams.set("game", "kings");
  return url.href;
}

// Capture phase so the geometry is the one under the finger, before the app handles the press.
function installPressCapture() {
  window.__kcPress = [];
  window.addEventListener("pointerdown", (event) => {
    const stock = document.querySelector('[data-drop="stock"]')?.getBoundingClientRect() || null;
    const x = event.clientX;
    const y = event.clientY;
    const pointInStock = !!(stock && x >= stock.left && x <= stock.right && y >= stock.top && y <= stock.bottom);
    const hearts = [];
    for (const host of document.querySelectorAll(".card-slide")) {
      const card = host.querySelector(".card");
      if (card?.dataset.id !== "hearts-8") continue;
      const rect = host.getBoundingClientRect();
      const overlap = !!(stock && rect.right > stock.left && rect.left < stock.right && rect.bottom > stock.top && rect.top < stock.bottom);
      const pointIn = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      hearts.push({ overlap, pointIn });
    }
    window.__kcPress.push({
      clientX: x,
      clientY: y,
      pointInStock,
      hearts8Sliding: hearts.length > 0,
      hearts8OverlapsStock: hearts.some((h) => h.overlap),
      pointInHearts8: hearts.some((h) => h.pointIn),
      hearts,
    });
  }, true);
}

function setupBoard() {
  const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
  const used = new Set(["clubs-5", "spades-9", "diamonds-3", "hearts-8", "spades-13", "hearts-13", "clubs-13", "diamonds-13"]);
  const stock = [];
  for (const suit of ["spades", "hearts", "diamonds", "clubs"]) {
    for (let rank = 1; rank <= 13; rank++) {
      const id = `${suit}-${rank}`;
      if (!used.has(id)) stock.push({ id, suit, rank, faceUp: false });
    }
  }
  const s = structuredClone(window.__solitaire.getState());
  s.sides = [[c("clubs", 5)], [c("spades", 9)], [c("diamonds", 3)], [c("hearts", 8)]];
  s.corners = [[c("spades", 13)], [c("hearts", 13)], [c("clubs", 13)], [c("diamonds", 13)]];
  s.waste = [];
  s.stock = stock;
  s.won = false;
  s.stuck = false;
  s.idlePasses = 0;
  window.__solitaire.setState(s);
  return stock.length;
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const url = gameUrl();
const totals = { caught: 0, miss: 0, lost: 0 };
let failed = false;

try {
  for (const vp of viewports) {
    let caught = 0;
    let miss = 0;
    let lost = 0;
    for (let k = 0; k < N; k++) {
      const vpJitters = jitters[vp.name];
      const frames = vpJitters[k % vpJitters.length];
      const ctx = await browser.newContext(vp.ctx);
      const page = await ctx.newPage();
      await page.addInitScript(installPressCapture);
      await page.goto(url);
      await page.waitForSelector("[data-drop='stock']");
      await page.waitForTimeout(400);
      const nStock = await page.evaluate(setupBoard);
      await page.waitForFunction(() => !window.__solitaire?.isAnimating?.(), null, { timeout: 3000 }).catch(() => {});
      const layout = await page.evaluate(() => {
        const box = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom };
        };
        const west = box('.card[data-id="hearts-8"]');
        const east = box('[data-drop="side:1"]');
        const stock = box('[data-drop="stock"]');
        return {
          west,
          east,
          stock,
          crosses: !!(west && east && stock && west.r <= stock.l + 8 && east.l >= stock.r),
        };
      });
      const stockBox = await page.locator("[data-drop='stock']").boundingBox();
      let moved = null;
      let h0 = null;
      let press = null;
      let after = null;
      if (stockBox) {
        const started = await page.evaluate(async (extraFrames) => {
          window.__kcPress.length = 0;
          const result = window.__solitaire.move({ zone: "side", index: 3, count: 1 }, { zone: "side", index: 1 });
          const h = window.__solitaire.historyLength();
          const coversStockCenter = () => {
            const stock = document.querySelector('[data-drop="stock"]')?.getBoundingClientRect();
            const host = [...document.querySelectorAll(".card-slide")].find((el) => el.querySelector(".card")?.dataset.id === "hearts-8");
            if (!stock || !host) return false;
            const rect = host.getBoundingClientRect();
            const cx = stock.left + stock.width / 2;
            const cy = stock.top + stock.height / 2;
            return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
          };
          const entered = await new Promise((resolve) => {
            let done = false;
            const finish = (ok) => {
              if (done) return;
              done = true;
              clearTimeout(cap);
              resolve(ok);
            };
            const cap = setTimeout(() => finish(false), 400);
            const watch = () => {
              if (done) return;
              if (coversStockCenter()) {
                finish(true);
                return;
              }
              requestAnimationFrame(watch);
            };
            requestAnimationFrame(watch);
          });
          if (entered && extraFrames > 0) {
            await new Promise((resolve) => {
              let left = extraFrames;
              const step = () => {
                left -= 1;
                if (left <= 0) resolve();
                else requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            });
          }
          return { ok: result?.ok === true, reason: result?.reason || "", h, entered };
        }, frames);
        moved = started;
        h0 = started.h;
        const x = stockBox.x + stockBox.width / 2;
        const y = stockBox.y + stockBox.height / 2;
        if (vp.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(900);
        after = await page.evaluate(() => {
          const s = window.__solitaire.getState();
          return {
            h: window.__solitaire.historyLength(),
            stock: s.stock.length,
            east: (s.sides[1] || []).map((c) => c.id),
            press: window.__kcPress[0] || null,
          };
        });
        press = after.press;
      }
      const drawOk = !!(after && h0 != null && after.h === h0 + 1 && after.stock === nStock - 1 && after.east.includes("hearts-8"));
      const hit = !!(press && press.hearts8Sliding && press.hearts8OverlapsStock && press.pointInStock && press.pointInHearts8);
      if (!stockBox || !moved?.ok || !layout.crosses || (hit && !drawOk)) {
        lost++;
        console.log(vp.name, k, { frames, hit, drawOk, layout: layout.crosses, moved, h0, press, after, nStock });
      } else if (!hit) {
        miss++;
        console.log(JSON.stringify({ viewport: vp.name, k, frames, entered: moved?.entered === true, press }));
      } else {
        caught++;
      }
      await ctx.close();
    }
    console.log(`kings-cross ${vp.name} caught ${caught} miss ${miss} lost ${lost} / ${N}`);
    totals.caught += caught;
    totals.miss += miss;
    totals.lost += lost;
    if (lost > 0 || caught < MIN_CAUGHT) failed = true;
  }
} finally {
  await browser.close();
}

console.log(`kings-cross summary caught ${totals.caught} miss ${totals.miss} lost ${totals.lost} / ${N * viewports.length}`);
if (failed) process.exit(1);
