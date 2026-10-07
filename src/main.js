import "./styles.css";
import { mount as mountKlondike } from "./ui.js";
import { mount as mountFreeCell } from "./ui-freecell.js";
import { mount as mountGolf } from "./ui-golf.js";
import { load, loadFreeCell, loadGolf, loadPrefs, savePrefs } from "./storage.js";

const THEME_COLOR = { night: "#080c0b", classic: "#0a3324" };
const MOON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M14.6 2.6a8.2 8.2 0 1 0 6.8 12.2A7 7 0 0 1 14.6 2.6z"/></svg>`;
const SUN = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 3.2v2.2M12 18.6V20.8M3.2 12h2.2M18.6 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/></svg>`;

function applyTheme(theme) {
  const next = theme === "classic" ? "classic" : "night";
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[next]);
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.innerHTML = next === "night" ? MOON : SUN;
  btn.setAttribute("aria-label", next === "night" ? "Switch to classic theme" : "Switch to night theme");
}

applyTheme(loadPrefs().theme);
document.getElementById("btn-theme")?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "classic" ? "night" : "classic";
  savePrefs({ theme: next });
  applyTheme(next);
});

// On touch screens the click that follows the move's pointerup lands on the
// just-opened overlay backdrop and would dismiss the end-of-game panel at once.
// Ignore backdrop clicks for a moment after the overlay opens.
(() => {
  const overlay = document.getElementById("overlay");
  if (!overlay) return;
  let openedAt = 0;
  new MutationObserver(() => {
    if (!overlay.hidden) openedAt = performance.now();
  }).observe(overlay, { attributes: true, attributeFilter: ["hidden"], childList: true });
  overlay.addEventListener(
    "click",
    (event) => {
      if (event.target === overlay && performance.now() - openedAt < 500) {
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();

let active = null;
let mode = "picker";

function hasKlondikeSave() {
  const saved = load().saved;
  return !!(saved?.state && !saved.state.won);
}

function hasFreeCellSave() {
  const saved = loadFreeCell();
  return !!(saved.state && !saved.state.won);
}

function hasGolfSave() {
  const saved = loadGolf();
  return !!(saved.state && !saved.state.over);
}

function syncHooks() {
  window.__solitaire = {
    game: () => (mode === "picker" ? null : mode),
    pick,
    getState: () => active?.getState?.() ?? null,
    setState: (state) => active?.setState?.(state),
    undo: () => active?.undo?.(),
    move: (from, to) => active?.move?.(from, to) ?? { ok: false, reason: "no game", state: null },
    historyLength: () => active?.historyLength?.() ?? 0,
    newGame: (...args) => active?.newGame?.(...args),
    draw: () => active?.draw?.(),
    hint: () => active?.hint?.(),
    listMoves: () => active?.listMoves?.() ?? [],
    apply: (action) => active?.apply?.(action),
  };
}

function unmountActive() {
  active?.unmount?.();
  active = null;
}

function showPicker() {
  unmountActive();
  mode = "picker";
  document.body.dataset.game = "picker";
  document.getElementById("game-kicker").textContent = "Games";
  const scoreWrap = document.getElementById("meter-score-wrap");
  if (scoreWrap) scoreWrap.hidden = false;
  document.getElementById("meter-time").textContent = "—";
  document.getElementById("meter-moves").textContent = "—";
  document.getElementById("meter-score").textContent = "—";
  document.getElementById("status-text").textContent = "Choose a game.";
  document.getElementById("status-seed").textContent = "";
  const klondike = hasKlondikeSave();
  const freecell = hasFreeCellSave();
  const golf = hasGolfSave();
  document.getElementById("table").innerHTML = `
    <div class="picker" data-testid="picker">
      <button type="button" class="pick-tile" data-testid="pick-klondike" data-pick="klondike">
        <span class="pick-kicker">Classic</span>
        <span class="pick-name">Klondike</span>
        <span class="pick-blurb">Build down by color. Draw from the stock.</span>
        ${klondike ? '<span class="resume">Resume</span>' : ""}
      </button>
      <button type="button" class="pick-tile" data-testid="pick-freecell" data-pick="freecell">
        <span class="pick-kicker">Microsoft deals</span>
        <span class="pick-name">FreeCell</span>
        <span class="pick-blurb">All cards face up. Four free cells.</span>
        ${freecell ? '<span class="resume">Resume</span>' : ""}
      </button>
      <button type="button" class="pick-tile" data-testid="pick-golf" data-pick="golf">
        <span class="pick-kicker">Calm & quick</span>
        <span class="pick-name">Golf</span>
        <span class="pick-blurb">Clear the columns one rank up or down.</span>
        ${golf ? '<span class="resume">Resume</span>' : ""}
      </button>
    </div>`;
  syncHooks();
}

function showKlondike() {
  unmountActive();
  mode = "klondike";
  savePrefs({ lastGame: "klondike" });
  active = mountKlondike();
  syncHooks();
}

function showFreeCell() {
  unmountActive();
  mode = "freecell";
  savePrefs({ lastGame: "freecell" });
  active = mountFreeCell();
  syncHooks();
}

function showGolf() {
  unmountActive();
  mode = "golf";
  savePrefs({ lastGame: "golf" });
  active = mountGolf();
  syncHooks();
}

function pick(id) {
  if (id === "freecell") showFreeCell();
  else if (id === "golf") showGolf();
  else if (id === "klondike") showKlondike();
  else showPicker();
}

document.getElementById("btn-home").addEventListener("click", () => showPicker());
document.getElementById("table").addEventListener("click", (event) => {
  const tile = event.target.closest("[data-pick]");
  if (!tile || mode !== "picker") return;
  pick(tile.dataset.pick);
});

const params = new URLSearchParams(location.search);
const requested = params.get("game");
if (requested === "freecell" || requested === "klondike" || requested === "golf") pick(requested);
else if (params.has("seed") || params.has("draw")) pick("klondike");
else {
  const last = loadPrefs().lastGame;
  if (last === "freecell" || last === "klondike" || last === "golf") pick(last);
  else showPicker();
}
