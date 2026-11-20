import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE_ID,
  TABLE_LAST_KEY,
  TABLE_NOTE_DISMISSED,
  TABLE_NOTE_KEY,
  TABLE_NOTE_PENDING,
  TABLE_PRIOR_KEYS,
  TABLE_RANDOM,
  TABLE_STORAGE_KEY,
  TABLE_THEMES,
  applyTableTheme,
  dismissTableNote,
  ensureTablePreference,
  getTableTheme,
  hasPriorPlayerData,
  listTableThemes,
  pickSessionTable,
  readTablePreference,
  shouldShowTableNote,
  tableSettingsHTML,
  tableThemesNoteHTML,
  themeColorFor,
  writeTablePreference,
} from "../src/table-themes.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/styles.css"), "utf8");

/** WCAG 2 relative luminance. */
export function relativeLuminance(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`expected #rrggbb, got ${hex}`);
  const channel = (start) => {
    const v = parseInt(h.slice(start, start + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ruleBody(selector) {
  const needle = `${selector} {`;
  const start = css.indexOf(needle);
  if (start < 0) throw new Error(`missing CSS rule ${selector}`);
  let i = start + needle.length;
  let depth = 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    i += 1;
  }
  return css.slice(start + needle.length, i - 1);
}

function cssVar(body, name) {
  const match = body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match?.[1].trim() ?? null;
}

// Shipped v1.2.0 classic felt vs ivory is just under 7:1. Phase 1 must not
// change the color; new themes and the Bedtime variant still need 7:1.
const CLASSIC_FELT_IVORY_FLOOR = 6.74;

describe("table theme registry", () => {
  it("defaults to classic-felt and keeps a storage key for phase 2", () => {
    expect(DEFAULT_TABLE_ID).toBe("classic-felt");
    expect(TABLE_STORAGE_KEY).toBe("grok-solitaire:table");
    expect(pickSessionTable()).toBe("classic-felt");
    expect(listTableThemes().map((t) => t.id)).toEqual([
      "classic-felt",
      "pub-fire",
      "coffee-shop",
      "library-desk",
      "train-dining",
      "beach-cabana",
      "midnight-casino",
    ]);
    expect(getTableTheme("missing").id).toBe("classic-felt");
  });

  it("applyTableTheme sets data-table, falling back to classic-felt", () => {
    const attrs = {};
    const root = {
      setAttribute(name, value) {
        attrs[name] = value;
      },
    };
    expect(applyTableTheme("classic-felt", root)).toBe("classic-felt");
    expect(attrs["data-table"]).toBe("classic-felt");
    expect(applyTableTheme("nope", root)).toBe("classic-felt");
    expect(attrs["data-table"]).toBe("classic-felt");
    expect(themeColorFor("classic-felt", "classic")).toBe("#0a3324");
    expect(themeColorFor("classic-felt", "night")).toBe("#080c0b");
    expect(themeColorFor("midnight-casino", "classic")).toBe("#2a0810");
  });
});

describe("table theme contrast", () => {
  it("checks --felt vs --ivory and --gold vs --felt for every theme", () => {
    expect(TABLE_THEMES.length).toBeGreaterThanOrEqual(1);
    for (const theme of TABLE_THEMES) {
      for (const scheme of ["classic", "night"]) {
        const tokens = theme.schemes[scheme];
        expect(tokens, `${theme.id} ${scheme}`).toBeTruthy();
        const feltIvory = contrastRatio(tokens.felt, tokens.ivory);
        const goldFelt = contrastRatio(tokens.gold, tokens.felt);
        const feltIvoryMin =
          theme.id === "classic-felt" && scheme === "classic" ? CLASSIC_FELT_IVORY_FLOOR : 7;
        expect(feltIvory, `${theme.id} ${scheme} felt vs ivory (${feltIvory.toFixed(3)}:1)`).toBeGreaterThanOrEqual(
          feltIvoryMin,
        );
        expect(goldFelt, `${theme.id} ${scheme} gold vs felt (${goldFelt.toFixed(3)}:1)`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("table theme CSS", () => {
  it("matches the registry and defines --table-bg for every theme", () => {
    expect(TABLE_THEMES.length).toBe(7);
    for (const theme of TABLE_THEMES) {
      const classicBody = ruleBody(`html[data-table="${theme.id}"]`);
      const nightBody = ruleBody(`html[data-table="${theme.id}"][data-theme="night"]`);
      for (const [body, tokens] of [
        [classicBody, theme.schemes.classic],
        [nightBody, theme.schemes.night],
      ]) {
        expect(cssVar(body, "--felt"), `${theme.id} felt`).toBe(tokens.felt);
        expect(cssVar(body, "--felt-deep"), `${theme.id} felt-deep`).toBe(tokens.feltDeep);
        expect(cssVar(body, "--felt-ink"), `${theme.id} felt-ink`).toBe(tokens.feltInk);
        expect(cssVar(body, "--gold"), `${theme.id} gold`).toBe(tokens.gold);
        expect(cssVar(body, "--table-bg"), `${theme.id} table-bg`).toBeTruthy();
      }
    }
    expect(cssVar(ruleBody('html[data-table="classic-felt"]'), "--table-bg")).toMatch(/radial-gradient/);
    expect(cssVar(ruleBody('html[data-table="classic-felt"][data-theme="night"]'), "--table-bg")).toBe("var(--felt)");
    expect(css).toMatch(/#app\s*\{[^}]*background:\s*var\(--table-bg\)/s);
  });
});


function memoryStore(init = {}) {
  const store = { ...init };
  return {
    store,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  };
}

describe("table picker, pin and migration", () => {
  it("defaults a new player to Random and remembers the pick", () => {
    const storage = memoryStore();
    expect(hasPriorPlayerData(storage)).toBe(false);
    const id = pickSessionTable({ storage, rng: () => 0 });
    expect(storage.store[TABLE_STORAGE_KEY]).toBe(TABLE_RANDOM);
    expect(id).toBe("classic-felt");
    expect(storage.store[TABLE_LAST_KEY]).toBe("classic-felt");
    expect(shouldShowTableNote(storage)).toBe(false);
  });

  it("does not pick the last theme again under Random", () => {
    const storage = memoryStore({
      [TABLE_STORAGE_KEY]: TABLE_RANDOM,
      [TABLE_LAST_KEY]: "classic-felt",
    });
    const id = pickSessionTable({ storage, rng: () => 0 });
    expect(id).toBe("pub-fire");
    expect(id).not.toBe("classic-felt");
    expect(storage.store[TABLE_LAST_KEY]).toBe("pub-fire");
    const again = pickSessionTable({ storage, rng: () => 0 });
    expect(again).toBe("classic-felt");
  });

  it("keeps a pinned theme", () => {
    const storage = memoryStore({ [TABLE_STORAGE_KEY]: "library-desk" });
    expect(pickSessionTable({ storage, rng: () => 0 })).toBe("library-desk");
    expect(pickSessionTable({ storage, rng: () => 0.99 })).toBe("library-desk");
    expect(writeTablePreference("beach-cabana", storage)).toBe("beach-cabana");
    expect(readTablePreference(storage)).toBe("beach-cabana");
    expect(pickSessionTable({ storage })).toBe("beach-cabana");
  });

  it("pins returning players to classic-felt and shows the opt-in note", () => {
    expect(TABLE_PRIOR_KEYS.length).toBe(5);
    const viaPrefs = memoryStore({ "grok-solitaire:prefs": JSON.stringify({ theme: "classic" }) });
    expect(hasPriorPlayerData(viaPrefs)).toBe(true);
    expect(ensureTablePreference(viaPrefs)).toBe("classic-felt");
    expect(viaPrefs.store[TABLE_STORAGE_KEY]).toBe("classic-felt");
    expect(shouldShowTableNote(viaPrefs)).toBe(true);
    expect(tableThemesNoteHTML(viaPrefs)).toContain("New: table themes");
    expect(tableThemesNoteHTML(viaPrefs)).toContain("table-themes-random");

    const viaSave = memoryStore({ "grok-solitaire-v1": "{}" });
    expect(pickSessionTable({ storage: viaSave })).toBe("classic-felt");
    expect(shouldShowTableNote(viaSave)).toBe(true);

    dismissTableNote(viaPrefs);
    expect(shouldShowTableNote(viaPrefs)).toBe(false);
    expect(tableThemesNoteHTML(viaPrefs)).toBe("");
    expect(ensureTablePreference(viaPrefs)).toBe("classic-felt");
    expect(viaPrefs.store[TABLE_NOTE_KEY]).toBe(TABLE_NOTE_DISMISSED);
  });

  it("does not revive a dismissed note or overwrite an existing pref", () => {
    const storage = memoryStore({
      "grok-solitaire:prefs": JSON.stringify({ theme: "night" }),
      [TABLE_STORAGE_KEY]: TABLE_RANDOM,
      [TABLE_NOTE_KEY]: TABLE_NOTE_DISMISSED,
    });
    expect(ensureTablePreference(storage)).toBe(TABLE_RANDOM);
    expect(shouldShowTableNote(storage)).toBe(false);
  });

  it("renders a Settings row with Random and every theme", () => {
    const html = tableSettingsHTML(TABLE_RANDOM, "pub-fire");
    expect(html).toContain("data-testid=\"table-settings\"");
    expect(html).toContain("Table");
    expect(html).toContain('value="random" selected');
    expect(html).toContain("Pub table by the fire");
    expect(html).toContain('data-testid="table-current">Pub table by the fire');
    for (const theme of TABLE_THEMES) {
      expect(html).toContain(`value="${theme.id}"`);
    }
    const pinned = tableSettingsHTML("train-dining", "train-dining");
    expect(pinned).toContain('value="train-dining" selected');
  });
});
