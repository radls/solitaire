import { buildDeck, mulberry32, shuffle } from "./cards.js";

export const COLUMN_COUNT = 7;
export const COLUMN_ROWS = 5;

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

function top(pile) {
  return pile?.length ? pile[pile.length - 1] : null;
}

function fail(state, reason) {
  return { ok: false, reason, state };
}

/**
 * One rank apart. Suit is ignored.
 * A king accepts nothing, so nothing wraps between king and ace.
 */
export function canPlay(card, wasteTop) {
  if (!card || !wasteTop) return false;
  if (wasteTop.rank === 13) return false;
  return Math.abs(card.rank - wasteTop.rank) === 1;
}

export function cardsLeft(state) {
  if (!state?.columns) return 0;
  return state.columns.reduce((n, pile) => n + pile.length, 0);
}

export function isCleared(state) {
  return !!state?.columns?.length && state.columns.every((pile) => pile.length === 0);
}

export function isRoundOver(state) {
  if (!state) return false;
  if (isCleared(state)) return true;
  if (state.stock.length > 0) return false;
  const wasteTop = top(state.waste);
  return !state.columns.some((pile) => pile.length > 0 && canPlay(pile[pile.length - 1], wasteTop));
}

export function score(state) {
  if (isCleared(state)) return -state.stock.length;
  return cardsLeft(state);
}

export function elapsedMs(state, now = Date.now()) {
  const end = state?.over && state.wonAt ? state.wonAt : now;
  return Math.max(0, end - (state?.startedAt || 0));
}

function finish(state) {
  state.moves += 1;
  if (isRoundOver(state)) {
    state.over = true;
    if (isCleared(state)) state.wonAt = Date.now();
  }
  return { ok: true, state };
}

export function deal({ seed, now = Date.now() } = {}) {
  const resolvedSeed = resolveSeed(seed);
  const rng = mulberry32(resolvedSeed);
  const deck = shuffle(buildDeck(), rng);
  const columns = Array.from({ length: COLUMN_COUNT }, () => []);
  let i = 0;
  for (let row = 0; row < COLUMN_ROWS; row++) {
    for (let col = 0; col < COLUMN_COUNT; col++) {
      columns[col].push({ ...deck[i], faceUp: true });
      i += 1;
    }
  }
  const waste = [{ ...deck[i], faceUp: true }];
  i += 1;
  const stock = [];
  for (; i < deck.length; i++) stock.push({ ...deck[i], faceUp: false });
  return {
    seed: resolvedSeed,
    columns,
    waste,
    stock,
    moves: 0,
    startedAt: now,
    wonAt: null,
    over: false,
  };
}

export function playColumn(state, col) {
  if (!state) return fail(state, "missing state");
  if (state.over || isCleared(state)) return fail(state, "round is over");
  if (!Number.isInteger(col) || col < 0 || col >= (state.columns?.length ?? 0)) {
    return fail(state, "no such column");
  }
  const pile = state.columns[col];
  if (!pile.length) return fail(state, "column is empty");
  if (!canPlay(pile[pile.length - 1], top(state.waste))) {
    return fail(state, "not one above or below");
  }
  const next = cloneState(state);
  const played = next.columns[col].pop();
  played.faceUp = true;
  next.waste.push(played);
  return finish(next);
}

export function drawStock(state) {
  if (!state) return fail(state, "missing state");
  if (state.over || isCleared(state)) return fail(state, "round is over");
  if (!state.stock.length) return fail(state, "stock is empty");
  const next = cloneState(state);
  const card = next.stock.pop();
  card.faceUp = true;
  next.waste.push(card);
  return finish(next);
}

export function listLegalMoves(state) {
  if (!state || state.over || isCleared(state)) return [];
  const wasteTop = top(state.waste);
  const moves = [];
  for (let col = 0; col < state.columns.length; col++) {
    const pile = state.columns[col];
    if (pile.length && canPlay(pile[pile.length - 1], wasteTop)) {
      moves.push({ type: "play", col });
    }
  }
  if (state.stock.length) moves.push({ type: "draw" });
  return moves;
}

export function apply(state, action) {
  if (!state) return fail(state, "missing state");
  if (!action || typeof action !== "object") return fail(state, "unknown action");
  if (action.type === "play") return playColumn(state, action.col);
  if (action.type === "draw") return drawStock(state);
  return fail(state, "unknown action");
}
