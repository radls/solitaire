import { describe, expect, it } from "vitest";
import { SITE_URL, TIP_BTC_ADDRESS, TIP_X_HANDLE } from "../src/config.js";
import { bitcoinUri, isLikelyBech32Btc, streakLine, tipSections, winTipHTML } from "../src/tip.js";

const LIVE = { TIP_BTC_ADDRESS, TIP_X_HANDLE, SITE_URL };

function withBadChar(bad) {
  return `bc1${bad}${TIP_BTC_ADDRESS.slice(4)}`;
}

describe("isLikelyBech32Btc", () => {
  it("accepts the configured address", () => {
    expect(TIP_BTC_ADDRESS).toHaveLength(42);
    expect(isLikelyBech32Btc(TIP_BTC_ADDRESS)).toBe(true);
  });

  it("accepts a 62-character lowercase bc1 address", () => {
    const long = `bc1${"q".repeat(59)}`;
    expect(long).toHaveLength(62);
    expect(isLikelyBech32Btc(long)).toBe(true);
  });

  it("rejects an empty address", () => {
    expect(isLikelyBech32Btc("")).toBe(false);
  });

  it("rejects uppercase and mixed case", () => {
    expect(isLikelyBech32Btc(TIP_BTC_ADDRESS.toUpperCase())).toBe(false);
    expect(isLikelyBech32Btc(`BC1${TIP_BTC_ADDRESS.slice(3)}`)).toBe(false);
    expect(isLikelyBech32Btc(`bc1${TIP_BTC_ADDRESS.slice(3).toUpperCase()}`)).toBe(false);
  });

  it("rejects a wrong prefix", () => {
    expect(isLikelyBech32Btc(`tb1${TIP_BTC_ADDRESS.slice(3)}`)).toBe(false);
    expect(isLikelyBech32Btc(`1${TIP_BTC_ADDRESS.slice(1)}`)).toBe(false);
    expect(isLikelyBech32Btc(`bc2${TIP_BTC_ADDRESS.slice(3)}`)).toBe(false);
  });

  it("rejects b, i, o, and 1 after the prefix", () => {
    for (const bad of ["b", "i", "o", "1"]) {
      const addr = withBadChar(bad);
      expect(addr).toHaveLength(42);
      expect(isLikelyBech32Btc(addr)).toBe(false);
    }
  });

  it("rejects the wrong length", () => {
    expect(isLikelyBech32Btc(TIP_BTC_ADDRESS.slice(0, -1))).toBe(false);
    expect(isLikelyBech32Btc(`${TIP_BTC_ADDRESS}q`)).toBe(false);
    expect(isLikelyBech32Btc(`bc1${"q".repeat(38)}`)).toBe(false);
    expect(isLikelyBech32Btc(`bc1${"q".repeat(40)}`)).toBe(false);
    expect(isLikelyBech32Btc(`bc1${"q".repeat(58)}`)).toBe(false);
    expect(isLikelyBech32Btc(`bc1${"q".repeat(60)}`)).toBe(false);
  });
});

describe("bitcoinUri", () => {
  it("prefixes the address with bitcoin:", () => {
    expect(bitcoinUri(TIP_BTC_ADDRESS)).toBe(`bitcoin:${TIP_BTC_ADDRESS}`);
  });
});

describe("streakLine", () => {
  it("stays empty below three wins", () => {
    for (const value of [undefined, null, "", 0, 1, 2, -4, 2.9, NaN, Infinity]) {
      expect(streakLine(value)).toBe("");
    }
  });

  it("writes one quiet line at three wins and above", () => {
    const line = "3 wins in a row. If these games help you unwind, a coffee is always welcome.";
    expect(streakLine(3)).toBe(line);
    expect(streakLine(3.8)).toBe(line);
    expect(streakLine(12)).toBe(
      "12 wins in a row. If these games help you unwind, a coffee is always welcome.",
    );
    expect(streakLine(4)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("winTipHTML", () => {
  it("keeps the coffee button on its own row and the streak line above it", () => {
    const quiet = winTipHTML(2);
    expect(quiet).not.toContain("tip-streak");
    expect(quiet).toContain('data-testid="btn-tip"');
    expect(quiet).toContain("☕ Buy me a coffee in BTC");
    expect(quiet).toContain('class="tip-offer"');

    const loud = winTipHTML(3);
    const streakAt = loud.indexOf('data-testid="tip-streak"');
    const buttonAt = loud.indexOf('data-testid="btn-tip"');
    expect(streakAt).toBeGreaterThanOrEqual(0);
    expect(buttonAt).toBeGreaterThan(streakAt);
    expect(loud).toContain("3 wins in a row. If these games help you unwind, a coffee is always welcome.");
    expect(loud).not.toMatch(/<a\b/i);
  });
});

describe("tipSections", () => {
  it("shows Bitcoin and the X Money note for the live config", () => {
    const sections = tipSections(LIVE);
    expect(sections.btc).toBe(true);
    expect(sections.x).toBe(true);
    expect(sections.fallback).toBe(false);
    expect(sections.address).toBe(TIP_BTC_ADDRESS);
    expect(sections.uri).toBe(`bitcoin:${TIP_BTC_ADDRESS}`);
    expect(sections.handle).toBe("ZeusRadls");
    expect(sections.xNote).toBe("Or tip via X Money by messaging @ZeusRadls.");
    expect(sections.xNote).not.toMatch(/https?:|x\.com|stripe/i);
    expect(sections.shareUrl).toBe("");
  });

  it("hides Bitcoin when the address is empty or invalid", () => {
    expect(tipSections({ ...LIVE, TIP_BTC_ADDRESS: "" }).btc).toBe(false);
    expect(tipSections({ ...LIVE, TIP_BTC_ADDRESS: "not-an-address" }).btc).toBe(false);
    const sections = tipSections({ ...LIVE, TIP_BTC_ADDRESS: "" });
    expect(sections.x).toBe(true);
    expect(sections.fallback).toBe(false);
    expect(sections.address).toBe("");
  });

  it("hides the X Money note when the handle is empty", () => {
    for (const handle of ["", "   ", "@"]) {
      const sections = tipSections({ ...LIVE, TIP_X_HANDLE: handle });
      expect(sections.x).toBe(false);
      expect(sections.xNote).toBe("");
      expect(sections.btc).toBe(true);
      expect(sections.fallback).toBe(false);
    }
  });

  it("falls back to thanks and a real site link when neither part is available", () => {
    const sections = tipSections({ TIP_BTC_ADDRESS: "", TIP_X_HANDLE: "  ", SITE_URL });
    expect(sections.btc).toBe(false);
    expect(sections.x).toBe(false);
    expect(sections.fallback).toBe(true);
    expect(sections.fallbackNote).toBe("Thanks for playing");
    expect(sections.shareUrl).toBe(SITE_URL);
  });

  it("omits the share link when the site URL is empty", () => {
    const sections = tipSections({ TIP_BTC_ADDRESS: "", TIP_X_HANDLE: "", SITE_URL: "" });
    expect(sections.fallback).toBe(true);
    expect(sections.fallbackNote).toBe("Thanks for playing");
    expect(sections.shareUrl).toBe("");
  });
});
