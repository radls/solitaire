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

function paintShake(from, root) {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const scope = root || document.getElementById("table") || document;
  let nodes = cardsForMove(scope, from);
  if (!nodes.length && from?.zone) {
    const slot = slotForMove(scope, from);
    if (slot) nodes = [slot];
  }
  if (!nodes.length) nodes = [...scope.querySelectorAll(".card.selected")].filter((el) => !el.closest("#drag-layer"));
  for (const el of nodes) {
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }
}

/**
 * Brief shake on the cards (or slot) from a rejected move.
 * Painted on a microtask so a same-turn re-render cannot drop the class.
 * Reduced motion adds nothing. The CSS animation is 250ms.
 */
export function shakeMoved(from, root) {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const snapshot = snapshotFrom(from);
  const scopeRoot = root || null;
  const run = () => paintShake(snapshot, scopeRoot);
  if (typeof queueMicrotask === "function") queueMicrotask(run);
  else run();
}
