import { describe, expect, it } from "vitest";
import { dailyFreeCellDeal, dailySeed } from "../src/daily.js";
import { deal as dealFreeCell, listLegalMoves as listFreeCell } from "../src/game/freecell.js";
import { deal as dealGolf, listLegalMoves as listGolf } from "../src/game/golf.js";
import { MOVE_GOAL, deal as dealKings, listLegalMoves as listKings } from "../src/game/kings.js";
import { deal as dealKlondike, isStuck, listLegalMoves as listKlondike } from "../src/game/klondike.js";
import { GROKS_PICK } from "../src/groks-pick-data.js";
import { evaluateGoal, pickForDate, pickOpenPlan } from "../src/groks-pick.js";

const GAMES = ["klondike", "freecell", "golf", "kings"];

function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function openingPlayable(game, seed) {
  if (game === "klondike") {
    const state = dealKlondike({ seed, drawCount: 1 });
    return listKlondike(state).length > 0 && !isStuck(state);
  }
  if (game === "freecell") {
    const state = dealFreeCell(seed);
    return listFreeCell(state).length > 0;
  }
  if (game === "golf") {
    const state = dealGolf({ seed });
    return listGolf(state).length > 0;
  }
  if (game === "kings") {
    const state = dealKings({ seed });
    return listKings(state).length > 0 && state.stuck !== true;
  }
  return false;
}

function expectedText(goal) {
  if (goal.type === "noUndo") return "Win with no Undo";
  if (goal.type === "maxMoves") return `Win in under ${goal.n} moves`;
  if (goal.type === "maxMinutes") return `Win in under ${goal.n} minutes`;
  if (goal.type === "golfUnder") return `Golf: finish with under ${goal.n} cards left`;
  return "";
}

describe("GROKS_PICK", () => {
  it("lists at least 60 consecutive days from 2026-10-13", () => {
    expect(GROKS_PICK.length).toBeGreaterThanOrEqual(60);
    expect(GROKS_PICK[0].date).toBe("2026-10-13");
    for (let i = 0; i < GROKS_PICK.length; i++) {
      expect(GROKS_PICK[i].date).toBe(addDays("2026-10-13", i));
    }
  });

  it("rotates valid games and keeps a non-empty goal", () => {
    for (let i = 0; i < GROKS_PICK.length; i++) {
      const entry = GROKS_PICK[i];
      expect(GAMES).toContain(entry.game);
      expect(entry.game).toBe(GAMES[i % 4]);
      expect(typeof entry.text).toBe("string");
      expect(entry.text.length).toBeGreaterThan(0);
      expect(entry.text).toBe(expectedText(entry.goal));
      if (entry.goal.type === "golfUnder") {
        expect(entry.game).toBe("golf");
        expect(entry.goal.n).toBeGreaterThanOrEqual(5);
        expect(entry.goal.n).toBeLessThanOrEqual(8);
      }
      if (entry.goal.type === "maxMoves") {
        const n = entry.game === "klondike" ? 160 : entry.game === "kings" ? MOVE_GOAL : 120;
        expect(entry.goal.n).toBe(n);
        expect(entry.game).not.toBe("golf");
      }
      if (entry.goal.type === "maxMinutes") {
        expect(entry.goal.n).toBeGreaterThanOrEqual(10);
        expect(entry.goal.n).toBeLessThanOrEqual(15);
      }
    }
  });

  it("rechecks every seed with the opening playable rules", () => {
    for (const entry of GROKS_PICK) {
      let seed = entry.game === "freecell" ? dailyFreeCellDeal(entry.date) : dailySeed(entry.game, entry.date);
      let steps = 0;
      while (!openingPlayable(entry.game, seed)) {
        seed = entry.game === "freecell" ? (seed >= 32000 ? 1 : seed + 1) : (seed + 1) >>> 0;
        steps += 1;
        expect(steps).toBeLessThan(400);
      }
      expect(entry.seed).toBe(seed);
      expect(openingPlayable(entry.game, entry.seed)).toBe(true);
    }
  }, 20000);
});

describe("pickForDate", () => {
  it("returns the entry for a listed day and null outside the list", () => {
    expect(pickForDate("2026-10-13")).toEqual(GROKS_PICK[0]);
    expect(pickForDate(GROKS_PICK.at(-1).date)).toEqual(GROKS_PICK.at(-1));
    expect(pickForDate("2026-10-12")).toBe(null);
    expect(pickForDate(addDays(GROKS_PICK.at(-1).date, 1))).toBe(null);
    expect(pickForDate("2099-01-01")).toBe(null);
    expect(pickForDate("")).toBe(null);
    expect(pickForDate(null)).toBe(null);
  });

  it("reads a caller-supplied list", () => {
    const data = [{ date: "2026-01-02", game: "golf", seed: 1, goal: { type: "noUndo" }, text: "Win with no Undo" }];
    expect(pickForDate("2026-01-02", data)).toBe(data[0]);
    expect(pickForDate("2026-01-03", data)).toBe(null);
    expect(pickForDate("2026-10-13", [])).toBe(null);
  });
});

describe("evaluateGoal", () => {
  const base = { won: true, moves: 10, elapsedMs: 60_000, undoUsed: false, cardsLeft: 2 };

  it("noUndo passes without an undo, fails after one, and fails when the game is not won", () => {
    expect(evaluateGoal({ type: "noUndo" }, { ...base, undoUsed: false })).toBe(true);
    expect(evaluateGoal({ type: "noUndo" }, { ...base, undoUsed: undefined })).toBe(true);
    expect(evaluateGoal({ type: "noUndo" }, { ...base, undoUsed: true })).toBe(false);
    expect(evaluateGoal({ type: "noUndo" }, { ...base, won: false, undoUsed: false })).toBe(false);
  });

  it("maxMoves is strictly under n", () => {
    expect(evaluateGoal({ type: "maxMoves", n: 160 }, { ...base, moves: 159 })).toBe(true);
    expect(evaluateGoal({ type: "maxMoves", n: 120 }, { ...base, moves: 119 })).toBe(true);
    expect(evaluateGoal({ type: "maxMoves", n: 160 }, { ...base, moves: 160 })).toBe(false);
    expect(evaluateGoal({ type: "maxMoves", n: 160 }, { ...base, moves: 161 })).toBe(false);
    expect(evaluateGoal({ type: "maxMoves", n: 160 }, { ...base, won: false, moves: 1 })).toBe(false);
  });

  it("maxMinutes is strictly under n minutes", () => {
    expect(evaluateGoal({ type: "maxMinutes", n: 10 }, { ...base, elapsedMs: 10 * 60 * 1000 - 1 })).toBe(true);
    expect(evaluateGoal({ type: "maxMinutes", n: 15 }, { ...base, elapsedMs: 14 * 60 * 1000 })).toBe(true);
    expect(evaluateGoal({ type: "maxMinutes", n: 10 }, { ...base, elapsedMs: 10 * 60 * 1000 })).toBe(false);
    expect(evaluateGoal({ type: "maxMinutes", n: 10 }, { ...base, elapsedMs: 11 * 60 * 1000 })).toBe(false);
    expect(evaluateGoal({ type: "maxMinutes", n: 10 }, { ...base, won: false, elapsedMs: 0 })).toBe(false);
  });

  it("golfUnder is strictly under n cards left and still requires a finished round", () => {
    expect(evaluateGoal({ type: "golfUnder", n: 5 }, { ...base, cardsLeft: 4 })).toBe(true);
    expect(evaluateGoal({ type: "golfUnder", n: 8 }, { ...base, cardsLeft: 0 })).toBe(true);
    expect(evaluateGoal({ type: "golfUnder", n: 5 }, { ...base, cardsLeft: 5 })).toBe(false);
    expect(evaluateGoal({ type: "golfUnder", n: 5 }, { ...base, cardsLeft: 9 })).toBe(false);
    expect(evaluateGoal({ type: "golfUnder", n: 5 }, { ...base, won: false, cardsLeft: 0 })).toBe(false);
  });

  it("rejects a missing result or an unknown goal", () => {
    expect(evaluateGoal({ type: "noUndo" }, null)).toBe(false);
    expect(evaluateGoal({ type: "noUndo" }, undefined)).toBe(false);
    expect(evaluateGoal(null, base)).toBe(false);
    expect(evaluateGoal({ type: "other" }, base)).toBe(false);
  });
});

describe("pickOpenPlan", () => {
  const key = "2026-10-13";
  const rules = {
    isFinished: (state) => !!(state.won || state.over),
    needsConfirm: (state) => state.moves > 0 && !state.won && !state.over,
  };

  it("resumes today's unfinished pick and confirms a different in-progress deal", () => {
    expect(pickOpenPlan({ pick: key, daily: key, moves: 4 }, key, rules)).toBe("resume");
    expect(pickOpenPlan({ pick: key, moves: 0 }, key, rules)).toBe("resume");
    expect(pickOpenPlan({ daily: key, moves: 3 }, key, rules)).toBe("confirm");
    expect(pickOpenPlan({ moves: 2 }, key, rules)).toBe("confirm");
    expect(pickOpenPlan(null, key, rules)).toBe("deal");
    expect(pickOpenPlan({ pick: key, moves: 8, won: true }, key, rules)).toBe("deal");
  });
});
