const SINGLE = new Set(["waste", "stock", "foundation", "freecell", "corner"]);

function cardsForMove(scope, from) {
  if (!from?.zone) return [];
  const cards = [...scope.querySelectorAll(".card")].filter((el) => {
    if (el.closest("#drag-layer")) return false;
    if (el.dataset.zone !== from.zone) return false;
    if (from.index != null && el.dataset.index !== String(from.index)) return false;
    return true;
  });
  if (!cards.length) return [];
  if (SINGLE.has(from.zone)) return [cards[cards.length - 1]];
  const count = from.count ?? 1;
  const moving = cards.filter((el) => Number(el.dataset.count || 1) <= count);
  return moving.length ? moving : [cards[cards.length - 1]];
}

function slotForMove(scope, from) {
  if (!from?.zone) return null;
  const drop = from.index == null ? from.zone : `${from.zone}:${from.index}`;
  return scope.querySelector(`[data-drop="${drop}"]`);
}

export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

export function isBedtimeTheme() {
  try {
    return typeof document !== "undefined" && document.documentElement?.dataset?.theme !== "classic";
  } catch {
    return false;
  }
}

/** What card motion is allowed. Bedtime stays quieter; reduced motion turns it off. */
export function motionPolicy({ reduce = false, bedtime = false } = {}) {
  return {
    reduce: !!reduce,
    bedtime: !!bedtime,
    dragWobble: !reduce,
    settleBounce: !reduce && !bedtime,
    sheenMotion: !reduce,
    sheenQuiet: !!reduce || !!bedtime,
  };
}

export function currentMotionPolicy() {
  return motionPolicy({ reduce: prefersReducedMotion(), bedtime: isBedtimeTheme() });
}

function snapshotFrom(from) {
  if (!from || typeof from !== "object") return null;
  return { zone: from.zone, index: from.index, count: from.count };
}

const REJECT_MS = 420;

function paintShake(from, root) {
  if (typeof document === "undefined") return;
  // Reduced motion gets a still red outline instead of the shake, so a
  // rejected move is never silent.
  const cls = prefersReducedMotion() ? "reject-flash" : "shake";
  const scope = root || document.getElementById("table") || document;
  let nodes = cardsForMove(scope, from);
  if (!nodes.length && from?.zone) {
    const slot = slotForMove(scope, from);
    if (slot) nodes = [slot];
  }
  if (!nodes.length) nodes = [...scope.querySelectorAll(".card.selected")].filter((el) => !el.closest("#drag-layer"));
  for (const el of nodes) {
    el.classList.remove("shake", "reject-flash");
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), REJECT_MS);
  }
}

/**
 * Brief shake on the cards (or slot) from a rejected move.
 * Painted on a microtask so a same-turn re-render cannot drop the class.
 * Reduced motion gets a still outline flash instead. The CSS animation is 380ms.
 */
export function shakeMoved(from, root) {
  if (typeof document === "undefined") return;
  const snapshot = snapshotFrom(from);
  const scopeRoot = root || null;
  const run = () => paintShake(snapshot, scopeRoot);
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else run();
}

const TILT_GAIN = 12;
const TILT_EASE = 0.32;
const VEL_SMOOTH = 0.42;

/** Ease pointer velocity into a clamped angle, in degrees. */
export function stepTilt(prev, vx, maxDeg) {
  const max = Math.abs(Number(maxDeg) || 0);
  const target = Math.max(-max, Math.min(max, (Number(vx) || 0) * TILT_GAIN));
  const from = Number(prev) || 0;
  const next = from + (target - from) * TILT_EASE;
  return Math.abs(next) < 0.04 ? 0 : next;
}

/** Low-pass a velocity sample so a stop eases out instead of snapping flat. */
export function smoothAxis(prev, next, ease = VEL_SMOOTH) {
  const v = (Number(prev) || 0) + ((Number(next) || 0) - (Number(prev) || 0)) * ease;
  return Math.abs(v) < 0.0005 ? 0 : v;
}

export function dragTiltMax() {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--card-tilt-max");
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 6;
  } catch {
    return 6;
  }
}

function writeDragPose(ghost, tilt, bend) {
  ghost.style.setProperty("--card-tilt", `${tilt.toFixed(2)}deg`);
  ghost.style.setProperty("--card-drag-ry", `${(tilt * 0.42).toFixed(2)}deg`);
  ghost.style.setProperty("--card-drag-rx", `${bend.toFixed(2)}deg`);
  ghost.dataset.tilt = tilt.toFixed(2);
}

/** Write drag pose on the ghost from pointer x (and optional y). Returns degrees of rotateZ. */
export function paintDragTilt(ghost, drag, x, now = typeof performance !== "undefined" ? performance.now() : 0, y) {
  if (!ghost || !drag) return 0;
  if (!currentMotionPolicy().dragWobble) {
    drag.tilt = 0;
    drag.bend = 0;
    drag.vx = 0;
    drag.vy = 0;
    drag.tiltX = x;
    if (y != null) drag.tiltY = y;
    drag.tiltT = now;
    writeDragPose(ghost, 0, 0);
    return 0;
  }
  const prevX = drag.tiltX ?? x;
  const prevT = drag.tiltT ?? now;
  const dt = Math.max(16, now - prevT);
  const vx = smoothAxis(drag.vx, (x - prevX) / dt);
  const max = dragTiltMax();
  const tilt = stepTilt(drag.tilt || 0, vx, max);
  drag.vx = vx;
  drag.tiltX = x;
  drag.tiltT = now;
  drag.tilt = tilt;
  let bend = Number(drag.bend) || 0;
  if (y != null && Number.isFinite(Number(y))) {
    const prevY = drag.tiltY ?? y;
    const vy = smoothAxis(drag.vy, (y - prevY) / dt);
    bend = stepTilt(bend, vy, max * 0.55);
    drag.vy = vy;
    drag.bend = bend;
    drag.tiltY = y;
  }
  writeDragPose(ghost, tilt, bend);
  return tilt;
}
