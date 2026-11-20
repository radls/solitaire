import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_MIGRATION_KEY, THEME_MIGRATION_VERSION } from "../src/storage.js";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const match = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
const PREPAINT = match?.[1] ?? "";

function runPrepaint(store = {}) {
  const htmlEl = { attrs: { lang: "en", "data-theme": "classic" } };
  const meta = { content: "#0a3324" };
  const document = {
    documentElement: {
      setAttribute(name, value) {
        htmlEl.attrs[name] = String(value);
      },
      getAttribute(name) {
        return htmlEl.attrs[name] ?? null;
      },
    },
    querySelector(sel) {
      if (sel === 'meta[name="theme-color"]') {
        return {
          setAttribute(name, value) {
            if (name === "content") meta.content = String(value);
          },
          getAttribute(name) {
            return name === "content" ? meta.content : "";
          },
        };
      }
      return null;
    },
  };
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
  };
  new Function("document", "localStorage", PREPAINT)(document, localStorage);
  return { theme: htmlEl.attrs["data-theme"], table: htmlEl.attrs["data-table"], color: meta.content, store };
}

describe("index.html pre-paint migration", () => {
  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("embeds the same migration key and version as storage.js", () => {
    expect(PREPAINT).not.toBe("");
    expect(PREPAINT).toContain(`"${THEME_MIGRATION_KEY}"`);
    expect(PREPAINT).toContain(`"${THEME_MIGRATION_VERSION}"`);
  });

  it("migrates a legacy night pref to Classic before first paint", () => {
    const store = {
      "grok-solitaire:prefs": JSON.stringify({ theme: "night", sound: true, lastGame: "klondike" }),
    };
    const out = runPrepaint(store);
    expect(out.theme).toBe("classic");
    expect(out.color).toBe("#0a3324");
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("classic");
    expect(JSON.parse(store["grok-solitaire:prefs"]).sound).toBe(true);
    expect(JSON.parse(store["grok-solitaire:prefs"]).lastGame).toBe("klondike");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("keeps a user-chosen night theme after the flag is set", () => {
    const store = {
      [THEME_MIGRATION_KEY]: THEME_MIGRATION_VERSION,
      "grok-solitaire:prefs": JSON.stringify({ theme: "night", sound: false }),
    };
    const out = runPrepaint(store);
    expect(out.theme).toBe("night");
    expect(out.color).toBe("#080c0b");
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("night");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("starts a fresh profile in Classic and sets the flag", () => {
    const store = {};
    const out = runPrepaint(store);
    expect(out.theme).toBe("classic");
    expect(out.color).toBe("#0a3324");
    expect(store["grok-solitaire:prefs"]).toBeUndefined();
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("sets data-table to classic-felt before first paint", () => {
    const htmlTag = html.match(/<html\b[^>]*>/)?.[0] ?? "";
    expect(htmlTag).toContain('data-table="classic-felt"');
    const out = runPrepaint({});
    expect(out.table).toBe("classic-felt");
    const night = runPrepaint({
      [THEME_MIGRATION_KEY]: THEME_MIGRATION_VERSION,
      "grok-solitaire:prefs": JSON.stringify({ theme: "night" }),
    });
    expect(night.theme).toBe("night");
    expect(night.table).toBe("classic-felt");
  });

  it("is a no-op on an already-classic profile besides setting the flag", () => {
    const store = {
      "grok-solitaire:prefs": JSON.stringify({ theme: "classic", sound: true }),
    };
    const out = runPrepaint(store);
    expect(out.theme).toBe("classic");
    expect(JSON.parse(store["grok-solitaire:prefs"])).toEqual({ theme: "classic", sound: true });
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });
});
