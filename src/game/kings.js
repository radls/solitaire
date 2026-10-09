import { buildDeck, mulberry32, oppositeColor, shuffle } from "./cards.js";

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
  const next = cloneState(snapshot);
  next.startedAt = current.startedAt;
  return next;
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

export function isWon(state) {
  return cardsInCorners(state) === 52;
}

export function elapsedMs(state, now = Date.now()) {
  const end = state?.won && state.wonAt ? state.wonAt : now;
  return Math.max(0, end - (state?.startedAt || 0));
}

function emptyPiles(n) {
  return Array.from({ length: n }, () => []);
}

/**
 * Sides are filled N, E, S, W. A king dealt to a side goes to the lowest-index
 * empty corner instead, and that side is dealt again. Corners are indexed
 * northwest, northeast, southwest, southeast.
 */
export function deal({ seed, now = Date.now() } = {}) {
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
    startedAt: now,
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
    return { ok: true, state: next, recycled: true };
  }
  const card = next.stock.pop();
  card.faceUp = true;
  next.waste.push(card);
  next.moves += 1;
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

/**
 * Prefer a move to a corner, then a side-to-side move that empties a side or
 * builds, then waste→side, else `{ kind: "draw" }` if the stock or waste has
 * cards, else null.
 */
export function hint(state) {
  if (!state || state.won || isWon(state)) return null;
  const moves = listLegalMoves(state);
  const first = (pred) => {
    for (const move of moves) {
      if (pred(move)) return move.kind === "draw" ? { kind: "draw" } : move;
    }
    return null;
  };
  return (
    first((move) => move.kind === "move" && move.to.zone === "corner") ||
    first((move) => {
      if (move.kind !== "move" || move.from.zone !== "side" || move.to.zone !== "side") return false;
      const pile = state.sides[move.from.index];
      const dest = state.sides[move.to.index];
      const empties = !!pile && (move.from.count ?? 1) === pile.length;
      const builds = !!dest && dest.length > 0;
      return empties || builds;
    }) ||
    first((move) => move.kind === "move" && move.from.zone === "waste" && move.to.zone === "side") ||
    first((move) => move.kind === "draw") ||
    null
  );
}

export function apply(state, action) {
  if (!state) return fail(state, "missing state");
  if (!action || typeof action !== "object") return fail(state, "unknown action");
  if (action.type === "move") return moveCards(state, action.from, action.to);
  if (action.type === "draw") return drawStock(state);
  return fail(state, "unknown action");
}
