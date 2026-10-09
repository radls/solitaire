import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { makeCard } from "../src/game/cards.js";
import {
  autoPlaySafe,
  continueClock,
  deal,
  foundationStep,
  hint,
  isTriviallySolvable,
  isWon,
  listLegalMoves,
  maxSupermove,
  moveCards,
  userMove,
} from "../src/game/freecell.js";

const RANK = { A: 1, J: 11, Q: 12, K: 13, T: 10 };
const SUIT = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };

function idOf(code) {
  const suit = SUIT[code.at(-1)];
  const raw = code.slice(0, -1);
  const rank = RANK[raw] ?? Number(raw);
  return `${suit}-${rank}`;
}

function C(suit, rank) {
  return makeCard(suit, rank, true);
}

function blank() {
  const state = deal(1, 0);
  state.cascades = Array.from({ length: 8 }, () => []);
  state.freecells = [null, null, null, null];
  state.foundations = [[], [], [], []];
  state.moves = 0;
  state.won = false;
  state.wonAt = null;
  return state;
}

describe("deal", () => {
  it("matches Microsoft FreeCell deal #1", () => {
    const columns = [
      "JD KD 2S 4C 3S 6D 6S",
      "2D KC KS 5C TD 8S 9C",
      "9H 9S 9D TS 4S 8D 2H",
      "JC 5S QD QH TH QS 6H",
      "5D AD JS 4H 8H 6C",
      "7H QC AS AC 2C 3D",
      "7C KH AH 4D JH 8C",
      "5H 3H 3C 7S 7D TC",
    ];
    const state = deal(1, 0);
    expect(state.dealNumber).toBe(1);
    expect(state.cascades.map((pile) => pile.map((card) => card.id))).toEqual(
      columns.map((line) => line.split(" ").map(idOf)),
    );
    expect(state.cascades.every((pile) => pile.every((card) => card.faceUp))).toBe(true);
  });

  it("deals 52 unique cards in a 7/7/7/7/6/6/6/6 layout for deals 1..50", () => {
    for (let n = 1; n <= 50; n++) {
      const state = deal(n, 0);
      expect(state.dealNumber).toBe(n);
      expect(state.cascades.map((pile) => pile.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
      const ids = state.cascades.flat().map((card) => card.id);
      expect(ids).toHaveLength(52);
      expect(new Set(ids).size).toBe(52);
      expect(state.freecells.every((card) => card == null)).toBe(true);
      expect(state.foundations.every((pile) => pile.length === 0)).toBe(true);
    }
  });
});

describe("maxSupermove", () => {
  it("follows (emptyFree + 1) * 2^emptyCascades and ignores an empty destination", () => {
    for (let free = 0; free <= 4; free++) {
      for (let empty = 0; empty <= 2; empty++) {
        const state = blank();
        for (let i = 0; i < 4 - free; i++) state.freecells[i] = C("spades", i + 1);
        for (let i = 0; i < 8; i++) {
          state.cascades[i] = i < empty ? [] : [C("hearts", (i % 13) + 1)];
        }
        const occupied = state.cascades.findIndex((pile) => pile.length > 0);
        expect(maxSupermove(state, occupied)).toBe((free + 1) * 2 ** empty);
        if (empty > 0) {
          const dest = state.cascades.findIndex((pile) => pile.length === 0);
          expect(maxSupermove(state, dest)).toBe((free + 1) * 2 ** (empty - 1));
        }
      }
    }
  });
});

describe("moves", () => {
  it("moves a legal supermove onto a built cascade and rejects the same run to an empty cascade", () => {
    const state = blank();
    state.freecells = [C("hearts", 13), C("diamonds", 13), C("clubs", 13), C("spades", 13)];
    state.cascades[0] = [C("hearts", 8), C("spades", 7)];
    state.cascades[1] = [C("spades", 9)];
    state.cascades[2] = [];
    for (let i = 3; i < 8; i++) state.cascades[i] = [C("diamonds", i)];

    expect(maxSupermove(state, 1)).toBe(2);
    expect(maxSupermove(state, 2)).toBe(1);

    const legal = moveCards(
      state,
      { zone: "cascade", index: 0, count: 2 },
      { zone: "cascade", index: 1 },
    );
    expect(legal.ok).toBe(true);
    expect(legal.state.cascades[1].map((card) => card.id)).toEqual([
      "spades-9",
      "hearts-8",
      "spades-7",
    ]);
    expect(state.cascades[0]).toHaveLength(2);

    const illegal = moveCards(
      state,
      { zone: "cascade", index: 0, count: 2 },
      { zone: "cascade", index: 2 },
    );
    expect(illegal.ok).toBe(false);
    expect(illegal.reason).toBe("supermove limit");

    const single = moveCards(
      state,
      { zone: "cascade", index: 0, count: 1 },
      { zone: "cascade", index: 2 },
    );
    expect(single.ok).toBe(true);
    expect(single.state.cascades[2].map((card) => card.id)).toEqual(["spades-7"]);
  });

  it("does not count the source cascade as empty before the move", () => {
    const state = blank();
    state.freecells = [C("hearts", 13), C("diamonds", 13), C("clubs", 13), C("spades", 12)];
    state.cascades[0] = [C("hearts", 8), C("spades", 7)];
    state.cascades[1] = [C("spades", 9)];
    for (let i = 2; i < 8; i++) state.cascades[i] = [C("clubs", i)];
    expect(maxSupermove(state, 1)).toBe(1);
    const moved = moveCards(
      state,
      { zone: "cascade", index: 0, count: 2 },
      { zone: "cascade", index: 1 },
    );
    expect(moved.ok).toBe(false);
    expect(moved.reason).toBe("supermove limit");
  });

  it("moves a run onto an empty cascade when the supermove allows it", () => {
    const state = blank();
    state.cascades[0] = [C("spades", 6), C("hearts", 5), C("clubs", 4)];
    state.cascades[1] = [];
    for (let i = 2; i < 8; i++) state.cascades[i] = [C("diamonds", i)];
    expect(maxSupermove(state, 1)).toBe(5);
    const moved = moveCards(
      state,
      { zone: "cascade", index: 0, count: 3 },
      { zone: "cascade", index: 1 },
    );
    expect(moved.ok).toBe(true);
    expect(moved.state.cascades[1].map((card) => card.rank)).toEqual([6, 5, 4]);
    expect(moved.state.cascades[0]).toHaveLength(0);
  });

  it("rejects a broken sequence and a full free cell", () => {
    const state = blank();
    state.cascades[0] = [C("hearts", 8), C("diamonds", 7)];
    state.cascades[1] = [];
    for (let i = 2; i < 8; i++) state.cascades[i] = [C("clubs", i)];
    expect(
      moveCards(state, { zone: "cascade", index: 0, count: 2 }, { zone: "cascade", index: 1 }).ok,
    ).toBe(false);

    state.freecells = [C("spades", 1), C("spades", 2), C("spades", 3), C("spades", 4)];
    state.cascades[3] = [C("hearts", 9)];
    const full = moveCards(
      state,
      { zone: "cascade", index: 3, count: 1 },
      { zone: "freecell", index: 0 },
    );
    expect(full.ok).toBe(false);
    expect(full.reason).toBe("free cell is full");
    expect(state.freecells.map((card) => card.id)).toEqual([
      "spades-1",
      "spades-2",
      "spades-3",
      "spades-4",
    ]);

    state.freecells[3] = null;
    const parked = moveCards(
      state,
      { zone: "cascade", index: 3, count: 1 },
      { zone: "freecell", index: 3 },
    );
    expect(parked.ok).toBe(true);
    expect(parked.state.freecells[3].id).toBe("hearts-9");
  });

  it("builds foundations up by suit and refuses a card out of order", () => {
    const state = blank();
    state.cascades[0] = [C("hearts", 1)];
    state.cascades[1] = [C("hearts", 2)];
    state.cascades[2] = [C("spades", 2)];
    const ace = moveCards(state, { zone: "cascade", index: 0, count: 1 }, { zone: "foundation", index: 0 });
    expect(ace.ok).toBe(true);
    expect(ace.state.foundations[0].map((card) => card.id)).toEqual(["hearts-1"]);

    const two = moveCards(
      ace.state,
      { zone: "cascade", index: 1, count: 1 },
      { zone: "foundation", index: 0 },
    );
    expect(two.ok).toBe(true);
    expect(two.state.foundations[0].map((card) => card.rank)).toEqual([1, 2]);

    const wrongSuit = moveCards(
      ace.state,
      { zone: "cascade", index: 2, count: 1 },
      { zone: "foundation", index: 0 },
    );
    expect(wrongSuit.ok).toBe(false);

    const skipped = moveCards(
      state,
      { zone: "cascade", index: 1, count: 1 },
      { zone: "foundation", index: 1 },
    );
    expect(skipped.ok).toBe(false);
  });

  it("lists the legal drop targets for a selected run", () => {
    const state = blank();
    state.freecells = [null, C("clubs", 9), null, null];
    state.cascades[0] = [C("spades", 5), C("hearts", 4)];
    state.cascades[1] = [C("diamonds", 6)];
    state.cascades[2] = [];
    for (let i = 3; i < 8; i++) state.cascades[i] = [C("diamonds", 3)];
    const moves = listLegalMoves(state).filter(
      (move) => move.from.zone === "cascade" && move.from.index === 0 && move.from.count === 2,
    );
    const dests = moves.map((move) => `${move.to.zone}:${move.to.index}`);
    expect(dests).toContain("cascade:1");
    expect(dests).toContain("cascade:2");
    expect(dests.some((dest) => dest.startsWith("freecell"))).toBe(false);
  });
});

describe("autoPlaySafe", () => {
  it("sends aces and twos home, then a card only when both opposite foundations are ready", () => {
    const state = blank();
    state.foundations = [[C("clubs", 1)], [C("spades", 1)], [], []];
    state.freecells = [C("hearts", 1), C("diamonds", 1), null, null];
    state.cascades[0] = [C("hearts", 2)];
    state.cascades[1] = [C("diamonds", 2)];
    state.cascades[2] = [C("clubs", 3)];
    const played = autoPlaySafe(state);
    expect(played.moved).toBe(4);
    const home = played.state.foundations.flat().map((card) => card.id);
    expect(home).toEqual(
      expect.arrayContaining(["hearts-1", "diamonds-1", "hearts-2", "diamonds-2", "clubs-1", "spades-1"]),
    );
    expect(played.state.cascades[2].map((card) => card.id)).toEqual(["clubs-3"]);
    expect(state.freecells[0].id).toBe("hearts-1");
  });

  it("moves a safe card as part of the same user move", () => {
    const state = blank();
    state.cascades[0] = [C("hearts", 1), C("spades", 9)];
    state.cascades[1] = [C("hearts", 10)];
    for (let i = 2; i < 8; i++) state.cascades[i] = [C("diamonds", 4)];
    const moved = userMove(
      state,
      { zone: "cascade", index: 0, count: 1 },
      { zone: "cascade", index: 1 },
    );
    expect(moved.ok).toBe(true);
    expect(moved.state.cascades[1].map((card) => card.id)).toEqual(["hearts-10", "spades-9"]);
    expect(moved.state.foundations.flat().map((card) => card.id)).toEqual(["hearts-1"]);
    expect(moved.autoMoved).toBe(1);
  });

  it("wins when the last kings are safe to go home", () => {
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const state = blank();
    state.foundations = suits.map((suit) =>
      Array.from({ length: 12 }, (_, rank) => C(suit, rank + 1)),
    );
    state.freecells = suits.map((suit) => C(suit, 13));
    const played = autoPlaySafe(state);
    expect(played.state.won).toBe(true);
    expect(isWon(played.state)).toBe(true);
    expect(played.state.freecells.every((card) => card == null)).toBe(true);
  });
});

function ranksHome(state) {
  return state.foundations.reduce((n, pile) => n + pile.length, 0);
}

describe("foundationStep", () => {
  it("moves one card at a time, lowest rank first, from a cascade or a free cell", () => {
    const state = blank();
    state.foundations[0] = [C("hearts", 1)];
    state.cascades[0] = [C("hearts", 2)];
    state.cascades[1] = [C("spades", 1)];
    state.freecells[0] = C("diamonds", 1);
    const before = structuredClone(state);

    const first = foundationStep(state, { safeOnly: false });
    expect(first.ok).toBe(true);
    expect(first.state.moves).toBe(state.moves + 1);
    expect(ranksHome(first.state)).toBe(ranksHome(state) + 1);
    expect(first.state.cascades[1]).toHaveLength(0);
    expect(first.state.cascades[0].map((card) => card.rank)).toEqual([2]);
    expect(first.state.freecells[0].id).toBe("diamonds-1");
    expect(state).toEqual(before);

    const second = foundationStep(first.state, { safeOnly: false });
    expect(second.ok).toBe(true);
    expect(ranksHome(second.state)).toBe(ranksHome(first.state) + 1);
    expect(second.state.freecells[0]).toBeNull();
    expect(second.state.cascades[0]).toHaveLength(1);

    const third = foundationStep(second.state, { safeOnly: true });
    expect(third.ok).toBe(true);
    expect(third.state.foundations[0].map((card) => card.rank)).toEqual([1, 2]);
    expect(ranksHome(third.state)).toBe(ranksHome(second.state) + 1);

    const done = foundationStep(third.state, { safeOnly: false });
    expect(done.ok).toBe(false);
    expect(done.state).toBe(third.state);
  });

  it("safeOnly skips a legal card the safe rule rejects", () => {
    const state = blank();
    state.foundations[0] = [C("clubs", 1), C("clubs", 2)];
    state.foundations[1] = [C("hearts", 1)];
    state.foundations[2] = [C("diamonds", 1)];
    state.cascades[0] = [C("clubs", 3)];
    const before = structuredClone(state);

    const safe = foundationStep(state, { safeOnly: true });
    expect(safe.ok).toBe(false);
    expect(state).toEqual(before);

    const any = foundationStep(state, { safeOnly: false });
    expect(any.ok).toBe(true);
    expect(any.state.foundations[0].map((card) => card.rank)).toEqual([1, 2, 3]);
    expect(any.state.cascades[0]).toHaveLength(0);
    expect(state.cascades[0]).toHaveLength(1);
  });
});

describe("isTriviallySolvable", () => {
  it("is true for a sorted near-win and false when a low card is buried", () => {
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const sorted = blank();
    sorted.foundations = suits.map((suit) => Array.from({ length: 10 }, (_, rank) => C(suit, rank + 1)));
    suits.forEach((suit, index) => {
      sorted.cascades[index] = [C(suit, 13), C(suit, 12), C(suit, 11)];
    });
    const sortedBefore = structuredClone(sorted);
    expect(isTriviallySolvable(sorted)).toBe(true);
    expect(sorted).toEqual(sortedBefore);

    let current = sorted;
    let steps = 0;
    while (steps < 20) {
      const step = foundationStep(current, { safeOnly: false });
      if (!step.ok) break;
      expect(ranksHome(step.state)).toBe(ranksHome(current) + 1);
      current = step.state;
      steps += 1;
    }
    expect(steps).toBe(12);
    expect(isWon(current)).toBe(true);

    const buried = blank();
    buried.foundations = ["clubs", "diamonds", "spades"].map((suit) =>
      Array.from({ length: 13 }, (_, rank) => C(suit, rank + 1)),
    );
    buried.foundations.push([]);
    buried.cascades[0] = [C("hearts", 1), C("hearts", 2)];
    const higher = [13, 12, 11, 10, 9, 8, 7];
    higher.forEach((rank, index) => {
      buried.cascades[index + 1] = [C("hearts", rank)];
    });
    buried.freecells = [C("hearts", 3), C("hearts", 4), C("hearts", 5), C("hearts", 6)];
    const buriedBefore = structuredClone(buried);
    expect(isTriviallySolvable(buried)).toBe(false);
    expect(foundationStep(buried, { safeOnly: false }).ok).toBe(false);
    expect(buried).toEqual(buriedBefore);
  });
});

describe("undo clock", () => {
  it("keeps the live clock when restoring an undo snapshot", () => {
    const live = blank();
    live.startedAt = 8_000;
    live.moves = 3;
    const snapshot = blank();
    snapshot.startedAt = 500;
    snapshot.moves = 2;
    const restored = continueClock(live, snapshot);
    expect(restored.startedAt).toBe(8_000);
    expect(restored.moves).toBe(2);
    expect(snapshot.startedAt).toBe(500);
  });
});

describe("hint", () => {
  it("prefers a foundation move", () => {
    const state = blank();
    state.cascades[0] = [C("spades", 1)];
    state.cascades[1] = [C("hearts", 7)];
    state.cascades[2] = [C("spades", 8)];
    const suggested = hint(state);
    expect(suggested).toEqual({
      from: { zone: "cascade", index: 0, count: 1 },
      to: { zone: "foundation", index: 0 },
    });
  });

  it("prefers building onto a non-empty cascade over a free cell", () => {
    const state = blank();
    state.cascades[0] = [C("hearts", 7)];
    state.cascades[1] = [C("spades", 8)];
    const suggested = hint(state);
    expect(suggested.from).toEqual({ zone: "cascade", index: 0, count: 1 });
    expect(suggested.to).toEqual({ zone: "cascade", index: 1 });
  });

  it("skips moving a whole run that already sits on a valid parent", () => {
    const state = blank();
    state.cascades[0] = [C("spades", 8), C("hearts", 7), C("spades", 6)];
    state.cascades[1] = [C("clubs", 8)];
    for (let i = 2; i < 8; i++) state.cascades[i] = [C("spades", 13)];
    state.freecells = [null, null, null, null];
    const suggested = hint(state);
    expect(suggested).not.toBeNull();
    expect(suggested).toEqual({
      from: { zone: "cascade", index: 0, count: 1 },
      to: { zone: "freecell", index: 0 },
    });
  });

  it("hints emptying a cascade or freeing a free-cell card onto a cascade", () => {
    const free = blank();
    free.freecells[0] = C("hearts", 7);
    free.cascades[0] = [C("spades", 8)];
    for (let i = 1; i < 8; i++) free.cascades[i] = [C("clubs", 13)];
    const fromCell = hint(free);
    expect(fromCell).toEqual({
      from: { zone: "freecell", index: 0, count: 1 },
      to: { zone: "cascade", index: 0 },
    });

    const clear = blank();
    clear.cascades[0] = [C("hearts", 5)];
    clear.cascades[1] = [];
    clear.freecells = [C("clubs", 3), C("clubs", 4), C("clubs", 5), C("clubs", 6)];
    const emptied = hint(clear);
    expect(emptied).toEqual({
      from: { zone: "cascade", index: 0, count: 1 },
      to: { zone: "cascade", index: 1 },
    });
  });

  it("falls back to a cascade-to-free-cell move, then an empty cascade", () => {
    const toCell = blank();
    toCell.cascades[0] = [C("clubs", 10), C("hearts", 5)];
    toCell.freecells = [null, C("hearts", 3), C("diamonds", 9), C("hearts", 2)];
    for (let i = 1; i < 8; i++) toCell.cascades[i] = [C("spades", 13)];
    const suggested = hint(toCell);
    expect(suggested).toEqual({
      from: { zone: "cascade", index: 0, count: 1 },
      to: { zone: "freecell", index: 0 },
    });

    const toEmpty = blank();
    toEmpty.cascades[0] = [C("clubs", 10), C("hearts", 5)];
    toEmpty.cascades[1] = [];
    toEmpty.freecells = [C("hearts", 3), C("diamonds", 9), C("hearts", 2), C("diamonds", 2)];
    for (let i = 2; i < 8; i++) toEmpty.cascades[i] = [C("spades", 13), C("hearts", 13)];
    expect(hint(toEmpty)).toEqual({
      from: { zone: "cascade", index: 0, count: 1 },
      to: { zone: "cascade", index: 1 },
    });
  });

  it("returns null when nothing can move", () => {
    const state = blank();
    state.cascades = Array.from({ length: 8 }, () => []);
    state.freecells = [null, null, null, null];
    expect(hint(state)).toBeNull();
    expect(hint({ ...state, won: true, cascades: [[C("spades", 1)]] })).toBeNull();
  });
});

describe("purity", () => {
  it("does not touch the DOM or storage", () => {
    const src = fs.readFileSync(new URL("../src/game/freecell.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/document|window|localStorage|HTMLElement/);
  });
});
