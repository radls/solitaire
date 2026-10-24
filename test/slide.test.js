import { describe, expect, it } from "vitest";
import { classifySlide, easeOvershoots, profileFromTokens, slideDelta } from "../src/slide.js";

describe("slide helper", () => {
  it("inverts the full way back to the old spot", () => {
    expect(slideDelta({ x: 10, y: 40 }, { x: 110, y: 20 })).toEqual({ dx: -100, dy: 20 });
  });

  it("slides a pile change and a drag ghost, not a peek in the same pile", () => {
    const far = { dx: 80, dy: 10 };
    expect(classifySlide({ prev: { zone: "tableau", index: "0" }, next: { zone: "tableau", index: "3" }, delta: far })).toBe("move");
    expect(classifySlide({ prev: { zone: "cascade", index: "1" }, next: { zone: "foundation", index: "0" }, delta: far })).toBe("move");
    expect(
      classifySlide({
        prev: { zone: "tableau", index: "2" },
        next: { zone: "tableau", index: "2" },
        delta: far,
        fromGhost: true,
      }),
    ).toBe("move");
    expect(
      classifySlide({
        prev: { zone: "tableau", index: "2" },
        next: { zone: "tableau", index: "2" },
        delta: { dx: 0, dy: 12 },
      }),
    ).toBe("still");
  });

  it("sends a fresh deal out from the stock and lets a buried card appear", () => {
    expect(classifySlide({ prev: null, next: { zone: "tableau", index: "0" }, delta: { dx: 40, dy: 80 }, deal: true })).toBe("deal");
    expect(classifySlide({ prev: null, next: { zone: "foundation", index: "1" }, delta: { dx: 0, dy: 0 }, deal: false })).toBe("appear");
    expect(classifySlide({ prev: { zone: "waste", index: "" }, next: { zone: "waste", index: "" }, delta: { dx: 20, dy: 0 } })).toBe("nudge");
  });

  it("uses a slower bedtime pace without overshoot, and no motion when reduced", () => {
    const day = profileFromTokens({
      ms: 200,
      fastMs: 120,
      ease: "cubic-bezier(0.16, 0.84, 0.3, 1.12)",
    });
    const night = profileFromTokens({
      ms: 250,
      fastMs: 160,
      gentle: true,
      ease: "cubic-bezier(0.37, 0, 0.25, 1)",
    });
    const fast = profileFromTokens({ fast: true, ms: 200, fastMs: 120, ease: day.ease });
    const reduced = profileFromTokens({ reduced: true, gentle: true, ease: night.ease });
    expect(day.ms).toBeGreaterThan(fast.ms);
    expect(night.ms).toBeGreaterThan(day.ms);
    expect(day.gentle).toBe(false);
    expect(night.gentle).toBe(true);
    expect(night.overshoot).toBe(false);
    expect(easeOvershoots(day.ease)).toBe(true);
    expect(day.overshoot).toBe(true);
    expect(reduced.instant).toBe(true);
    expect(reduced.ms).toBe(0);
    expect(reduced.overshoot).toBe(false);
  });
});
