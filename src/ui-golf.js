import { makeCardElement } from "./card-view.js";
import {
  apply,
  canPlay,
  cardsLeft,
  cloneState,
  continueClock,
  deal,
  elapsedMs,
  hint as findHint,
  isCleared,
  listLegalMoves,
  score,
} from "./game/golf.js";
import { meterElapsed, restoreClock, syncClock } from "./game/clock.js";
import { resumeAudio, sounds } from "./audio.js";
import { loadGolf, loadPrefs, saveGolf, savePrefs } from "./storage.js";
import { offerInstallHint } from "./install-hint.js";
import { shakeMoved } from "./motion.js";
import { tipEntryHTML, toggleTipPanel, winScreenTipHTML } from "./tip.js";
import { dailyDoneText, dailyOpenPlan, dailySeed, nextDailyStreak, seedStatusText, todayKey } from "./daily.js";
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
const HISTORY_CAP = 200;
const GAP = 4;

const ICONS = {
  mute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`,
  unmute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5-4.5-1.4 1.4A6.5 6.5 0 0 1 18 12a6.5 6.5 0 0 1-3.9 5.9l1.4 1.4A8.5 8.5 0 0 0 20 12a8.5 8.5 0 0 0-4.5-7.5zM16 4.2 4.2 16l1.4 1.4L17.4 5.6 16 4.2z"/></svg>`,
};

export function mount(options = {}) {
  const ac = new AbortController();
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, { ...options, signal: ac.signal });
  };

  const kicker = document.getElementById("game-kicker");
  if (kicker) kicker.textContent = "Golf";
  const scoreWrap = document.getElementById("meter-score-wrap");
  const scoreLabel = scoreWrap?.querySelector("dt");
  if (scoreWrap) scoreWrap.hidden = false;
  if (scoreLabel) scoreLabel.textContent = "Left";
  document.body.dataset.game = "golf";

  const toolbar = document.getElementById("toolbar");
  if (toolbar) {
    toolbar.innerHTML = `
      <button type="button" class="btn" id="btn-undo" data-testid="btn-undo" title="Undo (U)">Undo</button>
      <button type="button" class="btn" id="btn-new" data-testid="btn-new" aria-label="New deal" title="New deal (N)">New</button>
      <button type="button" class="btn" id="btn-hint" data-testid="btn-hint" title="Hint (H)">Hint</button>
      <button type="button" class="icon-btn" id="btn-help" data-testid="btn-help" aria-label="Help">?</button>
      <button type="button" class="icon-btn" id="btn-mute" data-testid="btn-sound" aria-label="Turn sound on"></button>`;
  }

  const root = {
    table: document.getElementById("table"),
    overlay: document.getElementById("overlay"),
    dragLayer: document.getElementById("drag-layer"),
    time: document.getElementById("meter-time"),
    moves: document.getElementById("meter-moves"),
    left: document.getElementById("meter-score"),
    status: document.getElementById("status-text"),
    seed: document.getElementById("status-seed"),
    undo: document.getElementById("btn-undo"),
    mute: document.getElementById("btn-mute"),
  };

  const saved = loadGolf();
  const session = {
    state: null,
    history: [],
    stats: saved.stats,
    drag: null,
    hintMove: null,
    muted: loadPrefs().sound !== true,
    modal: null,
    endShown: false,
    notedEnd: false,
    countedClear: false,
    improvedBest: false,
    missedRound: false,
    clockPlayed: false,
    streakBeforeMiss: 0,
    bestSnapshot: saved.stats.bestScore,
  };

  const params = new URLSearchParams(location.search);
  const rawSeed = params.get("seed");
  const urlSeed = rawSeed == null || rawSeed === "" ? null : Number(rawSeed);
  const honorSeed = params.get("game") === "golf" && urlSeed != null && Number.isFinite(urlSeed);
  const wantDaily = options.daily === true || (params.get("daily") === "1" && params.get("game") === "golf");
  const today = todayKey();
  const plan = wantDaily
    ? dailyOpenPlan(saved.state, today, {
        isFinished: (state) => !!state.over,
        needsConfirm: (state) => state.moves > 0 && !state.over,
      })
    : null;
  let bootDailyConfirm = false;
  const resume =
    plan === "resume" || plan === "confirm" || (!wantDaily && !honorSeed && saved.state && !saved.state.over);
  if (plan === "confirm") bootDailyConfirm = true;
  if (resume) {
    session.state = saved.state;
    session.history = (saved.history ?? []).slice(-HISTORY_CAP);
    if (!session.state.startedAt || typeof saved.savedAt === "number") {
      restoreClock(session.state, saved.savedAt);
    }
  }

  let alive = true;

  function persist() {
    saveGolf({
      state: session.state,
      history: session.history.slice(-HISTORY_CAP),
      stats: session.stats,
      savedAt: Date.now(),
    });
  }

  function setStatus(text) {
    if (root.status) root.status.textContent = text;
    if (window.innerWidth <= 600) requestAnimationFrame(() => fit());
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function statusFor(result) {
    if (result.reason === "stock is empty") return "The stock is empty.";
    if (result.reason === "round is over") return "The round is over.";
    if (result.reason === "column is empty") return "That column is empty.";
    return "That card is not one above or below.";
  }

  function wasteTop() {
    const waste = session.state?.waste;
    return waste?.length ? waste[waste.length - 1] : null;
  }

  function exposedCard(col) {
    const pile = session.state?.columns?.[col] ?? [];
    return pile.length ? pile[pile.length - 1] : null;
  }

  function parseLoc(el) {
    if (!el?.dataset?.zone) return null;
    const zone = el.dataset.zone;
    if (zone === "stock" || zone === "waste") return { zone };
    return {
      zone,
      index: Number(el.dataset.index),
      count: Number(el.dataset.count || 1),
    };
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
    slot.dataset.drop = index == null ? zone : `${zone}:${index}`;
    slot.dataset.zone = zone;
    if (index != null) slot.dataset.index = String(index);
    fill(slot);
    return slot;
  }

  function clearLayoutVars() {
    for (const key of ["--card-w", "--card-h", "--golf-peek", "--fc-peek", "--peek-up", "--peek-down", "--col-gap", "--waste-extra", "--waste-spread"]) {
      document.body.style.removeProperty(key);
    }
  }

  function applyGolfFit(cardW, cardH, peek) {
    const style = document.body.style;
    style.setProperty("--card-w", `${cardW}px`);
    style.setProperty("--card-h", `${cardH}px`);
    style.setProperty("--golf-peek", `${peek}px`);
    style.setProperty("--col-gap", `${GAP}px`);
  }

  function fit() {
    const board = root.table?.querySelector(".board.golf");
    if (!board) return;
    const width = board.clientWidth;
    if (!width) return;
    let cardW = Math.max(30, Math.min(120, Math.floor((width - GAP * 6) / 7)));
    let cardH = Math.round(cardW * 1.42);
    const longest = Math.max(1, ...session.state.columns.map((pile) => pile.length));
    const headerH = document.querySelector(".topbar")?.offsetHeight ?? 0;
    const statusH = document.querySelector(".status")?.offsetHeight ?? 0;
    const table = root.table;
    const ts = table ? getComputedStyle(table) : null;
    const padY = ts ? (parseFloat(ts.paddingTop) || 0) + (parseFloat(ts.paddingBottom) || 0) : 0;
    const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
    const bottomH = board.querySelector(".golf-bottom")?.offsetHeight || cardH;
    let peek = Math.round(cardW * 0.56);

    if (window.innerWidth <= 600) {
      const contentSpace = Math.floor(window.innerHeight - layoutBottomInset() - headerH - statusH - padY - gap - 4);
      const steps = Math.max(0, longest - 1);
      const fitsWidth = (w) => {
        const ch = Math.round(w * 1.42);
        return ch + steps + ch <= contentSpace;
      };
      if (!fitsWidth(cardW)) cardW = shrinkToFit(cardW, 24, fitsWidth);
      cardH = Math.round(cardW * 1.42);
      peek = Math.round(cardW * 0.56);
      const avail = contentSpace - cardH;
      if (steps > 0) {
        if (isPhonePortrait()) peek = fanPeek(peek, cardH, avail, steps);
        else peek = Math.max(1, Math.min(peek, Math.floor((avail - cardH) / steps)));
      }
      applyGolfFit(cardW, cardH, peek);
      return;
    }

    const avail = window.innerHeight - layoutBottomInset() - headerH - statusH - bottomH - padY - gap - 4;
    if (longest > 1) {
      const room = Math.floor((avail - cardH) / (longest - 1));
      peek = Math.max(12, Math.min(peek, room));
    }
    applyGolfFit(cardW, cardH, peek);
  }

  function updateMute() {
    if (!root.mute) return;
    root.mute.innerHTML = session.muted ? ICONS.unmute : ICONS.mute;
    root.mute.setAttribute("aria-label", session.muted ? "Turn sound on" : "Turn sound off");
    root.mute.setAttribute("aria-pressed", session.muted ? "false" : "true");
  }

  function nudgeBoard(from) {
    shakeMoved(from);
  }

  function render() {
    const state = session.state;
    const board = document.createElement("div");
    board.className = "board golf";

    const columns = document.createElement("div");
    columns.className = "golf-columns";
    columns.setAttribute("aria-label", "Columns");
    const topCard = wasteTop();
    state.columns.forEach((pile, index) => {
      columns.appendChild(
        renderSlot("column", index, (slot) => {
          slot.appendChild(well(""));
          const stack = document.createElement("div");
          stack.className = "pile";
          pile.forEach((card, row) => {
            const exposed = row === pile.length - 1;
            const playable = exposed && canPlay(card, topCard);
            const el = makeCardElement(card, { zone: "column", index }, exposed ? 1 : pile.length - row, playable, false);
            el.style.zIndex = String(row + 1);
            stack.appendChild(el);
          });
          slot.appendChild(stack);
        }),
      );
    });

    const bottom = document.createElement("div");
    bottom.className = "golf-bottom";
    bottom.setAttribute("aria-label", "Stock and waste");
    bottom.appendChild(
      renderSlot("stock", null, (slot) => {
        slot.appendChild(well(""));
        if (state.stock.length) {
          const back = makeCardElement(
            { ...state.stock[state.stock.length - 1], faceUp: false },
            { zone: "stock" },
            1,
            false,
            false,
          );
          slot.appendChild(back);
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = String(state.stock.length);
          slot.appendChild(badge);
        }
      }),
    );
    bottom.appendChild(
      renderSlot("waste", null, (slot) => {
        slot.appendChild(well(""));
        if (state.waste.length) {
          const card = state.waste[state.waste.length - 1];
          slot.appendChild(makeCardElement(card, { zone: "waste" }, 1, false, false));
        }
      }),
    );

    board.append(columns, bottom);
    root.table.replaceChildren(board);
    root.moves.textContent = String(state.moves);
    if (root.left) root.left.textContent = String(cardsLeft(state));
    if (root.seed) root.seed.textContent = seedStatusText(state);
    if (root.undo) root.undo.disabled = session.history.length === 0;
    syncThumbDisabled();
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
    if (!alive || !session.state) return;
    syncPlayClock();
    if (root.time) root.time.textContent = formatTime(readMeter());
    if (root.moves) root.moves.textContent = String(session.state.moves);
    if (root.left) root.left.textContent = String(cardsLeft(session.state));
  }

  function hideOverlay() {
    const celebrate = session.modal === "win" && isCleared(session.state);
    session.modal = null;
    if (!root.overlay) {
      if (celebrate) offerInstallHint();
      return;
    }
    root.overlay.hidden = true;
    root.overlay.innerHTML = "";
    syncPlayClock();
    if (celebrate) offerInstallHint();
  }

  function applyHintHighlight() {
    const move = session.hintMove;
    if (!move) return;
    if (move.type === "draw") {
      document.querySelector('[data-drop="stock"]')?.classList.add("hint-to");
      return;
    }
    if (move.type === "play") {
      document
        .querySelector(`.card[data-zone="column"][data-index="${move.col}"][data-count="1"]`)
        ?.classList.add("hint-from");
      document.querySelector('[data-drop="waste"]')?.classList.add("hint-to");
    }
  }

  function showEnd() {
    const state = session.state;
    session.endShown = true;
    session.modal = "win";
    const cleared = isCleared(state);
    const value = score(state);
    const best = session.stats.bestScore;
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="win-modal">
      <h2>${cleared ? "Course cleared" : "Round over"}</h2>
      <p>Score ${value} (lower is better)</p>
      <ul class="stats-line">
        <li><span>Cards left</span>${cardsLeft(state)}</li>
        <li><span>Stock left</span>${state.stock.length}</li>
        <li><span>Best score</span>${best == null ? "—" : best}</li>
      </ul>
      <p data-testid="win-count">Courses cleared ${session.stats.cleared}</p>
      ${winScreenTipHTML(session.stats.streak)}
      ${dailyDoneHTML()}
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close">Close</button>
        <button type="button" class="btn" data-act="replay">Replay this deal</button>
        <button type="button" class="btn primary" data-act="new">New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function showHelp() {
    session.modal = "help";
    root.overlay.hidden = false;
    const gestures = `<p>Tap the exposed card of a column to play it onto the waste.</p><p>Drag that card onto the waste to choose it. Tap the stock to draw.</p>`;
    const shortcuts = `<li><kbd>N</kbd> new deal</li><li><kbd>U</kbd> or <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li><li><kbd>H</kbd> hint</li><li><kbd>Space</kbd> draw</li><li><kbd>R</kbd> replay</li>`;
    root.overlay.innerHTML = `<div class="modal" data-testid="help-modal">
      <h2>Golf</h2>
      ${touchTipsHTML(gestures)}
      <div class="modal-actions help-deal">
        <p data-testid="deal-number">Seed ${session.state.seed}</p>
        <button type="button" class="btn" data-act="replay" data-testid="btn-replay">Replay this deal</button>
      </div>
      <p>Seven columns of five face-up cards. The next card starts the waste, and the other sixteen stay face down in the stock.</p>
      <p>Play the exposed card of a column onto the waste when it is one rank higher or one rank lower. Suit does not matter. Only that exposed card can be played.</p>
      <p>No wrap: nothing can be played on a King, and Aces take only a 2.</p>
      <p>Tap the stock to draw one card. The stock is a single pass and does not recycle. Clear the columns. Score is the number of cards left in the columns, or minus the cards still in the stock when you clear them. Lower is better.</p>
      ${kbdTipsHTML(shortcuts)}
      <div class="modal-actions">
        <button type="button" class="btn primary" data-act="close">Close</button>
      </div>
      ${tipEntryHTML("help-tip")}
    </div>`;
    syncPlayClock();
  }

  function gameInProgress() {
    return session.state.moves > 0 && !session.state.over;
  }

  function confirmNewDeal(extra = {}) {
    if (!gameInProgress()) {
      if (extra.daily) startDaily();
      else startDeal(undefined);
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
        <button type="button" class="btn primary" data-act="new" data-testid="confirm-ok"${dailyAttr}>New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function confirmReplay() {
    if (!gameInProgress()) {
      replay();
      return;
    }
    session.modal = "confirm";
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="confirm-modal">
      <h2>Replay this deal?</h2>
      <p>The current deal will be abandoned.</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close" data-testid="confirm-cancel">Keep playing</button>
        <button type="button" class="btn primary" data-act="replay" data-testid="confirm-ok">Replay</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function noteRoundEnd() {
    if (!session.state?.over || session.notedEnd) return;
    session.notedEnd = true;
    const value = score(session.state);
    if (isCleared(session.state)) {
      session.stats.cleared += 1;
      session.countedClear = true;
      session.stats.streak = (session.stats.streak || 0) + 1;
      session.stats.bestStreak = Math.max(session.stats.bestStreak || 0, session.stats.streak);
      session.missedRound = false;
    } else {
      session.streakBeforeMiss = session.stats.streak || 0;
      session.stats.streak = 0;
      session.missedRound = true;
    }
    if (session.stats.bestScore == null || value < session.stats.bestScore) {
      session.bestSnapshot = session.stats.bestScore;
      session.stats.bestScore = value;
      session.improvedBest = true;
    } else {
      session.improvedBest = false;
    }
    creditDaily();
    showEnd();
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

  function startDeal(seed, extra = {}) {
    hideOverlay();
    const dailyKey = extra.daily ? todayKey() : extra.dailyKey || null;
    const resolved = extra.daily ? dailySeed("golf", dailyKey) : seed;
    session.history = [];
    session.clockPlayed = false;
    session.drag = null;
    session.hintMove = null;
    session.endShown = false;
    session.notedEnd = false;
    session.countedClear = false;
    session.improvedBest = false;
    session.missedRound = false;
    session.state = deal({ seed: resolved });
    if (dailyKey) session.state.daily = dailyKey;
    session.stats.played += 1;
    persist();
    render();
    refreshMeters();
    setStatus("Play a card one rank above or below the waste.");
  }

  function startDaily() {
    startDeal(undefined, { daily: true });
  }

  function replay() {
    startDeal(session.state.seed, { dailyKey: session.state.daily || null });
  }

  function doApply(action) {
    const result = apply(session.state, action);
    if (!result.ok) {
      setStatus(statusFor(result));
      const from =
        action?.type === "play"
          ? { zone: "column", index: action.col, count: 1 }
          : action?.type === "draw"
            ? { zone: "stock" }
            : null;
      nudgeBoard(from);
      return result;
    }
    session.history.push(cloneState(session.state));
    if (session.history.length > HISTORY_CAP) session.history.shift();
    session.state = result.state;
    session.hintMove = null;
    if (session.state.over) noteRoundEnd();
    persist();
    render();
    refreshMeters();
    if (action?.type === "draw") sounds.draw(session.muted);
    else sounds.place(session.muted);
    if (session.state.over) {
      setStatus(isCleared(session.state) ? "Course cleared." : "No more moves.");
    } else if (action?.type === "draw") {
      setStatus("Drew from the stock.");
    } else {
      setStatus("Played onto the waste.");
    }
    return { ok: true, state: session.state };
  }

  function doUndo() {
    if (!session.history.length) return;
    const wasOver = session.state.over;
    const wasCleared = wasOver && session.countedClear && isCleared(session.state);
    session.state = continueClock(session.state, session.history.pop());
    session.hintMove = null;
    if (wasCleared && !isCleared(session.state)) {
      session.stats.cleared = Math.max(0, session.stats.cleared - 1);
      session.countedClear = false;
      session.stats.streak = Math.max(0, (session.stats.streak || 0) - 1);
    }
    if (wasOver && !session.state.over && session.missedRound) {
      session.stats.streak = session.streakBeforeMiss || 0;
      session.missedRound = false;
    }
    if (wasOver && !session.state.over && session.improvedBest) {
      session.stats.bestScore = session.bestSnapshot;
      session.improvedBest = false;
    }
    session.endShown = false;
    session.notedEnd = !!session.state.over;
    hideOverlay();
    persist();
    render();
    refreshMeters();
    sounds.undo(session.muted);
    setStatus("Undid the last move.");
  }

  function highlightWaste(card, on) {
    document.querySelectorAll(".slot.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
    if (!on || !card) return;
    if (canPlay(card, wasteTop())) document.querySelector('[data-drop="waste"]')?.classList.add("drop-ok");
  }

  function moveGhost(x, y) {
    const ghost = session.drag?.ghost;
    if (!ghost) return;
    const cardW = ghost.querySelector(".card")?.offsetWidth || 36;
    ghost.style.transform = `translate(${x - cardW / 2}px, ${y - 18}px)`;
  }

  function startDrag(from, x, y, originEl) {
    const card = exposedCard(from.index);
    if (!card || !originEl) return;
    session.drag = { from, x, y, originEl };
    document.documentElement.classList.add("is-dragging");
    const ghost = document.createElement("div");
    ghost.className = "ghost";
    ghost.appendChild(makeCardElement(card, from, 1, false, false));
    root.dragLayer.appendChild(ghost);
    session.drag.ghost = ghost;
    originEl.classList.add("is-ghost-source");
    moveGhost(x, y);
    highlightWaste(card, true);
  }

  function endDrag(x, y) {
    const drag = session.drag;
    session.drag = null;
    document.documentElement.classList.remove("is-dragging");
    if (root.dragLayer) root.dragLayer.innerHTML = "";
    document.querySelectorAll(".is-ghost-source").forEach((el) => el.classList.remove("is-ghost-source"));
    highlightWaste(null, false);
    if (!drag || drag.from?.zone !== "column") return;
    const drop = document.elementFromPoint(x, y)?.closest?.("[data-drop]");
    if (drop?.dataset.zone === "waste") {
      doApply({ type: "play", col: drag.from.index });
      return;
    }
    sounds.illegal(session.muted);
    setStatus("That card cannot move there.");
    nudgeBoard(drag.from);
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    if (!root.overlay?.hidden) return;
    if (session.state?.over) return;
    resumeAudio();
    const cardEl = event.target.closest?.(".card");
    const slot = event.target.closest?.("[data-drop]");
    if (!cardEl && slot?.dataset.zone === "stock") {
      event.preventDefault();
      session.drag = { from: { zone: "stock" }, x: event.clientX, y: event.clientY, clickOnly: true };
      return;
    }
    if (!cardEl) return;
    const loc = parseLoc(cardEl);
    if (!loc || loc.zone === "waste") return;
    event.preventDefault();
    cardEl.setPointerCapture?.(event.pointerId);
    if (loc.zone === "stock") {
      session.drag = {
        from: loc,
        x: event.clientX,
        y: event.clientY,
        originEl: cardEl,
        clickOnly: true,
      };
      return;
    }
    const exposed = Number(cardEl.dataset.count) === 1;
    session.drag = {
      from: loc,
      x: event.clientX,
      y: event.clientY,
      originEl: cardEl,
      pending: exposed,
      clickOnly: !exposed,
    };
  }

  function onPointerMove(event) {
    const drag = session.drag;
    if (!drag || drag.clickOnly) return;
    if (!drag.pending && !drag.ghost) return;
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
      return;
    }
    session.drag = null;
    if (drag.from?.zone === "stock") {
      doApply({ type: "draw" });
      return;
    }
    if (drag.from?.zone !== "column") return;
    if (Number(drag.originEl?.dataset.count) !== 1) {
      sounds.illegal(session.muted);
      setStatus("Only the exposed card can be played.");
      nudgeBoard({ zone: "column", index: drag.from.index, count: Number(drag.originEl?.dataset.count) || 1 });
      return;
    }
    doApply({ type: "play", col: drag.from.index });
  }

  listen(root.table, "pointerdown", onPointerDown);
  listen(window, "pointermove", onPointerMove);
  listen(window, "pointerup", onPointerUp);
  listen(window, "pointercancel", () => {
    document.documentElement.classList.remove("is-dragging");
    if (session.drag?.ghost) {
      if (root.dragLayer) root.dragLayer.innerHTML = "";
      document.querySelectorAll(".is-ghost-source").forEach((el) => el.classList.remove("is-ghost-source"));
      highlightWaste(null, false);
    }
    session.drag = null;
  });
  listenLayout(listen, fit);
  function doHint() {
    const move = findHint(session.state);
    session.hintMove = move;
    render();
    if (!move) setStatus("No moves — try Undo or a new deal.");
    else if (move.type === "draw") setStatus("Draw from the stock.");
    else setStatus("A legal move is highlighted.");
    return move;
  }

  listen(root.undo, "click", doUndo);
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
      hideOverlay();
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
      else startDeal(undefined);
    } else if (btn.dataset.act === "replay") {
      if (session.modal === "help") confirmReplay();
      else {
        if (gameInProgress()) session.stats.streak = 0;
        replay();
      }
    }
  });
  listen(window, "keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.target.matches?.("input, textarea")) {
      if (event.key === "Escape") hideOverlay();
      return;
    }
    if (key === "escape") {
      hideOverlay();
      return;
    }
    if (!root.overlay?.hidden) return;
    if (key === "u" || (key === "z" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      doUndo();
    } else if (key === "n") confirmNewDeal();
    else if (key === "r") confirmReplay();
    else if (key === "h") doHint();
    else if (key === " " || event.key === "Spacebar") {
      event.preventDefault();
      doApply({ type: "draw" });
    } else if (key === "?" || (event.shiftKey && event.key === "/")) showHelp();
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
  if (resume) {
    persist();
    render();
    refreshMeters();
    setStatus("Play a card one rank above or below the waste.");
    if (bootDailyConfirm) confirmNewDeal({ daily: true });
  } else if (wantDaily) {
    startDaily();
  } else {
    startDeal(honorSeed ? urlSeed : undefined);
  }

  return {
    getState: () => session.state,
    setState(next) {
      session.state = next;
      session.drag = null;
      session.hintMove = null;
      session.endShown = false;
      session.notedEnd = !!next?.over;
      session.countedClear = false;
      session.improvedBest = false;
      session.missedRound = false;
      session.clockPlayed = (next?.moves > 0) || session.history.length > 0;
      persist();
      render();
      refreshMeters();
      if (next?.over) showEnd();
      else hideOverlay();
    },
    newGame(options) {
      const seed = options && typeof options === "object" ? options.seed : options;
      startDeal(seed);
    },
    undo: doUndo,
    hint: doHint,
    move: (action) => doApply(action),
    apply: (action) => doApply(action),
    historyLength: () => session.history.length,
    listMoves: () => listLegalMoves(session.state),
    unmount() {
      if (session.state) persist();
      alive = false;
      document.documentElement.classList.remove("is-dragging");
      ac.abort();
      window.clearInterval(timer);
      clockObserver.disconnect();
      session.drag = null;
      clearLayoutVars();
      if (scoreLabel) scoreLabel.textContent = "Score";
      if (root.dragLayer) root.dragLayer.innerHTML = "";
      if (root.table) root.table.innerHTML = "";
      if (toolbar) toolbar.innerHTML = "";
      hideOverlay();
    },
  };
}
