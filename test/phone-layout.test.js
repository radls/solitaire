import { describe, expect, it } from "vitest";
import {
  canShrinkFan,
  fanPeek,
  growKlondikePeeks,
  kbdTipsHTML,
  klondikeLayoutKey,
  measureBoardSiblings,
  shrinkToFit,
  tightenUntilFit,
  touchTipsHTML,
} from "../src/phone-layout.js";

describe("fanPeek", () => {
  it("grows the strip up to 45% of card height", () => {
    expect(fanPeek(15, 62, 500, 6)).toBe(Math.round(62 * 0.45));
  });

  it("stops at the height that fills the column when that is under the cap", () => {
    const cardH = 62;
    const steps = 6;
    const avail = 200;
    const peek = fanPeek(15, cardH, avail, steps);
    expect(peek).toBeGreaterThanOrEqual(15);
    expect(peek).toBeLessThan(Math.round(cardH * 0.45));
    expect(cardH + steps * peek).toBeLessThanOrEqual(avail);
  });

  it("shrinks below the current step so a long column does not scroll", () => {
    expect(fanPeek(15, 62, 120, 6)).toBe(9);
  });

  it("keeps a single card at the natural step", () => {
    expect(fanPeek(18, 70, 400, 0)).toBe(18);
  });

  it("does not shrink below 1px", () => {
    expect(fanPeek(15, 62, 40, 12)).toBe(1);
  });
});

describe("growKlondikePeeks", () => {
  const faceUp = (n) => [Array.from({ length: n }, () => ({ faceUp: true }))];

  it("opens both strips to the cap when the column is short", () => {
    const cardH = 62;
    const grown = growKlondikePeeks({
      peekUp: 15,
      peekDown: 8,
      cardH,
      avail: 500,
      piles: faceUp(7),
    });
    expect(grown.peekUp).toBe(Math.round(cardH * 0.45));
    expect(grown.peekDown).toBe(Math.round(cardH * 0.45));
  });

  it("fills the available height without passing it", () => {
    const cardH = 62;
    const avail = 160;
    const grown = growKlondikePeeks({
      peekUp: 15,
      peekDown: 8,
      cardH,
      avail,
      piles: faceUp(7),
    });
    expect(grown.peekUp).toBeGreaterThanOrEqual(15);
    expect(grown.peekUp).toBeLessThanOrEqual(17);
    expect(cardH + 6 * grown.peekUp).toBeLessThanOrEqual(avail);
  });

  it("leaves shrinking to the caller when the natural step already overflows", () => {
    const grown = growKlondikePeeks({
      peekUp: 15,
      peekDown: 8,
      cardH: 62,
      avail: 200,
      piles: faceUp(20),
    });
    expect(grown).toEqual({ peekUp: 15, peekDown: 8 });
  });
});

describe("sibling measurement", () => {
  it("counts the draw choice and not the empty stretch under the board", () => {
    const board = {
      getBoundingClientRect: () => ({ top: 200, bottom: 500, height: 300 }),
    };
    const choice = {
      getBoundingClientRect: () => ({ top: 100, bottom: 168, height: 68 }),
    };
    const table = {
      children: [choice, board],
      getBoundingClientRect: () => ({ top: 80, bottom: 900, height: 820 }),
    };
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (el) => {
      if (el === table) {
        return { paddingTop: "16px", paddingBottom: "8px", borderTopWidth: "0px", borderBottomWidth: "0px" };
      }
      if (el === choice) return { marginTop: "0px", marginBottom: "12px" };
      return { marginTop: "0px", marginBottom: "0px" };
    };
    try {
      // Geometric slack would be (200-80-16) + (900-8-500) = 496.
      // The choice's margin box is 68 + 12. The stretched table's empty
      // region is not a sibling and must not be reserved.
      expect(measureBoardSiblings(table, board)).toBe(80);
    } finally {
      globalThis.getComputedStyle = previous;
    }
  });
});

describe("fan shrink", () => {
  it("shrinks only when the free column can hold one card", () => {
    expect(canShrinkFan(170, 170)).toBe(true);
    expect(canShrinkFan(171, 170)).toBe(true);
    expect(canShrinkFan(169, 170)).toBe(false);
    expect(canShrinkFan(1, 170)).toBe(false);
    expect(canShrinkFan(0, 170)).toBe(false);
    expect(canShrinkFan(-40, 170)).toBe(false);
  });
});

describe("klondike layout key", () => {
  const columns = [[{ faceUp: true }], [{ faceUp: false }, { faceUp: true }]];

  it("stays the same when a card is only selected", () => {
    const key = klondikeLayoutKey({ width: 1280, height: 800, choiceVisible: true, columns });
    expect(klondikeLayoutKey({ width: 1280, height: 800, choiceVisible: true, columns })).toBe(key);
  });

  it("changes on resize, a new deal, or the draw choice showing or hiding", () => {
    const base = { width: 1280, height: 800, choiceVisible: true, columns };
    const key = klondikeLayoutKey(base);
    expect(klondikeLayoutKey({ ...base, width: 390, height: 844 })).not.toBe(key);
    expect(klondikeLayoutKey({ ...base, choiceVisible: false })).not.toBe(key);
    const dealt = [[{ faceUp: false }, { faceUp: false }, { faceUp: true }]];
    expect(klondikeLayoutKey({ ...base, columns: dealt })).not.toBe(key);
  });
});

describe("tightenUntilFit", () => {
  it("keeps the first step that fits and falls through to the last when none do", () => {
    expect(tightenUntilFit(["0.5rem", "0.36rem", "0.24rem"], (gap) => gap === "0.24rem")).toBe("0.24rem");
    expect(tightenUntilFit(["0.5rem", "0.36rem"], () => true)).toBe("0.5rem");
    expect(tightenUntilFit(["0.5rem", "0.12rem"], () => false)).toBe("0.12rem");
  });
});

describe("shrinkToFit", () => {
  it("picks the largest size that fits", () => {
    expect(shrinkToFit(10, 1, (n) => n <= 6)).toBe(6);
    expect(shrinkToFit(6, 1, (n) => n <= 6)).toBe(6);
    expect(shrinkToFit(4, 8, () => false)).toBe(8);
  });
});

describe("help tips", () => {
  it("puts gesture tips first and hides shortcuts on touch", () => {
    const touch = touchTipsHTML("<p>Tap a card.</p>", true);
    const kbd = kbdTipsHTML("<li><kbd>N</kbd> new</li>", true);
    const html = `${touch}${kbd}`;
    expect(html.indexOf('data-testid="touch-tips"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="touch-tips"')).toBeLessThan(html.indexOf('data-testid="kbd-tips"'));
    expect(html).toContain('data-testid="kbd-tips" hidden');
  });

  it("keeps shortcuts and omits gesture tips on desktop", () => {
    expect(touchTipsHTML("<p>Tap a card.</p>", false)).toBe("");
    const kbd = kbdTipsHTML("<li><kbd>U</kbd> undo</li>", false);
    expect(kbd).toContain('data-testid="kbd-tips"');
    expect(kbd).not.toContain("hidden");
  });
});
