import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCardBack,
  bootCardMotion,
  CARD_BACKS,
  ensureDealBack,
  isTiltListening,
  nextCardBack,
  packCardBack,
  pickCardBack,
  requestTiltPermission,
  sheenPointFromOrientation,
  sheenPointFromPointer,
  sheenStyleHosts,
  sheenVars,
  syncMotionFlag,
  tiltSheenPressed,
  writeSheenVars,
} from "../src/card-backs.js";
import { motionPolicy } from "../src/motion.js";
import { flattenSlots, placeBoard, takeSlots } from "../src/slots.js";
import { load, loadFreeCell, loadGolf, loadKings, loadPrefs, save, saveFreeCell, saveGolf, saveKings, savePrefs } from "../src/storage.js";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function memoryStorage() {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
  return store;
}

function classList() {
  const names = new Set();
  return {
    toggle(name, on) {
      const force = on === undefined ? !names.has(name) : !!on;
      if (force) names.add(name);
      else names.delete(name);
      return force;
    },
    contains: (name) => names.has(name),
  };
}

function fakeEnv({ reduce = false, ios = false, tiltWanted = false } = {}) {
  const listeners = [];
  const root = {
    dataset: {},
    classList: classList(),
    style: {
      props: {},
      setProperty(key, value) {
        this.props[key] = value;
      },
    },
  };
  function styleBag() {
    return {
      props: {},
      setProperty(key, value) {
        this.props[key] = value;
      },
    };
  }
  const table = { id: "table", style: styleBag() };
  const layer = { id: "drag-layer", style: styleBag() };
  const doc = {
    documentElement: root,
    getElementById(id) {
      if (id === "table") return table;
      if (id === "drag-layer") return layer;
      return null;
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn, target: "document" });
    },
    querySelectorAll() {
      return [];
    },
  };
  const win = {
    innerWidth: 200,
    innerHeight: 100,
    listeners,
    addEventListener(type, fn) {
      listeners.push({ type, fn, target: "window" });
    },
    removeEventListener(type, fn) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    requestAnimationFrame(fn) {
      fn();
      return 1;
    },
    matchMedia() {
      return { matches: reduce, addEventListener() {} };
    },
  };
  let calls = 0;
  const DOE = ios
    ? {
        requestPermission() {
          calls += 1;
          return Promise.resolve("granted");
        },
      }
    : function DeviceOrientationEvent() {};
  return {
    win,
    doc,
    table,
    layer,
    DOE,
    calls: () => calls,
    listeners,
  };
}

function listener(env, type) {
  return env.listeners.find((entry) => entry.type === type);
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

describe("card backs", () => {
  it("offers the lattice back plus five more local designs", () => {
    expect(CARD_BACKS).toEqual(["lattice", "diamond", "waves", "medallion", "stars", "herringbone"]);
    expect(pickCardBack(() => 0)).toBe("lattice");
    expect(pickCardBack(() => 0.999)).toBe("herringbone");
    expect(packCardBack({})).toBe("lattice");
    expect(packCardBack({ cardBack: "stars" })).toBe("stars");
  });

  it("picks a new back for a deal and keeps it on resume", () => {
    expect(nextCardBack("waves", "resume")).toBe("waves");
    expect(nextCardBack("nope", "resume")).toBe("lattice");
    expect(nextCardBack(null, "resume")).toBe("lattice");
    const dealt = nextCardBack("waves", "deal", () => 0.5);
    expect(dealt).toBe("medallion");
    expect(nextCardBack(dealt, "resume")).toBe("medallion");
    expect(ensureDealBack("stars", () => 0)).toBe("stars");
    expect(ensureDealBack("nope", () => 0)).toBe("lattice");
  });

  it("round-trips the back through every game save so Resume keeps it", () => {
    memoryStorage();
    const klondike = placeBoard(null, { seed: 4, moves: 2 }, [{ seed: 4, moves: 1 }], 10, { cardBack: "medallion" });
    const undone = placeBoard(klondike, { seed: 4, moves: 1 }, [], 11, { cardBack: "medallion" });
    expect(undone.casual.cardBack).toBe("medallion");
    save(flattenSlots(undone, { nested: true, stats: {}, extra: { drawCount: 1, muted: true } }));
    expect(takeSlots(load(), { nested: true }).casual.cardBack).toBe("medallion");
    expect(nextCardBack(takeSlots(load(), { nested: true }).casual.cardBack, "resume")).toBe("medallion");

    saveFreeCell(flattenSlots(placeBoard(null, { dealNumber: 12, moves: 0 }, [], 12, { cardBack: "stars" }), { stats: {} }));
    expect(takeSlots(loadFreeCell()).casual.cardBack).toBe("stars");

    saveGolf(flattenSlots(placeBoard(null, { seed: 8, moves: 1 }, [], 13, { cardBack: "waves" }), { stats: {} }));
    expect(takeSlots(loadGolf()).casual.cardBack).toBe("waves");

    saveKings(flattenSlots(placeBoard(null, { seed: 9, moves: 1 }, [], 14, { cardBack: "herringbone" }), { stats: {} }));
    expect(takeSlots(loadKings()).casual.cardBack).toBe("herringbone");

    const daily = placeBoard(null, { seed: 3, daily: "2026-11-09", moves: 0 }, [], 15, { cardBack: "diamond" });
    saveGolf(flattenSlots(daily, { stats: {} }));
    const golf = takeSlots(loadGolf());
    expect(golf.active).toBe("daily");
    expect(golf.daily.cardBack).toBe("diamond");
    expect(nextCardBack(golf.daily.cardBack, "resume")).toBe("diamond");
  });
});

describe("sheen and tilt permission", () => {
  it("maps pointer and device tilt onto sheen variables", () => {
    expect(sheenPointFromPointer(0, 0, 100, 100)).toEqual({ x: -1, y: -1 });
    expect(sheenPointFromPointer(100, 50, 100, 100)).toEqual({ x: 1, y: 0 });
    const tilt = sheenPointFromOrientation({ gamma: 35, beta: 45 });
    expect(tilt.x).toBeCloseTo(1);
    expect(tilt.y).toBeCloseTo(0);
    expect(sheenVars({ x: 1, y: -1 })).toEqual({ "--sheen-x": "70.0%", "--sheen-y": "-12.0%" });
  });

  it("does not call iOS requestPermission until the tilt control is tapped", async () => {
    memoryStorage();
    const env = fakeEnv({ ios: true, tiltWanted: true });
    globalThis.window = env.win;
    globalThis.document = env.doc;
    bootCardMotion({
      window: env.win,
      document: env.doc,
      DeviceOrientationEvent: env.DOE,
      tiltWanted: true,
    });
    expect(env.calls()).toBe(0);
    expect(isTiltListening()).toBe(false);
    expect(listener(env, "deviceorientation")).toBeUndefined();

    expect(tiltSheenPressed()).toBe(true);
    const click = listener(env, "click").fn;
    await click({ target: { closest: () => null }, preventDefault() {} });
    expect(env.calls()).toBe(0);

    const button = { closest: (sel) => (sel === "[data-testid='tilt-sheen']" ? button : null) };
    // Pref is on but the listener is waiting for a gesture, so Help shows on
    // and a press turns it off without prompting.
    await click({ target: button, preventDefault() {} });
    expect(env.calls()).toBe(0);
    expect(isTiltListening()).toBe(false);
    expect(tiltSheenPressed()).toBe(false);
    expect(loadPrefs().tiltSheen).toBe(false);

    await click({ target: button, preventDefault() {} });
    expect(env.calls()).toBe(1);
    expect(isTiltListening()).toBe(true);
    expect(tiltSheenPressed()).toBe(true);
    expect(listener(env, "deviceorientation")).toBeTruthy();
    expect(loadPrefs().tiltSheen).toBe(true);

    await click({ target: button, preventDefault() {} });
    expect(env.calls()).toBe(1);
    expect(isTiltListening()).toBe(false);
    expect(loadPrefs().tiltSheen).toBe(false);
  });

  it("listens without a prompt when the browser has no permission API and the pref is on", async () => {
    memoryStorage();
    savePrefs({ tiltSheen: true });
    const env = fakeEnv({ ios: false, tiltWanted: true });
    bootCardMotion({
      window: env.win,
      document: env.doc,
      DeviceOrientationEvent: env.DOE,
      tiltWanted: true,
    });
    expect(isTiltListening()).toBe(true);
    expect(listener(env, "deviceorientation")).toBeTruthy();
    await expect(requestTiltPermission(env.DOE)).resolves.toBe("granted");
  });

  it("re-requests tilt from the first board tap when the pref is on", async () => {
    memoryStorage();
    savePrefs({ tiltSheen: true });
    const env = fakeEnv({ ios: true, tiltWanted: true });
    bootCardMotion({
      window: env.win,
      document: env.doc,
      DeviceOrientationEvent: env.DOE,
      tiltWanted: true,
    });
    expect(env.calls()).toBe(0);
    expect(isTiltListening()).toBe(false);
    expect(tiltSheenPressed()).toBe(true);

    await listener(env, "pointerdown").fn({ target: { closest: () => null } });
    expect(env.calls()).toBe(1);
    expect(isTiltListening()).toBe(true);
    expect(tiltSheenPressed()).toBe(true);
    expect(loadPrefs().tiltSheen).toBe(true);
  });

  it("writes sheen variables on the board hosts and skips them while dragging", () => {
    const env = fakeEnv();
    const written = writeSheenVars(env.doc, { x: 1, y: -1 });
    expect(written).toEqual({ "--sheen-x": "70.0%", "--sheen-y": "-12.0%" });
    expect(sheenStyleHosts(env.doc)).toEqual([env.table, env.layer]);
    expect(env.table.style.props["--sheen-x"]).toBe("70.0%");
    expect(env.layer.style.props["--sheen-y"]).toBe("-12.0%");
    expect(env.doc.documentElement.style.props["--sheen-x"]).toBeUndefined();

    bootCardMotion({
      window: env.win,
      document: env.doc,
      DeviceOrientationEvent: env.DOE,
      tiltWanted: false,
    });
    env.table.style.props = {};
    env.doc.documentElement.classList.toggle("is-dragging", true);
    listener(env, "pointermove").fn({ clientX: 20, clientY: 20 });
    expect(env.table.style.props["--sheen-x"]).toBeUndefined();
    expect(env.doc.documentElement.dataset.sheen).toBe("idle");
  });
});

describe("reduced motion", () => {
  it("flags the document and leaves the idle sheen still", () => {
    const env = fakeEnv({ reduce: true });
    globalThis.window = env.win;
    globalThis.document = env.doc;
    bootCardMotion({
      window: env.win,
      document: env.doc,
      DeviceOrientationEvent: env.DOE,
      tiltWanted: false,
    });
    expect(env.doc.documentElement.dataset.motion).toBe("reduce");
    expect(env.doc.documentElement.classList.contains("reduce-motion")).toBe(true);
    expect(env.doc.documentElement.dataset.sheen).toBe("idle");
    listener(env, "pointermove").fn({ clientX: 20, clientY: 20 });
    expect(env.doc.documentElement.dataset.sheen).toBe("idle");
    expect(env.table.style.props["--sheen-x"]).toBeUndefined();
    expect(env.doc.documentElement.style.props["--sheen-x"]).toBeUndefined();

    const root = { dataset: {}, classList: classList() };
    expect(syncMotionFlag(root, false)).toBe(false);
    expect(root.dataset.motion).toBe("full");
    expect(applyCardBack("waves", root)).toBe("waves");
    expect(root.dataset.cardBack).toBe("waves");
  });

  it("turns sheen animation off in CSS for reduced motion and bedtime stays quiet", () => {
    const open = css.match(/{/g).length;
    const close = css.match(/}/g).length;
    expect(open).toBe(close);
    expect(css).toContain("@keyframes back-shimmer");
    expect(css).toContain('html[data-card-back="herringbone"]');
    expect(css).toContain('html[data-motion="reduce"]');
    expect(css).toContain('html[data-theme="night"] .card.face-down::before');
    const night = css.slice(css.indexOf('html[data-theme="night"] .card.face-down::before'));
    expect(night).toContain("animation: none !important");
    const media = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(media).toContain(".card.face-down::before");
    expect(media).toContain("animation: none !important");
    expect(css).toMatch(/--sheen-ms:\s*12s/);
    expect(css).toMatch(/--sheen-ms:\s*5\.4s/);
    expect(motionPolicy({ reduce: true, bedtime: true })).toMatchObject({
      dragWobble: false,
      settleBounce: false,
      sheenMotion: false,
      sheenQuiet: true,
    });
    expect(motionPolicy({ reduce: false, bedtime: true })).toMatchObject({
      dragWobble: false,
      settleBounce: false,
      sheenMotion: false,
      sheenQuiet: true,
    });
  });
});
