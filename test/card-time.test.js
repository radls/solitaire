import { describe, expect, it } from "vitest";
import { cssTimeMs } from "../src/card-view.js";

describe("cssTimeMs", () => {
  it("reads the minified seconds form the build ships, not only ms", () => {
    expect(cssTimeMs(".68s", 700)).toBe(680);
    expect(cssTimeMs(" 0.44s", 700)).toBe(440);
    expect(cssTimeMs("680ms", 700)).toBe(680);
    expect(cssTimeMs("250", 700)).toBe(250);
  });
  it("ignores unit case", () => {
    expect(cssTimeMs("0.5S", 700)).toBe(500);
    expect(cssTimeMs("120MS", 700)).toBe(120);
  });
  it("falls back for empty, unknown units and junk", () => {
    for (const raw of ["", "auto", "10px", "5em", "1s2", null, undefined]) expect(cssTimeMs(raw, 700)).toBe(700);
  });
  it("falls back for negative times", () => {
    expect(cssTimeMs("-200ms", 700)).toBe(700);
    expect(cssTimeMs("-.5s", 700)).toBe(700);
    expect(cssTimeMs("0s", 700)).toBe(0);
  });
});
