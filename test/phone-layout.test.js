import { describe, expect, it } from "vitest";
import { fanPeek, growKlondikePeeks, kbdTipsHTML, shrinkToFit, touchTipsHTML } from "../src/phone-layout.js";

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
