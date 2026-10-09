import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDeck, makeCard, mulberry32, shuffle } from "../src/game/cards.js";
import {
  apply,
  canBuild,
  cardsInCorners,
  cloneState,
  continueClock,
  deal,
  drawStock,
  isWon,
  listLegalMoves,
  moveCards,
} from "../src/game/kings.js";

function C(suit, rank, faceUp = true) {
  return makeCard(suit, rank, faceUp);
}

function blank(overrides = {}) {
  return {
    seed: 1,
    sides: [[], [], [], []],
    corners: [[], [], [], []],
    stock: [],
    waste: [],
    moves: 0,
    startedAt: 0,
    wonAt: null,
    won: false,
    stuck: false,
    idlePasses: 0,
    ...overrides,
  };
}

function referenceDeal(seed) {
  const deck = shuffle(buildDeck(), mulberry32(seed >>> 0));
  const sides = [[], [], [], []];
  const corners = [[], [], [], []];
  let i = 0;
  for (let s = 0; s < 4; s++) {
    for (;;) {
      const card = { ...deck[i], faceUp: true };
      i += 1;
      if (card.rank === 13) {
        corners[corners.findIndex((pile) => pile.length === 0)].push(card);
        continue;
      }
      sides[s].push(card);
      break;
    }
  }
  const stock = deck.slice(i).map((card) => ({ ...card, faceUp: false }));
  return { sides, corners, stock };
}

describe("deal", () => {
  it("gives each side one face-up non-king, sends dealt kings to corners, and keeps 52 unique cards", () => {
    let sawKing = false;
    for (let seed = 0; seed < 40; seed++) {
      const state = deal({ seed, now: 10 });
      expect(state.seed).toBe(seed);
      expect(state.startedAt).toBe(10);
      expect(state.moves).toBe(0);
      expect(state.won).toBe(false);
      expect(state.wonAt).toBeNull();
      expect(state.stuck).toBe(false);
      expect(state.idlePasses).toBe(0);
      expect(state.waste).toEqual([]);
      expect(state.sides).toHaveLength(4);
      expect(state.corners).toHaveLength(4);
      expect(state.sides.every((pile) => pile.length === 1 && pile[0].faceUp && pile[0].rank !== 13)).toBe(true);
      expect(state.corners.every((pile) => pile.every((card) => card.faceUp && card.rank === 13))).toBe(true);
      expect(state.stock.every((card) => card.faceUp === false)).toBe(true);
      if (state.corners.some((pile) => pile.length > 0)) sawKing = true;

      const ids = [
        ...state.sides.flat().map((card) => card.id),
        ...state.corners.flat().map((card) => card.id),
        ...state.stock.map((card) => card.id),
      ];
      expect(ids).toHaveLength(52);
      expect(new Set(ids).size).toBe(52);
      expect(new Set(ids)).toEqual(new Set(buildDeck().map((card) => card.id)));
      expect(isWon(state)).toBe(false);

      const expected = referenceDeal(seed);
      expect(state.sides).toEqual(expected.sides);
      expect(state.corners).toEqual(expected.corners);
      expect(state.stock).toEqual(expected.stock);
    }
    expect(sawKing).toBe(true);
  });

  it("is deterministic for a seed and random when none is given", () => {
    const a = deal({ seed: 123456, now: 0 });
    const b = deal({ seed: 123456, now: 99 });
    expect(b.sides).toEqual(a.sides);
    expect(b.corners).toEqual(a.corners);
    expect(b.stock).toEqual(a.stock);
    expect(b.waste).toEqual(a.waste);
    expect(b.startedAt).toBe(99);

    const zero = deal({ seed: 0, now: 1 });
    expect(zero.seed).toBe(0);
    expect(zero.sides.flat()).toHaveLength(4);

    const random = deal({ now: 2 });
    expect(Number.isInteger(random.seed)).toBe(true);
    expect(random.seed).toBeGreaterThanOrEqual(0);
    expect(random.sides.flat().length + random.corners.flat().length + random.stock.length).toBe(52);
  });
});

describe("canBuild", () => {
  const card = (rank, suit = "spades") => C(suit, rank);

  it("builds down one rank in the other color, kings only on an empty corner, any card on an empty side", () => {
    expect(canBuild(card(12, "hearts"), card(13, "spades"))).toBe(true);
    expect(canBuild(card(12, "hearts"), card(13, "clubs"))).toBe(true);
    expect(canBuild(card(12, "diamonds"), card(13, "hearts"))).toBe(false);
    expect(canBuild(card(12, "spades"), card(13, "clubs"))).toBe(false);
    expect(canBuild(card(11, "hearts"), card(13, "spades"))).toBe(false);
    expect(canBuild(card(13, "hearts"), card(12, "spades"))).toBe(false);
    expect(canBuild(card(1, "spades"), card(2, "hearts"))).toBe(true);
    expect(canBuild(card(1, "hearts"), card(2, "diamonds"))).toBe(false);
    expect(canBuild(card(1, "hearts"), card(13, "spades"))).toBe(false);
    expect(canBuild(card(13, "hearts"), card(1, "spades"))).toBe(false);
    expect(canBuild(card(13), { zone: "corner" })).toBe(true);
    expect(canBuild(card(12), { zone: "corner" })).toBe(false);
    expect(canBuild(card(1), { zone: "corner" })).toBe(false);
    expect(canBuild(card(1, "hearts"), { zone: "side" })).toBe(true);
    expect(canBuild(card(13, "diamonds"), { zone: "side" })).toBe(true);
    expect(canBuild(card(5), { zone: "side" })).toBe(true);
    expect(canBuild(null, card(5))).toBe(false);
    expect(canBuild(card(5), null)).toBe(false);
  });
});

describe("moves", () => {
  it("moves the waste onto a side or a corner, and a side top onto a corner", () => {
    const state = blank({
      waste: [C("clubs", 9), C("hearts", 12)],
      sides: [[C("spades", 6)], [], [C("clubs", 4)], [C("diamonds", 8)]],
      corners: [[C("spades", 13)], [], [], []],
    });

    const toSide = moveCards(state, { zone: "waste" }, { zone: "side", index: 0 });
    expect(toSide.ok).toBe(false);
    expect(toSide.state).toBe(state);

    const queenToKing = moveCards(state, { zone: "waste" }, { zone: "corner", index: 0 });
    expect(queenToKing.ok).toBe(true);
    expect(queenToKing.state.waste.map((card) => card.id)).toEqual(["clubs-9"]);
    expect(queenToKing.state.corners[0].map((card) => card.id)).toEqual(["spades-13", "hearts-12"]);
    expect(queenToKing.state.moves).toBe(1);
    expect(queenToKing.state.idlePasses).toBe(0);
    expect(state.waste).toHaveLength(2);

    const sideTop = moveCards(
      blank({
        sides: [[C("diamonds", 8), C("spades", 12)], [], [], []],
        corners: [[C("hearts", 13)], [], [], []],
      }),
      { zone: "side", index: 0, count: 1 },
      { zone: "corner", index: 0 },
    );
    expect(sideTop.ok).toBe(true);
    expect(sideTop.state.sides[0].map((card) => card.id)).toEqual(["diamonds-8"]);
    expect(sideTop.state.corners[0].map((card) => card.id)).toEqual(["hearts-13", "spades-12"]);

    const wasteToSide = moveCards(
      blank({
        waste: [C("spades", 5)],
        sides: [[], [C("hearts", 6)], [], []],
      }),
      { zone: "waste" },
      { zone: "side", index: 1 },
    );
    expect(wasteToSide.ok).toBe(true);
    expect(wasteToSide.state.waste).toEqual([]);
    expect(wasteToSide.state.sides[1].map((card) => card.id)).toEqual(["hearts-6", "spades-5"]);

    const anywhere = moveCards(
      blank({ waste: [C("clubs", 3)], sides: [[], [], [], []] }),
      { zone: "waste" },
      { zone: "side", index: 2 },
    );
    expect(anywhere.ok).toBe(true);
    expect(anywhere.state.sides[2].map((card) => card.id)).toEqual(["clubs-3"]);

    const notCorner = moveCards(
      blank({ waste: [C("clubs", 3)] }),
      { zone: "waste" },
      { zone: "corner", index: 1 },
    );
    expect(notCorner.ok).toBe(false);
    expect(notCorner.reason).toBe("that card does not fit");

    const king = moveCards(
      blank({ waste: [C("diamonds", 13)] }),
      { zone: "waste" },
      { zone: "corner", index: 2 },
    );
    expect(king.ok).toBe(true);
    expect(king.state.corners[2].map((card) => card.id)).toEqual(["diamonds-13"]);
  });

  it("moves a whole side pile only when the bottom card fits, and rejects a partial run", () => {
    const pile = [C("hearts", 10), C("spades", 9)];
    const legal = blank({
      sides: [pile, [], [], []],
      corners: [[C("clubs", 11)], [], [], []],
    });
    const whole = moveCards(legal, { zone: "side", index: 0, count: 2 }, { zone: "corner", index: 0 });
    expect(whole.ok).toBe(true);
    expect(whole.state.sides[0]).toEqual([]);
    expect(whole.state.corners[0].map((card) => card.id)).toEqual(["clubs-11", "hearts-10", "spades-9"]);

    const topWouldFit = blank({
      sides: [[C("spades", 10), C("hearts", 9)], [], [], []],
      corners: [[C("clubs", 10)], [], [], []],
    });
    const blocked = moveCards(topWouldFit, { zone: "side", index: 0, count: 2 }, { zone: "corner", index: 0 });
    expect(blocked.ok).toBe(false);
    expect(blocked.state).toBe(topWouldFit);
    const onlyTop = moveCards(topWouldFit, { zone: "side", index: 0, count: 1 }, { zone: "corner", index: 0 });
    expect(onlyTop.ok).toBe(true);
    expect(onlyTop.state.sides[0].map((card) => card.id)).toEqual(["spades-10"]);

    const partial = moveCards(
      blank({ sides: [[C("hearts", 10), C("spades", 9), C("diamonds", 8), C("clubs", 7)], [C("spades", 11)], [], []] }),
      { zone: "side", index: 0, count: 2 },
      { zone: "side", index: 1 },
    );
    expect(partial.ok).toBe(false);
    expect(partial.reason).toBe("partial runs cannot move");

    const led = [C("spades", 13), C("hearts", 12), C("clubs", 11)];
    const toEmptyCorner = moveCards(
      blank({ sides: [led, [], [], []] }),
      { zone: "side", index: 0, count: 3 },
      { zone: "corner", index: 3 },
    );
    expect(toEmptyCorner.ok).toBe(true);
    expect(toEmptyCorner.state.corners[3].map((card) => card.id)).toEqual(["spades-13", "hearts-12", "clubs-11"]);

    const queenLed = moveCards(
      blank({ sides: [[C("hearts", 12), C("clubs", 11)], [], [], []] }),
      { zone: "side", index: 0, count: 2 },
      { zone: "corner", index: 0 },
    );
    expect(queenLed.ok).toBe(false);

    const ontoSide = moveCards(
      blank({
        sides: [
          [C("hearts", 10), C("spades", 9)],
          [C("clubs", 11)],
          [],
          [],
        ],
      }),
      { zone: "side", index: 0, count: 2 },
      { zone: "side", index: 1 },
    );
    expect(ontoSide.ok).toBe(true);
    expect(ontoSide.state.sides[1].map((card) => card.id)).toEqual(["clubs-11", "hearts-10", "spades-9"]);

    const ontoEmptySide = moveCards(
      blank({ sides: [[C("hearts", 4), C("spades", 3)], [], [], []] }),
      { zone: "side", index: 0, count: 2 },
      { zone: "side", index: 3 },
    );
    expect(ontoEmptySide.ok).toBe(true);
    expect(ontoEmptySide.state.sides[3]).toHaveLength(2);

    const self = moveCards(
      blank({ sides: [[C("hearts", 4), C("spades", 3)], [], [], []] }),
      { zone: "side", index: 0, count: 2 },
      { zone: "side", index: 0 },
    );
    expect(self.ok).toBe(false);
    expect(self.reason).toBe("same pile");
  });

  it("does not let a corner card move out", () => {
    const state = blank({
      corners: [[C("spades", 13), C("hearts", 12)], [], [], []],
      sides: [[C("clubs", 13)], [], [], []],
    });
    const out = moveCards(state, { zone: "corner", index: 0 }, { zone: "side", index: 1 });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("cards cannot leave a corner");
    expect(out.state).toBe(state);
    expect(state.corners[0]).toHaveLength(2);
  });
});

describe("draw, stuck, and win", () => {
  it("draws one card and turns the waste back over, reversing it", () => {
    const state = blank({
      stock: [C("clubs", 2, false), C("diamonds", 8, false)],
      waste: [C("hearts", 4)],
      sides: [[C("spades", 13)], [], [], []],
    });
    const first = drawStock(state);
    expect(first.ok).toBe(true);
    expect(first.recycled).toBe(false);
    expect(first.state.stock.map((card) => card.id)).toEqual(["clubs-2"]);
    expect(first.state.waste.map((card) => card.id)).toEqual(["hearts-4", "diamonds-8"]);
    expect(first.state.waste.at(-1).faceUp).toBe(true);
    expect(first.state.moves).toBe(1);
    expect(first.state.idlePasses).toBe(0);
    expect(state.stock).toHaveLength(2);

    const second = drawStock(first.state);
    const third = drawStock(second.state);
    expect(third.ok).toBe(true);
    expect(third.recycled).toBe(true);
    expect(third.state.waste).toEqual([]);
    expect(third.state.stock.map((card) => card.id)).toEqual(["clubs-2", "diamonds-8", "hearts-4"]);
    expect(third.state.stock.every((card) => card.faceUp === false)).toBe(true);
    expect(third.state.idlePasses).toBe(1);
    expect(third.state.stuck).toBe(false);

    const emptied = drawStock(drawStock(drawStock(third.state).state).state);
    expect(emptied.state.stock).toHaveLength(0);
    expect(emptied.state.idlePasses).toBe(1);
    const again = drawStock(emptied.state);
    expect(again.recycled).toBe(true);
    expect(again.state.idlePasses).toBe(2);
    expect(again.state.stuck).toBe(true);
    expect(listLegalMoves(again.state).some((move) => move.kind === "draw")).toBe(true);
  });

  it("sets stuck after two idle passes and clears it on a real move", () => {
    let state = blank({
      stock: [C("spades", 5, false), C("hearts", 4, false)],
      waste: [C("clubs", 9)],
      sides: [[C("diamonds", 2)], [C("spades", 3)], [C("hearts", 6)], [C("clubs", 7)]],
    });
    state = drawStock(state).state;
    state = drawStock(state).state;
    expect(state.idlePasses).toBe(0);
    expect(state.stock).toHaveLength(0);
    state = drawStock(state).state;
    expect(state.idlePasses).toBe(1);
    expect(state.stuck).toBe(false);

    state = drawStock(state).state;
    expect(state.idlePasses).toBe(1);
    expect(state.stuck).toBe(false);
    state = drawStock(state).state;
    state = drawStock(state).state;
    expect(state.stock).toHaveLength(0);
    expect(state.stuck).toBe(false);
    state = drawStock(state).state;
    expect(state.idlePasses).toBe(2);
    expect(state.stuck).toBe(true);

    const moved = moveCards(state, { zone: "side", index: 0, count: 1 }, { zone: "side", index: 1 });
    expect(moved.ok).toBe(true);
    expect(moved.state.stuck).toBe(false);
    expect(moved.state.idlePasses).toBe(0);
    expect(moved.state.sides[1].map((card) => card.id)).toEqual(["spades-3", "diamonds-2"]);

    const again = blank({
      stock: [C("spades", 9, false)],
      waste: [C("hearts", 3)],
      sides: [[C("clubs", 4)], [], [], []],
      idlePasses: 1,
    });
    const reset = moveCards(again, { zone: "waste" }, { zone: "side", index: 0 });
    expect(reset.ok).toBe(true);
    expect(reset.state.idlePasses).toBe(0);
    expect(reset.state.stuck).toBe(false);
    const drawn = drawStock(reset.state).state;
    expect(drawn.idlePasses).toBe(0);
    const passes = drawStock(drawn).state;
    expect(passes.stuck).toBe(false);
    expect(passes.idlePasses).toBe(1);
  });

  it("wins when every card is in a corner", () => {
    const sequence = [
      C("hearts", 13),
      C("spades", 12),
      C("diamonds", 11),
      C("clubs", 10),
      C("hearts", 9),
      C("spades", 8),
      C("diamonds", 7),
      C("clubs", 6),
      C("hearts", 5),
      C("spades", 4),
      C("diamonds", 3),
      C("clubs", 2),
    ];
    const used = new Set([...sequence.map((card) => card.id), "hearts-1"]);
    const rest = buildDeck()
      .filter((card) => !used.has(card.id))
      .map((card) => ({ ...card, faceUp: true }));
    const corners = [sequence, rest.slice(0, 13), rest.slice(13, 26), rest.slice(26)];
    expect(rest).toHaveLength(39);
    expect(cardsInCorners({ corners })).toBe(51);

    const state = blank({ corners, waste: [C("hearts", 1)], sides: [[], [], [], []] });
    expect(isWon(state)).toBe(false);
    const won = apply(state, { type: "move", from: { zone: "waste" }, to: { zone: "corner", index: 0 } });
    expect(won.ok).toBe(true);
    expect(isWon(won.state)).toBe(true);
    expect(won.state.won).toBe(true);
    expect(typeof won.state.wonAt).toBe("number");
    expect(cardsInCorners(won.state)).toBe(52);
    expect(listLegalMoves(won.state)).toEqual([]);
    expect(drawStock(won.state).ok).toBe(false);
    expect(moveCards(won.state, { zone: "waste" }, { zone: "side", index: 0 }).reason).toBe("game already won");
  });

  it("lists waste, side, whole-pile, and draw moves", () => {
    const state = blank({
      waste: [C("hearts", 12)],
      stock: [C("clubs", 3, false)],
      sides: [[C("spades", 10), C("hearts", 9)], [], [C("clubs", 13)], []],
      corners: [[C("spades", 13)], [], [], []],
    });
    const moves = listLegalMoves(state);
    expect(moves.some((move) => move.kind === "draw")).toBe(true);
    expect(moves).toContainEqual({
      kind: "move",
      from: { zone: "waste" },
      to: { zone: "corner", index: 0 },
    });
    expect(moves).toContainEqual({
      kind: "move",
      from: { zone: "side", index: 0, count: 2 },
      to: { zone: "side", index: 1 },
    });
    expect(moves).toContainEqual({
      kind: "move",
      from: { zone: "side", index: 2, count: 1 },
      to: { zone: "corner", index: 1 },
    });
    expect(moves.some((move) => move.from?.count === 1 && move.from?.index === 0 && move.kind === "move")).toBe(true);
    expect(moves.some((move) => move.from?.zone === "corner")).toBe(false);
  });
});

describe("clock and purity", () => {
  it("keeps the live clock when a snapshot is restored", () => {
    const live = blank({ startedAt: 5_000, moves: 4 });
    const snapshot = blank({ startedAt: 100, moves: 1 });
    const restored = continueClock(live, snapshot);
    expect(restored.startedAt).toBe(5_000);
    expect(restored.moves).toBe(1);
    expect(snapshot.startedAt).toBe(100);
    expect(cloneState(snapshot)).not.toBe(snapshot);
    expect(cloneState(snapshot)).toEqual(snapshot);
  });

  it("does not mutate the state passed in", () => {
    const state = blank({
      waste: [C("hearts", 12)],
      stock: [C("clubs", 2, false), C("spades", 8, false)],
      sides: [[C("spades", 6), C("hearts", 5)], [C("clubs", 13)], [], []],
      corners: [[C("spades", 13)], [], [], []],
    });
    const snapshot = structuredClone(state);

    const illegal = moveCards(state, { zone: "side", index: 0, count: 2 }, { zone: "corner", index: 0 });
    expect(illegal.ok).toBe(false);
    expect(illegal.state).toBe(state);

    const played = moveCards(state, { zone: "waste" }, { zone: "corner", index: 0 });
    expect(played.ok).toBe(true);
    expect(played.state).not.toBe(state);

    const drawn = drawStock(state);
    expect(drawn.ok).toBe(true);
    expect(drawn.state).not.toBe(state);
    expect(apply(state, { type: "nope" }).state).toBe(state);
    expect(apply(state, { type: "nope" }).reason).toBe("unknown action");
    listLegalMoves(state);
    expect(state).toEqual(snapshot);
  });

  it("does not touch the DOM or storage", () => {
    const src = fs.readFileSync(new URL("../src/game/kings.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/document|window|localStorage|HTMLElement/);
  });
});
