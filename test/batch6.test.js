import { describe, expect, it } from "vitest";
import { tomorrowDealHTML, tomorrowDealText } from "../src/daily.js";
import { celebrationHTML, winCelebration } from "../src/celebrate.js";
import { foundationCountLabel, completedFoundationIndexes } from "../src/game/freecell.js";
import { cardsLeft, deal as dealGolf, nearMissLine } from "../src/game/golf.js";
import { makeCard } from "../src/game/cards.js";
import { emptyState, moveCards, scoreParts } from "../src/game/klondike.js";
import { hintFromSelector } from "../src/hint-target.js";
import { notePersonalBest, personalBestHTML } from "../src/records.js";
import { abandonsStreak, dailyAlongsidePlan, isDailyBoard, placeBoard, takeSlots } from "../src/slots.js";

function C(suit, rank, faceUp = true) {
  return makeCard(suit, rank, faceUp);
}

describe("score parts", () => {
  it("shows 61 at the start and 37 after 120 seconds while moves stay at 12", () => {
    const state = emptyState({
      score: 61,
      moves: 12,
      startedAt: 1_000,
      drawCount: 3,
      recycled: 0,
    });
    const atStart = scoreParts(state, 1_000);
    expect(atStart.display).toBe(61);
    expect(atStart.raw).toBe(61);
    expect(atStart.timePenalty).toBe(0);
    const later = scoreParts(state, 1_000 + 120_000);
    expect(later.display).toBe(37);
    expect(later.timePenalty).toBe(24);
    expect(state.score).toBe(61);
    expect(state.moves).toBe(12);
    expect(later.recycleTotal).toBe(0);
  });
});

describe("waste hint target", () => {
  it("selects the top waste card, not the first one in the fan", () => {
    const move = {
      kind: "waste-to-tableau",
      from: { zone: "waste" },
      to: { zone: "tableau", index: 0 },
    };
    expect(hintFromSelector(move)).toBe('.card[data-zone="waste"][data-waste-top="1"]');
    expect(hintFromSelector(move)).not.toBe('.card[data-zone="waste"]');
  });
});

describe("last face-down glow", () => {
  it("names the column only when its last face-down card turns over", () => {
    const state = emptyState({
      tableau: [
        [C("spades", 13, false), C("hearts", 12)],
        [C("clubs", 9, false), C("diamonds", 8, false), C("spades", 7)],
        [C("clubs", 13)],
        [C("hearts", 8)],
        [],
        [],
        [],
      ],
      foundations: [[], [], [], []],
    });
    const one = moveCards(state, { zone: "tableau", index: 0, count: 1 }, { zone: "tableau", index: 2 });
    expect(one.ok).toBe(true);
    expect(one.flipped).toBe(true);
    expect(one.revealedColumns).toEqual([0]);

    const two = moveCards(state, { zone: "tableau", index: 1, count: 1 }, { zone: "tableau", index: 3 });
    expect(two.ok).toBe(true);
    expect(two.flipped).toBe(true);
    expect(two.revealedColumns).toEqual([]);
  });
});

describe("golf near miss", () => {
  it("says how many cards were left when 1 to 3 remain", () => {
    const base = dealGolf({ seed: 1 });
    const over = (left) => ({
      ...base,
      stock: [],
      waste: [C("hearts", 13)],
      columns: Array.from({ length: 7 }, (_, i) => (i < left ? [C("spades", 2)] : [])),
      over: true,
    });
    expect(nearMissLine(over(1))).toBe("So close — 1 card left");
    expect(nearMissLine(over(2))).toBe("So close — 2 cards left");
    expect(nearMissLine(over(3))).toBe("So close — 3 cards left");
    expect(nearMissLine(over(4))).toBe("");
    expect(cardsLeft(over(2))).toBe(2);
    const cleared = { ...base, columns: [[], [], [], [], [], [], []], stock: [C("clubs", 1)], over: true };
    expect(nearMissLine(cleared)).toBe("");
  });
});

describe("tomorrow's deal", () => {
  it("rounds up the hours until local midnight and stays at least 1", () => {
    const evening = new Date(2026, 9, 20, 22, 30, 0);
    expect(tomorrowDealText(evening)).toBe("Tomorrow's deal in 2h");
    const almost = new Date(2026, 9, 20, 23, 59, 0);
    expect(tomorrowDealText(almost)).toBe("Tomorrow's deal in 1h");
    const noon = new Date(2026, 9, 20, 12, 0, 0);
    expect(tomorrowDealText(noon)).toBe("Tomorrow's deal in 12h");
    expect(tomorrowDealHTML(evening)).toContain('data-testid="tomorrow-deal"');
    expect(tomorrowDealHTML(evening)).toContain("Tomorrow's deal in 2h");
  });
});

describe("daily slot", () => {
  const key = "2026-10-20";
  const finished = (state) => !!(state.won || state.over);

  it("keeps a casual game when the daily is opened and does not reset the streak", () => {
    const casual = { state: { moves: 8, seed: 4 }, history: [{ moves: 7 }], savedAt: 10 };
    const slots = takeSlots({ saved: casual, stats: { streak: 5 } }, { nested: true });
    const plan = dailyAlongsidePlan(slots.daily?.state, key, finished);
    expect(plan).toBe("deal");
    expect(abandonsStreak(casual.state, { toDaily: true })).toBe(false);
    expect(abandonsStreak(casual.state)).toBe(true);
    const parked = placeBoard(slots, { ...casual.state, daily: key, moves: 0 }, [], 20);
    expect(parked.casual.state.seed).toBe(4);
    expect(parked.daily.state.daily).toBe(key);
    expect(isDailyBoard(parked.daily.state)).toBe(true);
  });

  it("moves an old daily save into the daily slot", () => {
    const slots = takeSlots(
      { state: { daily: key, moves: 3 }, history: [], savedAt: 5 },
      { nested: false },
    );
    expect(slots.casual).toBeNull();
    expect(slots.daily.state.moves).toBe(3);
    expect(slots.active).toBe("daily");
    expect(dailyAlongsidePlan(slots.daily.state, key, finished)).toBe("resume");
  });

  it("does not treat a Grok's pick as the daily slot", () => {
    const slots = takeSlots(
      { state: { daily: key, pick: key, moves: 2 }, history: [], savedAt: 1 },
      { nested: false },
    );
    expect(slots.casual.state.pick).toBe(key);
    expect(slots.daily).toBeNull();
  });

  it("resumes today's finished daily instead of dealing over it", () => {
    expect(dailyAlongsidePlan({ daily: key, won: true, moves: 40 }, key, finished)).toBe("done");
    expect(dailyAlongsidePlan({ daily: "2026-10-19", moves: 4 }, key, finished)).toBe("deal");
  });
});

describe("personal bests", () => {
  it("notes a new best time on its own, and New best for moves or a golf score", () => {
    const first = notePersonalBest({ won: 1 }, { timeMs: 80_000, moves: 90 });
    expect(first.note).toBe("New best");
    expect(first.stats.bestTimeMs).toBe(80_000);
    expect(first.stats.fewestMoves).toBe(90);
    expect(first.stats.won).toBe(1);

    const faster = notePersonalBest(first.stats, { timeMs: 50_000, moves: 100 });
    expect(faster.note).toBe("New best time");
    expect(faster.stats.bestTimeMs).toBe(50_000);
    expect(faster.stats.fewestMoves).toBe(90);

    const shorter = notePersonalBest(faster.stats, { timeMs: 70_000, moves: 40 });
    expect(shorter.note).toBe("New best");
    expect(shorter.stats.fewestMoves).toBe(40);
    expect(shorter.stats.bestTimeMs).toBe(50_000);

    const golf = notePersonalBest({ bestScore: 4 }, { score: 2 });
    expect(golf.note).toBe("New best");
    expect(golf.stats.bestScore).toBe(2);
    const worse = notePersonalBest(golf.stats, { score: 6 });
    expect(worse.note).toBe("");
    expect(worse.stats.bestScore).toBe(2);
    expect(personalBestHTML("New best")).toContain('data-testid="new-best"');
    expect(personalBestHTML("")).toBe("");
  });
});

describe("freecell foundation glance", () => {
  it("labels each pile as n/13 and notices a pile that reaches a king", () => {
    expect(foundationCountLabel([])).toBe("0/13");
    expect(foundationCountLabel({ length: 7 })).toBe("7/13");
    const before = { foundations: [[], [], [], []] };
    const after = { foundations: [Array(13), [], Array(13), []] };
    before.foundations[2] = Array(12);
    expect(completedFoundationIndexes(before, after)).toEqual([0, 2]);
  });
});

describe("win celebration", () => {
  it("cascades on a win, and only glows when motion is reduced", () => {
    expect(winCelebration()).toMatchObject({ cascade: 16, glow: true, dim: false });
    const night = winCelebration({ bedtime: true });
    expect(night.cascade).toBeLessThan(16);
    expect(night.ms).toBeGreaterThan(winCelebration().ms);
    expect(night.dim).toBe(true);
    const still = winCelebration({ reduce: true, bedtime: true });
    expect(still.cascade).toBe(0);
    expect(still.glow).toBe(true);
    expect(celebrationHTML(still)).toContain('data-cascade="0"');
    expect(celebrationHTML(still)).not.toContain("cascade-card");
    expect(celebrationHTML(winCelebration())).toContain("cascade-card");
  });
});
