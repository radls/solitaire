/**
 * A stored record, or null when it is missing.
 * Moves and time below 0 are corrupt. Golf scores may be negative or zero.
 */
function storedNumber(value, allowNegative) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!allowNegative && n < 0) return null;
  return n;
}

/** Lower is better. A missing previous record counts as a first best. */
export function judgeBest(previous, value, { allowNegative = false } = {}) {
  const n = storedNumber(value, allowNegative);
  const prev = storedNumber(previous, allowNegative);
  if (n == null) return { value: prev, improved: false };
  if (prev == null || n < prev) return { value: n, improved: true };
  return { value: prev, improved: false };
}

/** Non-numeric streaks (a corrupt "x") are 0 so the next win is 1, not "x1". */
export function coerceStreak(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function bumpWinStreak(stats) {
  const streak = coerceStreak(stats?.streak) + 1;
  const bestStreak = Math.max(coerceStreak(stats?.bestStreak), streak);
  return { streak, bestStreak };
}

/**
 * Copy best fields onto a stats object.
 * Time alone reads "New best time". Moves, Golf score, or more than one read "New best".
 */
export function notePersonalBest(stats, { timeMs, moves, score } = {}) {
  const next = { ...(stats || {}) };
  const kinds = [];
  if (timeMs != null) {
    const judged = judgeBest(next.bestTimeMs ?? null, timeMs);
    next.bestTimeMs = judged.value;
    if (judged.improved) kinds.push("time");
  }
  if (moves != null) {
    const judged = judgeBest(next.fewestMoves ?? null, moves);
    next.fewestMoves = judged.value;
    if (judged.improved) kinds.push("moves");
  }
  if (score != null) {
    const judged = judgeBest(next.bestScore ?? null, score, { allowNegative: true });
    next.bestScore = judged.value;
    if (judged.improved) kinds.push("score");
  }
  let note = "";
  if (kinds.length === 1 && kinds[0] === "time") note = "New best time";
  else if (kinds.length > 0) note = "New best";
  return { stats: next, note };
}

export function personalBestHTML(note) {
  if (!note) return "";
  return `<p class="new-best" data-testid="new-best">${note}</p>`;
}
