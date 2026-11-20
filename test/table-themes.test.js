import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE_ID,
  TABLE_STORAGE_KEY,
  TABLE_THEMES,
  applyTableTheme,
  getTableTheme,
  listTableThemes,
  pickSessionTable,
  themeColorFor,
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
