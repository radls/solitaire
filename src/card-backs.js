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

let tiltOn = false;
let oriHandler = null;
let oriWin = null;

export function isTiltListening() {
  return tiltOn;
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
    return "denied";
  }
}

export function tiltToggleHTML(on) {
  const pressed = on ? "true" : "false";
  const label = on ? "Device tilt sheen on" : "Use device tilt for card backs";
  return `<div class="modal-actions"><button type="button" class="btn" data-testid="tilt-sheen" aria-pressed="${pressed}">${label}</button></div>`;
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

/** Pointer sheen, optional device tilt, and the Help toggle. Does not request permission. */
export function bootCardMotion(env = {}) {
  const win = env.window ?? globalThis.window;
  const doc = env.document ?? globalThis.document;
  const DOE = Object.prototype.hasOwnProperty.call(env, "DeviceOrientationEvent")
    ? env.DeviceOrientationEvent
    : globalThis.DeviceOrientationEvent;
  if (!win || !doc?.documentElement) return;

  unlistenTilt();
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

  const paint = (point, mode) => {
    if (motionReduced(doc.documentElement)) return;
    const vars = sheenVars(point);
    doc.documentElement.style.setProperty("--sheen-x", vars["--sheen-x"]);
    doc.documentElement.style.setProperty("--sheen-y", vars["--sheen-y"]);
    doc.documentElement.dataset.sheen = mode;
  };
  const onPointer = (event) => {
    if (tiltOn) return;
    paint(
      sheenPointFromPointer(event.clientX, event.clientY, win.innerWidth, win.innerHeight),
      "pointer",
    );
  };
  const onOrientation = (event) => {
    paint(sheenPointFromOrientation(event), "tilt");
  };
  win.addEventListener("pointermove", onPointer);

  const ios = typeof DOE?.requestPermission === "function";
  let wanted = env.tiltWanted;
  if (wanted == null) {
    try {
      wanted = loadPrefs().tiltSheen === true;
    } catch {
      wanted = false;
    }
  }
  // A saved opt-in can listen immediately only when the browser has no permission prompt.
  if (!ios && wanted) listenTilt(win, onOrientation);

  doc.addEventListener("click", async (event) => {
    const btn = event.target?.closest?.("[data-testid='tilt-sheen']");
    if (!btn) return;
    event.preventDefault?.();
    if (tiltOn) {
      unlistenTilt();
      try {
        savePrefs({ tiltSheen: false });
      } catch {
        /* private mode */
      }
      paintTiltButtons(doc, false);
      if (doc.documentElement.dataset.sheen === "tilt") doc.documentElement.dataset.sheen = "idle";
      return;
    }
    const result = await requestTiltPermission(DOE);
    if (result === "granted") {
      listenTilt(win, onOrientation);
      try {
        savePrefs({ tiltSheen: true });
      } catch {
        /* private mode */
      }
      paintTiltButtons(doc, true);
    } else {
      try {
        savePrefs({ tiltSheen: false });
      } catch {
        /* private mode */
      }
      paintTiltButtons(doc, false);
    }
  });
}
