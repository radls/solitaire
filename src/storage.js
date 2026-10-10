const KEY = "grok-solitaire-v1";
const FREECELL_KEY = "grok-solitaire:freecell";
const GOLF_KEY = "grok-solitaire:golf";
const KINGS_KEY = "grok-solitaire:kings";
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
    dailyStreak: 0,
    dailyBest: 0,
    dailyLast: null,
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
  stats: { played: 0, won: 0, streak: 0, bestStreak: 0, dailyStreak: 0, dailyBest: 0, dailyLast: null },
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
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
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
        savedAt: typeof data.savedAt === "number" ? data.savedAt : Date.now(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

const defaultGolf = () => ({
  state: null,
  history: [],
  stats: { played: 0, cleared: 0, bestScore: null, streak: 0, bestStreak: 0, dailyStreak: 0, dailyBest: 0, dailyLast: null },
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
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
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
        savedAt: typeof data.savedAt === "number" ? data.savedAt : Date.now(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

const defaultKings = () => ({
  state: null,
  history: [],
  stats: { played: 0, won: 0, streak: 0, bestStreak: 0, dailyStreak: 0, dailyBest: 0, dailyLast: null },
});

export function loadKings() {
  try {
    const raw = localStorage.getItem(KINGS_KEY);
    if (!raw) return defaultKings();
    const parsed = JSON.parse(raw);
    const history = Array.isArray(parsed.history) ? parsed.history.slice(-200) : [];
    return {
      state: parsed.state ?? null,
      history,
      stats: { ...defaultKings().stats, ...(parsed.stats ?? {}) },
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
    };
  } catch {
    return defaultKings();
  }
}

export function saveKings(data) {
  try {
    const history = Array.isArray(data.history) ? data.history.slice(-200) : [];
    localStorage.setItem(
      KINGS_KEY,
      JSON.stringify({
        state: data.state ?? null,
        history,
        stats: data.stats ?? defaultKings().stats,
        savedAt: typeof data.savedAt === "number" ? data.savedAt : Date.now(),
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

const GAMES = new Set(["klondike", "freecell", "golf", "kings"]);

function defaultPrefs() {
  return { lastGame: null, theme: "night", sound: false, installHint: null };
}

function normalizeInstallHint(value) {
  return value === "dismissed" || value === "installed" ? value : null;
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    const lastGame = GAMES.has(parsed.lastGame) ? parsed.lastGame : null;
    const theme = parsed.theme === "classic" ? "classic" : "night";
    return { lastGame, theme, sound: parsed.sound === true, installHint: normalizeInstallHint(parsed.installHint) };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(partial) {
  try {
    const prev = loadPrefs();
    const next = { ...prev, ...partial };
    if (!GAMES.has(next.lastGame)) next.lastGame = null;
    if (next.theme !== "classic") next.theme = "night";
    next.sound = next.sound === true;
    const installHint = normalizeInstallHint(next.installHint);
    const stored = { lastGame: next.lastGame, theme: next.theme, sound: next.sound };
    if (installHint) stored.installHint = installHint;
    localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
  } catch {
    /* quota / private mode */
  }
}
