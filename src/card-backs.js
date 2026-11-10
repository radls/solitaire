import { currentMotionPolicy } from "./motion.js";
import { loadPrefs, savePrefs } from "./storage.js";

/** Lattice is the original back. A new deal picks one of these. */
export const CARD_BACKS = ["lattice", "diamond", "waves", "medallion", "stars", "herringbone"];

export function coerceCardBack(id) {
  return CARD_BACKS.includes(id) ? id : null;
}

export function packCardBack(pack) {
  return coerceCardBack(pack?.cardBack) || "lattice";
}

export function pickCardBack(rng = Math.random) {
  const n = CARD_BACKS.length;
  let i = Math.floor(Number(rng()) * n);
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i >= n) i = n - 1;
  return CARD_BACKS[i];
}

/** `deal` picks a new back. `resume` and ordinary play keep the one already stored. */
export function nextCardBack(current, kind, rng = Math.random) {
  if (kind === "deal") return pickCardBack(rng);
  return coerceCardBack(current) || "lattice";
}

export function ensureDealBack(current, rng = Math.random) {
  return coerceCardBack(current) || pickCardBack(rng);
}

export function applyCardBack(id, root = globalThis.document?.documentElement) {
  const next = coerceCardBack(id) || "lattice";
  if (root?.dataset) root.dataset.cardBack = next;
  return next;
}

export function syncMotionFlag(root, reduce) {
  const on = !!reduce;
  if (!root) return on;
  root.dataset.motion = on ? "reduce" : "full";
  root.classList?.toggle?.("reduce-motion", on);
  return on;
}

export function sheenPointFromPointer(clientX, clientY, width, height) {
  const w = Number(width) || 1;
  const h = Number(height) || 1;
  const x = (Number(clientX) || 0) / w * 2 - 1;
  const y = (Number(clientY) || 0) / h * 2 - 1;
  return { x: clampUnit(x), y: clampUnit(y) };
}

export function sheenPointFromOrientation(event) {
  const gamma = Number(event?.gamma) || 0;
  const beta = Number(event?.beta) || 0;
  return {
    x: clampUnit(gamma / 35),
    y: clampUnit((beta - 45) / 40),
  };
}

function clampUnit(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

export function sheenVars(point) {
  const x = clampUnit(point?.x);
  const y = clampUnit(point?.y);
  return {
    "--sheen-x": `${(x * 70).toFixed(1)}%`,
    "--sheen-y": `${(y * 12).toFixed(1)}%`,
  };
}

/** Visible face-down cards first, so a sheen write does not restyle the page. */
export function sheenStyleHosts(doc) {
  if (!doc) return [];
  const visible = doc.querySelectorAll?.("#table .card.face-down, #drag-layer .card.face-down");
  if (visible && visible.length) return [...visible];
  const hosts = [];
  for (const id of ["table", "drag-layer"]) {
    const el = doc.getElementById?.(id);
    if (el) hosts.push(el);
  }
  if (!hosts.length && doc.documentElement) hosts.push(doc.documentElement);
  return hosts;
}

let lastSheenPoint = null;

export function writeSheenVars(doc, point) {
  if (point) lastSheenPoint = { x: point.x, y: point.y };
  const vars = sheenVars(point ?? lastSheenPoint);
  const hosts = sheenStyleHosts(doc);
  for (const host of hosts) {
    host.style?.setProperty?.("--sheen-x", vars["--sheen-x"]);
    host.style?.setProperty?.("--sheen-y", vars["--sheen-y"]);
  }
  return vars;
}

/** Stamp the last pointer/tilt point onto a newly rendered face-down card. */
export function applyStoredSheen(el) {
  if (!el || !lastSheenPoint) return null;
  const vars = sheenVars(lastSheenPoint);
  el.style?.setProperty?.("--sheen-x", vars["--sheen-x"]);
  el.style?.setProperty?.("--sheen-y", vars["--sheen-y"]);
  return vars;
}

/** Reapply the last sheen point to the current face-down cards. */
export function syncSheenVars(doc, point = lastSheenPoint) {
  if (!point) return null;
  return writeSheenVars(doc, point);
}

let tiltOn = false;
let tiltWanted = false;
let oriHandler = null;
let oriWin = null;

export function isTiltListening() {
  return tiltOn;
}

/** True when tilt is on, or the saved opt-in is waiting for a user gesture. */
export function tiltSheenPressed() {
  return tiltOn || tiltWanted;
}

function unlistenTilt() {
  if (oriWin && oriHandler) {
    try {
      oriWin.removeEventListener("deviceorientation", oriHandler);
    } catch {
      /* already gone */
    }
  }
  oriWin = null;
  oriHandler = null;
  tiltOn = false;
}

function listenTilt(win, handler) {
  if (!win || tiltOn) return;
  oriHandler = handler;
  oriWin = win;
  win.addEventListener("deviceorientation", handler);
  tiltOn = true;
}

/**
 * iOS only exposes this as a user-gesture call. Never invoke it from page load.
 * Other browsers resolve as granted without a prompt.
 */
export async function requestTiltPermission(DOE = globalThis.DeviceOrientationEvent) {
  if (!DOE) return "unsupported";
  if (typeof DOE.requestPermission !== "function") return "granted";
  try {
    const result = await DOE.requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "error";
  }
}

export function tiltToggleHTML(on, env = {}) {
  if (!tiltControlAvailable(env)) return "";
  const pressed = on ? "true" : "false";
  const label = on ? "Device tilt sheen on" : "Use device tilt for card backs";
  return `<div class="help-tilt" data-testid="tilt-sheen-wrap"><p>Tilt the phone to slide the light across the card backs.</p><button type="button" class="btn" data-testid="tilt-sheen" aria-pressed="${pressed}">${label}</button></div>`;
}

function paintTiltButtons(doc, on) {
  const nodes = doc.querySelectorAll?.("[data-testid='tilt-sheen']") ?? [];
  for (const btn of nodes) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "Device tilt sheen on" : "Use device tilt for card backs";
  }
}

function motionReduced(root) {
  if (root?.dataset?.motion === "reduce") return true;
  return !currentMotionPolicy().sheenMotion;
}

function isDragging(doc) {
  return doc?.documentElement?.classList?.contains?.("is-dragging") === true;
}

/**
 * Device orientation is only useful on a phone. Desktop Chrome still exposes
 * the API, so require a touch screen or a coarse pointer.
 */
export function tiltControlAvailable(env = {}) {
  const win = env.window ?? globalThis.window;
  const DOE = Object.prototype.hasOwnProperty.call(env, "DeviceOrientationEvent")
    ? env.DeviceOrientationEvent
    : (win?.DeviceOrientationEvent ?? globalThis.DeviceOrientationEvent);
  if (!DOE) return false;
  const nav = env.navigator ?? win?.navigator ?? globalThis.navigator;
  const touch = Number(nav?.maxTouchPoints) > 0;
  let coarse = false;
  try {
    coarse = win?.matchMedia?.("(pointer: coarse)")?.matches === true;
  } catch {
    coarse = false;
  }
  return touch || coarse;
}

/** Pause the idle shimmer when the tab is hidden. */
export function syncSheenPaused(doc) {
  const hidden = doc?.visibilityState === "hidden" || doc?.hidden === true;
  const root = doc?.documentElement;
  if (!root?.dataset) return hidden;
  if (hidden) root.dataset.sheenPaused = "1";
  else delete root.dataset.sheenPaused;
  return hidden;
}

/** Pointer sheen, optional device tilt, and the Help toggle. Does not request permission on load. */
export function bootCardMotion(env = {}) {
  const win = env.window ?? globalThis.window;
  const doc = env.document ?? globalThis.document;
  const DOE = Object.prototype.hasOwnProperty.call(env, "DeviceOrientationEvent")
    ? env.DeviceOrientationEvent
    : globalThis.DeviceOrientationEvent;
  if (!win || !doc?.documentElement) return;

  unlistenTilt();
  lastSheenPoint = null;
  let reduce = false;
  try {
    reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    reduce = false;
  }
  syncMotionFlag(doc.documentElement, reduce);
  try {
    win.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", (event) => {
      syncMotionFlag(doc.documentElement, event.matches === true);
    });
  } catch {
    /* matchMedia without events */
  }
  if (!doc.documentElement.dataset.sheen) doc.documentElement.dataset.sheen = "idle";

  let pending = null;
  let raf = 0;
  const paint = (point, mode) => {
    if (motionReduced(doc.documentElement) || isDragging(doc)) return;
    writeSheenVars(doc, point);
    if (doc.documentElement.dataset.sheen !== mode) doc.documentElement.dataset.sheen = mode;
  };
  const schedule = (point, mode) => {
    pending = { point, mode };
    if (raf) return;
    const flush = () => {
      raf = 0;
      const next = pending;
      pending = null;
      if (next) paint(next.point, next.mode);
    };
    if (typeof win.requestAnimationFrame === "function") {
      raf = win.requestAnimationFrame(flush);
    } else {
      flush();
    }
  };
  const onPointer = (event) => {
    if (tiltOn || isDragging(doc)) return;
    schedule(
      sheenPointFromPointer(event.clientX, event.clientY, win.innerWidth, win.innerHeight),
      "pointer",
    );
  };
  const onOrientation = (event) => {
    schedule(sheenPointFromOrientation(event), "tilt");
  };
  win.addEventListener("pointermove", onPointer);

  // A finger leaves no hover, so return to the idle shimmer when a touch ends.
  const onPointerEnd = (event) => {
    if (event?.pointerType !== "touch" || tiltOn) return;
    pending = null;
    if (doc.documentElement.dataset.sheen === "pointer") doc.documentElement.dataset.sheen = "idle";
  };
  win.addEventListener("pointercancel", onPointerEnd);

  syncSheenPaused(doc);
  doc.addEventListener("visibilitychange", () => syncSheenPaused(doc));

  const needsGesture = typeof DOE?.requestPermission === "function";
  if (env.tiltWanted == null) {
    try {
      tiltWanted = loadPrefs().tiltSheen === true;
    } catch {
      tiltWanted = false;
    }
  } else {
    tiltWanted = env.tiltWanted === true;
  }
  // A saved opt-in can listen immediately only when the browser has no permission prompt.
  if (!needsGesture && tiltWanted) listenTilt(win, onOrientation);

  const keepWanted = (on) => {
    tiltWanted = on;
    try {
      savePrefs({ tiltSheen: on });
    } catch {
      /* private mode */
    }
    paintTiltButtons(doc, on);
  };

  const enableTilt = async () => {
    const result = await requestTiltPermission(DOE);
    if (result === "granted") {
      listenTilt(win, onOrientation);
      keepWanted(true);
      return true;
    }
    keepWanted(false);
    return false;
  };

  // A saved opt-in that cannot listen on load is retried from the first board
  // gesture. WebKit only treats pointerup/click as a user activation, not
  // pointerdown. Keep the preference on deny or error; after an explicit
  // denied this session, do not prompt again.
  let resumeBusy = false;
  let resumeDenied = false;
  const resumeTilt = async () => {
    if (resumeBusy || resumeDenied || tiltOn || !tiltWanted) return false;
    resumeBusy = true;
    try {
      const result = await requestTiltPermission(DOE);
      if (result === "granted") {
        listenTilt(win, onOrientation);
        paintTiltButtons(doc, true);
        return true;
      }
      if (result === "denied") resumeDenied = true;
      paintTiltButtons(doc, true);
      if (doc.documentElement.dataset.sheen === "tilt") doc.documentElement.dataset.sheen = "idle";
      return false;
    } finally {
      resumeBusy = false;
    }
  };

  const onPointerUp = (event) => {
    onPointerEnd(event);
    if (!tiltWanted || tiltOn || !needsGesture || resumeDenied || resumeBusy) return;
    if (!event?.target?.closest?.("#table, #drag-layer")) return;
    return resumeTilt();
  };
  win.addEventListener("pointerup", onPointerUp);

  doc.addEventListener("click", async (event) => {
    const btn = event.target?.closest?.("[data-testid='tilt-sheen']");
    if (!btn) return;
    event.preventDefault?.();
    if (tiltOn || tiltWanted) {
      unlistenTilt();
      tiltWanted = false;
      try {
        savePrefs({ tiltSheen: false });
      } catch {
        /* private mode */
      }
      paintTiltButtons(doc, false);
      if (doc.documentElement.dataset.sheen === "tilt") doc.documentElement.dataset.sheen = "idle";
      return;
    }
    await enableTilt();
  });
}
