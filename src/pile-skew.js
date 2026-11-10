/** Tiny, stable pile offset. Same card + deal + pile always lands the same way. */

const PILE_ZONES = new Set(["tableau", "cascade", "column", "side"]);

let dealSeed = 0;

export function setPileSeed(seed) {
  const n = Number(seed);
  dealSeed = Number.isFinite(n) ? n >>> 0 : 0;
}

export function getPileSeed() {
  return dealSeed;
}

/** FNV-1a, 32-bit. Integer only so every engine agrees. */
export function hashSkew(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unit(n) {
  return (n & 4095) / 4095;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Rotation about ±1.5° and a 1–2px shift.
 * `index` is the pile column, not the row, so burying a card does not reshuffle the ones under it.
 */
export function pileSkew(cardId, seed, zone = "", index = 0) {
  const key = `${Number(seed) >>> 0}|${cardId ?? ""}|${zone}|${index ?? ""}`;
  const h = hashSkew(key);
  return {
    rot: round3((unit(h) * 2 - 1) * 1.5),
    dx: round3((unit(h >>> 8) * 2 - 1) * 1.75),
    dy: round3((unit(h >>> 16) * 2 - 1) * 1.75),
  };
}

export function isPileZone(zone) {
  return PILE_ZONES.has(zone);
}

/** Write unitless --pile-rot / --pile-dx / --pile-dy. CSS scales them. No-op outside piles. */
export function applyPileSkew(el, card, loc, seed = dealSeed) {
  if (!el?.style || !loc || !PILE_ZONES.has(loc.zone)) return null;
  const skew = pileSkew(card?.id ?? "", seed, loc.zone, loc.index);
  el.style.setProperty("--pile-rot", skew.rot.toFixed(3));
  el.style.setProperty("--pile-dx", skew.dx.toFixed(3));
  el.style.setProperty("--pile-dy", skew.dy.toFixed(3));
  return skew;
}
