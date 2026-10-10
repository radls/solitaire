/** Phone width, thumb clearance, cascade fan, and touch help copy. */

export function isPhonePortrait() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 600 && window.innerHeight >= window.innerWidth;
}

export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return true;
  } catch {
    /* matchMedia can throw in locked-down embeds */
  }
  return "ontouchstart" in window;
}

/** Padding reserved under the board so cards clear the thumb bar and the home indicator. */
export function layoutBottomInset() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  if (window.innerWidth > 600) return 0;
  const game = document.body?.dataset?.game;
  if (!game || game === "picker") return 0;
  const app = document.getElementById("app");
  if (!app) return 0;
  const pad = parseFloat(getComputedStyle(app).paddingBottom);
  return Number.isFinite(pad) ? pad : 0;
}

/**
 * Visible strip of an overlapped card.
 * Grows from `natural` up to 45% of card height so the column fills `avail`.
 * Shrinks below `natural` when the column would scroll.
 */
export function fanPeek(natural, cardH, avail, steps) {
  const base = Math.max(1, Math.round(Number(natural) || 1));
  if (!steps || steps <= 0) return base;
  const cap = Math.max(base, Math.round(cardH * 0.45));
  const fill = Math.floor((avail - cardH) / steps);
  if (fill >= base) return Math.min(fill, cap);
  return Math.max(1, fill);
}

/** Largest integer <= start that `fits`, never below `min`. */
export function shrinkToFit(start, min, fits) {
  const top = Math.round(start);
  const floor = Math.round(min);
  if (top <= floor) return floor;
  if (fits(top)) return top;
  if (!fits(floor)) return floor;
  let lo = floor;
  let hi = top;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Grow Klondike's face-up and face-down strips together, capped at 45% of card height. */
export function growKlondikePeeks({ peekUp, peekDown, cardH, avail, piles }) {
  const baseUp = Math.max(1, Math.round(peekUp));
  const baseDown = Math.max(1, Math.round(peekDown));
  const cap = Math.max(baseUp, baseDown, Math.round(cardH * 0.45));
  const height = (pile, up, down) => {
    if (!pile?.length) return cardH;
    let h = cardH;
    for (let i = 1; i < pile.length; i++) h += pile[i].faceUp ? up : down;
    return h;
  };
  const fits = (up, down) => (piles || []).every((pile) => height(pile, up, down) <= avail);
  if (!fits(baseUp, baseDown)) return { peekUp: baseUp, peekDown: baseDown };
  let lo = 1;
  let hi = Math.max(1, cap / Math.max(1, Math.min(baseUp, baseDown)));
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const up = Math.min(cap, Math.round(baseUp * mid));
    const down = Math.min(cap, Math.round(baseDown * mid));
    if (fits(up, down)) lo = mid;
    else hi = mid;
  }
  let up = Math.min(cap, Math.max(baseUp, Math.round(baseUp * lo)));
  let down = Math.min(cap, Math.max(baseDown, Math.round(baseDown * lo)));
  let guard = 60;
  while (guard-- > 0 && (up > baseUp || down > baseDown) && !fits(up, down)) {
    if (up > baseUp) up -= 1;
    if (down > baseDown) down -= 1;
  }
  return { peekUp: up, peekDown: down };
}

export function touchTipsHTML(gestures, touch = isTouchDevice()) {
  if (!touch) return "";
  return `<div data-testid="touch-tips">${gestures}</div>`;
}

export function kbdTipsHTML(shortcuts, touch = isTouchDevice()) {
  return `<ul data-testid="kbd-tips"${touch ? " hidden" : ""}>${shortcuts}</ul>`;
}

export function bindThumb(listen, { undo, hint, newGame }) {
  listen(document.getElementById("thumb-undo"), "click", undo);
  listen(document.getElementById("thumb-hint"), "click", hint);
  listen(document.getElementById("thumb-new"), "click", newGame);
}

export function syncThumbDisabled() {
  for (const [srcId, dstId] of [
    ["btn-undo", "thumb-undo"],
    ["btn-hint", "thumb-hint"],
    ["btn-new", "thumb-new"],
  ]) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (src && dst) dst.disabled = src.disabled;
  }
}

export function listenLayout(listen, fit) {
  const run = () => fit();
  listen(window, "resize", run);
  listen(window, "orientationchange", run);
  if (typeof window !== "undefined" && window.visualViewport) listen(window.visualViewport, "resize", run);
}
