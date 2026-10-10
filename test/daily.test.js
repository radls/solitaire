import { describe, expect, it } from "vitest";
import {
  canResume,
  dailyButtonLabel,
  dailyFreeCellDeal,
  dailyOpenPlan,
  dailySeed,
  formatDailyLabel,
  frozenElapsedMs,
  nextDailyStreak,
  pickerStatsText,
  resumeText,
  todayKey,
} from "../src/daily.js";

describe("todayKey", () => {
  it("formats the local calendar day", () => {
    expect(todayKey(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
    expect(todayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(todayKey(new Date(2026, 11, 31, 12))).toBe("2026-12-31");
  });
});

describe("dailySeed", () => {
  it("is a stable uint32 for the same game and day", () => {
    const a = dailySeed("klondike", "2026-10-09");
    const b = dailySeed("klondike", "2026-10-09");
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    expect(a).toBe(3797186690);
  });

  it("changes when the day or the game changes", () => {
    const day = dailySeed("klondike", "2026-10-09");
    expect(dailySeed("klondike", "2026-10-10")).not.toBe(day);
    expect(dailySeed("golf", "2026-10-09")).not.toBe(day);
    expect(dailySeed("kings", "2026-10-09")).not.toBe(day);
    expect(dailySeed("golf", "2026-10-09")).not.toBe(dailySeed("kings", "2026-10-09"));
  });
});

describe("dailyFreeCellDeal", () => {
  it("stays inside 1..32000 and follows the day", () => {
    const deals = [];
    for (let day = 1; day <= 28; day++) {
      const key = `2026-10-${String(day).padStart(2, "0")}`;
      const deal = dailyFreeCellDeal(key);
      expect(dailyFreeCellDeal(key)).toBe(deal);
      expect(deal).toBeGreaterThanOrEqual(1);
      expect(deal).toBeLessThanOrEqual(32000);
      deals.push(deal);
    }
    expect(new Set(deals).size).toBe(deals.length);
    expect(dailyFreeCellDeal("2026-10-09")).not.toBe(dailyFreeCellDeal("2026-10-10"));
  });
});

describe("nextDailyStreak", () => {
  it("continues a streak on the next day and updates the best", () => {
    const stats = { dailyStreak: 2, dailyBest: 2, dailyLast: "2026-10-08", won: 4 };
    const next = nextDailyStreak(stats, "2026-10-09");
    expect(next).toEqual({ dailyStreak: 3, dailyBest: 3, dailyLast: "2026-10-09" });
    expect(stats.dailyStreak).toBe(2);
  });

  it("crosses a month boundary", () => {
    const next = nextDailyStreak({ dailyStreak: 4, dailyBest: 4, dailyLast: "2026-09-30" }, "2026-10-01");
    expect(next).toEqual({ dailyStreak: 5, dailyBest: 5, dailyLast: "2026-10-01" });
  });

  it("crosses a year boundary", () => {
    const next = nextDailyStreak({ dailyStreak: 6, dailyBest: 6, dailyLast: "2025-12-31" }, "2026-01-01");
    expect(next).toEqual({ dailyStreak: 7, dailyBest: 7, dailyLast: "2026-01-01" });
  });

  it("resets after a gap and keeps a higher best", () => {
    const next = nextDailyStreak({ dailyStreak: 4, dailyBest: 9, dailyLast: "2026-10-01" }, "2026-10-09");
    expect(next).toEqual({ dailyStreak: 1, dailyBest: 9, dailyLast: "2026-10-09" });
  });

  it("does not change when the same day is finished again", () => {
    const stats = { dailyStreak: 3, dailyBest: 7, dailyLast: "2026-10-09" };
    expect(nextDailyStreak(stats, "2026-10-09")).toEqual({
      dailyStreak: 3,
      dailyBest: 7,
      dailyLast: "2026-10-09",
    });
    expect(stats).toEqual({ dailyStreak: 3, dailyBest: 7, dailyLast: "2026-10-09" });
  });

  it("starts at 1 with empty stats", () => {
    expect(nextDailyStreak({}, "2026-10-09")).toEqual({
      dailyStreak: 1,
      dailyBest: 1,
      dailyLast: "2026-10-09",
    });
    expect(nextDailyStreak(null, "2026-10-09").dailyStreak).toBe(1);
  });
});

describe("dailyOpenPlan", () => {
  const key = "2026-10-09";
  const rules = {
    isFinished: (state) => !!(state.won || state.over),
    needsConfirm: (state) => state.moves > 0 && !state.won && !state.over,
  };

  it("resumes today's unfinished daily, even before the first move", () => {
    expect(dailyOpenPlan({ daily: key, moves: 0 }, key, rules)).toBe("resume");
    expect(dailyOpenPlan({ daily: key, moves: 8 }, key, rules)).toBe("resume");
  });

  it("confirms before leaving a different in-progress deal", () => {
    expect(dailyOpenPlan({ moves: 3 }, key, rules)).toBe("confirm");
    expect(dailyOpenPlan({ daily: "2026-10-08", moves: 2 }, key, rules)).toBe("confirm");
  });

  it("deals immediately when nothing is in progress", () => {
    expect(dailyOpenPlan(null, key, rules)).toBe("deal");
    expect(dailyOpenPlan({ moves: 0 }, key, rules)).toBe("deal");
    expect(dailyOpenPlan({ daily: key, moves: 20, won: true }, key, rules)).toBe("deal");
    expect(dailyOpenPlan({ moves: 4, over: true }, key, rules)).toBe("deal");
  });
});

describe("picker copy", () => {
  it("formats the daily label and empty stats", () => {
    expect(formatDailyLabel("2026-10-09")).toBe("Daily · Oct 9");
    expect(pickerStatsText("klondike", { played: 0, won: 0, streak: 0, bestStreak: 0 })).toBe("No games yet");
    expect(pickerStatsText("golf", { played: 0, cleared: 0, streak: 0, bestStreak: 0 })).toBe("No games yet");
  });

  it("uses wins or cleared, streak, best, and the daily streak", () => {
    expect(
      pickerStatsText("klondike", { played: 20, won: 12, streak: 3, bestStreak: 5, dailyStreak: 2 }),
    ).toBe("Wins 12 · Streak 3 · Best 5 · Daily 2 days");
    expect(pickerStatsText("golf", { played: 6, cleared: 4, streak: 1, bestStreak: 2 })).toBe(
      "Cleared 4 · Streak 1 · Best 2",
    );
    expect(pickerStatsText("freecell", { played: 3, won: 0, streak: 0, bestStreak: 0, dailyStreak: 1 })).toBe(
      "Wins 0 · Streak 0 · Best 0 · Daily 1 day",
    );
    expect(pickerStatsText("kings", { played: 2, won: 1, streak: 1 })).toBe("Wins 1 · Streak 1");
  });

  it("always shows the daily streak, including 0, and drops a lapsed streak", () => {
    const key = "2026-10-10";
    expect(dailyButtonLabel({ dailyStreak: 0 }, key)).toBe("Today's deal · Streak 0");
    expect(dailyButtonLabel({}, key)).toBe("Today's deal · Streak 0");
    expect(dailyButtonLabel(null, key)).toBe("Today's deal · Streak 0");
    expect(dailyButtonLabel({ dailyStreak: 2 }, key)).toBe("Today's deal · Streak 2");
    expect(dailyButtonLabel({ dailyStreak: 1, dailyLast: "2026-10-09" }, key)).toBe("Today's deal · Streak 1");
    expect(dailyButtonLabel({ dailyStreak: 3, dailyLast: key }, key)).toBe("Done today ✓ · Streak 3");
    expect(dailyButtonLabel({ dailyStreak: 0, dailyLast: key }, key)).toBe("Done today ✓ · Streak 0");
    expect(dailyButtonLabel({ dailyStreak: 4, dailyLast: "2026-10-08" }, key)).toBe("Today's deal · Streak 0");
    expect(dailyButtonLabel({ dailyStreak: 6, dailyLast: "2026-09-30" }, "2026-10-01")).toBe(
      "Today's deal · Streak 6",
    );
    expect(dailyButtonLabel({ dailyStreak: 6, dailyLast: "2026-09-29" }, "2026-10-01")).toBe(
      "Today's deal · Streak 0",
    );
    expect(dailyButtonLabel({ dailyStreak: 8, dailyLast: "2025-12-31" }, "2026-01-01")).toBe(
      "Today's deal · Streak 8",
    );
    expect(dailyButtonLabel({ dailyStreak: 8, dailyLast: "2025-12-30" }, "2026-01-01")).toBe(
      "Today's deal · Streak 0",
    );
    expect(dailyButtonLabel({ dailyStreak: 5, dailyLast: "2026-01-01" }, "2026-01-01")).toBe(
      "Done today ✓ · Streak 5",
    );
  });

  it("shows resume only for an unfinished deal that has a move", () => {
    expect(canResume({ moves: 0 })).toBe(false);
    expect(canResume({ moves: 4, won: true })).toBe(false);
    expect(canResume({ moves: 4, over: true })).toBe(false);
    expect(canResume({ moves: 41, startedAt: 1_000, pausedAt: 0 })).toBe(true);
    expect(resumeText({ moves: 41, startedAt: 1_000, pausedAt: 0 }, 1_000 + 192_000)).toBe("Resume · 3:12 · 41 moves");
    expect(resumeText({ moves: 2, startedAt: 0 }, 50_000)).toBe("Resume · 0:00 · 2 moves");
    expect(frozenElapsedMs({ startedAt: 0 }, 50_000)).toBe(0);
    expect(frozenElapsedMs({ moves: 0, startedAt: 1_000 }, 61_000)).toBe(0);
    expect(frozenElapsedMs({ moves: 0, startedAt: 1_000 }, 61_000, 2)).toBe(60_000);
    expect(frozenElapsedMs({ moves: 4, startedAt: 1_000 }, 61_000)).toBe(60_000);
  });
});
