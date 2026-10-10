import { elapsed } from "./game/clock.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local calendar day, `YYYY-MM-DD`. */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ""));
  if (!match) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Stable uint32 from FNV-1a over `${game}:${key}`.
 * Same day and game hash to the same seed on every device.
 */
export function dailySeed(game, key) {
  const text = `${game}:${key}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Microsoft FreeCell deal number for this day, 1..32000. */
export function dailyFreeCellDeal(key) {
  return (dailySeed("freecell", key) % 32000) + 1;
}

/**
 * Next daily streak after finishing the deal for `key`.
 * Same day is a no-op. Yesterday continues the streak. Any gap starts at 1.
 * Does not mutate `stats`.
 */
export function nextDailyStreak(stats, key) {
  const streak = Number(stats?.dailyStreak) || 0;
  const best = Number(stats?.dailyBest) || 0;
  const last = stats?.dailyLast || null;
  if (last === key) {
    return { dailyStreak: streak, dailyBest: best, dailyLast: key };
  }
  const next = last === yesterdayKey(key) ? streak + 1 : 1;
  return {
    dailyStreak: next,
    dailyBest: Math.max(best, next),
    dailyLast: key,
  };
}

/**
 * How to open a game when the player asked for today's daily.
 * `resume` keeps today's unfinished daily. `confirm` asks before abandoning
 * another in-progress deal. `deal` starts today's daily immediately.
 */
export function dailyOpenPlan(state, key, { isFinished, needsConfirm }) {
  const finished = !state || isFinished(state);
  if (!finished && state.daily === key) return "resume";
  if (state && needsConfirm(state)) return "confirm";
  return "deal";
}

/** `Daily · Oct 9` from a `YYYY-MM-DD` key. */
export function formatDailyLabel(key) {
  const parts = String(key ?? "").split("-");
  const month = MONTHS[(Number(parts[1]) || 1) - 1] || "";
  const day = Number(parts[2]) || 0;
  return `Daily · ${month} ${day}`;
}

export function seedStatusText(state, fallback = "") {
  if (state?.daily) return formatDailyLabel(state.daily);
  return fallback;
}

export function dailyDoneText(streak) {
  const n = Number(streak) || 0;
  const unit = n === 1 ? "day" : "days";
  return `Today's deal done · ${n} ${unit} in a row`;
}

export function pickerStatsText(game, stats) {
  const played = stats?.played || 0;
  const wins = game === "golf" ? stats?.cleared || 0 : stats?.won || 0;
  const streak = stats?.streak || 0;
  let line;
  if (played === 0 && wins === 0) {
    line = "No games yet";
  } else {
    const parts = game === "golf" ? [`Cleared ${wins}`, `Streak ${streak}`] : [`Wins ${wins}`, `Streak ${streak}`];
    if (stats && stats.bestStreak != null) parts.push(`Best ${stats.bestStreak}`);
    line = parts.join(" · ");
  }
  const daily = stats?.dailyStreak || 0;
  if (daily >= 1) {
    const unit = daily === 1 ? "day" : "days";
    line = `${line} · Daily ${daily} ${unit}`;
  }
  return line;
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Elapsed time frozen at save. A deal that never started is 0. */
export function frozenElapsedMs(state, savedAt) {
  if (!state?.startedAt) return 0;
  const at = typeof savedAt === "number" ? savedAt : state.startedAt;
  return elapsed(state, at);
}

export function resumeText(state, savedAt) {
  const moves = state?.moves || 0;
  const word = moves === 1 ? "move" : "moves";
  return `Resume · ${formatClock(frozenElapsedMs(state, savedAt))} · ${moves} ${word}`;
}

export function canResume(state) {
  if (!state || !(state.moves > 0)) return false;
  if (state.won || state.over) return false;
  return true;
}
