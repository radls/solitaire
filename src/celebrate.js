/**
 * Win celebration plan.
 * Reduced motion keeps a still glow and does not move cards.
 * Bedtime is slower, shorter, and dimmer.
 */
export function winCelebration({ reduce = false, bedtime = false } = {}) {
  if (reduce) return { cascade: 0, glow: true, ms: 0, dim: !!bedtime };
  if (bedtime) return { cascade: 7, glow: true, ms: 2800, dim: true };
  return { cascade: 16, glow: true, ms: 1400, dim: false };
}

export function celebrationHTML(plan) {
  const n = plan?.cascade || 0;
  const cards = Array.from({ length: n }, (_, i) => `<i class="cascade-card" style="--i:${i}"></i>`).join("");
  const dim = plan?.dim ? " dim" : "";
  return `<div class="celebrate${dim}" data-testid="celebrate" data-cascade="${n}" data-glow="${plan?.glow ? "1" : "0"}">${cards}</div>`;
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isBedtimeTheme() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme !== "classic";
}

export function winCelebrateHTML() {
  return celebrationHTML(winCelebration({ reduce: prefersReducedMotion(), bedtime: isBedtimeTheme() }));
}
