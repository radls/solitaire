import { describe, expect, it } from "vitest";
import { cssTimeMs } from "../src/card-view.js";

describe("cssTimeMs", () => {
  it("reads the minified seconds form the build ships, not only ms", () => {
    expect(cssTimeMs(".68s", 700)).toBe(680);
    expect(cssTimeMs(" 0.44s", 700)).toBe(440);
    expect(cssTimeMs("680ms", 700)).toBe(680);
    expect(cssTimeMs("", 700)).toBe(700);
    expect(cssTimeMs("auto", 700)).toBe(700);
  });
});
