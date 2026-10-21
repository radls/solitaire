import { buildDeck, mulberry32, oppositeColor, shuffle } from "./cards.js";
import { elapsed, startClock, transferClock } from "./clock.js";

export const SIDE_COUNT = 4;
export const CORNER_COUNT = 4;

function resolveSeed(seed) {
  if (seed == null || seed === "") return (Math.random() * 0xffffffff) >>> 0;
  const n = Number(seed);
  if (!Number.isFinite(n)) return (Math.random() * 0xffffffff) >>> 0;
  return n >>> 0;
}

export function cloneState(state) {
  return structuredClone(state);
}

/** Undo restores a snapshot but keeps the live clock so elapsed time does not jump. */
export function continueClock(current, snapshot) {
  return transferClock(current, cloneState(snapshot));
}

function fail(state, reason) {
  return { ok: false, reason, state };
}

function top(pile) {
  return pile?.length ? pile[pile.length - 1] : null;
}

function inRange(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/**
 * `onto` is a card, or an empty pile `{ zone: "corner" | "side" }`.
 * A card builds down one rank in the other color.
 * An empty corner takes a king. An empty side takes any card.
 */
export function canBuild(card, onto) {
  if (!card || !onto) return false;
  if (onto.rank == null) {
    if (onto.zone === "corner") return card.rank === 13;
    if (onto.zone === "side") return true;
    return false;
  }
  if (onto.suit == null) return false;
  return oppositeColor(card.suit, onto.suit) && card.rank === onto.rank - 1;
}

export function cardsInCorners(state) {
  if (!state?.corners) return 0;
  return state.corners.reduce((n, pile) => n + pile.length, 0);
}

/** Corners that hold at least one card, not the total number of cards. */
export function filledCorners(state) {
  if (!state?.corners) return 0;
  return state.corners.reduce((n, pile) => n + (pile.length > 0 ? 1 : 0), 0);
}

export function cornerProgressLabel(state) {
  return `${filledCorners(state)}/${CORNER_COUNT}`;
}

/**
 * Move target for a decent hint-following run. Filled in after the
 * measurement in docs/batch6-spec.md. FreeCell's 120 is a different game.
 */
export const MOVE_GOAL = 150;

export function isWon(state) {
  return cardsInCorners(state) === 52;
}

export function elapsedMs(state, now = Date.now()) {
  return elapsed(state, now);
}

function emptyPiles(n) {
  return Array.from({ length: n }, () => []);
}

/**
 * Sides are filled N, E, S, W. A king dealt to a side goes to the lowest-index
 * empty corner instead, and that side is dealt again. Corners are indexed
 * northwest, northeast, southwest, southeast.
 */
export function deal({ seed } = {}) {
  const resolvedSeed = resolveSeed(seed);
  const deck = shuffle(buildDeck(), mulberry32(resolvedSeed));
  const sides = emptyPiles(SIDE_COUNT);
  const corners = emptyPiles(CORNER_COUNT);
  let i = 0;
  for (let s = 0; s < SIDE_COUNT; s++) {
    for (;;) {
      const card = { ...deck[i], faceUp: true };
      i += 1;
      if (card.rank === 13) {
        const corner = corners.findIndex((pile) => pile.length === 0);
        corners[corner].push(card);
        continue;
      }
      sides[s].push(card);
      break;
    }
  }
  const stock = [];
  for (; i < deck.length; i++) stock.push({ ...deck[i], faceUp: false });
  return {
    seed: resolvedSeed,
    sides,
    corners,
    stock,
    waste: [],
    moves: 0,
    startedAt: 0,
    pausedAt: 0,
    wonAt: null,
    won: false,
    stuck: false,
    idlePasses: 0,
  };
}

function sameSide(from, to) {
  return from?.zone === "side" && to?.zone === "side" && from.index === to.index;
}

function readSource(state, from) {
  if (!from?.zone) return { ok: false, reason: "missing location" };
  if (from.zone === "corner") return { ok: false, reason: "cards cannot leave a corner" };
  if (from.zone === "waste") {
    if (!state.waste?.length) return { ok: false, reason: "waste is empty" };
    return { ok: true, take: "waste" };
  }
  if (from.zone === "side") {
    if (!inRange(from.index, state.sides?.length ?? 0)) return { ok: false, reason: "no such side" };
    const pile = state.sides[from.index];
    if (!pile.length) return { ok: false, reason: "side is empty" };
    const count = Number(from.count);
    if (count !== 1 && count !== pile.length) return { ok: false, reason: "partial runs cannot move" };
    return { ok: true, take: count === 1 ? "top" : "all" };
  }
  return { ok: false, reason: "missing location" };
}

function readDest(state, to) {
  if (!to || (to.zone !== "side" && to.zone !== "corner")) return { ok: false, reason: "not a destination" };
  const piles = to.zone === "side" ? state.sides : state.corners;
  if (!inRange(to.index, piles?.length ?? 0)) {
    return { ok: false, reason: to.zone === "side" ? "no such side" : "no such corner" };
  }
  return { ok: true, pile: piles[to.index] };
}

/** A whole side pile moved onto an empty side. The piles are the same set. */
function isPointlessSideMove(state, from, to) {
  if (from?.zone !== "side" || to?.zone !== "side") return false;
  const pile = state.sides?.[from.index];
  const dest = state.sides?.[to.index];
  if (!pile?.length || dest?.length) return false;
  return Number(from.count) === pile.length;
}

function sourceCards(state, from) {
  if (from.zone === "waste") return [state.waste[state.waste.length - 1]];
  const pile = state.sides[from.index];
  if (Number(from.count) === 1) return [pile[pile.length - 1]];
  return pile;
}

export function moveCards(state, from, to) {
  if (!state) return fail(state, "missing state");
  if (state.won || isWon(state)) return fail(state, "game already won");
  if (!from || !to) return fail(state, "missing location");
  if (sameSide(from, to)) return fail(state, "same pile");
  if (isPointlessSideMove(state, from, to)) return fail(state, "that move goes nowhere");
  const src = readSource(state, from);
  if (!src.ok) return fail(state, src.reason);
  const dest = readDest(state, to);
  if (!dest.ok) return fail(state, dest.reason);
  const movingPreview = sourceCards(state, from);
  const destTop = top(dest.pile);
  const anchor = movingPreview[0];
  const builds = destTop ? canBuild(anchor, destTop) : canBuild(anchor, { zone: to.zone });
  if (!builds) return fail(state, "that card does not fit");

  const next = cloneState(state);
  let moving;
  if (src.take === "waste") {
    moving = [next.waste.pop()];
  } else if (src.take === "top") {
    moving = [next.sides[from.index].pop()];
  } else {
    moving = next.sides[from.index];
    next.sides[from.index] = [];
  }
  for (const card of moving) card.faceUp = true;
  const destPile = to.zone === "side" ? next.sides[to.index] : next.corners[to.index];
  destPile.push(...moving);
  next.moves += 1;
  startClock(next);
  next.idlePasses = 0;
  next.stuck = false;
  if (isWon(next)) {
    next.won = true;
    next.wonAt = Date.now();
  }
  return { ok: true, state: next };
}

/**
 * Draw one card, or turn the waste back over into the stock when the stock is empty.
 * A recycle with no non-stock move since the previous recycle increments `idlePasses`.
 * Two idle passes in a row set `stuck`.
 */
export function drawStock(state) {
  if (!state) return fail(state, "missing state");
  if (state.won || isWon(state)) return fail(state, "game already won");
  if (!state.stock?.length && !state.waste?.length) return fail(state, "nothing to draw");
  const next = cloneState(state);
  if (!next.stock.length) {
    next.stock = next.waste
      .slice()
      .reverse()
      .map((card) => ({ ...card, faceUp: false }));
    next.waste = [];
    next.idlePasses += 1;
    if (next.idlePasses >= 2) next.stuck = true;
    next.moves += 1;
    startClock(next);
    return { ok: true, state: next, recycled: true };
  }
  const card = next.stock.pop();
  card.faceUp = true;
  next.waste.push(card);
  next.moves += 1;
  startClock(next);
  return { ok: true, state: next, recycled: false };
}

export function listLegalMoves(state) {
  if (!state || state.won || isWon(state)) return [];
  const moves = [];
  const sources = [];
  if (state.waste?.length) sources.push({ zone: "waste" });
  for (let index = 0; index < (state.sides?.length ?? 0); index++) {
    const pile = state.sides[index];
    if (!pile.length) continue;
    sources.push({ zone: "side", index, count: 1 });
    if (pile.length > 1) sources.push({ zone: "side", index, count: pile.length });
  }
  const destinations = [];
  for (let index = 0; index < (state.sides?.length ?? 0); index++) destinations.push({ zone: "side", index });
  for (let index = 0; index < (state.corners?.length ?? 0); index++) destinations.push({ zone: "corner", index });
  for (const from of sources) {
    for (const to of destinations) {
      if (moveCards(state, from, to).ok) moves.push({ kind: "move", from, to });
    }
  }
  if (state.stock?.length || state.waste?.length) moves.push({ kind: "draw" });
  return moves;
}

/** Layout only. Moves and idle passes are left out so a rising potential cannot cycle. */
export function layoutKey(state) {
  const ids = (pile) => (pile || []).map((card) => card.id).join(".");
  return [
    (state?.sides || []).map(ids).join("/"),
    (state?.corners || []).map(ids).join("/"),
    ids(state?.stock),
    ids(state?.waste),
  ].join("|");
}

function sideRunScore(pile) {
  if (!pile || pile.length <= 1) return 0;
  for (let i = 1; i < pile.length; i++) {
    if (!canBuild(pile[i], pile[i - 1])) return 0;
  }
  return pile.length * pile.length;
}

/** A waste top that builds on a corner or a non-empty side. An empty side does not count. */
function wasteTopPlays(state) {
  const card = top(state.waste);
  if (!card) return false;
  for (let i = 0; i < (state.corners?.length || 0); i++) {
    const pile = state.corners[i];
    const onto = pile.length ? top(pile) : { zone: "corner" };
    if (canBuild(card, onto)) return true;
  }
  for (let i = 0; i < (state.sides?.length || 0); i++) {
    const pile = state.sides[i];
    if (!pile.length) continue;
    if (canBuild(card, top(pile))) return true;
  }
  return false;
}

const DRAW_HORIZON = 48;

function stepsToUsefulDraw(state) {
  let sim = cloneState(state);
  const seen = new Set();
  for (let n = 0; n < DRAW_HORIZON; n++) {
    const key = layoutKey(sim);
    if (seen.has(key)) return DRAW_HORIZON;
    seen.add(key);
    if (wasteTopPlays(sim)) return n;
    if (!sim.stock.length && !sim.waste.length) return DRAW_HORIZON;
    const drawn = drawStock(sim);
    if (!drawn.ok) return DRAW_HORIZON;
    sim = drawn.state;
  }
  return DRAW_HORIZON;
}

function cornerReady(state) {
  const ids = new Set();
  const consider = (card, cards) => {
    if (!card) return;
    for (let i = 0; i < (state.corners?.length || 0); i++) {
      const dest = state.corners[i];
      const onto = dest.length ? top(dest) : { zone: "corner" };
      if (!canBuild(card, onto)) continue;
      for (const entry of cards) ids.add(entry.id);
      return;
    }
  };
  if (state.waste?.length) consider(top(state.waste), [top(state.waste)]);
  for (const pile of state.sides || []) {
    if (!pile.length) continue;
    consider(top(pile), [top(pile)]);
    consider(pile[0], pile);
  }
  return ids.size;
}

const potCache = new Map();

/** Higher is better. Depends only on the layout, so a strict increase cannot repeat a key. */
export function potential(state) {
  const key = layoutKey(state);
  if (potCache.has(key)) return potCache.get(key);
  let builds = 0;
  for (const pile of state?.sides || []) builds += sideRunScore(pile);
  const value =
    cardsInCorners(state) * 1_000_000 +
    cornerReady(state) * 1_000 +
    builds * 20 +
    (DRAW_HORIZON - stepsToUsefulDraw(state));
  if (potCache.size > 6000) potCache.clear();
  potCache.set(key, value);
  return value;
}

/**
 * The legal move or draw that most raises `potential`.
 * A recycle that only restores the same pass does not raise it, so it is not hinted.
 * Returns null when nothing increases the potential.
 */
export function hint(state) {
  if (!state || state.won || isWon(state)) return null;
  const base = potential(state);
  let best = null;
  let bestPot = base;
  for (const move of listLegalMoves(state)) {
    const action =
      move.kind === "draw" ? { type: "draw" } : { type: "move", from: move.from, to: move.to };
    const next = apply(state, action);
    if (!next.ok) continue;
    const pot = potential(next.state);
    if (pot > bestPot) {
      bestPot = pot;
      best = move.kind === "draw" ? { kind: "draw" } : move;
    }
  }
  return best;
}

/** Follow hints until they stop. `repeated` is a layout seen twice. `noProgress` is a hint that did not rise. */
export function followHints(state, limit = 80) {
  const seen = [];
  let current = state;
  for (let step = 0; step < limit; step++) {
    const key = layoutKey(current);
    if (seen.includes(key)) return { repeated: true, noProgress: false, steps: step, state: current };
    seen.push(key);
    const suggested = hint(current);
    if (!suggested) return { repeated: false, noProgress: false, steps: step, state: current, stopped: true };
    const before = potential(current);
    const action =
      suggested.kind === "draw"
        ? { type: "draw" }
        : { type: "move", from: suggested.from, to: suggested.to };
    const next = apply(current, action);
    if (!next.ok || potential(next.state) <= before) {
      return { repeated: false, noProgress: true, steps: step, state: current };
    }
    current = next.state;
    if (current.won || isWon(current)) {
      return { repeated: false, noProgress: false, steps: step + 1, state: current, won: true };
    }
  }
  return {
    repeated: seen.includes(layoutKey(current)),
    noProgress: false,
    steps: limit,
    state: current,
    capped: true,
  };
}

export function apply(state, action) {
  if (!state) return fail(state, "missing state");
  if (!action || typeof action !== "object") return fail(state, "unknown action");
  if (action.type === "move") return moveCards(state, action.from, action.to);
  if (action.type === "draw") return drawStock(state);
  return fail(state, "unknown action");
}
