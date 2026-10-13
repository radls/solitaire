import { dailyOpenPlan } from "./daily.js";
import { GROKS_PICK } from "./groks-pick-data.js";

export const PICK_GAME_NAMES = {
  klondike: "Klondike",
  freecell: "FreeCell",
  golf: "Golf",
  kings: "King's Corners",
};

/** Today's Grok's pick, or null when the date is outside the list. */
export function pickForDate(key, data = GROKS_PICK) {
  if (typeof key !== "string" || !Array.isArray(data)) return null;
  for (const entry of data) {
    if (entry && entry.date === key) return entry;
  }
  return null;
}

/**
 * True when a finished game meets the goal.
 * `result.won` is a win, or a completed Golf round.
 */
export function evaluateGoal(goal, result) {
  if (!goal || typeof goal !== "object") return false;
  if (!result || result.won !== true) return false;
  if (goal.type === "noUndo") return result.undoUsed !== true;
  if (goal.type === "maxMoves") return underNumber(result.moves, goal.n);
  if (goal.type === "maxMinutes") return underNumber(result.elapsedMs, Number(goal.n) * 60 * 1000);
  if (goal.type === "golfUnder") return underNumber(result.cardsLeft, goal.n);
  return false;
}

function underNumber(value, limit) {
  const left = Number(value);
  const right = Number(limit);
  return Number.isFinite(left) && Number.isFinite(right) && left < right;
}

/** Quiet win-screen line for a pick. Does not write storage. */
export function formatPickResult(entry, result) {
  if (!entry) return null;
  const met = evaluateGoal(entry.goal, result);
  const text = met ? "Grok's pick done ✓" : `Goal missed: ${entry.text}`;
  return {
    met,
    text,
    html: `<p class="pick-result" data-testid="pick-result">${text}</p>`,
  };
}

/**
 * Resume / confirm / deal for a pick, using the daily plan.
 * An unfinished board resumes only when `state.pick` is this date.
 */
export function pickOpenPlan(state, key, rules) {
  if (!state) return dailyOpenPlan(null, key, rules);
  const daily = state.pick === key ? key : state.daily === key ? null : state.daily;
  return dailyOpenPlan({ ...state, daily }, key, rules);
}
