import { SUIT_GLYPH } from "./game/cards.js";
import { makeCardElement } from "./card-view.js";
import {
  cloneState,
  continueClock,
  deal,
  elapsedMs,
  foundationStep,
  hint as findHint,
  isTriviallySolvable,
  isWon,
  listLegalMoves,
  moveCards,
} from "./game/freecell.js";
import { meterElapsed, restoreClock, syncClock } from "./game/clock.js";
import { resumeAudio, sounds } from "./audio.js";
import { loadFreeCell, loadPrefs, saveFreeCell, savePrefs } from "./storage.js";
import { offerInstallHint } from "./install-hint.js";
import { shakeMoved } from "./motion.js";
import { creditHTML, tipEntryHTML, toggleTipPanel, winScreenTipHTML } from "./tip.js";
import {
  dailyDoneText,
  dailyFreeCellDeal,
  dailyOpenPlan,
  nextDailyStreak,
  seedStatusText,
  todayKey,
} from "./daily.js";
import {
  bindThumb,
  fanPeek,
  isPhonePortrait,
  kbdTipsHTML,
  layoutBottomInset,
  listenLayout,
  shrinkToFit,
  syncThumbDisabled,
  touchTipsHTML,
} from "./phone-layout.js";

const DRAG_THRESHOLD = 7;
const DOUBLE_MS = 420;
const HISTORY_CAP = 200;
const GAP = 4;

const ICONS = {
  mute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`,
  unmute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5-4.5-1.4 1.4A6.5 6.5 0 0 1 18 12a6.5 6.5 0 0 1-3.9 5.9l1.4 1.4A8.5 8.5 0 0 0 20 12a8.5 8.5 0 0 0-4.5-7.5zM16 4.2 4.2 16l1.4 1.4L17.4 5.6 16 4.2z"/></svg>`,
};

function randomDeal() {
  return 1 + Math.floor(Math.random() * 32000);
}

export function mount(options = {}) {
  const ac = new AbortController();
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, { ...options, signal: ac.signal });
  };

  const kicker = document.getElementById("game-kicker");
  if (kicker) kicker.textContent = "FreeCell";
  const scoreWrap = document.getElementById("meter-score-wrap");
  if (scoreWrap) scoreWrap.hidden = true;
  document.body.dataset.game = "freecell";

  const toolbar = document.getElementById("toolbar");
  if (toolbar) {
    toolbar.innerHTML = `
      <button type="button" class="btn" id="btn-undo" data-testid="btn-undo" title="Undo (U)">Undo</button>
      <button type="button" class="btn" id="btn-new" data-testid="btn-new" aria-label="New deal" title="New deal (N)">New</button>
      <button type="button" class="btn" id="btn-hint" data-testid="btn-hint" title="Hint (H)">Hint</button>
      <button type="button" class="btn" id="btn-finish" data-testid="btn-finish" hidden title="Send remaining cards to the foundations">Finish</button>
      <button type="button" class="icon-btn" id="btn-help" data-testid="btn-help" aria-label="Help">?</button>
      <button type="button" class="icon-btn" id="btn-mute" data-testid="btn-sound" aria-label="Turn sound on"></button>`;
  }

  const root = {
    table: document.getElementById("table"),
    overlay: document.getElementById("overlay"),
    dragLayer: document.getElementById("drag-layer"),
    time: document.getElementById("meter-time"),
    moves: document.getElementById("meter-moves"),
    status: document.getElementById("status-text"),
    seed: document.getElementById("status-seed"),
    undo: document.getElementById("btn-undo"),
    finish: document.getElementById("btn-finish"),
    mute: document.getElementById("btn-mute"),
  };

  const saved = loadFreeCell();
  const session = {
    state: null,
    history: [],
    stats: saved.stats,
    selected: null,
    hintMove: null,
    drag: null,
    lastClick: { key: "", at: 0 },
    muted: loadPrefs().sound !== true,
    modal: null,
    countedPlay: false,
    countedWin: false,
    winShown: false,
    autoTimer: 0,
    clockPlayed: false,
    animating: false,
    landedId: null,
  };

  const params = new URLSearchParams(location.search);
  const wantDaily = options.daily === true || (params.get("daily") === "1" && params.get("game") === "freecell");
  const today = todayKey();
  const plan = wantDaily
    ? dailyOpenPlan(saved.state, today, {
        isFinished: (state) => !!(state.won || isWon(state)),
        needsConfirm: (state) => state.moves > 0 && !state.won && !isWon(state),
      })
    : null;
  let bootDailyConfirm = false;

  function resumeSaved() {
    session.state = saved.state;
    session.history = (saved.history ?? []).slice(-HISTORY_CAP);
    session.countedPlay = session.state.moves > 0;
    if (!session.state.startedAt || typeof saved.savedAt === "number") {
      restoreClock(session.state, saved.savedAt);
    }
  }

  if (plan === "resume" || plan === "confirm") {
    resumeSaved();
    bootDailyConfirm = plan === "confirm";
  } else if (plan === "deal") {
    session.state = deal(dailyFreeCellDeal(today));
    session.state.daily = today;
  } else if (saved.state && !saved.state.won) {
    resumeSaved();
  } else {
    session.state = deal(randomDeal());
  }

  let alive = true;

  function persist() {
    saveFreeCell({
      state: session.state,
      history: session.history.slice(-HISTORY_CAP),
      stats: session.stats,
      savedAt: Date.now(),
    });
  }

  function setStatus(text) {
    root.status.textContent = text;
    if (window.innerWidth <= 600) requestAnimationFrame(() => fit());
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function locKey(loc) {
    if (!loc) return "";
    return `${loc.zone}:${loc.index ?? ""}:${loc.count ?? 1}`;
  }

  function parseLoc(el) {
    if (!el?.dataset?.zone) return null;
    return {
      zone: el.dataset.zone,
      index: el.dataset.index == null || el.dataset.index === "" ? undefined : Number(el.dataset.index),
      count: Number(el.dataset.count || 1),
    };
  }

  function parseDrop(el) {
    const raw = el?.closest?.("[data-drop]")?.dataset.drop;
    if (!raw) return null;
    const [zone, index] = raw.split(":");
    return { zone, index: Number(index) };
  }

  function isSelected(loc, count) {
    const sel = session.selected;
    if (!sel) return false;
    return sel.zone === loc.zone && sel.index === loc.index && (sel.count ?? 1) === count;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function stepDelay() {
    return prefersReducedMotion() ? 0 : 90;
  }

  function makeCard(card, loc, count, playable) {
    const el = makeCardElement(card, loc, count, playable, isSelected(loc, count));
    if (
      session.landedId &&
      card.id === session.landedId &&
      loc.zone === "foundation" &&
      !prefersReducedMotion()
    ) {
      el.classList.add("fc-land");
    }
    if (el.classList.contains("selected")) el.style.zIndex = "40";
    return el;
  }

  function foundationLandedId(before, after) {
    for (let i = 0; i < after.foundations.length; i++) {
      const next = after.foundations[i];
      const prev = before.foundations[i] ?? [];
      if (next.length > prev.length) return next[next.length - 1].id;
    }
    return null;
  }

  function well(content = "") {
    const el = document.createElement("div");
    el.className = "well";
    el.innerHTML = content;
    return el;
  }

  function renderSlot(zone, index, fill) {
    const slot = document.createElement("div");
    slot.className = `slot ${zone}`;
    slot.dataset.drop = `${zone}:${index}`;
    slot.dataset.zone = zone;
    slot.dataset.index = String(index);
    fill(slot);
    return slot;
  }

  function clearLayoutVars() {
    for (const key of ["--card-w", "--card-h", "--fc-peek", "--peek-up", "--peek-down", "--col-gap", "--waste-extra", "--waste-spread"]) {
      document.body.style.removeProperty(key);
    }
  }

  function applyFreeCellFit(cardW, cardH, peek) {
    const style = document.body.style;
    style.setProperty("--card-w", `${cardW}px`);
    style.setProperty("--card-h", `${cardH}px`);
    style.setProperty("--fc-peek", `${peek}px`);
    style.setProperty("--col-gap", `${GAP}px`);
  }

  function fit() {
    const board = root.table.querySelector(".board.freecell");
    if (!board) return;
    const width = board.clientWidth;
    if (!width) return;
    let cardW = Math.max(30, Math.min(110, Math.floor((width - GAP * 7) / 8)));
    let cardH = Math.round(cardW * 1.42);
    const longest = Math.max(1, ...session.state.cascades.map((pile) => pile.length));
    const headerH = document.querySelector(".topbar")?.offsetHeight ?? 0;
    const statusH = document.querySelector(".status")?.offsetHeight ?? 0;
    const topH = board.querySelector(".fc-top")?.offsetHeight || cardH;
    const table = root.table;
    const ts = table ? getComputedStyle(table) : null;
    const padY = ts ? (parseFloat(ts.paddingTop) || 0) + (parseFloat(ts.paddingBottom) || 0) : 0;
    const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
    let peek = Math.round(cardW * 0.34);

    if (window.innerWidth <= 600) {
      const contentSpace = Math.floor(window.innerHeight - layoutBottomInset() - headerH - statusH - padY - gap - 4);
      const steps = Math.max(0, longest - 1);
      const fitsWidth = (w) => {
        const ch = Math.round(w * 1.42);
        return ch + ch + steps <= contentSpace;
      };
      if (!fitsWidth(cardW)) cardW = shrinkToFit(cardW, 24, fitsWidth);
      cardH = Math.round(cardW * 1.42);
      peek = Math.round(cardW * 0.34);
      const availH = contentSpace - cardH;
      if (steps > 0) {
        if (isPhonePortrait()) peek = fanPeek(peek, cardH, availH, steps);
        else {
          const room = Math.floor((availH - cardH) / steps);
          const natural = peek;
          if (room >= 14) peek = Math.min(natural, room);
          else peek = Math.max(1, Math.min(natural, room));
        }
      }
      applyFreeCellFit(cardW, cardH, peek);
      return;
    }

    const availH = window.innerHeight - layoutBottomInset() - headerH - statusH - topH - padY - gap - 4;
    if (longest > 1) {
      const room = Math.floor((availH - cardH) / (longest - 1));
      const natural = Math.round(cardW * 0.34);
      if (room >= 14) peek = Math.min(natural, room);
      else peek = Math.max(1, Math.min(natural, room));
    }
    applyFreeCellFit(cardW, cardH, peek);
  }

  function updateMute() {
    root.mute.innerHTML = session.muted ? ICONS.unmute : ICONS.mute;
    root.mute.setAttribute("aria-label", session.muted ? "Turn sound on" : "Turn sound off");
    root.mute.setAttribute("aria-pressed", session.muted ? "false" : "true");
  }

  function nudgeBoard(from) {
    shakeMoved(from || session.selected);
  }

  function render() {
    const state = session.state;
    const board = document.createElement("div");
    board.className = "board freecell";

    const top = document.createElement("div");
    top.className = "fc-top";
    top.setAttribute("aria-label", "Free cells and foundations");
    state.freecells.forEach((card, index) => {
      top.appendChild(
        renderSlot("freecell", index, (slot) => {
          slot.appendChild(well(""));
          if (card) slot.appendChild(makeCard(card, { zone: "freecell", index }, 1, true));
        }),
      );
    });
    state.foundations.forEach((pile, index) => {
      top.appendChild(
        renderSlot("foundation", index, (slot) => {
          const glyph = pile.length ? SUIT_GLYPH[pile[pile.length - 1].suit] : "A";
          slot.appendChild(well(glyph));
          if (pile.length) {
            const card = pile[pile.length - 1];
            slot.appendChild(makeCard(card, { zone: "foundation", index }, 1, false));
          }
        }),
      );
    });

    const cascades = document.createElement("div");
    cascades.className = "fc-cascades";
    cascades.setAttribute("aria-label", "Cascades");
    state.cascades.forEach((pile, index) => {
      cascades.appendChild(
        renderSlot("cascade", index, (slot) => {
          slot.appendChild(well(""));
          const stack = document.createElement("div");
          stack.className = "pile";
          pile.forEach((card, row) => {
            const count = pile.length - row;
            const el = makeCard(card, { zone: "cascade", index }, count, true);
            if (!el.style.zIndex) el.style.zIndex = String(row + 1);
            stack.appendChild(el);
          });
          slot.appendChild(stack);
        }),
      );
    });

    board.append(top, cascades);
    root.table.replaceChildren(board);
    session.landedId = null;
    root.moves.textContent = String(state.moves);
    root.seed.textContent = seedStatusText(state);
    root.undo.disabled = session.history.length === 0;
    syncThumbDisabled();
    if (root.finish) {
      const home = state.won || isWon(state);
      root.finish.hidden = home || !isTriviallySolvable(state);
    }
    applyHintHighlight();
    updateMute();
    fit();
    requestAnimationFrame(() => {
      if (alive) fit();
    });
  }

  function syncPlayClock() {
    if (!session.state || !root.overlay) return;
    const paused = !root.overlay.hidden || document.visibilityState === "hidden";
    syncClock(session.state, paused);
  }

  function readMeter(now = Date.now()) {
    const state = session.state;
    if (!state) return 0;
    if (state.moves > 0 || session.history.length > 0) session.clockPlayed = true;
    const historyLength = session.history.length > 0 ? session.history.length : session.clockPlayed ? 1 : 0;
    return meterElapsed(state, historyLength, now);
  }

  function refreshMeters() {
    if (!alive) return;
    syncPlayClock();
    root.time.textContent = formatTime(readMeter());
  }

  function hideOverlay() {
    const celebrate = session.modal === "win" && !!session.state && !!(session.state.won || isWon(session.state));
    session.modal = null;
    root.overlay.hidden = true;
    root.overlay.innerHTML = "";
    syncPlayClock();
    if (celebrate) offerInstallHint();
  }

  function applyHintHighlight() {
    const move = session.hintMove;
    if (!move) return;
    const fromSel = `.card[data-zone="${move.from.zone}"][data-index="${move.from.index}"][data-count="${move.from.count ?? 1}"]`;
    document.querySelector(fromSel)?.classList.add("hint-from");
    document.querySelector(`[data-drop="${move.to.zone}:${move.to.index}"]`)?.classList.add("hint-to");
  }

  function showWin() {
    const state = session.state;
    const won = session.stats.won || 0;
    const played = Math.max(session.stats.played || 0, won);
    session.winShown = true;
    session.modal = "win";
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="win-modal">
      <p class="big">Well played</p>
      <p>${state.moves} moves · ${formatTime(elapsedMs(state))}</p>
      <p data-testid="win-count">Wins ${won} of ${played}</p>
      ${winScreenTipHTML(session.stats.streak)}
      ${dailyDoneHTML()}
      <div class="modal-actions">
        <button type="button" class="btn primary" data-act="new">New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function showHelp() {
    session.modal = "help";
    root.overlay.hidden = false;
    const gestures = `<p>Tap a card, then tap a free cell, cascade, or foundation.</p><p>Drag to choose the spot. Double-tap sends one card to a foundation, or into an open free cell.</p>`;
    const shortcuts = `<li><kbd>N</kbd> new deal</li><li><kbd>U</kbd> or <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li><li><kbd>H</kbd> hint</li>`;
    root.overlay.innerHTML = `<div class="modal" data-testid="help-modal">
      <h2>FreeCell</h2>
      <div class="help-tip-row">${tipEntryHTML("help-tip")}</div>
      ${touchTipsHTML(gestures)}
      <p>Microsoft deal numbers 1–32000. Eight cascades, all cards face up. Four free cells and four foundations.</p>
      <p>Build cascades down by alternating color. Any card or legal run may move to an empty cascade. Build foundations up by suit, ace through king. A free cell holds one card.</p>
      <p data-testid="deal-number">Deal #${session.state.dealNumber}</p>
      <form class="deal-form" data-deal-form>
        <input data-testid="deal-input" inputmode="numeric" type="text" autocomplete="off" value="${session.state.dealNumber}" aria-label="Deal number" style="font-size:16px" />
        <button type="submit" class="btn primary">Deal</button>
      </form>
      ${kbdTipsHTML(shortcuts)}
      <div class="modal-actions">
        <button type="button" class="btn primary" data-act="close">Close</button>
      </div>
      ${creditHTML("help-credit")}
    </div>`;
    syncPlayClock();
  }

  function gameInProgress() {
    return session.state.moves > 0 && !session.state.won && !isWon(session.state);
  }

  // dealNumber is set when the player asked for a specific deal (Help → Deal form); otherwise a random deal.
  function confirmNewDeal(dealNumber, extra = {}) {
    if (!gameInProgress()) {
      if (extra.daily) startDaily();
      else startDeal(dealNumber ?? randomDeal());
      return;
    }
    session.modal = "confirm";
    const dailyAttr = extra.daily ? ` data-daily="1"` : "";
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="confirm-modal">
      <h2>Start a new deal?</h2>
      <p>The current deal will be abandoned.</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close" data-testid="confirm-cancel">Keep playing</button>
        <button type="button" class="btn primary" data-act="new" data-testid="confirm-ok"${dailyAttr}${dealNumber && !extra.daily ? ` data-deal="${dealNumber}"` : ""}>New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function stopAuto() {
    if (session.autoTimer) window.clearTimeout(session.autoTimer);
    session.autoTimer = 0;
    session.animating = false;
  }

  function creditDaily() {
    const key = session.state?.daily;
    if (!key || key !== todayKey()) return;
    const next = nextDailyStreak(session.stats, key);
    session.stats.dailyStreak = next.dailyStreak;
    session.stats.dailyBest = next.dailyBest;
    session.stats.dailyLast = next.dailyLast;
  }

  function dailyDoneHTML() {
    const key = todayKey();
    if (session.state?.daily !== key) return "";
    if (session.stats.dailyLast !== key) {
      creditDaily();
      persist();
    }
    if (session.stats.dailyLast !== key) return "";
    return `<p class="daily-done" data-testid="daily-done">${dailyDoneText(session.stats.dailyStreak)}</p>`;
  }

  function startDeal(dealNumber, extra = {}) {
    stopAuto();
    hideOverlay();
    const dailyKey = extra.daily ? todayKey() : extra.dailyKey || null;
    const number = extra.daily ? dailyFreeCellDeal(dailyKey) : dealNumber;
    session.history = [];
    session.clockPlayed = false;
    session.selected = null;
    session.hintMove = null;
    session.landedId = null;
    session.winShown = false;
    session.countedWin = false;
    session.countedPlay = false;
    session.state = deal(number);
    if (dailyKey) session.state.daily = dailyKey;
    persist();
    render();
    setStatus(`Deal #${session.state.dealNumber}.`);
  }

  function startDaily() {
    startDeal(undefined, { daily: true });
  }

  function statusForSuccess(result, from, to) {
    const count = from?.count ?? 1;
    const auto = result.autoMoved ?? 0;
    let msg;
    if (to?.zone === "freecell") msg = "Moved to a free cell.";
    else if (to?.zone === "foundation") msg = "Moved to the foundation.";
    else if (count > 1) msg = `Moved ${count} cards.`;
    else if (to?.zone === "cascade" && Number.isInteger(to.index)) msg = `Moved to column ${to.index + 1}.`;
    else msg = "Moved the card.";
    if (auto === 1) msg += " Auto-played a card.";
    else if (auto > 1) msg += ` Auto-played ${auto} cards.`;
    return msg;
  }

  function recordWin() {
    if (session.winShown) return;
    if (!session.countedWin) {
      if (!session.countedPlay) {
        session.stats.played = (Number(session.stats.played) || 0) + 1;
        session.countedPlay = true;
      }
      session.stats.won += 1;
      session.stats.streak = (session.stats.streak || 0) + 1;
      session.stats.bestStreak = Math.max(session.stats.bestStreak || 0, session.stats.streak);
      session.countedWin = true;
      creditDaily();
    }
    persist();
    sounds.win(session.muted);
    showWin();
    setStatus("All cards are home.");
  }

  function runAutoStep() {
    session.autoTimer = 0;
    if (!alive) {
      session.animating = false;
      return;
    }
    const finishMode = isTriviallySolvable(session.state);
    const before = session.state;
    const result = foundationStep(before, { safeOnly: !finishMode });
    if (!result.ok) {
      session.animating = false;
      if (session.state.won || isWon(session.state)) recordWin();
      else {
        persist();
        render();
      }
      return;
    }
    session.landedId = foundationLandedId(before, result.state);
    session.state = result.state;
    session.selected = null;
    session.hintMove = null;
    persist();
    render();
    if (session.state.won || isWon(session.state)) {
      session.animating = false;
      recordWin();
      return;
    }
    if (isTriviallySolvable(session.state)) setStatus("Finishing…");
    session.animating = true;
    session.autoTimer = window.setTimeout(runAutoStep, stepDelay());
  }

  function queueAuto() {
    if (!alive || session.animating) return;
    if (session.state.won || isWon(session.state)) return;
    const finishMode = isTriviallySolvable(session.state);
    const probe = foundationStep(session.state, { safeOnly: !finishMode });
    if (!probe.ok) return;
    session.animating = true;
    if (finishMode) setStatus("Finishing…");
    session.autoTimer = window.setTimeout(runAutoStep, stepDelay());
  }

  function commit(result, from, to) {
    if (session.animating) return false;
    if (!result.ok) {
      sounds.illegal(session.muted);
      setStatus("That card cannot move there.");
      nudgeBoard(from);
      return false;
    }
    if (!session.countedPlay) {
      session.stats.played += 1;
      session.countedPlay = true;
    }
    const before = session.state;
    session.history.push(cloneState(before));
    if (session.history.length > HISTORY_CAP) session.history.shift();
    session.landedId = foundationLandedId(before, result.state);
    session.state = result.state;
    session.selected = null;
    session.hintMove = null;
    persist();
    render();
    sounds.place(session.muted);
    if (session.state.won || isWon(session.state)) {
      recordWin();
      return true;
    }
    setStatus(statusForSuccess(result, from, to));
    queueAuto();
    return true;
  }

  function tryMove(from, to) {
    if (session.animating) return false;
    const src = { ...from, count: from.count ?? 1 };
    return commit(moveCards(session.state, src, to), src, to);
  }

  function doDouble(from) {
    if (session.animating) return;
    if ((from.count ?? 1) !== 1 || from.zone === "foundation") {
      if ((from.count ?? 1) !== 1 && from.zone !== "foundation") {
        sounds.illegal(session.muted);
        setStatus("That card cannot move there.");
        nudgeBoard(from);
      }
      return;
    }
    const single = { zone: from.zone, index: from.index, count: 1 };
    const toFoundation = moveCards(session.state, single, { zone: "foundation" });
    if (toFoundation.ok) {
      commit(toFoundation, single, { zone: "foundation" });
      return;
    }
    if (from.zone === "freecell") {
      sounds.illegal(session.muted);
      setStatus("That card cannot move to a foundation.");
      nudgeBoard(single);
      return;
    }
    const index = session.state.freecells.findIndex((card) => card == null);
    if (index < 0) {
      sounds.illegal(session.muted);
      setStatus("No free cell is open.");
      nudgeBoard(single);
      return;
    }
    const toCell = moveCards(session.state, single, { zone: "freecell", index });
    if (!commit(toCell, single, { zone: "freecell", index })) setStatus("That card cannot move there.");
  }

  function doFinish() {
    if (!alive || session.animating || !root.overlay.hidden) return;
    if (session.state.won || isWon(session.state)) return;
    if (!isTriviallySolvable(session.state)) return;
    const snapshot = cloneState(session.state);
    session.history.push(snapshot);
    if (session.history.length > HISTORY_CAP) session.history.shift();
    session.selected = null;
    session.hintMove = null;
    if (root.undo) root.undo.disabled = false;
    syncThumbDisabled();
    queueAuto();
    if (!session.animating && session.history[session.history.length - 1] === snapshot) {
      session.history.pop();
    }
  }

  function doUndo() {
    stopAuto();
    session.landedId = null;
    if (!session.history.length) return;
    const wasWin = session.countedWin && session.state.won;
    session.state = continueClock(session.state, session.history.pop());
    session.selected = null;
    session.hintMove = null;
    session.winShown = false;
    if (wasWin && !session.state.won) {
      session.stats.won = Math.max(0, session.stats.won - 1);
      session.stats.streak = Math.max(0, (session.stats.streak || 0) - 1);
      session.countedWin = false;
    }
    hideOverlay();
    persist();
    render();
    sounds.undo(session.muted);
    setStatus("Undid the last move.");
  }

  function cardsFor(from) {
    if (from.zone === "freecell") {
      const card = session.state.freecells[from.index];
      return card ? [card] : [];
    }
    const pile = session.state.cascades[from.index] ?? [];
    return pile.slice(pile.length - (from.count ?? 1));
  }

  function highlightDrops(from, on) {
    document.querySelectorAll(".slot.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
    if (!on || !from) return;
    for (const move of listLegalMoves(session.state)) {
      if (locKey(move.from) !== locKey(from)) continue;
      document.querySelector(`[data-drop="${move.to.zone}:${move.to.index}"]`)?.classList.add("drop-ok");
    }
  }

  function startDrag(from, x, y, originEl) {
    const cards = cardsFor(from);
    if (!cards.length) return;
    session.drag = { from, x, y, originEl };
    document.documentElement.classList.add("is-dragging");
    const ghost = document.createElement("div");
    ghost.className = "ghost";
    cards.forEach((card, i) => {
      ghost.appendChild(makeCard(card, from, cards.length - i, false));
    });
    root.dragLayer.appendChild(ghost);
    session.drag.ghost = ghost;
    originEl.classList.add("is-ghost-source");
    if (from.zone === "cascade") {
      originEl.parentElement?.querySelectorAll(".card").forEach((el) => {
        if (Number(el.dataset.count) <= from.count) el.classList.add("is-ghost-source");
      });
    }
    moveGhost(x, y);
    highlightDrops(from, true);
  }

  function moveGhost(x, y) {
    const ghost = session.drag?.ghost;
    if (!ghost) return;
    const cardW = ghost.querySelector(".card")?.offsetWidth || 36;
    ghost.style.transform = `translate(${x - cardW / 2}px, ${y - 18}px)`;
  }

  function endDrag(x, y) {
    const drag = session.drag;
    session.drag = null;
    document.documentElement.classList.remove("is-dragging");
    root.dragLayer.innerHTML = "";
    document.querySelectorAll(".is-ghost-source").forEach((el) => el.classList.remove("is-ghost-source"));
    highlightDrops(null, false);
    if (!drag) return false;
    const to = parseDrop(document.elementFromPoint(x, y));
    if (to) return tryMove(drag.from, to);
    sounds.illegal(session.muted);
    setStatus("That card cannot move there.");
    nudgeBoard(drag.from);
    return false;
  }

  function onActivate(loc, cardEl, isDouble) {
    if (isDouble) {
      doDouble(loc);
      return;
    }
    const dest = { zone: loc.zone, index: loc.index };
    if (session.selected) {
      if (locKey(session.selected) === locKey(loc)) {
        session.selected = null;
        render();
        return;
      }
      if (canMove(session.selected, dest)) {
        tryMove(session.selected, dest);
        return;
      }
      if (cardEl?.classList.contains("playable")) {
        const from = { ...session.selected };
        session.selected = loc;
        render();
        sounds.illegal(session.muted);
        setStatus("That card cannot move there.");
        nudgeBoard(from);
        return;
      }
    }
    if (cardEl?.classList.contains("playable")) {
      session.selected = loc;
      render();
      setStatus("Choose a destination, or drag the card.");
      return;
    }
    if (session.selected) tryMove(session.selected, dest);
  }

  function canMove(from, to) {
    return listLegalMoves(session.state).some(
      (move) =>
        locKey(move.from) === locKey(from) &&
        move.to.zone === to.zone &&
        move.to.index === to.index,
    );
  }

  function onPointerDown(event) {
    if (session.animating) return;
    if (event.button != null && event.button !== 0) return;
    if (!root.overlay.hidden) return;
    resumeAudio();
    const cardEl = event.target.closest(".card");
    const slot = event.target.closest("[data-drop]");
    if (!cardEl && !slot) {
      if (session.selected) {
        session.selected = null;
        render();
      }
      return;
    }
    if (!cardEl || cardEl.dataset.zone === "foundation") {
      const dest = parseDrop(slot);
      if (session.selected && dest) tryMove(session.selected, dest);
      return;
    }
    const loc = parseLoc(cardEl);
    if (!loc) return;
    event.preventDefault();
    cardEl.setPointerCapture?.(event.pointerId);
    session.drag = {
      from: loc,
      x: event.clientX,
      y: event.clientY,
      originEl: cardEl,
      pending: true,
    };
  }

  function onPointerMove(event) {
    const drag = session.drag;
    if (!drag?.pending && !drag?.ghost) return;
    if (!drag || drag.clickOnly) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.pending && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (drag.pending) {
      drag.pending = false;
      startDrag(drag.from, event.clientX, event.clientY, drag.originEl);
    } else {
      moveGhost(event.clientX, event.clientY);
    }
  }

  function onPointerUp(event) {
    const drag = session.drag;
    if (!drag) return;
    if (drag.ghost) {
      endDrag(event.clientX, event.clientY);
      session.lastClick = { key: "", at: 0 };
      return;
    }
    session.drag = null;
    const key = locKey(drag.from);
    const now = performance.now();
    const isDouble = key && key === session.lastClick.key && now - session.lastClick.at < DOUBLE_MS;
    session.lastClick = { key, at: now };
    onActivate(drag.from, drag.originEl, isDouble);
  }

  listen(root.table, "pointerdown", onPointerDown);
  listen(window, "pointermove", onPointerMove);
  listen(window, "pointerup", onPointerUp);
  listen(window, "pointercancel", () => {
    document.documentElement.classList.remove("is-dragging");
    if (session.drag?.ghost) endDrag(-1, -1);
    session.drag = null;
  });
  listenLayout(listen, fit);
  function doHint() {
    const move = findHint(session.state);
    session.hintMove = move;
    render();
    if (!move) setStatus("No moves — try Undo or a new deal.");
    else setStatus("A legal move is highlighted.");
    return move;
  }

  listen(root.undo, "click", doUndo);
  listen(root.finish, "click", doFinish);
  const onNew = () => confirmNewDeal();
  listen(document.getElementById("btn-new"), "click", onNew);
  listen(document.getElementById("btn-hint"), "click", doHint);
  bindThumb(listen, { undo: doUndo, hint: doHint, newGame: onNew });
  listen(document.getElementById("btn-help"), "click", showHelp);
  listen(root.mute, "click", () => {
    session.muted = !session.muted;
    savePrefs({ sound: !session.muted });
    updateMute();
  });
  listen(root.overlay, "click", (event) => {
    if (event.target.closest(".tip-panel")) return;
    if (event.target === root.overlay) {
      if (session.modal === "confirm" || session.modal === "help") hideOverlay();
      return;
    }
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "tip") {
      toggleTipPanel(btn.closest(".modal"));
      return;
    }
    if (btn.dataset.act === "close") hideOverlay();
    else if (btn.dataset.act === "new") {
      if (gameInProgress()) session.stats.streak = 0;
      if (btn.dataset.daily === "1") startDaily();
      else startDeal(Number(btn.dataset.deal) || randomDeal());
    }
  });
  listen(root.overlay, "submit", (event) => {
    if (!event.target.closest("[data-deal-form]")) return;
    event.preventDefault();
    const input = root.overlay.querySelector("[data-testid='deal-input']");
    const raw = String(input?.value ?? "").trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < 1 || n > 32000) {
      setStatus("Enter a deal from 1 to 32000.");
      return;
    }
    confirmNewDeal(n);
  });
  listen(window, "keydown", (event) => {
    if (event.target.matches("input, textarea")) {
      if (event.key === "Escape") hideOverlay();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (!root.overlay.hidden) hideOverlay();
      else if (session.selected) {
        session.selected = null;
        render();
      }
      return;
    }
    if (!root.overlay.hidden) return;
    if (key === "u" || (key === "z" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      doUndo();
    } else if (key === "n") confirmNewDeal();
    else if (key === "h") doHint();
    else if (key === "?" || (event.shiftKey && key === "/")) showHelp();
  });

  const timer = window.setInterval(refreshMeters, 250);
  const clockObserver = new MutationObserver(() => syncPlayClock());
  if (root.overlay) {
    clockObserver.observe(root.overlay, { attributes: true, attributeFilter: ["hidden"] });
  }
  listen(document, "visibilitychange", () => {
    syncPlayClock();
    refreshMeters();
    if (session.state) persist();
  });
  // Save the frozen elapsed time when the page goes away (reload, close, app switch).
  listen(window, "pagehide", () => {
    if (session.state) persist();
  });
  render();
  refreshMeters();
  setStatus("Move a card into a free cell, cascade, or foundation.");
  persist();
  if (bootDailyConfirm) confirmNewDeal(undefined, { daily: true });

  return {
    getState: () => session.state,
    setState(next) {
      stopAuto();
      session.landedId = null;
      session.state = next;
      session.selected = null;
      session.hintMove = null;
      session.winShown = false;
      session.clockPlayed = (next?.moves > 0) || session.history.length > 0;
      persist();
      render();
      refreshMeters();
      if (session.state?.won) showWin();
      else hideOverlay();
    },
    newGame: (dealNumber) => startDeal(Number.isInteger(dealNumber) ? dealNumber : randomDeal()),
    hint: doHint,
    undo: doUndo,
    move(from, to) {
      if (session.animating) return { ok: false, reason: "finishing", state: session.state };
      const result = moveCards(session.state, from, to);
      if (!result.ok) {
        sounds.illegal(session.muted);
        setStatus("That card cannot move there.");
        nudgeBoard(from);
        return result;
      }
      commit(result, from, to);
      return { ok: true, state: session.state };
    },
    isAnimating: () => session.animating === true,
    historyLength: () => session.history.length,
    listMoves: () => listLegalMoves(session.state),
    unmount() {
      if (session.state) persist();
      alive = false;
      stopAuto();
      document.documentElement.classList.remove("is-dragging");
      ac.abort();
      window.clearInterval(timer);
      clockObserver.disconnect();
      session.drag = null;
      clearLayoutVars();
      if (root.dragLayer) root.dragLayer.innerHTML = "";
      if (root.table) root.table.innerHTML = "";
      if (toolbar) toolbar.innerHTML = "";
      hideOverlay();
    },
  };
}
