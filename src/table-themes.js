/** Table surface themes. Phase 2 ships classic-felt plus six more. */

export const TABLE_STORAGE_KEY = "grok-solitaire:table";
export const DEFAULT_TABLE_ID = "classic-felt";

/**
 * Surface tokens for each color scheme.
 * Ivory is not a table token (card faces stay the same in every theme); it is
 * recorded so contrast can be checked against the surface the cards sit on.
 * themeColor is the browser chrome meta color for that scheme.
 */
export const TABLE_THEMES = [
  {
    id: "classic-felt",
    name: "Classic felt",
    schemes: {
      classic: {
        felt: "#14633f",
        feltDeep: "#0a3324",
        feltInk: "#07281c",
        gold: "#d4b46a",
        ivory: "#fbf6ea",
        themeColor: "#0a3324",
      },
      night: {
        felt: "#121a17",
        feltDeep: "#0c1110",
        feltInk: "#080c0b",
        gold: "#9c8a5c",
        ivory: "#bfb8a8",
        themeColor: "#080c0b",
      },
    },
  },
  {
    id: "pub-fire",
    name: "Pub table by the fire",
    schemes: {
      classic: {
        felt: "#3b2416",
        feltDeep: "#24150d",
        feltInk: "#160e08",
        gold: "#c98a3c",
        ivory: "#fbf6ea",
        themeColor: "#24150d",
      },
      night: {
        felt: "#24160e",
        feltDeep: "#160e09",
        feltInk: "#0e0906",
        gold: "#b18043",
        ivory: "#bfb8a8",
        themeColor: "#160e09",
      },
    },
  },
  {
    id: "coffee-shop",
    name: "Coffee shop",
    schemes: {
      classic: {
        felt: "#3e2a1d",
        feltDeep: "#2a1c14",
        feltInk: "#1c120c",
        gold: "#d4c4a0",
        ivory: "#fbf6ea",
        themeColor: "#2a1c14",
      },
      night: {
        felt: "#20140e",
        feltDeep: "#160e0a",
        feltInk: "#0e0906",
        gold: "#b19043",
        ivory: "#bfb8a8",
        themeColor: "#160e0a",
      },
    },
  },
  {
    id: "library-desk",
    name: "Library desk",
    schemes: {
      classic: {
        felt: "#5a1f1f",
        feltDeep: "#3c1414",
        feltInk: "#2a0c0c",
        gold: "#b8954a",
        ivory: "#fbf6ea",
        themeColor: "#3c1414",
      },
      night: {
        felt: "#2e1010",
        feltDeep: "#1e0a0a",
        feltInk: "#140606",
        gold: "#a58541",
        ivory: "#bfb8a8",
        themeColor: "#1e0a0a",
      },
    },
  },
  {
    id: "train-dining",
    name: "Train dining car",
    schemes: {
      classic: {
        felt: "#1d2a44",
        feltDeep: "#12182c",
        feltInk: "#0c101c",
        gold: "#b08d57",
        ivory: "#fbf6ea",
        themeColor: "#12182c",
      },
      night: {
        felt: "#12182c",
        feltDeep: "#0c1020",
        feltInk: "#080a14",
        gold: "#b18643",
        ivory: "#bfb8a8",
        themeColor: "#0c1020",
      },
    },
  },
  {
    id: "beach-cabana",
    name: "Beach cabana",
    schemes: {
      classic: {
        felt: "#4f3922",
        feltDeep: "#3a2a18",
        feltInk: "#241a10",
        gold: "#c9b07a",
        ivory: "#fbf6ea",
        themeColor: "#3a2a18",
      },
      night: {
        felt: "#1e262c",
        feltDeep: "#141a20",
        feltInk: "#0c1014",
        gold: "#a38542",
        ivory: "#bfb8a8",
        themeColor: "#141a20",
      },
    },
  },
  {
    id: "midnight-casino",
    name: "Midnight casino",
    schemes: {
      classic: {
        felt: "#4a0f1c",
        feltDeep: "#2a0810",
        feltInk: "#1a0508",
        gold: "#d4b46a",
        ivory: "#fbf6ea",
        themeColor: "#2a0810",
      },
      night: {
        felt: "#1a060a",
        feltDeep: "#100406",
        feltInk: "#0a0204",
        gold: "#b18f43",
        ivory: "#bfb8a8",
        themeColor: "#100406",
      },
    },
  },
];

const themesById = new Map(TABLE_THEMES.map((theme) => [theme.id, theme]));

export function listTableThemes() {
  return TABLE_THEMES.slice();
}

export function getTableTheme(id) {
  return themesById.get(id) ?? themesById.get(DEFAULT_TABLE_ID);
}

export function themeColorFor(id, scheme = "classic") {
  const theme = getTableTheme(id);
  const key = scheme === "night" ? "night" : "classic";
  return theme.schemes[key].themeColor;
}

export const TABLE_RANDOM = "random";
export const TABLE_LAST_KEY = "grok-solitaire:table-last";
export const TABLE_NOTE_KEY = "grok-solitaire:table-note";
export const TABLE_NOTE_PENDING = "pending";
export const TABLE_NOTE_DISMISSED = "dismissed";

/** Prefs or a saved game means this is a returning player, not a first visit. */
export const TABLE_PRIOR_KEYS = [
  "grok-solitaire:prefs",
  "grok-solitaire-v1",
  "grok-solitaire:freecell",
  "grok-solitaire:golf",
  "grok-solitaire:kings",
];

export function isTableId(id) {
  return themesById.has(id);
}

export function hasPriorPlayerData(storage) {
  if (!storage?.getItem) return false;
  return TABLE_PRIOR_KEYS.some((key) => {
    try {
      return !!storage.getItem(key);
    } catch {
      return false;
    }
  });
}

/** `random`, a theme id, or null when the key has never been written. */
export function readTablePreference(storage) {
  if (!storage?.getItem) return null;
  try {
    const raw = storage.getItem(TABLE_STORAGE_KEY);
    if (raw == null) return null;
    if (raw === TABLE_RANDOM) return TABLE_RANDOM;
    if (isTableId(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

export function writeTablePreference(value, storage) {
  if (!storage?.setItem) return value;
  const next = value === TABLE_RANDOM || isTableId(value) ? value : TABLE_RANDOM;
  try {
    storage.setItem(TABLE_STORAGE_KEY, next);
  } catch {
    /* quota / private mode */
  }
  return next;
}

function writeLastTable(id, storage) {
  if (!storage?.setItem || !isTableId(id)) return;
  try {
    storage.setItem(TABLE_LAST_KEY, id);
  } catch {
    /* quota / private mode */
  }
}

export function shouldShowTableNote(storage) {
  try {
    return storage?.getItem?.(TABLE_NOTE_KEY) === TABLE_NOTE_PENDING;
  } catch {
    return false;
  }
}

export function dismissTableNote(storage) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(TABLE_NOTE_KEY, TABLE_NOTE_DISMISSED);
  } catch {
    /* quota / private mode */
  }
}

/**
 * First visit after this feature: existing players are pinned to classic-felt
 * and shown the opt-in note. New players default to Random.
 */
export function ensureTablePreference(storage) {
  const existing = readTablePreference(storage);
  if (existing) return existing;
  if (hasPriorPlayerData(storage)) {
    try {
      if (storage.getItem(TABLE_NOTE_KEY) !== TABLE_NOTE_DISMISSED) {
        storage.setItem(TABLE_NOTE_KEY, TABLE_NOTE_PENDING);
      }
    } catch {
      /* quota / private mode */
    }
    return writeTablePreference(DEFAULT_TABLE_ID, storage);
  }
  return writeTablePreference(TABLE_RANDOM, storage);
}

function pickRandomTable(storage, rng) {
  let last = null;
  try {
    last = storage?.getItem?.(TABLE_LAST_KEY) ?? null;
  } catch {
    last = null;
  }
  const ids = TABLE_THEMES.map((theme) => theme.id);
  const pool = ids.filter((id) => id !== last);
  const choices = pool.length ? pool : ids;
  let i = Math.floor(Number(rng()) * choices.length);
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i >= choices.length) i = choices.length - 1;
  return choices[i];
}

/**
 * One theme per page load. Random never repeats the last id. A pin always wins.
 */
export function pickSessionTable({ storage = globalThis.localStorage, rng = Math.random } = {}) {
  if (!storage) return DEFAULT_TABLE_ID;
  const pref = ensureTablePreference(storage);
  const id = pref === TABLE_RANDOM ? pickRandomTable(storage, rng) : pref;
  const theme = getTableTheme(id);
  writeLastTable(theme.id, storage);
  return theme.id;
}

export function applyTableTheme(id, root = globalThis.document?.documentElement) {
  const theme = getTableTheme(id);
  root?.setAttribute?.("data-table", theme.id);
  const doc = root?.ownerDocument ?? globalThis.document;
  const scheme = root?.getAttribute?.("data-theme") === "night" ? "night" : "classic";
  const meta = doc?.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColorFor(theme.id, scheme));
  return theme.id;
}

export function tableSettingsHTML(pref, currentId) {
  const selected = pref === TABLE_RANDOM || isTableId(pref) ? pref : TABLE_RANDOM;
  const options = [
    `<option value="${TABLE_RANDOM}"${selected === TABLE_RANDOM ? " selected" : ""}>Random</option>`,
    ...TABLE_THEMES.map((theme) => {
      const isOn = selected === theme.id;
      return `<option value="${theme.id}"${isOn ? " selected" : ""}>${theme.name}</option>`;
    }),
  ];
  const current = getTableTheme(currentId).name;
  return `<div class="table-pref" data-testid="table-settings">
      <label for="table-select">Table</label>
      <select id="table-select" data-testid="table-select" aria-label="Table theme">${options.join("")}</select>
      <span class="table-pref-now" data-testid="table-current">${current}</span>
    </div>`;
}

export function tableThemesNoteHTML(storage) {
  if (!shouldShowTableNote(storage)) return "";
  return `<div class="table-themes-note" data-testid="table-themes-note">
      <p>New: table themes</p>
      <button type="button" class="btn" data-testid="table-themes-random">Try a random table</button>
      <button type="button" class="icon-btn" data-testid="table-themes-dismiss" aria-label="Dismiss">×</button>
    </div>`;
}
