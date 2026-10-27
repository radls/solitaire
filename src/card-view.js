import { cardName, rankLabel, SUIT_GLYPH, suitColor } from "./game/cards.js";

const PIP = {
  2: [
    [50, 18],
    [50, 80, 1],
  ],
  3: [
    [50, 18],
    [50, 49],
    [50, 80, 1],
  ],
  4: [
    [24, 18],
    [76, 18],
    [24, 80, 1],
    [76, 80, 1],
  ],
  5: [
    [24, 18],
    [76, 18],
    [50, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  6: [
    [24, 18],
    [76, 18],
    [24, 49],
    [76, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  7: [
    [24, 18],
    [76, 18],
    [50, 34],
    [24, 49],
    [76, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  8: [
    [24, 18],
    [76, 18],
    [50, 34],
    [24, 49],
    [76, 49],
    [50, 64, 1],
    [24, 80, 1],
    [76, 80, 1],
  ],
  9: [
    [24, 16],
    [76, 16],
    [24, 38],
    [76, 38],
    [50, 49],
    [24, 62, 1],
    [76, 62, 1],
    [24, 84, 1],
    [76, 84, 1],
  ],
  10: [
    [24, 14],
    [76, 14],
    [50, 26],
    [24, 36],
    [76, 36],
    [24, 64, 1],
    [76, 64, 1],
    [50, 74, 1],
    [24, 84, 1],
    [76, 84, 1],
  ],
};

function cardFaceHTML(card) {
  const glyph = SUIT_GLYPH[card.suit];
  const label = rankLabel(card.rank);
  const corner = `<span class="corner tl">${label}<span class="suit">${glyph}</span></span><span class="corner br">${label}<span class="suit">${glyph}</span></span>`;
  if (card.rank === 1) return `${corner}<div class="pips ace">${glyph}</div>`;
  if (card.rank >= 11) return `${corner}<div class="face-mark">${label}<span>${glyph}</span></div>`;
  const pips = (PIP[card.rank] ?? [])
    .map(
      ([x, y, rot]) =>
        `<span class="pip" style="left:${x}%;top:${y}%;${rot ? "transform:translate(-50%,-50%) rotate(180deg)" : ""}">${glyph}</span>`,
    )
    .join("");
  return `${corner}<div class="pips">${pips}</div>`;
}

const faceWasUp = new Map();
const settleIds = new Set();
let settleTilt = 0;
let flipBatch = [];
let flipQueued = false;

/** Remember cards dropped this gesture so the next render can play the settle. */
export function armCardSettle(ids, tiltDeg = 0) {
  settleIds.clear();
  for (const id of ids || []) if (id) settleIds.add(id);
  const tilt = Number(tiltDeg);
  settleTilt = Number.isFinite(tilt) ? Math.max(-6, Math.min(6, tilt)) : 0;
}

export function cancelCardSettle() {
  settleIds.clear();
  settleTilt = 0;
}

function clearTurning(node) {
  node.classList.remove("is-turning");
  delete node.dataset.turning;
}

function queueTurning(el) {
  flipBatch.push(el);
  if (flipQueued) return;
  flipQueued = true;
  queueMicrotask(() => {
    flipQueued = false;
    const batch = flipBatch;
    flipBatch = [];
    // A deal or undo turns many cards at once. Only a real reveal (1–3) flips.
    if (batch.length > 3) {
      for (const node of batch) clearTurning(node);
    }
  });
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A CSS time token in ms. The build minifies `680ms` to `.68s`, so units matter. */
export function cssTimeMs(raw, fallback) {
  const match = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)?$/.exec(String(raw ?? "").trim().toLowerCase());
  if (!match) return fallback;
  const value = Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  // A negative or non-finite time means no usable duration.
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// animationend does not fire when the flip animation is suppressed. A timeout
// still clears the flag if the event never arrives.
function armFlip(el) {
  el.classList.add("is-turning");
  el.dataset.turning = "1";
  if (prefersReducedMotion()) {
    clearTurning(el);
    return;
  }
  let timer = 0;
  const finish = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    el.removeEventListener("animationend", onEnd);
    clearTurning(el);
  };
  const onEnd = (event) => {
    if (event.animationName !== "card-flip") return;
    finish();
  };
  el.addEventListener("animationend", onEnd);
  const ms = cssTimeMs(getComputedStyle(document.documentElement).getPropertyValue("--card-flip-ms"), 700);
  timer = window.setTimeout(finish, ms + 400);
  queueTurning(el);
}

export function makeCardElement(card, loc, count, playable, selected) {
  const el = document.createElement("article");
  const color = card.faceUp ? suitColor(card.suit) : "";
  el.className = `card ${card.faceUp ? "face-up" : "face-down"} ${color}`.trim();
  if (playable && card.faceUp) el.classList.add("playable");
  if (selected) el.classList.add("selected");
  el.dataset.id = card.id;
  el.dataset.zone = loc.zone;
  if (loc.index != null) el.dataset.index = String(loc.index);
  el.dataset.count = String(count);
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", card.faceUp ? cardName(card) : "Face-down card");
  const prev = faceWasUp.get(card.id);
  faceWasUp.set(card.id, !!card.faceUp);
  const face = card.faceUp ? cardFaceHTML(card) : "";
  el.innerHTML = `<div class="card-lift card-rotator"><div class="card-face front">${face}</div><div class="card-face back"></div></div>`;
  if (card.faceUp && prev === false) armFlip(el);
  if (settleIds.has(card.id)) {
    el.classList.add("is-settling");
    el.dataset.settling = "1";
    el.style.setProperty("--card-tilt", `${settleTilt}deg`);
    settleIds.delete(card.id);
  }
  return el;
}
