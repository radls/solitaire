import { describe, expect, it } from "vitest";
import { applyPileSkew, hashSkew, pileSkew, setPileSeed } from "../src/pile-skew.js";

function fakeEl() {
  const props = new Map();
  return {
    style: {
      setProperty(name, value) {
        props.set(name, value);
      },
      getPropertyValue(name) {
        return props.get(name) ?? "";
      },
    },
  };
}

describe("pile skew", () => {
  it("is deterministic for the same card, seed, and pile", () => {
    const a = pileSkew("hearts-7", 12345, "tableau", 2);
    const b = pileSkew("hearts-7", 12345, "tableau", 2);
    expect(b).toEqual(a);
    expect(hashSkew("12345|hearts-7|tableau|2")).toBe(hashSkew("12345|hearts-7|tableau|2"));
  });

  it("stays inside a readable nudge", () => {
    const skew = pileSkew("spades-13", 99, "cascade", 4);
    expect(Math.abs(skew.rot)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(skew.dx)).toBeLessThanOrEqual(1.75);
    expect(Math.abs(skew.dy)).toBeLessThanOrEqual(1.75);
  });

  it("does not jitter when the same pile is rendered again or undone", () => {
    setPileSeed(42);
    const el = fakeEl();
    const loc = { zone: "tableau", index: 3 };
    const first = applyPileSkew(el, { id: "clubs-5" }, loc);
    const again = applyPileSkew(el, { id: "clubs-5" }, loc);
    expect(again).toEqual(first);
    applyPileSkew(el, { id: "clubs-5" }, { zone: "tableau", index: 5 });
    const undone = applyPileSkew(el, { id: "clubs-5" }, loc);
    expect(undone).toEqual(first);
    expect(el.style.getPropertyValue("--pile-rot")).toBe(first.rot.toFixed(3));
    expect(el.style.getPropertyValue("--pile-dx")).toBe(first.dx.toFixed(3));
    expect(el.style.getPropertyValue("--pile-dy")).toBe(first.dy.toFixed(3));
  });

  it("changes with the deal seed and skips cards that are not in a pile", () => {
    const home = pileSkew("diamonds-2", 1, "column", 0);
    const other = pileSkew("diamonds-2", 2, "column", 0);
    expect(other).not.toEqual(home);
    const el = fakeEl();
    expect(applyPileSkew(el, { id: "diamonds-2" }, { zone: "waste" }, 1)).toBeNull();
    expect(el.style.getPropertyValue("--pile-rot")).toBe("");
  });

  it("spreads stacked cards so a pile is not a single repeated offset", () => {
    const seen = new Set();
    for (const id of ["spades-1", "hearts-3", "clubs-9", "diamonds-12", "spades-6", "hearts-11"]) {
      const skew = pileSkew(id, 777, "side", 1);
      seen.add(`${skew.rot}|${skew.dx}|${skew.dy}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
