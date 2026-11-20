import { afterAll, afterEach, describe, expect, it } from "vitest";
import { winEffectsPlan } from "../src/win-effects-plan.js";
import { dismissWinEffects, presentWinEffects, startWinEffects, stopWinEffects } from "../src/win-effects.js";

const origNow = performance.now.bind(performance);
let now = 5000;
performance.now = () => now;

function classList() {
  const set = new Set();
  return {
    add(name) { set.add(name); },
    remove(name) { set.delete(name); },
    contains(name) { return set.has(name); },
  };
}

function listeners() {
  const list = [];
  return {
    list,
    addEventListener(type, fn) { list.push({ type, fn }); },
    removeEventListener(type, fn) {
      const i = list.findIndex((entry) => entry.type === type && entry.fn === fn);
      if (i >= 0) list.splice(i, 1);
    },
  };
}

function installDom() {
  const nodes = [];
  const modal = { classList: classList() };
  const docListen = listeners();
  const winListen = listeners();
  let created = 0;
  const cancelled = [];
  let rafSeq = 0;
  let frame = null;
  const document = {
    hidden: false,
    visibilityState: "visible",
    documentElement: { dataset: { theme: "classic", motion: "" }, classList: classList() },
    body: {
      appendChild(node) {
        nodes.push(node);
        node.remove = () => {
          const i = nodes.indexOf(node);
          if (i >= 0) nodes.splice(i, 1);
        };
        return node;
      },
    },
    createElement() {
      created += 1;
      const canvas = {
        tag: "canvas",
        width: 0,
        height: 0,
        dataset: {},
        style: {},
        setAttribute(name, value) {
          if (name === "data-testid") canvas.dataset.testid = value;
          if (name === "aria-hidden") canvas.ariaHidden = value;
        },
        getContext() {
          return {
            setTransform() {},
            clearRect() {},
            fillRect() {},
            beginPath() {},
            arc() {},
            fill() {},
            save() {},
            restore() {},
            translate() {},
            rotate() {},
            globalAlpha: 1,
            fillStyle: "",
          };
        },
      };
      return canvas;
    },
    addEventListener: docListen.addEventListener,
    removeEventListener: docListen.removeEventListener,
    querySelector(sel) {
      if (sel === "#overlay .modal.win") return modal;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === 'canvas[data-testid="win-fx"]') return nodes.filter((node) => node.dataset.testid === "win-fx");
      if (sel === ".win-glow") return modal.classList.contains("win-glow") ? [modal] : [];
      return [];
    },
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 3,
    requestAnimationFrame(fn) {
      frame = fn;
      rafSeq += 1;
      return rafSeq;
    },
    cancelAnimationFrame(id) { cancelled.push(id); },
    matchMedia() { return { matches: false }; },
    addEventListener: winListen.addEventListener,
    removeEventListener: winListen.removeEventListener,
  };
  globalThis.document = document;
  globalThis.window = window;
  return { nodes, modal, document, window, docListen, winListen, cancelled, created: () => created, frame: () => frame };
}

let env = installDom();

afterEach(() => {
  stopWinEffects();
});

afterAll(() => {
  performance.now = origNow;
  delete globalThis.document;
  delete globalThis.window;
});

function fresh() {
  stopWinEffects();
  now = 5000;
  env = installDom();
  return env;
}

function dimColor(color) {
  const match = String(color).match(/hsla\(\s*[\d.]+\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)\s*\)/i);
  if (!match) return false;
  return Number(match[1]) <= 40 && Number(match[2]) <= 55 && Number(match[3]) <= 0.6;
}

describe("winEffectsPlan", () => {
  const games = ["klondike", "freecell", "golf", "kings"];

  it("maps every casual game, daily, pick, and draw 3", () => {
    expect(winEffectsPlan({ game: "klondike", drawCount: 1 }).kind).toBe("confetti");
    expect(winEffectsPlan({ game: "klondike" }).kind).toBe("confetti");
    expect(winEffectsPlan({ game: "klondike", drawCount: 3 }).kind).toBe("both");
    expect(winEffectsPlan({ game: "freecell" }).kind).toBe("fireworks");
    expect(winEffectsPlan({ game: "golf" }).kind).toBe("confetti");
    expect(winEffectsPlan({ game: "kings" }).kind).toBe("confetti");
    for (const game of games) {
      expect(winEffectsPlan({ game, daily: true }).kind).toBe("fireworks");
      expect(winEffectsPlan({ game, pick: true }).kind).toBe("both");
      expect(winEffectsPlan({ game, daily: true, pick: true }).kind).toBe("both");
      expect(winEffectsPlan({ game, daily: true, drawCount: 3, pick: true }).kind).toBe("both");
    }
    expect(winEffectsPlan({ game: "klondike", daily: true, drawCount: 3 }).kind).toBe("fireworks");
  });

  it("uses the classic budget, a dim bedtime budget, and glow when reduced", () => {
    const classic = winEffectsPlan({ game: "klondike" });
    const narrow = winEffectsPlan({ game: "klondike", narrow: true });
    const bed = winEffectsPlan({ game: "klondike", bedtime: true });
    const bedNarrow = winEffectsPlan({ game: "golf", bedtime: true, narrow: true });
    expect(classic).toMatchObject({
      kind: "confetti", gentle: false, confetti: 90, bursts: 5, sparks: 36,
      durationMs: 3200, speed: 1, flash: false, glow: true,
    });
    expect(narrow).toMatchObject({ confetti: 55, bursts: 4, sparks: 26, speed: 1, durationMs: 3200 });
    expect(bed).toMatchObject({
      gentle: true, confetti: 30, bursts: 2, sparks: 12, durationMs: 4200, speed: 0.5, flash: false,
    });
    expect(bedNarrow).toMatchObject({ gentle: true, confetti: 18, bursts: 1, sparks: 9, speed: 0.5 });
    expect(bed.confetti).toBeLessThan(classic.confetti);
    expect(bed.bursts).toBeLessThan(classic.bursts);
    expect(bed.sparks).toBeLessThan(classic.sparks);
    expect(bed.speed).toBeLessThan(1);
    expect(bed.palette.every(dimColor)).toBe(true);
    expect(classic.palette.every((color) => color.startsWith("#"))).toBe(true);
    expect(classic.flash).toBe(false);
    for (const game of games) {
      const reduced = winEffectsPlan({ game, reduce: true, daily: true, pick: true, drawCount: 3, bedtime: true });
      expect(reduced).toMatchObject({
        kind: "glow", gentle: true, confetti: 0, bursts: 0, sparks: 0, durationMs: 0, flash: false, glow: true,
      });
      expect(reduced.confetti + reduced.bursts * reduced.sparks).toBe(0);
    }
  });

  it("stays inside the hard caps", () => {
    const flags = [false, true];
    for (const game of games) {
      for (const narrow of flags) {
        for (const bedtime of flags) {
          for (const daily of flags) {
            for (const pick of flags) {
              const plan = winEffectsPlan({ game, narrow, bedtime, daily, pick, drawCount: pick ? 1 : 3 });
              expect(plan.confetti).toBeLessThanOrEqual(120);
              expect(plan.bursts * plan.sparks).toBeLessThanOrEqual(200);
              expect(plan.flash).toBe(false);
              expect(plan.glow).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("startWinEffects", () => {
  it("creates one canvas, replaces it on a second start, and stops cleanly", () => {
    const dom = fresh();
    const plan = winEffectsPlan({ game: "klondike" });
    plan.game = "klondike";
    startWinEffects(plan);
    expect(dom.nodes).toHaveLength(1);
    expect(dom.created()).toBe(1);
    const canvas = dom.nodes[0];
    expect(canvas.dataset).toMatchObject({
      testid: "win-fx", kind: "confetti", gentle: "0", particles: "90", game: "klondike",
    });
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.style.position).toBe("fixed");
    expect(canvas.style.zIndex).toBe("60");
    expect(canvas.width).toBe(1280 * 2);
    expect(canvas.height).toBe(800 * 2);
    const fx = globalThis.__winFx;
    expect(fx.raf()).toBe(true);
    expect(fx.active()).toBe(true);
    expect(fx.canvases()).toBe(1);
    expect(fx.plan().kind).toBe("confetti");
    expect(fx.starts).toBe(1);
    expect(fx.stops).toBe(0);
    const firstId = dom.cancelled.length;
    startWinEffects(plan);
    expect(dom.nodes).toHaveLength(1);
    expect(dom.created()).toBe(2);
    expect(dom.cancelled.length).toBeGreaterThan(firstId);
    expect(fx.canvases()).toBe(1);
    expect(fx.starts).toBe(2);
    const liveId = dom.winListen.list.find((entry) => entry.type === "resize") ? true : false;
    expect(liveId).toBe(true);
    const rafBefore = dom.cancelled.length;
    stopWinEffects();
    expect(dom.nodes).toHaveLength(0);
    expect(dom.cancelled.length).toBeGreaterThan(rafBefore);
    expect(fx.raf()).toBe(false);
    expect(fx.active()).toBe(false);
    expect(fx.canvases()).toBe(0);
    expect(dom.docListen.list).toHaveLength(0);
    expect(dom.winListen.list).toHaveLength(0);
    expect(fx.stops).toBe(2);
    stopWinEffects();
    expect(fx.stops).toBe(2);
    expect(fx.plan()).toBe(plan);
  });

  it("draws a frame, ignores a stale frame, and removes the canvas when time is up", () => {
    const dom = fresh();
    startWinEffects(winEffectsPlan({ game: "freecell" }));
    expect(dom.nodes[0].dataset.kind).toBe("fireworks");
    expect(dom.nodes[0].dataset.particles).toBe(String(5 + 5 * 36));
    expect(() => dom.frame()(now + 16)).not.toThrow();
    expect(globalThis.__winFx.raf()).toBe(true);
    expect(dom.nodes).toHaveLength(1);
    const stale = dom.frame();
    stopWinEffects();
    expect(() => stale(now + 40)).not.toThrow();
    expect(dom.nodes).toHaveLength(0);
    now = 8000;
    startWinEffects(winEffectsPlan({ game: "klondike", drawCount: 3 }));
    expect(dom.nodes[0].dataset.particles).toBe(String(90 + 5 + 5 * 36));
    dom.frame()(now + 3200 + 700);
    expect(dom.nodes).toHaveLength(0);
    expect(globalThis.__winFx.raf()).toBe(false);
    expect(globalThis.__winFx.active()).toBe(false);
  });

  it("stops when the page is hidden and draws no canvas for a glow plan", () => {
    const dom = fresh();
    startWinEffects(winEffectsPlan({ game: "golf", reduce: true }));
    expect(dom.created()).toBe(0);
    expect(dom.nodes).toHaveLength(0);
    expect(dom.modal.classList.contains("win-glow")).toBe(true);
    expect(globalThis.__winFx.raf()).toBe(false);
    expect(globalThis.__winFx.active()).toBe(true);
    expect(globalThis.__winFx.canvases()).toBe(0);
    dom.document.hidden = true;
    dom.document.visibilityState = "hidden";
    const vis = dom.docListen.list.filter((entry) => entry.type === "visibilitychange").map((entry) => entry.fn);
    expect(vis.length).toBeGreaterThan(0);
    vis.forEach((fn) => fn());
    expect(dom.modal.classList.contains("win-glow")).toBe(false);
    expect(globalThis.__winFx.active()).toBe(false);
    expect(dom.docListen.list).toHaveLength(0);
  });

  it("starts once per win and rebuilds a glow without a second start", () => {
    const dom = fresh();
    dom.window.matchMedia = () => ({ matches: false });
    const session = {};
    presentWinEffects(session, "klondike", { wonAt: 11, drawCount: 1 });
    expect(dom.nodes).toHaveLength(1);
    expect(dom.nodes[0].dataset.game).toBe("klondike");
    const starts = globalThis.__winFx.starts;
    presentWinEffects(session, "klondike", { wonAt: 11, drawCount: 1 });
    expect(globalThis.__winFx.starts).toBe(starts);
    expect(dom.nodes).toHaveLength(1);
    presentWinEffects(session, "klondike", { wonAt: 12, drawCount: 3 });
    expect(globalThis.__winFx.starts).toBe(starts + 1);
    expect(dom.nodes[0].dataset.kind).toBe("both");
    dismissWinEffects(session);
    expect(session.fxOn).toBe(false);
    expect(dom.nodes).toHaveLength(0);

    dom.document.documentElement.dataset.theme = "night";
    dom.window.innerWidth = 390;
    presentWinEffects(session, "kings", { wonAt: 20, seed: 4 });
    expect(dom.nodes[0].dataset.gentle).toBe("1");
    expect(Number(dom.nodes[0].dataset.particles)).toBeLessThan(90);
    expect(globalThis.__winFx.plan().speed).toBeLessThan(1);

    dismissWinEffects(session);
    dom.window.matchMedia = () => ({ matches: true });
    dom.document.documentElement.dataset.theme = "classic";
    presentWinEffects(session, "freecell", { wonAt: 30, daily: "2026-11-20", pick: "2026-11-18" });
    const glowStarts = globalThis.__winFx.starts;
    expect(dom.nodes).toHaveLength(0);
    expect(dom.modal.classList.contains("win-glow")).toBe(true);
    expect(globalThis.__winFx.plan().kind).toBe("glow");
    dom.modal.classList.remove("win-glow");
    presentWinEffects(session, "freecell", { wonAt: 30, daily: "2026-11-20", pick: "2026-11-18" });
    expect(globalThis.__winFx.starts).toBe(glowStarts);
    expect(dom.modal.classList.contains("win-glow")).toBe(true);
  });
});
