import { describe, expect, it } from "vitest";
import { installFallbackCopy, shouldShowInstallHint } from "../src/install-hint.js";

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

describe("installFallbackCopy", () => {
  it("leaves the line empty when an install event was captured", () => {
    expect(installFallbackCopy({ ios: true, hasInstallEvent: true })).toBe("");
    expect(installFallbackCopy({ ios: false, hasInstallEvent: true })).toBe("");
  });

  it("tells iOS Safari to use the Share sheet", () => {
    expect(installFallbackCopy({ ios: true, hasInstallEvent: false })).toBe("Tap Share, then Add to Home Screen.");
  });

  it("uses browser-neutral wording for every other browser", () => {
    expect(installFallbackCopy({ ios: false })).toBe(
      "Use your browser menu to add Solitaire to your home screen, or bookmark this page.",
    );
    expect(installFallbackCopy()).toBe(
      "Use your browser menu to add Solitaire to your home screen, or bookmark this page.",
    );
  });
});
