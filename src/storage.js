const KEY = "grok-solitaire-v1";
const FREECELL_KEY = "grok-solitaire:freecell";
const GOLF_KEY = "grok-solitaire:golf";
const PREFS_KEY = "grok-solitaire:prefs";

const defaultData = () => ({
  drawCount: 1,
  muted: true,
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

const defaultFreeCell = () => ({
  state: null,
  history: [],
  stats: { played: 0, won: 0 },
});

export function loadFreeCell() {
  try {
    const raw = localStorage.getItem(FREECELL_KEY);
    if (!raw) return defaultFreeCell();
    const parsed = JSON.parse(raw);
    const history = Array.isArray(parsed.history) ? parsed.history.slice(-200) : [];
    return {
      state: parsed.state ?? null,
      history,
      stats: { ...defaultFreeCell().stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return defaultFreeCell();
  }
}

export function saveFreeCell(data) {
  try {
    const history = Array.isArray(data.history) ? data.history.slice(-200) : [];
    localStorage.setItem(
      FREECELL_KEY,
      JSON.stringify({
        state: data.state ?? null,
        history,
        stats: data.stats ?? defaultFreeCell().stats,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

const defaultGolf = () => ({
  state: null,
  history: [],
  stats: { played: 0, cleared: 0, bestScore: null },
});

export function loadGolf() {
  try {
    const raw = localStorage.getItem(GOLF_KEY);
    if (!raw) return defaultGolf();
    const parsed = JSON.parse(raw);
    const history = Array.isArray(parsed.history) ? parsed.history.slice(-200) : [];
    return {
      state: parsed.state ?? null,
      history,
      stats: { ...defaultGolf().stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return defaultGolf();
  }
}

export function saveGolf(data) {
  try {
    const history = Array.isArray(data.history) ? data.history.slice(-200) : [];
    localStorage.setItem(
      GOLF_KEY,
      JSON.stringify({
        state: data.state ?? null,
        history,
        stats: { ...defaultGolf().stats, ...(data.stats ?? {}) },
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { lastGame: null };
    const parsed = JSON.parse(raw);
    return { lastGame: parsed.lastGame ?? null };
  } catch {
    return { lastGame: null };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ lastGame: prefs.lastGame ?? null }));
  } catch {
    /* quota / private mode */
  }
}
