import { describe, expect, it } from "vitest";
import { SITE_URL, TIP_BTC_ADDRESS, TIP_X_HANDLE } from "../src/config.js";
import {
  bitcoinUri,
  isLikelyBech32Btc,
  markTipCta,
  readTipCtaDay,
  shouldShowTipCta,
  streakLine,
  stuckTipHTML,
  TIP_STORE_KEY,
  creditHTML,
  tipCtaHTML,
  tipEntryHTML,
  tipSections,
  winScreenTipHTML,
  winTipHTML,
} from "../src/tip.js";

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
    const line = "3 wins in a row. If these games help you unwind, a few tokens are always welcome.";
    expect(streakLine(3)).toBe(line);
    expect(streakLine(3.8)).toBe(line);
    expect(streakLine(12)).toBe(
      "12 wins in a row. If these games help you unwind, a few tokens are always welcome.",
    );
    expect(streakLine(4)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("winTipHTML", () => {
  it("keeps the tip button on its own row and the streak line above it", () => {
    const quiet = winTipHTML(2);
    expect(quiet).not.toContain("tip-streak");
    expect(quiet).toContain('data-testid="btn-tip"');
    expect(quiet).toContain("🪙 Buy me some tokens in BTC");
    expect(quiet).toContain('class="tip-offer"');

    const loud = winTipHTML(3);
    const streakAt = loud.indexOf('data-testid="tip-streak"');
    const buttonAt = loud.indexOf('data-testid="btn-tip"');
    expect(streakAt).toBeGreaterThanOrEqual(0);
    expect(buttonAt).toBeGreaterThan(streakAt);
    expect(loud).toContain("3 wins in a row. If these games help you unwind, a few tokens are always welcome.");
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

  it("shows the once-a-day CTA on a new day, and not again the same day", () => {
    expect(shouldShowTipCta("2026-10-10", "2026-10-10")).toBe(false);
    expect(shouldShowTipCta(" 2026-10-10 ", "2026-10-10")).toBe(false);
    expect(shouldShowTipCta("2026-10-09", "2026-10-10")).toBe(true);
    expect(shouldShowTipCta("2025-01-01", "2026-10-10")).toBe(true);
  });

  it("treats a missing saved day as not yet shown", () => {
    for (const saved of [undefined, null, "", "   ", 0, 12, {}, []]) {
      expect(shouldShowTipCta(saved, "2026-10-10")).toBe(true);
    }
    expect(shouldShowTipCta("2026-10-10", "")).toBe(true);
    expect(shouldShowTipCta("2026-10-10", null)).toBe(true);
  });

  it("remembers the local day and ignores broken storage", () => {
    const box = {};
    const storage = {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(box, key) ? box[key] : null;
      },
      setItem(key, value) {
        box[key] = String(value);
      },
    };
    expect(readTipCtaDay(storage)).toBe(null);
    expect(markTipCta("2026-10-10", storage)).toBe(true);
    expect(box[TIP_STORE_KEY]).toBe(JSON.stringify({ ctaDay: "2026-10-10" }));
    expect(readTipCtaDay(storage)).toBe("2026-10-10");
    expect(shouldShowTipCta(readTipCtaDay(storage), "2026-10-10")).toBe(false);
    expect(shouldShowTipCta(readTipCtaDay(storage), "2026-10-11")).toBe(true);

    const broken = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    expect(() => readTipCtaDay(broken)).not.toThrow();
    expect(readTipCtaDay(broken)).toBe(null);
    expect(() => markTipCta("2026-10-10", broken)).not.toThrow();
    expect(markTipCta("2026-10-10", broken)).toBe(false);
    expect(markTipCta("2026-10-10", null)).toBe(false);
    expect(shouldShowTipCta(readTipCtaDay(broken), "2026-10-10")).toBe(true);

    const corrupt = {
      getItem() {
        return "{not json";
      },
      setItem() {},
    };
    expect(readTipCtaDay(corrupt)).toBe(null);
    expect(readTipCtaDay({ getItem: () => JSON.stringify({ ctaDay: 4 }), setItem() {} })).toBe(null);
    expect(readTipCtaDay({ getItem: () => "null", setItem() {} })).toBe(null);
  });

  it("shows the CTA once per day, then the small tip button", () => {
    const box = {};
    const storage = {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(box, key) ? box[key] : null;
      },
      setItem(key, value) {
        box[key] = String(value);
      },
    };
    const first = winScreenTipHTML(4, "2026-10-10", storage);
    expect(first).toContain('data-testid="tip-cta"');
    expect(first).toContain("Enjoying a quiet game? A small BTC tip keeps it going.");
    expect(first).toContain('data-testid="btn-tip"');
    expect(first).toContain("🪙 Buy me some tokens in BTC");
    expect(first).not.toContain("tip-streak");
    expect(first).not.toMatch(/!/);
    expect(first).not.toMatch(/<a\b|https?:|x\.com|stripe/i);

    const again = winScreenTipHTML(4, "2026-10-10", storage);
    expect(again).not.toContain("tip-cta");
    expect(again).toContain('data-testid="btn-tip"');
    expect(again).toContain('data-testid="tip-streak"');
    expect(stuckTipHTML("2026-10-10", storage)).toBe("");

    const next = stuckTipHTML("2026-10-11", storage);
    expect(next).toContain('data-testid="tip-cta"');
    expect(winScreenTipHTML(1, "2026-10-11", storage)).not.toContain("tip-cta");
    expect(winScreenTipHTML(1, "2026-10-11", storage)).toContain('data-testid="btn-tip"');
  });

  it("keeps a quiet tip entry free of the address", () => {
    const entry = tipEntryHTML("help-tip");
    expect(entry).toContain('data-testid="help-tip"');
    expect(entry).toContain('data-act="tip"');
    expect(entry).toContain("🪙 Tip in BTC");
    expect(entry).not.toContain(TIP_BTC_ADDRESS);
    expect(entry).not.toMatch(/!/);
    const cta = tipCtaHTML();
    expect(cta).toContain('data-testid="tip-cta"');
    expect(cta.indexOf('data-testid="btn-tip"')).toBeGreaterThan(cta.indexOf("Enjoying a quiet game?"));
  });

  it("renders a quiet maker credit with no link", () => {
    const picker = creditHTML("credit");
    expect(picker).toContain('data-testid="credit"');
    expect(picker).toContain("Made by Grok Bot");
    expect(picker).not.toMatch(/<a\b/i);
    expect(picker).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(creditHTML("help-credit")).toContain('data-testid="help-credit"');
    expect(creditHTML("help-credit")).toContain("Made by Grok Bot");
  });

  it("omits the share link when the site URL is empty", () => {
    const sections = tipSections({ TIP_BTC_ADDRESS: "", TIP_X_HANDLE: "", SITE_URL: "" });
    expect(sections.fallback).toBe(true);
    expect(sections.fallbackNote).toBe("Thanks for playing");
    expect(sections.shareUrl).toBe("");
  });
});
