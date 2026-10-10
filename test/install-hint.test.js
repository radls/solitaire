import { describe, expect, it } from "vitest";
import { shouldShowInstallHint } from "../src/install-hint.js";

describe("shouldShowInstallHint", () => {
  it("shows after the first win when the app is in a browser tab", () => {
    expect(shouldShowInstallHint({}, { standalone: false, totalWins: 1 })).toBe(true);
    expect(shouldShowInstallHint({ installHint: null }, { standalone: false, totalWins: 3 })).toBe(true);
  });

  it("stays hidden before any win", () => {
    expect(shouldShowInstallHint({}, { standalone: false, totalWins: 0 })).toBe(false);
    expect(shouldShowInstallHint(null, { standalone: false, totalWins: 0 })).toBe(false);
  });

  it("stays hidden after dismiss or install", () => {
    expect(shouldShowInstallHint({ installHint: "dismissed" }, { standalone: false, totalWins: 1 })).toBe(false);
    expect(shouldShowInstallHint({ installHint: "installed" }, { standalone: false, totalWins: 4 })).toBe(false);
  });

  it("stays hidden when the app is already standalone", () => {
    expect(shouldShowInstallHint({}, { standalone: true, totalWins: 2 })).toBe(false);
    expect(shouldShowInstallHint({ installHint: null }, { standalone: true, totalWins: 1 })).toBe(false);
  });
});
