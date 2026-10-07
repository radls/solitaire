import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDeck, makeCard } from "../src/game/cards.js";
import {
  apply,
  canPlay,
  cardsLeft,
  deal,
  drawStock,
  isCleared,
  isRoundOver,
  listLegalMoves,
  playColumn,
  score,
} from "../src/game/golf.js";

function C(suit, rank, faceUp = true) {
  return makeCard(suit, rank, faceUp);
}

function blank(overrides = {}) {
  return {
    seed: 1,
    columns: Array.from({ length: 7 }, () => []),
    waste: [C("hearts", 7)],
    stock: [],
    moves: 0,
    startedAt: 0,
    wonAt: null,
    over: false,
    ...overrides,
  };
}

describe("deal", () => {
  it("lays out 7 columns of 5 face-up cards, one waste card, and 16 stock cards", () => {
    const state = deal({ seed: 42, now: 10 });
    expect(state.seed).toBe(42);
    expect(state.startedAt).toBe(10);
    expect(state.moves).toBe(0);
    expect(state.over).toBe(false);
    expect(state.wonAt).toBeNull();
    expect(state.columns).toHaveLength(7);
    expect(state.columns.map((pile) => pile.length)).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(state.columns.every((pile) => pile.every((card) => card.faceUp))).toBe(true);
    expect(state.waste).toHaveLength(1);
    expect(state.waste[0].faceUp).toBe(true);
    expect(state.stock).toHaveLength(16);
    expect(state.stock.every((card) => card.faceUp === false)).toBe(true);

    const ids = [
      ...state.columns.flat().map((card) => card.id),
      ...state.waste.map((card) => card.id),
      ...state.stock.map((card) => card.id),
    ];
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
    expect(new Set(ids)).toEqual(new Set(buildDeck().map((card) => card.id)));
    expect(isCleared(state)).toBe(false);
    expect(isRoundOver(state)).toBe(false);
    expect(score(state)).toBe(35);
    expect(cardsLeft(state)).toBe(35);
  });

  it("is deterministic for a seed and random when none is given", () => {
    const a = deal({ seed: 123456, now: 0 });
    const b = deal({ seed: 123456, now: 99 });
    expect(b.columns).toEqual(a.columns);
    expect(b.waste).toEqual(a.waste);
    expect(b.stock).toEqual(a.stock);
    expect(b.startedAt).toBe(99);

    const zero = deal({ seed: 0, now: 1 });
    expect(zero.seed).toBe(0);
    expect(zero.waste).toHaveLength(1);
    expect(zero.stock).toHaveLength(16);

    const random = deal({ now: 2 });
    expect(Number.isInteger(random.seed)).toBe(true);
    expect(random.seed).toBeGreaterThanOrEqual(0);
    expect(random.columns.flat()).toHaveLength(35);
  });
});

describe("canPlay", () => {
  const card = (rank, suit = "spades") => C(suit, rank);
  const waste = (rank, suit = "hearts") => C(suit, rank);

  it("allows one rank either way, ignores suit, and does not wrap around a king", () => {
    expect(canPlay(card(5), waste(4))).toBe(true);
    expect(canPlay(card(5), waste(6))).toBe(true);
    expect(canPlay(card(5), waste(5))).toBe(false);
    expect(canPlay(card(5), waste(3))).toBe(false);
    expect(canPlay(card(5), waste(7))).toBe(false);
    expect(canPlay(card(5, "clubs"), waste(4, "clubs"))).toBe(true);
    expect(canPlay(card(5, "diamonds"), waste(6, "spades"))).toBe(true);
    expect(canPlay(card(11), waste(10))).toBe(true);
    expect(canPlay(card(12), waste(11))).toBe(true);

    for (let rank = 1; rank <= 13; rank++) {
      expect(canPlay(card(rank), waste(13))).toBe(false);
    }
    expect(canPlay(card(2), waste(1))).toBe(true);
    for (const rank of [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(canPlay(card(rank), waste(1))).toBe(false);
    }
    expect(canPlay(card(13), waste(12))).toBe(true);
    expect(canPlay(card(12), waste(13))).toBe(false);
    expect(canPlay(card(1), waste(13))).toBe(false);
    expect(canPlay(card(13), waste(1))).toBe(false);
    expect(canPlay(null, waste(5))).toBe(false);
    expect(canPlay(card(5), null)).toBe(false);
  });
});

describe("play and draw", () => {
  it("plays only the exposed card of a column", () => {
    const state = blank();
    state.waste = [C("hearts", 6)];
    state.columns[0] = [C("spades", 6), C("clubs", 5)];
    state.columns[1] = [C("diamonds", 6), C("spades", 13)];
    state.stock = [C("hearts", 9, false)];

    const buried = playColumn(state, 1);
    expect(buried.ok).toBe(false);
    expect(buried.reason).toBe("not one above or below");
    expect(state.columns[1].map((card) => card.id)).toEqual(["diamonds-6", "spades-13"]);

    const played = playColumn(state, 0);
    expect(played.ok).toBe(true);
    expect(played.state.columns[0].map((card) => card.id)).toEqual(["spades-6"]);
    expect(played.state.waste.map((card) => card.id)).toEqual(["hearts-6", "clubs-5"]);
    expect(played.state.waste.at(-1).faceUp).toBe(true);
    expect(played.state.moves).toBe(1);
    expect(played.state.over).toBe(false);
    expect(state.columns[0]).toHaveLength(2);
    expect(state.moves).toBe(0);
  });

  it("moves the top stock card face up onto the waste and does not recycle", () => {
    const state = blank();
    state.columns[0] = [C("spades", 13)];
    state.stock = [C("clubs", 2, false), C("diamonds", 8, false)];
    state.waste = [C("hearts", 4)];
    const first = drawStock(state);
    expect(first.ok).toBe(true);
    expect(first.state.over).toBe(false);
    expect(first.state.stock.map((card) => card.id)).toEqual(["clubs-2"]);
    expect(first.state.waste.map((card) => card.id)).toEqual(["hearts-4", "diamonds-8"]);
    expect(first.state.waste.at(-1).faceUp).toBe(true);
    expect(first.state.moves).toBe(1);
    expect(state.stock).toHaveLength(2);
    expect(state.waste).toHaveLength(1);

    const emptyState = blank();
    emptyState.columns[0] = [C("spades", 3)];
    emptyState.waste = [C("hearts", 4)];
    emptyState.stock = [];
    const empty = drawStock(emptyState);
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe("stock is empty");
    expect(emptyState.waste).toHaveLength(1);
    expect(emptyState.stock).toHaveLength(0);
    expect(isRoundOver(emptyState)).toBe(false);
  });

  it("lists a play for each playable column and a draw while the stock has cards", () => {
    const state = blank();
    state.waste = [C("hearts", 6)];
    state.columns[0] = [C("spades", 6), C("clubs", 5)];
    state.columns[1] = [C("diamonds", 8), C("spades", 13)];
    state.columns[3] = [C("clubs", 7)];
    state.stock = [C("hearts", 9, false)];
    expect(listLegalMoves(state)).toEqual([
      { type: "play", col: 0 },
      { type: "play", col: 3 },
      { type: "draw" },
    ]);
  });
});

describe("round over and score", () => {
  it("ends cleared rounds with a stock bonus and blocks further draws", () => {
    const state = blank();
    state.waste = [C("hearts", 5)];
    state.columns[2] = [C("spades", 4)];
    state.stock = [C("clubs", 9, false), C("diamonds", 8, false), C("spades", 1, false)];
    expect(isCleared(state)).toBe(false);
    expect(score(state)).toBe(1);

    const cleared = apply(state, { type: "play", col: 2 });
    expect(cleared.ok).toBe(true);
    expect(isCleared(cleared.state)).toBe(true);
    expect(isRoundOver(cleared.state)).toBe(true);
    expect(cleared.state.over).toBe(true);
    expect(typeof cleared.state.wonAt).toBe("number");
    expect(score(cleared.state)).toBe(-3);
    expect(cardsLeft(cleared.state)).toBe(0);
    expect(listLegalMoves(cleared.state)).toEqual([]);
    expect(state.over).toBe(false);
    expect(state.wonAt).toBeNull();

    const later = apply(cleared.state, { type: "draw" });
    expect(later.ok).toBe(false);
    expect(later.reason).toBe("round is over");
    expect(cleared.state.stock).toHaveLength(3);
  });

  it("ends a stuck round when the stock is empty and nothing plays", () => {
    const state = blank();
    state.waste = [C("hearts", 5)];
    state.columns[0] = [C("clubs", 1)];
    state.columns[4] = [C("spades", 9), C("diamonds", 13)];
    state.stock = [C("hearts", 9, false)];
    expect(isRoundOver(state)).toBe(false);
    expect(listLegalMoves(state)).toEqual([{ type: "draw" }]);

    const stuck = apply(state, { type: "draw" });
    expect(stuck.ok).toBe(true);
    expect(stuck.state.stock).toHaveLength(0);
    expect(stuck.state.waste.at(-1).id).toBe("hearts-9");
    expect(isCleared(stuck.state)).toBe(false);
    expect(isRoundOver(stuck.state)).toBe(true);
    expect(stuck.state.over).toBe(true);
    expect(stuck.state.wonAt).toBeNull();
    expect(score(stuck.state)).toBe(3);
    expect(listLegalMoves(stuck.state)).toEqual([]);

    const again = playColumn(stuck.state, 0);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("round is over");
  });

  it("stays open when the last stock card creates a play", () => {
    const state = blank();
    state.waste = [C("hearts", 9)];
    state.columns[0] = [C("spades", 3)];
    state.stock = [C("clubs", 2, false)];
    const drawn = drawStock(state);
    expect(drawn.state.over).toBe(false);
    expect(isRoundOver(drawn.state)).toBe(false);
    expect(score(drawn.state)).toBe(1);
    expect(listLegalMoves(drawn.state)).toEqual([{ type: "play", col: 0 }]);
  });

  it("scores cards left in the columns until the course is clear", () => {
    const midway = blank();
    midway.columns[0] = [C("spades", 2), C("hearts", 3)];
    midway.columns[1] = [C("clubs", 8)];
    midway.stock = [C("diamonds", 4, false), C("spades", 5, false)];
    midway.waste = [C("hearts", 9), C("clubs", 10)];
    expect(isCleared(midway)).toBe(false);
    expect(score(midway)).toBe(3);

    const clear = blank({
      columns: Array.from({ length: 7 }, () => []),
      stock: [C("spades", 1, false)],
      waste: [C("hearts", 12)],
    });
    expect(isCleared(clear)).toBe(true);
    expect(isRoundOver(clear)).toBe(true);
    expect(score(clear)).toBe(-1);
  });
});

describe("purity", () => {
  it("does not mutate the state passed in", () => {
    const state = blank();
    state.waste = [C("hearts", 6)];
    state.columns[0] = [C("spades", 2), C("clubs", 5)];
    state.columns[1] = [C("diamonds", 13)];
    state.stock = [C("hearts", 9, false), C("spades", 8, false)];
    const snapshot = structuredClone(state);

    const illegal = playColumn(state, 1);
    expect(illegal.ok).toBe(false);
    expect(illegal.state).toBe(state);

    const played = playColumn(state, 0);
    expect(played.ok).toBe(true);
    expect(played.state).not.toBe(state);

    const drawn = drawStock(state);
    expect(drawn.ok).toBe(true);
    expect(drawn.state).not.toBe(state);
    expect(apply(state, { type: "nope" }).state).toBe(state);
    listLegalMoves(state);
    expect(state).toEqual(snapshot);
  });

  it("does not touch the DOM or storage", () => {
    const src = fs.readFileSync(new URL("../src/game/golf.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/document|window|localStorage|HTMLElement/);
  });
});
