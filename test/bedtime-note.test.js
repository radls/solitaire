import { describe, expect, it } from "vitest";
import { BEDTIME_NOTE_TEXT, bedtimeLine, bedtimeNoteHTML, syncPickerBedtimeNote } from "../src/bedtime-note.js";

function el(doc, tag, attrs = {}) {
  const node = {
    tag,
    attrs: { ...attrs },
    children: [],
    textContent: "",
    dataset: {},
    className: attrs.class || "",
    parent: null,
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    querySelector(selector) {
      const all = [];
      const walk = (item) => {
        all.push(item);
        item.children.forEach(walk);
      };
      this.children.forEach(walk);
      return all.find((item) => matches(item, selector)) || null;
    },
    insertBefore(node, anchor) {
      node.parent = this;
      const at = this.children.indexOf(anchor);
      if (at < 0) this.children.push(node);
      else this.children.splice(at, 0, node);
    },
    appendChild(node) {
      node.parent = this;
      this.children.push(node);
    },
  };
  if (attrs["data-testid"]) node.dataset.testid = attrs["data-testid"];
  return node;
}

function matches(node, selector) {
  if (selector.startsWith("[data-testid=")) {
    const id = selector.slice(14, -2);
    return node.dataset.testid === id || node.attrs?.["data-testid"] === id;
  }
  if (selector.startsWith(".")) return node.className.split(" ").includes(selector.slice(1));
  return false;
}

function pickerDoc(theme, { withNote = false } = {}) {
  const picker = el(null, "div", { "data-testid": "picker", class: "picker" });
  const promise = el(null, "p", { "data-testid": "no-dead-deals" });
  const pick = el(null, "article", { class: "pick-tile groks-pick", "data-testid": "groks-pick" });
  picker.appendChild(promise);
  if (withNote) {
    const note = el(null, "p", { class: "picker-bedtime", "data-testid": "bedtime-note" });
    note.textContent = BEDTIME_NOTE_TEXT;
    note.dataset.testid = "bedtime-note";
    picker.appendChild(note);
  }
  picker.appendChild(pick);
  const table = el(null, "main");
  table.appendChild(picker);
  const doc = {
    body: { dataset: { game: "picker" } },
    createElement() {
      const node = el(doc, "p");
      return node;
    },
    getElementById(id) {
      return id === "table" ? table : null;
    },
  };
  return { doc, picker };
}

describe("bedtime picker note", () => {
  it("matches the theme: night shows the sentence, classic is empty", () => {
    expect(bedtimeLine("night")).toBe(BEDTIME_NOTE_TEXT);
    expect(bedtimeLine("classic")).toBe("");
    expect(bedtimeLine(undefined)).toBe(BEDTIME_NOTE_TEXT);
    expect(bedtimeNoteHTML("night")).toContain('data-testid="bedtime-note"');
    expect(bedtimeNoteHTML("night")).toContain(BEDTIME_NOTE_TEXT);
    expect(bedtimeNoteHTML("classic")).toBe("");
  });

  it("toggle night to classic removes the note, and classic to night puts it back", () => {
    const night = pickerDoc("night", { withNote: true });
    expect(syncPickerBedtimeNote(night.doc, "classic")).toBeNull();
    expect(night.picker.querySelector('[data-testid="bedtime-note"]')).toBeNull();

    const classic = pickerDoc("classic");
    const note = syncPickerBedtimeNote(classic.doc, "night");
    expect(note.textContent).toBe(BEDTIME_NOTE_TEXT);
    expect(classic.picker.querySelector('[data-testid="bedtime-note"]')).toBe(note);
    const pick = classic.picker.querySelector('[data-testid="groks-pick"]');
    expect(classic.picker.children.indexOf(note)).toBeLessThan(classic.picker.children.indexOf(pick));

    note.textContent = "stale";
    syncPickerBedtimeNote(classic.doc, "night");
    expect(classic.picker.querySelector('[data-testid="bedtime-note"]').textContent).toBe(BEDTIME_NOTE_TEXT);
  });

  it("does nothing when the Games picker is not on screen", () => {
    const { doc } = pickerDoc("night", { withNote: true });
    doc.body.dataset.game = "klondike";
    expect(syncPickerBedtimeNote(doc, "classic")).toBeNull();
    expect(doc.getElementById("table").querySelector('[data-testid="bedtime-note"]')).not.toBeNull();
  });
});
