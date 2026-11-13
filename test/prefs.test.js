import { afterEach, describe, expect, it } from "vitest";
import { loadPrefs, savePrefs, THEME_MIGRATION_KEY, THEME_MIGRATION_VERSION } from "../src/storage.js";

function memoryStorage() {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
  return store;
}

describe("prefs theme", () => {
  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("starts a new or unset profile in Classic", () => {
    memoryStorage();
    expect(loadPrefs().theme).toBe("classic");
    globalThis.localStorage.setItem("grok-solitaire:prefs", JSON.stringify({ lastGame: "klondike", sound: false }));
    expect(loadPrefs().theme).toBe("classic");
  });

  it("keeps a saved night or classic theme and does not overwrite it", () => {
    const store = memoryStorage();
    store[THEME_MIGRATION_KEY] = THEME_MIGRATION_VERSION;
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "night", sound: false });
    expect(loadPrefs().theme).toBe("night");
    savePrefs({ sound: false });
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("night");
    savePrefs({ theme: "classic" });
    expect(loadPrefs().theme).toBe("classic");
    savePrefs({ lastGame: "golf" });
    expect(loadPrefs().theme).toBe("classic");
  });

  it("migrates a saved night theme to classic once when the flag is missing", () => {
    const store = memoryStorage();
    store["grok-solitaire:prefs"] = JSON.stringify({
      theme: "night",
      sound: true,
      lastGame: "klondike",
      tiltSheen: true,
      installHint: "dismissed",
    });
    const prefs = loadPrefs();
    expect(prefs.theme).toBe("classic");
    expect(prefs.sound).toBe(true);
    expect(prefs.lastGame).toBe("klondike");
    expect(prefs.tiltSheen).toBe(true);
    expect(prefs.installHint).toBe("dismissed");
    expect(JSON.parse(store["grok-solitaire:prefs"])).toEqual({
      theme: "classic",
      sound: true,
      lastGame: "klondike",
      tiltSheen: true,
      installHint: "dismissed",
    });
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("keeps a user-chosen night theme after the migration flag is set", () => {
    const store = memoryStorage();
    store[THEME_MIGRATION_KEY] = THEME_MIGRATION_VERSION;
    savePrefs({ theme: "night" });
    expect(loadPrefs().theme).toBe("night");
    expect(loadPrefs().theme).toBe("night");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("sets the migration flag on a fresh empty profile and returns classic", () => {
    const store = memoryStorage();
    expect(loadPrefs().theme).toBe("classic");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
    expect(store["grok-solitaire:prefs"]).toBeUndefined();
  });

  it("migrates the legacy stored night value (Bedtime is only a UI name)", () => {
    const store = memoryStorage();
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "night" });
    expect(loadPrefs().theme).toBe("classic");
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("classic");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
    expect(JSON.stringify(store)).not.toMatch(/bedtime/i);
  });

  it("sets the flag on an already-classic profile without changing the theme", () => {
    const store = memoryStorage();
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "classic", sound: true });
    expect(loadPrefs().theme).toBe("classic");
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("classic");
    expect(JSON.parse(store["grok-solitaire:prefs"]).sound).toBe(true);
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("does not sneak night back in when saving other prefs before the flag is set", () => {
    const store = memoryStorage();
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "night", sound: false });
    savePrefs({ sound: true });
    expect(loadPrefs().theme).toBe("classic");
    expect(loadPrefs().sound).toBe(true);
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("classic");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });

  it("keeps night when saving other prefs after the flag is set", () => {
    const store = memoryStorage();
    store[THEME_MIGRATION_KEY] = THEME_MIGRATION_VERSION;
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "night", sound: false });
    savePrefs({ sound: true });
    expect(loadPrefs().theme).toBe("night");
    expect(loadPrefs().sound).toBe(true);
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("night");
    expect(store[THEME_MIGRATION_KEY]).toBe(THEME_MIGRATION_VERSION);
  });
});
