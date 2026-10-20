import { describe, expect, it } from "vitest";
import { shareCardHTML, shareText, shareUrl } from "../src/share.js";
import { shouldShowInstallHint } from "../src/install-hint.js";

describe("share card", () => {
  it("links to the same deal per game", () => {
    expect(shareUrl("klondike", { seed: 42, drawCount: 3 })).toBe("https://radls.github.io/solitaire/?game=klondike&seed=42&draw=3");
    expect(shareUrl("freecell", { seed: 617 })).toBe("https://radls.github.io/solitaire/?game=freecell&deal=617");
    expect(shareUrl("golf", { seed: 9 })).toBe("https://radls.github.io/solitaire/?game=golf&seed=9");
    expect(shareUrl("kings", { seed: 9 })).toBe("https://radls.github.io/solitaire/?game=kings&seed=9");
  });
  it("text has time, moves and streak", () => {
    expect(shareText({ game: "freecell", dateLabel: "Oct 20", time: "3:05", moves: 88, streak: 1 })).toBe(
      "Solitaire · FreeCell daily (Oct 20): 3:05 · 88 moves · 1 day in a row. Play the same deal:",
    );
  });
  it("escapes into attributes", () => {
    const html = shareCardHTML({ game: "kings", time: "1:00", moves: 1, streak: 2, seed: 5 });
    expect(html).toContain("King&#39;s Corners");
    expect(html).not.toContain("King's");
  });
});

describe("install hint once", () => {
  it("never shows again once shown", () => {
    expect(shouldShowInstallHint({ installHint: "shown" }, { totalWins: 3 })).toBe(false);
    expect(shouldShowInstallHint({}, { totalWins: 1 })).toBe(true);
  });
});
