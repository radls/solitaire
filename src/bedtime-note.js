/** Picker bedtime note. The theme toggle and the Games screen share this text. */

export const BEDTIME_NOTE_TEXT =
  "Bedtime mode · timer hidden, sound off unless you turn it on.";

export function bedtimeLine(theme) {
  return theme === "classic" ? "" : BEDTIME_NOTE_TEXT;
}

export function bedtimeNoteHTML(theme) {
  const line = bedtimeLine(theme);
  if (!line) return "";
  return `<p class="picker-bedtime" data-testid="bedtime-note">${line}</p>`;
}

/**
 * Show, update, or remove the picker note so it matches `theme`.
 * No-op off the Games screen. Returns the note element, or null when hidden.
 */
export function syncPickerBedtimeNote(doc, theme) {
  if (!doc || doc.body?.dataset?.game !== "picker") return null;
  const picker = doc.getElementById("table")?.querySelector?.('[data-testid="picker"]');
  if (!picker) return null;
  const line = bedtimeLine(theme);
  const existing = picker.querySelector('[data-testid="bedtime-note"]');
  if (!line) {
    existing?.remove();
    return null;
  }
  if (existing) {
    existing.textContent = line;
    return existing;
  }
  const note = doc.createElement("p");
  note.className = "picker-bedtime";
  note.dataset.testid = "bedtime-note";
  note.textContent = line;
  const anchor =
    picker.querySelector('[data-testid="groks-pick"]') || picker.querySelector(".pick-tile");
  if (anchor) picker.insertBefore(note, anchor);
  else picker.appendChild(note);
  return note;
}
