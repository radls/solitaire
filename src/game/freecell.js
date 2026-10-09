import { makeCard, oppositeColor } from "./cards.js";

export const CASCADE_COUNT = 8;
export const FREE_CELL_COUNT = 4;
export const FOUNDATION_COUNT = 4;

const DEAL_SUITS = ["clubs", "diamonds", "hearts", "spades"];
const MOD = 1n << 31n;

const OPPOSITE_SUITS = {
  spades: ["hearts", "diamonds"],
  clubs: ["hearts", "diamonds"],
  hearts: ["clubs", "spades"],
  diamonds: ["clubs", "spades"],
};

export function emptyState(overrides = {}) {
  return {
    dealNumber: 1,
    cascades: Array.from({ length: CASCADE_COUNT }, () => []),
    freecells: Array.from({ length: FREE_CELL_COUNT }, () => null),
    foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),
    moves: 0,
    won: false,
    startedAt: 0,
    wonAt: null,
    ...overrides,
  };
}

function orderedDeck() {
  const deck = [];
  for (let rank = 1; rank <= 13; rank++) {
    for (let suit = 0; suit < DEAL_SUITS.length; suit++) {
      deck.push(makeCard(DEAL_SUITS[suit], rank, true));
    }
  }
  return deck;
}

export function deal(dealNumber = 1, now = Date.now()) {
  const n = Number.isFinite(Number(dealNumber)) ? Math.trunc(Number(dealNumber)) : 1;
  let seed = BigInt(n);
  const rand = () => {
    seed = (seed * 214013n + 2531011n) % MOD;
    return Number(seed >> 16n);
  };
  const deck = orderedDeck();
  const cascades = Array.from({ length: CASCADE_COUNT }, () => []);
  for (let i = 52; i >= 1; i--) {
    const j = rand() % i;
    cascades[(52 - i) % CASCADE_COUNT].push(deck[j]);
    deck[j] = deck[i - 1];
  }
  return emptyState({
    dealNumber: n,
    cascades,
    startedAt: now,
  });
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

export function top(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

export function isWon(state) {
  return state.foundations.every((pile) => pile.length === 13);
}

export function elapsedMs(state, now = Date.now()) {
  const end = state.won && state.wonAt ? state.wonAt : now;
  return Math.max(0, end - (state.startedAt || 0));
}

function inRange(index, length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

export function emptyFreeCells(state) {
  return state.freecells.reduce((n, card) => n + (card == null ? 1 : 0), 0);
}

export function emptyCascades(state) {
  return state.cascades.reduce((n, pile) => n + (pile.length === 0 ? 1 : 0), 0);
}

export function maxSupermove(state, destIndex) {
  let empty = emptyCascades(state);
  const dest = state.cascades[destIndex];
  if (dest && dest.length === 0) empty -= 1;
  if (empty < 0) empty = 0;
  return (emptyFreeCells(state) + 1) * 2 ** empty;
}

export function isValidRun(cards) {
  if (!cards.length) return false;
  for (let i = 0; i < cards.length - 1; i++) {
    const lower = cards[i];
    const upper = cards[i + 1];
    if (!oppositeColor(lower.suit, upper.suit) || upper.rank !== lower.rank - 1) return false;
  }
  return true;
}

function foundationRank(state, suit) {
  for (const pile of state.foundations) {
    if (pile.length && pile[0].suit === suit) return pile[pile.length - 1].rank;
  }
  return 0;
}

export function isSafeFoundationCard(state, card) {
  if (card.rank <= 2) return true;
  return OPPOSITE_SUITS[card.suit].every((suit) => foundationRank(state, suit) >= card.rank - 1);
}

function canPlaceFoundation(card, pile) {
  if (!pile.length) return card.rank === 1;
  const onto = pile[pile.length - 1];
  return onto.suit === card.suit && card.rank === onto.rank + 1;
}

function foundationIndexFor(state, card, preferred) {
  if (preferred != null) {
    if (!inRange(preferred, FOUNDATION_COUNT)) return -1;
    return canPlaceFoundation(card, state.foundations[preferred]) ? preferred : -1;
  }
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (canPlaceFoundation(card, state.foundations[i])) return i;
  }
  return -1;
}

function canPlaceCascade(cards, pile) {
  if (!pile.length) return true;
  const onto = pile[pile.length - 1];
  const moving = cards[0];
  return oppositeColor(moving.suit, onto.suit) && moving.rank === onto.rank - 1;
}

function markWin(state) {
  if (!state.won && isWon(state)) {
    state.won = true;
    state.wonAt = Date.now();
  }
  return state;
}

function take(state, from) {
  if (!from?.zone) return { ok: false, reason: "unknown source" };
  if (from.zone === "foundation") return { ok: false, reason: "cannot move from a foundation" };
  if (from.zone === "freecell") {
    if (!inRange(from.index, FREE_CELL_COUNT)) return { ok: false, reason: "no such free cell" };
    const card = state.freecells[from.index];
    if (!card) return { ok: false, reason: "free cell is empty" };
    if ((from.count ?? 1) !== 1) return { ok: false, reason: "free cell holds one card" };
    state.freecells[from.index] = null;
    return { ok: true, cards: [card] };
  }
  if (from.zone === "cascade") {
    if (!inRange(from.index, CASCADE_COUNT)) return { ok: false, reason: "no such cascade" };
    const pile = state.cascades[from.index];
    const count = from.count ?? 1;
    if (!Number.isInteger(count) || count < 1 || count > pile.length) {
      return { ok: false, reason: "invalid count" };
    }
    const cards = pile.slice(pile.length - count);
    if (!isValidRun(cards)) return { ok: false, reason: "not a valid sequence" };
    pile.splice(pile.length - count, count);
    return { ok: true, cards };
  }
  return { ok: false, reason: "unknown source" };
}

function put(state, to, cards, original) {
  if (!to?.zone) return { ok: false, reason: "unknown destination" };
  if (to.zone === "cascade") {
    if (!inRange(to.index, CASCADE_COUNT)) return { ok: false, reason: "no such cascade" };
    if (cards.length > maxSupermove(original, to.index)) {
      return { ok: false, reason: "supermove limit" };
    }
    const pile = state.cascades[to.index];
    if (!canPlaceCascade(cards, pile)) return { ok: false, reason: "cascade does not accept that run" };
    pile.push(...cards);
    return { ok: true };
  }
  if (to.zone === "freecell") {
    if (cards.length !== 1) return { ok: false, reason: "free cell holds one card" };
    let index = to.index;
    if (index == null) index = state.freecells.findIndex((card) => card == null);
    if (!inRange(index, FREE_CELL_COUNT)) return { ok: false, reason: "no such free cell" };
    if (state.freecells[index] != null) return { ok: false, reason: "free cell is full" };
    state.freecells[index] = cards[0];
    return { ok: true };
  }
  if (to.zone === "foundation") {
    if (cards.length !== 1) return { ok: false, reason: "foundations accept one card" };
    const index = foundationIndexFor(state, cards[0], to.index);
    if (index < 0) return { ok: false, reason: "foundation does not accept that card" };
    state.foundations[index].push(cards[0]);
    return { ok: true };
  }
  return { ok: false, reason: "unknown destination" };
}

function samePlace(from, to) {
  if (!from || !to) return false;
  if (from.zone !== to.zone) return false;
  if (from.zone === "foundation" && to.index == null) return false;
  return from.index === to.index;
}

export function moveCards(state, from, to) {
  if (state?.won) return { ok: false, reason: "game already won", state };
  if (!from || !to) return { ok: false, reason: "missing location", state };
  if (samePlace(from, to)) return { ok: false, reason: "same pile", state };

  const next = cloneState(state);
  const taken = take(next, from);
  if (!taken.ok) return { ok: false, reason: taken.reason, state };
  const placed = put(next, to, taken.cards, state);
  if (!placed.ok) return { ok: false, reason: placed.reason, state };
  next.moves += 1;
  markWin(next);
  return { ok: true, state: next };
}

function sequenceLength(pile) {
  if (!pile.length) return 0;
  let n = 1;
  for (let i = pile.length - 1; i > 0; i--) {
    const upper = pile[i];
    const lower = pile[i - 1];
    if (oppositeColor(upper.suit, lower.suit) && upper.rank === lower.rank - 1) n += 1;
    else break;
  }
  return n;
}

export function listLegalMoves(state) {
  const moves = [];
  if (!state || state.won) return moves;

  const consider = (from, cards) => {
    for (let dest = 0; dest < CASCADE_COUNT; dest++) {
      if (from.zone === "cascade" && from.index === dest) continue;
      const count = cards.length;
      if (count > maxSupermove(state, dest)) continue;
      if (!canPlaceCascade(cards, state.cascades[dest])) continue;
      moves.push({
        from: { ...from, count },
        to: { zone: "cascade", index: dest },
        kind: "cascade",
      });
    }
    if (cards.length !== 1) return;
    const card = cards[0];
    for (let i = 0; i < FREE_CELL_COUNT; i++) {
      if (from.zone === "freecell" && from.index === i) continue;
      if (state.freecells[i] != null) continue;
      moves.push({
        from: { ...from, count: 1 },
        to: { zone: "freecell", index: i },
        kind: "freecell",
      });
    }
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      if (canPlaceFoundation(card, state.foundations[i])) {
        moves.push({
          from: { ...from, count: 1 },
          to: { zone: "foundation", index: i },
          kind: "foundation",
        });
      }
    }
  };

  for (let col = 0; col < CASCADE_COUNT; col++) {
    const pile = state.cascades[col];
    const seq = sequenceLength(pile);
    for (let count = 1; count <= seq; count++) {
      consider({ zone: "cascade", index: col }, pile.slice(pile.length - count));
    }
  }
  for (let i = 0; i < FREE_CELL_COUNT; i++) {
    const card = state.freecells[i];
    if (card) consider({ zone: "freecell", index: i }, [card]);
  }
  return moves;
}

function foundationCandidates(state, safeOnly) {
  const candidates = [];
  const consider = (card, from) => {
    if (!card) return;
    if (safeOnly && !isSafeFoundationCard(state, card)) return;
    const index = foundationIndexFor(state, card, null);
    if (index < 0) return;
    candidates.push({ card, from, to: { zone: "foundation", index } });
  };
  for (let i = 0; i < CASCADE_COUNT; i++) {
    consider(top(state.cascades[i]), { zone: "cascade", index: i, count: 1 });
  }
  for (let i = 0; i < FREE_CELL_COUNT; i++) {
    consider(state.freecells[i], { zone: "freecell", index: i, count: 1 });
  }
  return candidates;
}

/** Move exactly one exposed cascade or free-cell card onto its foundation. */
export function foundationStep(state, options = {}) {
  if (!state) return { ok: false, reason: "missing state", state };
  const safeOnly = options.safeOnly === true;
  const candidates = foundationCandidates(state, safeOnly);
  if (!safeOnly) candidates.sort((a, b) => a.card.rank - b.card.rank);
  const pick = candidates[0];
  if (!pick) return { ok: false, reason: "nothing to move", state };
  const moved = moveCards(state, pick.from, pick.to);
  if (!moved.ok) return { ok: false, reason: moved.reason, state };
  return { ok: true, state: moved.state };
}

/** True when foundation moves alone, lowest rank first, put every card home. */
export function isTriviallySolvable(state) {
  if (!state) return false;
  if (isWon(state)) return true;
  let current = cloneState(state);
  for (let guard = 0; guard < 52; guard++) {
    if (isWon(current)) return true;
    const step = foundationStep(current, { safeOnly: false });
    if (!step.ok) return false;
    current = step.state;
  }
  return isWon(current);
}

export function autoPlaySafe(state) {
  if (!state) return { ok: false, reason: "missing state", state };
  if (state.won) return { ok: true, state, moved: 0 };
  let current = state;
  let moved = 0;
  for (let guard = 0; guard < 52; guard++) {
    const step = foundationStep(current, { safeOnly: true });
    if (!step.ok) break;
    current = step.state;
    moved += 1;
    if (current.won) break;
  }
  if (!current.won && isWon(current)) {
    current = markWin(cloneState(current));
  }
  return { ok: true, state: current, moved };
}

export function userMove(state, from, to) {
  const result = moveCards(state, from, to);
  if (!result.ok) return result;
  const auto = autoPlaySafe(result.state);
  return { ok: true, state: auto.state, autoMoved: auto.moved };
}
