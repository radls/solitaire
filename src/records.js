/** Lower is better. A missing previous record counts as a first best. */
export function judgeBest(previous, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { value: previous ?? null, improved: false };
  if (previous == null || previous === "") return { value: n, improved: true };
  const prev = Number(previous);
  if (!Number.isFinite(prev) || n < prev) return { value: n, improved: true };
  return { value: prev, improved: false };
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
    const judged = judgeBest(next.bestScore ?? null, score);
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
