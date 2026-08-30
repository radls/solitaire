import { describe, expect, it } from "vitest";
import {
  buildDeck,
  makeCard,
  mulberry32,
  oppositeColor,
  rankLabel,
  shuffle,
  SUITS,
} from "../src/game/cards.js";

describe("cards", () => {
  it("builds a 52-card deck with unique ids", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(SUITS.every((suit) => deck.filter((c) => c.suit === suit).length === 13)).toBe(true);
    expect(deck.every((c) => c.faceUp === false)).toBe(true);
  });

  it("labels face cards and aces", () => {
    expect(rankLabel(1)).toBe("A");
    expect(rankLabel(10)).toBe("10");
    expect(rankLabel(11)).toBe("J");
    expect(rankLabel(12)).toBe("Q");
    expect(rankLabel(13)).toBe("K");
  });

  it("treats hearts/diamonds as opposite of spades/clubs", () => {
    expect(oppositeColor("hearts", "spades")).toBe(true);
    expect(oppositeColor("diamonds", "clubs")).toBe(true);
    expect(oppositeColor("hearts", "diamonds")).toBe(false);
    expect(oppositeColor("spades", "clubs")).toBe(false);
  });

  it("shuffles deterministically from a seed", () => {
    const deck = buildDeck();
    const a = shuffle(deck, mulberry32(42));
    const b = shuffle(deck, mulberry32(42));
    const c = shuffle(deck, mulberry32(43));
    expect(a.map((card) => card.id)).toEqual(b.map((card) => card.id));
    expect(a.map((card) => card.id)).not.toEqual(c.map((card) => card.id));
    expect(a).toHaveLength(52);
    expect(new Set(a.map((card) => card.id)).size).toBe(52);
  });

  it("makeCard uses suit-rank ids", () => {
    expect(makeCard("hearts", 1).id).toBe("hearts-1");
  });
});
