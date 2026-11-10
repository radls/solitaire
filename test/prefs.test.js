import { afterEach, describe, expect, it } from "vitest";
import { loadPrefs, savePrefs } from "../src/storage.js";

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
    store["grok-solitaire:prefs"] = JSON.stringify({ theme: "night", sound: false });
    expect(loadPrefs().theme).toBe("night");
    savePrefs({ sound: false });
    expect(JSON.parse(store["grok-solitaire:prefs"]).theme).toBe("night");
    savePrefs({ theme: "classic" });
    expect(loadPrefs().theme).toBe("classic");
    savePrefs({ lastGame: "golf" });
    expect(loadPrefs().theme).toBe("classic");
  });
});
