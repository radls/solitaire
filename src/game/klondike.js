import { buildDeck, mulberry32, oppositeColor, shuffle } from "./cards.js";
import { elapsed, startClock, transferClock } from "./clock.js";

export const TABLEAU_COUNT = 7;
export const FOUNDATION_COUNT = 4;

export function emptyState(overrides = {}) {
  return {
    seed: 0,
    drawCount: 1,
    tableau: Array.from({ length: TABLEAU_COUNT }, () => []),
    foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),
    stock: [],
    waste: [],
    moves: 0,
    score: 0,
    won: false,
    startedAt: 0,
    pausedAt: 0,
    wonAt: null,
    recycled: 0,
    ...overrides,
  };
}

export function deal({ seed, drawCount = 1 } = {}) {
  const resolvedSeed = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  const rng = mulberry32(resolvedSeed);
  const deck = shuffle(buildDeck(), rng);
  const tableau = Array.from({ length: TABLEAU_COUNT }, () => []);
  let i = 0;
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[i++] };
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }
  const stock = deck.slice(i).map((card) => ({ ...card, faceUp: false }));
  return emptyState({
    seed: resolvedSeed,
    drawCount: drawCount === 3 ? 3 : 1,
    tableau,
    stock,
  });
}

export function cloneState(state) {
  return structuredClone(state);
}

export function top(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

export function canStackTableau(moving, onto) {
  if (!onto) return moving.rank === 13;
  return oppositeColor(moving.suit, onto.suit) && moving.rank === onto.rank - 1;
}

export function canStackFoundation(moving, onto) {
  if (!onto) return moving.rank === 1;
  return moving.suit === onto.suit && moving.rank === onto.rank + 1;
}

export function isWon(state) {
  return state.foundations.every((pile) => pile.length === 13);
}

export function allTableauFaceUp(state) {
  return state.tableau.every((pile) => pile.every((card) => card.faceUp));
}

export function canAutoComplete(state) {
  return (
    !state.won &&
    !isWon(state) &&
    state.stock.length === 0 &&
    state.waste.length === 0 &&
    allTableauFaceUp(state)
  );
}

export function timedScore(state, now = Date.now()) {
  const penalty = Math.floor(elapsedMs(state, now) / 10000) * 2;
  return Math.max(0, state.score - penalty);
}

export function elapsedMs(state, now = Date.now()) {
  return elapsed(state, now);
}

function flipExposed(state) {
  let flipped = false;
  for (const pile of state.tableau) {
    const card = top(pile);
    if (card && !card.faceUp) {
      card.faceUp = true;
      state.score += 5;
      flipped = true;
    }
  }
  return flipped;
}

function finish(state) {
  if (!state.won && isWon(state)) {
    state.won = true;
    state.wonAt = Date.now();
    state.score += 100;
  }
  return state;
}

function takeFrom(state, from) {
  if (from.zone === "waste") {
    if (!state.waste.length) return { ok: false, reason: "waste is empty" };
    return { ok: true, cards: [state.waste.pop()], origin: { zone: "waste" } };
  }
  if (from.zone === "foundation") {
    const pile = state.foundations[from.index];
    if (!pile?.length) return { ok: false, reason: "foundation is empty" };
    return {
      ok: true,
      cards: [pile.pop()],
      origin: { zone: "foundation", index: from.index },
    };
  }
  if (from.zone === "tableau") {
    const pile = state.tableau[from.index];
    if (!pile) return { ok: false, reason: "no such tableau" };
    const count = from.count ?? 1;
    if (count < 1 || count > pile.length) {
      return { ok: false, reason: "invalid count" };
    }
    const start = pile.length - count;
    const cards = pile.slice(start);
    if (cards.some((card) => !card.faceUp)) {
      return { ok: false, reason: "cannot move face-down cards" };
    }
    pile.length = start;
    return {
      ok: true,
      cards,
      origin: { zone: "tableau", index: from.index, count },
    };
  }
  return { ok: false, reason: "unknown source" };
}

function putOn(state, to, cards) {
  if (to.zone === "tableau") {
    const pile = state.tableau[to.index];
    if (!pile) return { ok: false, reason: "no such tableau" };
    if (!canStackTableau(cards[0], top(pile))) {
      return { ok: false, reason: "tableau does not accept that run" };
    }
    pile.push(...cards);
    return { ok: true };
  }
  if (to.zone === "foundation") {
    if (cards.length !== 1) {
      return { ok: false, reason: "foundations accept one card" };
    }
    let index = to.index;
    if (index == null) {
      index = firstAcceptingFoundation(state, cards[0]);
      if (index < 0) return { ok: false, reason: "no foundation accepts that card" };
    }
    const pile = state.foundations[index];
    if (!pile) return { ok: false, reason: "no such foundation" };
    if (!canStackFoundation(cards[0], top(pile))) {
      return { ok: false, reason: "foundation does not accept that card" };
    }
    pile.push(cards[0]);
    return { ok: true, index };
  }
  return { ok: false, reason: "unknown destination" };
}

function restore(state, origin, cards) {
  if (origin.zone === "waste") state.waste.push(...cards);
  else if (origin.zone === "foundation") state.foundations[origin.index].push(...cards);
  else if (origin.zone === "tableau") state.tableau[origin.index].push(...cards);
}

function samePile(from, to) {
  return from.zone === to.zone && from.index === to.index;
}

function scoreMove(from, to) {
  if (from.zone === "waste" && to.zone === "tableau") return 5;
  if (from.zone === "waste" && to.zone === "foundation") return 10;
  if (from.zone === "tableau" && to.zone === "foundation") return 10;
  if (from.zone === "foundation" && to.zone === "tableau") return -15;
  return 0;
}

export function acceptingFoundations(state, card) {
  const indices = [];
  for (let i = 0; i < FOUNDATION_COUNT; i++) {
    if (canStackFoundation(card, top(state.foundations[i]))) indices.push(i);
  }
  return indices;
}

export function firstAcceptingFoundation(state, card) {
  const indices = acceptingFoundations(state, card);
  return indices.length ? indices[0] : -1;
}

export function draw(state) {
  if (state.won) return { ok: false, reason: "game already won", state };
  const next = cloneState(state);
  if (next.stock.length === 0) {
    if (next.waste.length === 0) {
      return { ok: false, reason: "nothing to draw", state };
    }
    next.stock = next.waste
      .slice()
      .reverse()
      .map((card) => ({ ...card, faceUp: false }));
    next.waste = [];
    next.recycled += 1;
    next.moves += 1;
    startClock(next);
    const penalty = next.drawCount === 3 ? 20 : 100;
    next.score = Math.max(0, next.score - penalty);
    return { ok: true, state: next, recycled: true };
  }
  const n = Math.min(next.drawCount, next.stock.length);
  for (let i = 0; i < n; i++) {
    const card = next.stock.pop();
    card.faceUp = true;
    next.waste.push(card);
  }
  next.moves += 1;
  startClock(next);
  return { ok: true, state: next, recycled: false, drawn: n };
}

export function moveCards(state, from, to) {
  if (state.won) return { ok: false, reason: "game already won", state };
  if (!from || !to) return { ok: false, reason: "missing location", state };
  if (samePile(from, to)) return { ok: false, reason: "same pile", state };

  const next = cloneState(state);
  const taken = takeFrom(next, from);
  if (!taken.ok) return { ok: false, reason: taken.reason, state };

  const placed = putOn(next, to, taken.cards);
  if (!placed.ok) {
    restore(next, taken.origin, taken.cards);
    return { ok: false, reason: placed.reason, state };
  }

  next.score = Math.max(0, next.score + scoreMove(from, to));
  next.moves += 1;
  startClock(next);
  const flipped = flipExposed(next);
  finish(next);
  return {
    ok: true,
    state: next,
    flipped,
    foundationIndex: placed.index,
  };
}

export function autoMove(state, from) {
  const probe = cloneState(state);
  const taken = takeFrom(probe, { ...from, count: from.count ?? 1 });
  if (!taken.ok) return { ok: false, reason: taken.reason, state };
  const card = taken.cards[0];

  if (taken.cards.length === 1) {
    const fi = firstAcceptingFoundation(state, card);
    if (fi >= 0) {
      return moveCards(state, { ...from, count: 1 }, { zone: "foundation", index: fi });
    }
  }

  for (let i = 0; i < TABLEAU_COUNT; i++) {
    if (from.zone === "tableau" && from.index === i) continue;
    if (canStackTableau(taken.cards[0], top(state.tableau[i]))) {
      return moveCards(state, from, { zone: "tableau", index: i });
    }
  }
  return { ok: false, reason: "no auto destination", state };
}

function runStarts(pile) {
  const starts = [];
  for (let i = 0; i < pile.length; i++) {
    if (pile[i].faceUp) starts.push(i);
  }
  return starts;
}

export function listLegalMoves(state) {
  const moves = [];
  if (state.won) return moves;

  const wasteTop = top(state.waste);
  if (wasteTop) {
    const from = { zone: "waste" };
    for (const fi of acceptingFoundations(state, wasteTop)) {
      moves.push({ from, to: { zone: "foundation", index: fi }, kind: "to-foundation" });
    }
    for (let i = 0; i < TABLEAU_COUNT; i++) {
      if (canStackTableau(wasteTop, top(state.tableau[i]))) {
        moves.push({ from, to: { zone: "tableau", index: i }, kind: "waste-to-tableau" });
      }
    }
  }

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const pile = state.tableau[col];
    const card = top(pile);
    if (card?.faceUp) {
      for (const fi of acceptingFoundations(state, card)) {
        moves.push({
          from: { zone: "tableau", index: col, count: 1 },
          to: { zone: "foundation", index: fi },
          kind: "to-foundation",
        });
      }
    }
    for (const start of runStarts(pile)) {
      const count = pile.length - start;
      const moving = pile[start];
      for (let dest = 0; dest < TABLEAU_COUNT; dest++) {
        if (dest === col) continue;
        const onto = top(state.tableau[dest]);
        if (canStackTableau(moving, onto)) {
          const uncovers = start > 0 && !pile[start - 1].faceUp;
          const clears = start === 0;
          moves.push({
            from: { zone: "tableau", index: col, count },
            to: { zone: "tableau", index: dest },
            kind: uncovers ? "uncover" : clears ? "clear-column" : "tableau",
          });
        }
      }
    }
  }

  if (state.stock.length || state.waste.length) {
    moves.push({
      from: { zone: "stock" },
      to: { zone: "waste" },
      kind: "draw",
    });
  }
  return moves;
}

const HINT_RANK = {
  "to-foundation": 0,
  uncover: 1,
  "clear-column": 2,
  "waste-to-tableau": 3,
  tableau: 4,
  draw: 5,
};

function canPlaceCard(state, card) {
  if (!card) return false;
  if (acceptingFoundations(state, card).length > 0) return true;
  for (let i = 0; i < TABLEAU_COUNT; i++) {
    if (canStackTableau(card, top(state.tableau[i]))) return true;
  }
  return false;
}

function isUsefulDraw(state) {
  if (state.stock.length > 0) return true;
  if (state.waste.length <= 1) return false;
  return state.waste.some((card) => canPlaceCard(state, card));
}

/** Tableau transfers that uncover, open a column, or free a foundation card. */
function isUsefulTableauTransfer(state, move) {
  const pile = state.tableau[move.from.index];
  if (!pile) return false;
  const count = move.from.count ?? 1;
  const start = pile.length - count;
  const moving = pile[start];
  if (!moving) return false;
  if (start > 0 && pile[start - 1] && !pile[start - 1].faceUp) return true;
  const onto = top(state.tableau[move.to.index]);
  if (start === 0) return !(moving.rank === 13 && !onto);
  const under = pile[start - 1];
  return !!(under?.faceUp && acceptingFoundations(state, under).length);
}

export function hintMoves(state) {
  return listLegalMoves(state).filter((move) => {
    if (move.kind === "draw") return isUsefulDraw(state);
    if (move.from?.zone === "tableau" && move.to?.zone === "tableau") {
      return isUsefulTableauTransfer(state, move);
    }
    return true;
  });
}

export function hint(state) {
  const moves = hintMoves(state);
  if (!moves.length) return null;
  moves.sort((a, b) => (HINT_RANK[a.kind] ?? 9) - (HINT_RANK[b.kind] ?? 9));
  return moves[0];
}

/** Undo restores a snapshot but keeps the live clock so elapsed time does not jump. */
export function continueClock(current, snapshot) {
  return transferClock(current, cloneState(snapshot));
}

function hasBoardMove(state) {
  if (listLegalMoves(state).some((move) => move.kind !== "draw")) return true;
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    const card = top(state.foundations[fi]);
    if (!card) continue;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      if (canStackTableau(card, top(state.tableau[col]))) return true;
    }
  }
  return false;
}

/**
 * Further draws are allowed. A numeric `redealLimit` caps waste recycles
 * (0 means the stock cannot be rebuilt). The shipped rules leave it unset,
 * so the waste may be turned over without a cap.
 */
function canRedeal(state) {
  if (!state.waste.length) return false;
  if (Number.isInteger(state.redealLimit) && state.recycled >= state.redealLimit) return false;
  return true;
}

function pileKey(pile) {
  return pile.map((card) => card.id).join(".");
}

/**
 * True when the deal is not won and no tableau or foundation move can be
 * reached by drawing, including every waste top a stock/waste cycle can
 * expose under the draw count and any redeal limit. Drawing never changes
 * the tableau, so a card that stays buried under a draw-3 group does not count.
 */
export function isStuck(state) {
  if (!state || state.won || isWon(state)) return false;
  if (hasBoardMove(state)) return false;
  if (!state.stock.length && !canRedeal(state)) return true;

  const seen = new Set();
  let current = cloneState(state);
  for (let guard = 0; guard < 400; guard++) {
    const key = `${pileKey(current.stock)}|${pileKey(current.waste)}`;
    if (seen.has(key)) return true;
    seen.add(key);
    if (!current.stock.length && !canRedeal(current)) return true;
    const drawn = draw(current);
    if (!drawn.ok) return true;
    current = drawn.state;
    if (hasBoardMove(current)) return false;
  }
  return true;
}

export function autoCompleteStep(state) {
  if (state.won) return { ok: false, reason: "game already won", state };
  const wasteTop = top(state.waste);
  if (wasteTop && firstAcceptingFoundation(state, wasteTop) >= 0) {
    return autoMove(state, { zone: "waste" });
  }
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    const card = top(state.tableau[col]);
    if (card?.faceUp && firstAcceptingFoundation(state, card) >= 0) {
      return autoMove(state, { zone: "tableau", index: col, count: 1 });
    }
  }
  return { ok: false, reason: "nothing to auto-complete", state };
}

export function apply(state, action) {
  if (action.type === "draw") return draw(state);
  if (action.type === "move") return moveCards(state, action.from, action.to);
  if (action.type === "auto") return autoMove(state, action.from);
  if (action.type === "autoComplete") return autoCompleteStep(state);
  return { ok: false, reason: "unknown action", state };
}
