import "./styles.css";
import { mount as mountKlondike } from "./ui.js";
import { mount as mountFreeCell } from "./ui-freecell.js";
import { mount as mountGolf } from "./ui-golf.js";
import { mount as mountKings } from "./ui-kings.js";
import { load, loadFreeCell, loadGolf, loadKings, loadPrefs, savePrefs } from "./storage.js";
import { canResume, dailyButtonLabel, pickerStatsText, resumeText, startupTarget, todayKey } from "./daily.js";
import { mountTipPanel, tipEntryHTML } from "./tip.js";

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

function showMeters(on) {
  const meters = document.getElementById("meters");
  if (meters) meters.hidden = !on;
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
    isAnimating: () => active?.isAnimating?.() ?? false,
  };
}

function unmountActive() {
  active?.unmount?.();
  active = null;
}

function resumeMarkup(game, state, savedAt) {
  if (!canResume(state)) return "";
  return `<span class="resume" data-testid="resume-${game}">${resumeText(state, savedAt)}</span>`;
}

function dailyButton(game, stats) {
  const key = todayKey();
  const done = stats?.dailyLast === key;
  const label = dailyButtonLabel(stats, key);
  const dot = label.indexOf(" · ");
  const lead = dot === -1 ? label : label.slice(0, dot);
  const tail = dot === -1 ? "" : label.slice(dot + 3);
  const badge = done ? "" : `<span class="today-badge">Today</span>`;
  const copy = tail
    ? `<span class="daily-copy"><span class="daily-lead">${lead} ·</span> <span class="daily-streak">${tail}</span></span>`
    : `<span class="daily-copy">${label}</span>`;
  return `<button type="button" class="daily-btn" data-testid="daily-${game}" data-daily="${game}">${badge}${copy}</button>`;
}

function pickCard({ game, testid, kicker, name, blurb, stats, state, savedAt }) {
  return `<article class="pick-tile">
      <button type="button" class="pick-open" data-testid="${testid}" data-pick="${game}">
        <span class="pick-kicker">${kicker}</span>
        <span class="pick-name">${name}</span>
        <span class="pick-blurb">${blurb}</span>
        <span class="pick-stats" data-testid="pick-stats-${game}">${pickerStatsText(game, stats)}</span>
        ${resumeMarkup(game, state, savedAt)}
      </button>
      ${dailyButton(game, stats)}
    </article>`;
}

function showPicker() {
  dismissTipModal();
  unmountActive();
  mode = "picker";
  document.body.dataset.game = "picker";
  document.getElementById("game-kicker").textContent = "Games";
  showMeters(false);
  document.getElementById("status-text").textContent = "Choose a game. Progress is saved on this device.";
  document.getElementById("status-seed").textContent = "";
  const klondike = load();
  const freecell = loadFreeCell();
  const golf = loadGolf();
  const kings = loadKings();
  document.getElementById("table").innerHTML = `
    <div class="picker" data-testid="picker">
      ${pickCard({
        game: "klondike",
        testid: "pick-klondike",
        kicker: "Classic",
        name: "Klondike",
        blurb: "Build down by color. Draw from the stock.",
        stats: klondike.stats,
        state: klondike.saved?.state,
        savedAt: klondike.saved?.savedAt,
      })}
      ${pickCard({
        game: "freecell",
        testid: "pick-freecell",
        kicker: "Microsoft deals",
        name: "FreeCell",
        blurb: "All cards face up. Four free cells.",
        stats: freecell.stats,
        state: freecell.state,
        savedAt: freecell.savedAt,
      })}
      ${pickCard({
        game: "golf",
        testid: "pick-golf",
        kicker: "Calm & quick",
        name: "Golf",
        blurb: "Clear the columns one rank up or down.",
        stats: golf.stats,
        state: golf.state,
        savedAt: golf.savedAt,
      })}
      ${pickCard({
        game: "kings",
        testid: "pick-kings",
        kicker: "Four kings",
        name: "King's Corners",
        blurb: "Kings in the corners. Build down by color.",
        stats: kings.stats,
        state: kings.state,
        savedAt: kings.savedAt,
      })}
      ${tipEntryHTML("picker-tip")}
    </div>`;
  syncHooks();
}

function dismissTipModal() {
  const overlay = document.getElementById("overlay");
  if (!overlay?.querySelector("[data-testid='tip-modal']")) return;
  overlay.hidden = true;
  overlay.innerHTML = "";
}

function openPickerTip() {
  const overlay = document.getElementById("overlay");
  if (!overlay) return;
  overlay.innerHTML = `<div class="modal" data-testid="tip-modal">
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close">Close</button>
      </div>
    </div>`;
  const modal = overlay.querySelector("[data-testid='tip-modal']");
  mountTipPanel(modal, { position: "start" });
  overlay.hidden = false;
  try {
    modal?.querySelector("[data-act='close']")?.focus?.({ preventScroll: true });
  } catch {
    /* Focusing Close is a convenience. The modal is already open. */
  }
}

function showKlondike(opts) {
  dismissTipModal();
  unmountActive();
  mode = "klondike";
  savePrefs({ lastGame: "klondike" });
  showMeters(true);
  active = mountKlondike(opts);
  syncHooks();
}

function showFreeCell(opts) {
  dismissTipModal();
  unmountActive();
  mode = "freecell";
  savePrefs({ lastGame: "freecell" });
  showMeters(true);
  active = mountFreeCell(opts);
  syncHooks();
}

function showGolf(opts) {
  dismissTipModal();
  unmountActive();
  mode = "golf";
  savePrefs({ lastGame: "golf" });
  showMeters(true);
  active = mountGolf(opts);
  syncHooks();
}

function showKings(opts) {
  dismissTipModal();
  unmountActive();
  mode = "kings";
  savePrefs({ lastGame: "kings" });
  showMeters(true);
  active = mountKings(opts);
  syncHooks();
}

function pick(id, opts) {
  if (id === "freecell") showFreeCell(opts);
  else if (id === "golf") showGolf(opts);
  else if (id === "kings") showKings(opts);
  else if (id === "klondike") showKlondike(opts);
  else showPicker();
}

document.getElementById("btn-home").addEventListener("click", () => showPicker());
document.getElementById("table").addEventListener("click", (event) => {
  if (mode !== "picker") return;
  if (event.target.closest("[data-testid='picker-tip']")) {
    openPickerTip();
    return;
  }
  const dailyBtn = event.target.closest("[data-daily]");
  if (dailyBtn) {
    pick(dailyBtn.dataset.daily, { daily: true });
    return;
  }
  const tile = event.target.closest("[data-pick]");
  if (!tile) return;
  pick(tile.dataset.pick);
});

document.getElementById("overlay")?.addEventListener("click", (event) => {
  const overlay = document.getElementById("overlay");
  if (!overlay?.querySelector("[data-testid='tip-modal']")) return;
  if (event.target.closest(".tip-panel")) return;
  if (event.target.closest("[data-act='close']") || event.target === overlay) dismissTipModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const overlay = document.getElementById("overlay");
  if (!overlay || overlay.hidden || !overlay.querySelector("[data-testid='tip-modal']")) return;
  dismissTipModal();
});

function savedBoards() {
  return {
    klondike: load().saved?.state ?? null,
    freecell: loadFreeCell().state ?? null,
    golf: loadGolf().state ?? null,
    kings: loadKings().state ?? null,
  };
}

const params = new URLSearchParams(location.search);
const requested = params.get("game");
const dailyQuery = params.get("daily") === "1";
const bareLoad = !params.has("game") && !params.has("seed") && !params.has("draw") && !params.has("daily");
if (requested === "freecell" || requested === "klondike" || requested === "golf" || requested === "kings") {
  pick(requested, { daily: dailyQuery });
} else if (params.has("seed") || params.has("draw")) pick("klondike");
else if (bareLoad) {
  const target = startupTarget(loadPrefs(), savedBoards());
  if (target === "picker") showPicker();
  else pick(target);
} else {
  const last = loadPrefs().lastGame;
  if (last === "freecell" || last === "klondike" || last === "golf" || last === "kings") pick(last);
  else showPicker();
}
