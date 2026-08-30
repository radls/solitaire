const KEY = "grok-solitaire-v1";

const defaultData = () => ({
  drawCount: 1,
  muted: false,
  stats: {
    played: 0,
    won: 0,
    streak: 0,
    bestStreak: 0,
    bestTimeMs: null,
    fewestMoves: null,
  },
  saved: null,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      ...defaultData(),
      ...parsed,
      stats: { ...defaultData().stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return defaultData();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}
