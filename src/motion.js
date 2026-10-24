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

function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
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

/** Ease horizontal pointer velocity into a clamped rotateZ, in degrees. */
export function stepTilt(prev, vx, maxDeg) {
  const max = Math.abs(Number(maxDeg) || 0);
  const target = Math.max(-max, Math.min(max, (Number(vx) || 0) * TILT_GAIN));
  const from = Number(prev) || 0;
  const next = from + (target - from) * TILT_EASE;
  return Math.abs(next) < 0.04 ? 0 : next;
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

/** Write --card-tilt on the drag ghost from pointer x. Returns degrees. */
export function paintDragTilt(ghost, drag, x, now = typeof performance !== "undefined" ? performance.now() : 0) {
  if (!ghost || !drag) return 0;
  const prevX = drag.tiltX ?? x;
  const prevT = drag.tiltT ?? now;
  const dt = Math.max(16, now - prevT);
  const vx = (x - prevX) / dt;
  const tilt = stepTilt(drag.tilt || 0, vx, dragTiltMax());
  drag.tiltX = x;
  drag.tiltT = now;
  drag.tilt = tilt;
  ghost.style.setProperty("--card-tilt", `${tilt.toFixed(2)}deg`);
  ghost.dataset.tilt = tilt.toFixed(2);
  return tilt;
}
