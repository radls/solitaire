import { describe, expect, it } from "vitest";
import { makeCard } from "../src/game/cards.js";
import {
  autoCompleteStep,
  autoMove,
  canAutoComplete,
  canStackFoundation,
  canStackTableau,
  deal,
  draw,
  emptyState,
  hint,
  isWon,
  listLegalMoves,
  moveCards,
  timedScore,
  top,
} from "../src/game/klondike.js";

function C(suit, rank, faceUp = true) {
  return makeCard(suit, rank, faceUp);
}

function game(partial = {}) {
  return emptyState({ startedAt: 1_000_000, ...partial });
}

describe("deal", () => {
  it("deals Klondike layout for any seed", () => {
    for (const seed of [1, 7, 99, 123456]) {
      const state = deal({ seed, now: 0 });
      expect(state.tableau).toHaveLength(7);
      expect(state.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      for (const [i, pile] of state.tableau.entries()) {
        expect(pile.filter((c) => c.faceUp)).toHaveLength(1);
        expect(top(pile).faceUp).toBe(true);
        expect(pile.slice(0, i).every((c) => !c.faceUp)).toBe(true);
      }
      expect(state.stock).toHaveLength(24);
      expect(state.stock.every((c) => !c.faceUp)).toBe(true);
      expect(state.waste).toHaveLength(0);
      expect(state.foundations.every((p) => p.length === 0)).toBe(true);
      const ids = [
        ...state.tableau.flat(),
        ...state.stock,
      ].map((c) => c.id);
      expect(ids).toHaveLength(52);
      expect(new Set(ids).size).toBe(52);
    }
  });

  it("is reproducible for a given seed", () => {
    const a = deal({ seed: 2026, now: 0 });
    const b = deal({ seed: 2026, now: 0 });
    expect(a.tableau.map((p) => p.map((c) => c.id))).toEqual(
      b.tableau.map((p) => p.map((c) => c.id)),
    );
    expect(a.stock.map((c) => c.id)).toEqual(b.stock.map((c) => c.id));
  });
});

describe("stacking rules", () => {
  it("allows a king on an empty tableau and alternating descending colors", () => {
    expect(canStackTableau(C("spades", 13), null)).toBe(true);
    expect(canStackTableau(C("hearts", 12), null)).toBe(false);
    expect(canStackTableau(C("hearts", 12), C("spades", 13))).toBe(true);
    expect(canStackTableau(C("clubs", 12), C("spades", 13))).toBe(false);
    expect(canStackTableau(C("hearts", 11), C("spades", 13))).toBe(false);
  });

  it("builds foundations ace-up by suit", () => {
    expect(canStackFoundation(C("hearts", 1), null)).toBe(true);
    expect(canStackFoundation(C("hearts", 2), null)).toBe(false);
    expect(canStackFoundation(C("hearts", 2), C("hearts", 1))).toBe(true);
    expect(canStackFoundation(C("spades", 2), C("hearts", 1))).toBe(false);
    expect(canStackFoundation(C("hearts", 3), C("hearts", 1))).toBe(false);
  });
});

describe("moves", () => {
  it("plays waste onto a matching tableau card", () => {
    const state = game({
      waste: [C("hearts", 12)],
      tableau: [[C("spades", 13)], [], [], [], [], [], []],
    });
    const result = moveCards(
      state,
      { zone: "waste" },
      { zone: "tableau", index: 0 },
    );
    expect(result.ok).toBe(true);
    expect(result.state.waste).toHaveLength(0);
    expect(result.state.tableau[0].map((c) => c.id)).toEqual(["spades-13", "hearts-12"]);
    expect(result.state.score).toBe(5);
    expect(result.state.moves).toBe(1);
  });

  it("rejects a same-color tableau drop", () => {
    const state = game({
      waste: [C("clubs", 12)],
      tableau: [[C("spades", 13)], [], [], [], [], [], []],
    });
    const result = moveCards(
      state,
      { zone: "waste" },
      { zone: "tableau", index: 0 },
    );
    expect(result.ok).toBe(false);
    expect(state.waste).toHaveLength(1);
  });

  it("moves a face-up run between tableau columns", () => {
    const state = game({
      tableau: [
        [C("clubs", 6, false), C("hearts", 5), C("spades", 4)],
        [C("clubs", 6)],
        [],
        [],
        [],
        [],
        [],
      ],
    });
    const result = moveCards(
      state,
      { zone: "tableau", index: 0, count: 2 },
      { zone: "tableau", index: 1 },
    );
    expect(result.ok).toBe(true);
    expect(result.state.tableau[0]).toHaveLength(1);
    expect(result.state.tableau[0][0].faceUp).toBe(true);
    expect(result.flipped).toBe(true);
    expect(result.state.score).toBe(5);
    expect(result.state.tableau[1].map((c) => c.id)).toEqual([
      "clubs-6",
      "hearts-5",
      "spades-4",
    ]);
  });

  it("refuses to move face-down cards", () => {
    const state = game({
      tableau: [
        [C("clubs", 13, false), C("hearts", 12)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    });
    const result = moveCards(
      state,
      { zone: "tableau", index: 0, count: 2 },
      { zone: "tableau", index: 1 },
    );
    expect(result.ok).toBe(false);
  });

  it("only places kings on empty tableau columns", () => {
    const state = game({
      waste: [C("hearts", 12)],
      tableau: [[], [], [], [], [], [], []],
    });
    expect(
      moveCards(state, { zone: "waste" }, { zone: "tableau", index: 3 }).ok,
    ).toBe(false);

    const kingState = game({
      waste: [C("hearts", 13)],
      tableau: [[], [], [], [], [], [], []],
    });
    const moved = moveCards(kingState, { zone: "waste" }, { zone: "tableau", index: 3 });
    expect(moved.ok).toBe(true);
    expect(moved.state.tableau[3][0].id).toBe("hearts-13");
  });

  it("sends an ace from waste to a foundation and scores 10", () => {
    const state = game({ waste: [C("diamonds", 1)] });
    const result = moveCards(
      state,
      { zone: "waste" },
      { zone: "foundation", index: 0 },
    );
    expect(result.ok).toBe(true);
    expect(result.state.foundations[0][0].id).toBe("diamonds-1");
    expect(result.state.score).toBe(10);
  });

  it("auto-picks a foundation when index is omitted", () => {
    const state = game({
      waste: [C("spades", 2)],
      foundations: [[C("spades", 1)], [], [], []],
    });
    const result = moveCards(state, { zone: "waste" }, { zone: "foundation" });
    expect(result.ok).toBe(true);
    expect(result.state.foundations[0].map((c) => c.rank)).toEqual([1, 2]);
  });

  it("allows moving a foundation card back to the tableau at a score cost", () => {
    const state = game({
      foundations: [[C("hearts", 1), C("hearts", 2)], [], [], []],
      tableau: [[C("spades", 3)], [], [], [], [], [], []],
    });
    const result = moveCards(
      state,
      { zone: "foundation", index: 0 },
      { zone: "tableau", index: 0 },
    );
    expect(result.ok).toBe(true);
    expect(result.state.foundations[0]).toHaveLength(1);
    expect(result.state.score).toBe(0);
  });

  it("does not mutate the original state on a failed move", () => {
    const state = game({
      waste: [C("hearts", 5)],
      tableau: [[C("hearts", 6)], [], [], [], [], [], []],
    });
    const snapshot = structuredClone(state);
    const result = moveCards(state, { zone: "waste" }, { zone: "tableau", index: 0 });
    expect(result.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });
});

describe("stock and waste", () => {
  it("draws one card when drawCount is 1", () => {
    const state = game({
      drawCount: 1,
      stock: [C("spades", 3, false), C("hearts", 4, false)],
    });
    const result = draw(state);
    expect(result.ok).toBe(true);
    expect(result.state.stock).toHaveLength(1);
    expect(result.state.waste).toHaveLength(1);
    expect(result.state.waste[0].id).toBe("hearts-4");
    expect(result.state.waste[0].faceUp).toBe(true);
    expect(state.stock).toHaveLength(2);
  });

  it("draws three, or fewer when the stock is short", () => {
    const three = draw(
      game({
        drawCount: 3,
        stock: [C("clubs", 1, false), C("clubs", 2, false), C("clubs", 3, false)],
      }),
    );
    expect(three.state.waste.map((c) => c.id)).toEqual(["clubs-3", "clubs-2", "clubs-1"]);
    expect(three.state.stock).toHaveLength(0);

    const short = draw(
      game({
        drawCount: 3,
        stock: [C("hearts", 9, false)],
      }),
    );
    expect(short.state.waste).toHaveLength(1);
  });

  it("recycles waste onto stock when stock is empty", () => {
    const state = game({
      drawCount: 1,
      waste: [C("hearts", 1, true), C("hearts", 2, true)],
    });
    const result = draw(state);
    expect(result.ok).toBe(true);
    expect(result.recycled).toBe(true);
    expect(result.state.waste).toHaveLength(0);
    expect(result.state.stock.map((c) => c.id)).toEqual(["hearts-2", "hearts-1"]);
    expect(result.state.stock.every((c) => !c.faceUp)).toBe(true);
    expect(result.state.score).toBe(0);
    expect(result.state.recycled).toBe(1);
  });

  it("applies the draw-3 recycle penalty", () => {
    const result = draw(
      game({
        drawCount: 3,
        score: 50,
        waste: [C("spades", 5, true)],
      }),
    );
    expect(result.state.score).toBe(30);
  });

  it("refuses to draw when both stock and waste are empty", () => {
    expect(draw(game()).ok).toBe(false);
  });
});

describe("auto-move, hints, win", () => {
  it("auto-moves an ace to a foundation before looking at tableau", () => {
    const state = game({
      waste: [C("clubs", 1)],
      tableau: [[C("diamonds", 2)], [], [], [], [], [], []],
    });
    const result = autoMove(state, { zone: "waste" });
    expect(result.ok).toBe(true);
    expect(result.state.foundations[0][0].id).toBe("clubs-1");
  });

  it("lists uncovering moves and prefers them over a plain draw in hints", () => {
    const state = game({
      tableau: [
        [C("clubs", 13, false), C("hearts", 5)],
        [C("spades", 6)],
        [],
        [],
        [],
        [],
        [],
      ],
    });
    const moves = listLegalMoves(state);
    expect(moves.some((m) => m.kind === "uncover")).toBe(true);
    const h = hint(state);
    expect(h.kind).toBe("uncover");
    expect(h.from.index).toBe(0);
    expect(h.to.index).toBe(1);
  });

  it("does not hint moving a lone king between empty columns", () => {
    const state = game({
      tableau: [[C("spades", 13)], [], [], [], [], [], []],
    });
    const kingMoves = listLegalMoves(state).filter(
      (m) => m.from.zone === "tableau" && m.to.zone === "tableau",
    );
    expect(kingMoves).toHaveLength(0);
  });

  it("detects a win when all foundations have 13 cards", () => {
    const foundations = ["spades", "hearts", "diamonds", "clubs"].map((suit) =>
      Array.from({ length: 13 }, (_, i) => C(suit, i + 1)),
    );
    const state = game({ foundations });
    expect(isWon(state)).toBe(true);
    expect(canAutoComplete(state)).toBe(false);
  });

  it("refuses auto-complete while a card remains on the waste", () => {
    const ready = game({
      stock: [],
      waste: [],
      tableau: [
        [C("spades", 13)],
        [C("hearts", 12)],
        [C("diamonds", 11)],
        [C("clubs", 10)],
        [],
        [],
        [],
      ],
    });
    expect(canAutoComplete(ready)).toBe(true);
    expect(canAutoComplete(game({ ...ready, waste: [C("hearts", 5)] }))).toBe(false);
  });

  it("auto-completes the next foundation card and marks a win", () => {
    const foundations = ["spades", "hearts", "diamonds", "clubs"].map((suit) =>
      Array.from({ length: 12 }, (_, i) => C(suit, i + 1)),
    );
    const state = game({
      foundations,
      tableau: [
        [C("spades", 13)],
        [C("hearts", 13)],
        [C("diamonds", 13)],
        [C("clubs", 13)],
        [],
        [],
        [],
      ],
    });
    expect(canAutoComplete(state)).toBe(true);
    let current = state;
    for (let i = 0; i < 4; i++) {
      const step = autoCompleteStep(current);
      expect(step.ok).toBe(true);
      current = step.state;
    }
    expect(current.won).toBe(true);
    expect(current.foundations.every((p) => p.length === 13)).toBe(true);
    expect(current.score).toBeGreaterThanOrEqual(140);
  });

  it("subtracts a time penalty from the displayed score", () => {
    const state = game({ score: 20, startedAt: 0 });
    expect(timedScore(state, 25_000)).toBe(16);
  });
});
