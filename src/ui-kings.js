import { makeCardElement } from "./card-view.js";
import {
  apply,
  cardsInCorners,
  cloneState,
  continueClock,
  deal,
  elapsedMs,
  hint as findHint,
  isWon,
  listLegalMoves,
} from "./game/kings.js";
import { meterElapsed, restoreClock, syncClock } from "./game/clock.js";
import { resumeAudio, sounds } from "./audio.js";
import { loadKings, loadPrefs, saveKings, savePrefs } from "./storage.js";
import { offerInstallHint } from "./install-hint.js";
import { shakeMoved } from "./motion.js";
import { creditHTML, tipEntryHTML, toggleTipPanel, winScreenTipHTML } from "./tip.js";
import { dailyDoneText, dailyOpenPlan, dailySeed, nextDailyStreak, seedStatusText, todayKey } from "./daily.js";
import {
  bindThumb,
  fanPeek,
  isPhonePortrait,
  kbdTipsHTML,
  layoutBottomInset,
  listenLayout,
  syncThumbDisabled,
  touchTipsHTML,
} from "./phone-layout.js";

const DRAG_THRESHOLD = 7;
const DOUBLE_MS = 420;
const HISTORY_CAP = 200;
const SIDE_NAME = ["North", "East", "South", "West"];
const CORNER_NAME = ["Northwest", "Northeast", "Southwest", "Southeast"];

const ICONS = {
  mute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`,
  unmute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5-4.5-1.4 1.4A6.5 6.5 0 0 1 18 12a6.5 6.5 0 0 1-3.9 5.9l1.4 1.4A8.5 8.5 0 0 0 20 12a8.5 8.5 0 0 0-4.5-7.5zM16 4.2 4.2 16l1.4 1.4L17.4 5.6 16 4.2z"/></svg>`,
  recycle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8a8 8 0 0 1 13.2-6M20 16a8 8 0 0 1-13.2 6"/><path d="M17 3h4v4M7 21H3v-4"/></svg>`,
};

export function mount(options = {}) {
  const ac = new AbortController();
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, { ...options, signal: ac.signal });
  };

  const kicker = document.getElementById("game-kicker");
  if (kicker) kicker.textContent = "King's Corners";
  const scoreWrap = document.getElementById("meter-score-wrap");
  const scoreLabel = scoreWrap?.querySelector("dt");
  if (scoreWrap) scoreWrap.hidden = false;
  if (scoreLabel) scoreLabel.textContent = "Corners";
  document.body.dataset.game = "kings";

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
    home: document.getElementById("meter-score"),
    status: document.getElementById("status-text"),
    seed: document.getElementById("status-seed"),
    undo: document.getElementById("btn-undo"),
    mute: document.getElementById("btn-mute"),
  };

  const saved = loadKings();
  const session = {
    state: null,
    history: [],
    stats: saved.stats,
    selected: null,
    hintMove: null,
    drag: null,
    lastClick: { key: "", at: 0 },
    muted: loadPrefs().sound !== true,
    countedWin: false,
    clockPlayed: false,
    modal: null,
  };

  const params = new URLSearchParams(location.search);
  const rawSeed = params.get("seed");
  const urlSeed = rawSeed == null || rawSeed === "" ? null : Number(rawSeed);
  const honorSeed = params.get("game") === "kings" && urlSeed != null && Number.isFinite(urlSeed);
  const wantDaily = options.daily === true || (params.get("daily") === "1" && params.get("game") === "kings");
  const today = todayKey();
  const plan = wantDaily
    ? dailyOpenPlan(saved.state, today, {
        isFinished: (state) => !!(state.won || isWon(state)),
        needsConfirm: (state) => state.moves > 0 && !state.won && !isWon(state) && !state.stuck,
      })
    : null;
  let bootDailyConfirm = false;
  const resume =
    plan === "resume" ||
    plan === "confirm" ||
    (!wantDaily && !honorSeed && saved.state && !saved.state.won && !isWon(saved.state));
  if (plan === "confirm") bootDailyConfirm = true;
  if (resume) {
    session.state = saved.state;
    session.history = (saved.history ?? []).slice(-HISTORY_CAP);
    if (!session.state.startedAt || typeof saved.savedAt === "number") {
      restoreClock(session.state, saved.savedAt);
    }
  }

  let alive = true;
  let observer = null;

  function persist() {
    saveKings({
      state: session.state,
      history: session.history.slice(-HISTORY_CAP),
      stats: session.stats,
      savedAt: Date.now(),
    });
  }

  function setStatus(text) {
    if (root.status) root.status.textContent = text;
    if (alive) requestAnimationFrame(() => fit());
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function locKey(loc) {
    if (!loc) return "";
    if (loc.zone === "waste") return "waste";
    return `${loc.zone}:${loc.index ?? ""}:${loc.count ?? 1}`;
  }

  function normalize(loc) {
    if (!loc) return null;
    if (loc.zone === "waste") return { zone: "waste" };
    if (loc.zone === "side") return { zone: "side", index: loc.index, count: loc.count ?? 1 };
    return { zone: loc.zone, index: loc.index };
  }

  function parseLoc(el) {
    if (!el?.dataset?.zone) return null;
    const zone = el.dataset.zone;
    if (zone === "stock" || zone === "waste") return { zone };
    return {
      zone,
      index: el.dataset.index == null || el.dataset.index === "" ? undefined : Number(el.dataset.index),
      count: Number(el.dataset.count || 1),
    };
  }

  function pileAt(index) {
    return session.state?.sides?.[index] ?? [];
  }

  function isMovable(loc) {
    if (!loc) return false;
    if (loc.zone === "waste") return (session.state?.waste?.length ?? 0) > 0;
    if (loc.zone !== "side") return false;
    const pile = pileAt(loc.index);
    const count = loc.count ?? 1;
    return pile.length > 0 && (count === 1 || count === pile.length);
  }

  function isWholePileTap(loc) {
    if (loc?.zone !== "side") return false;
    const pile = pileAt(loc.index);
    return pile.length > 1 && loc.count === pile.length;
  }

  function statusFor(result) {
    if (result.reason === "partial runs cannot move") return "Only the top card or the whole pile can move.";
    if (result.reason === "cards cannot leave a corner") return "Cards in a corner stay there.";
    if (result.reason === "nothing to draw") return "Nothing left to turn.";
    if (result.reason === "game already won") return "Four kings home.";
    if (result.reason === "waste is empty") return "The waste is empty.";
    if (result.reason === "side is empty") return "That side pile is empty.";
    return "That card cannot move there.";
  }

  function canDrop(from, to) {
    if (!to || (to.zone !== "side" && to.zone !== "corner")) return false;
    const key = locKey(normalize(from));
    return listLegalMoves(session.state).some(
      (move) => move.kind === "move" && locKey(move.from) === key && move.to.zone === to.zone && move.to.index === to.index,
    );
  }

  function rowSelected(index, row, pileLength) {
    const sel = session.selected;
    if (!sel || sel.zone !== "side" || sel.index !== index) return false;
    const count = sel.count ?? 1;
    if (count === pileLength && pileLength > 1) return true;
    return count === 1 && row === pileLength - 1;
  }

  function clearLayoutVars() {
    for (const key of [
      "--card-w",
      "--card-h",
      "--kc-peek",
      "--kc-inner-gap",
      "--kc-row-gap",
      "--fc-peek",
      "--peek-up",
      "--peek-down",
      "--col-gap",
      "--waste-extra",
      "--waste-spread",
    ]) {
      document.body.style.removeProperty(key);
    }
  }

  function fit() {
    const board = root.table?.querySelector(".board.kings");
    if (!board || !session.state) return;
    const width = board.clientWidth;
    if (!width) return;
    const colGap = 6;
    const innerGap = 4;
    const rowGap = 6;
    let cardW = Math.floor((width - colGap * 2 - innerGap) / 4);
    if (window.innerWidth <= 600) cardW = Math.max(22, cardW);
    else cardW = Math.max(26, Math.min(118, cardW));

    const lengths = session.state.sides.map((pile) => Math.max(1, pile.length));
    const extra =
      lengths[0] -
      1 +
      (Math.max(lengths[1], lengths[3]) - 1) +
      (lengths[2] - 1);

    const headerH = document.querySelector(".topbar")?.offsetHeight ?? 0;
    const statusH = document.querySelector(".status")?.offsetHeight ?? 0;
    const table = root.table;
    const ts = table ? getComputedStyle(table) : null;
    const padY = ts ? (parseFloat(ts.paddingTop) || 0) + (parseFloat(ts.paddingBottom) || 0) : 0;
    const phone = window.innerWidth <= 600;
    let avail = window.innerHeight - headerH - statusH - padY - rowGap * 2 - 8 - layoutBottomInset();
    if (!phone && avail < 90) avail = 90;

    let cardH = Math.round(cardW * 1.42);
    const minPeek = extra > 0 ? 1 : 0;
    const minCard = phone ? 24 : 36;
    if (cardH * 3 + extra * minPeek > avail) {
      cardH = Math.max(minCard, Math.floor((avail - extra * minPeek) / 3));
      cardW = Math.max(phone ? 22 : 26, Math.min(cardW, Math.floor(cardH / 1.42)));
      cardH = Math.round(cardW * 1.42);
      if (cardH * 3 + extra * minPeek > avail) {
        cardH = Math.max(minCard, Math.floor((avail - extra * minPeek) / 3));
      }
    }
    let peek = Math.round(cardW * 0.26);
    if (extra > 0) {
      const room = Math.floor((avail - cardH * 3) / extra);
      if (isPhonePortrait()) {
        const columnAvail = cardH + extra * Math.max(room, 1);
        peek = fanPeek(peek, cardH, columnAvail, extra);
        if (cardH * 3 + extra * peek > avail) peek = Math.max(1, room);
      } else peek = Math.max(1, Math.min(peek, room));
    }

    const style = document.body.style;
    style.setProperty("--card-w", `${cardW}px`);
    style.setProperty("--card-h", `${cardH}px`);
    style.setProperty("--kc-peek", `${peek}px`);
    style.setProperty("--peek-up", `${peek}px`);
    style.setProperty("--col-gap", `${colGap}px`);
    style.setProperty("--kc-inner-gap", `${innerGap}px`);
    style.setProperty("--kc-row-gap", `${rowGap}px`);
  }

  function updateMute() {
    if (!root.mute) return;
    root.mute.innerHTML = session.muted ? ICONS.unmute : ICONS.mute;
    root.mute.setAttribute("aria-label", session.muted ? "Turn sound on" : "Turn sound off");
    root.mute.setAttribute("aria-pressed", session.muted ? "false" : "true");
  }

  function nudgeBoard(from) {
    shakeMoved(from || session.selected);
  }

  function well(content = "", recycle = false) {
    const el = document.createElement("div");
    el.className = recycle ? "well recycle" : "well";
    if (recycle) el.innerHTML = content;
    else el.textContent = content;
    return el;
  }

  function renderSlot(zone, index, className, label, fill) {
    const slot = document.createElement("div");
    slot.className = `slot ${className}`;
    slot.dataset.drop = index == null ? zone : `${zone}:${index}`;
    slot.dataset.zone = zone;
    if (index != null) slot.dataset.index = String(index);
    if (label) slot.setAttribute("aria-label", label);
    fill(slot);
    return slot;
  }

  function badge(n) {
    const el = document.createElement("span");
    el.className = "badge";
    el.textContent = String(n);
    return el;
  }

  function renderSide(index) {
    const pile = session.state.sides[index];
    return renderSlot("side", index, "kc-side", `${SIDE_NAME[index]} side`, (slot) => {
      slot.appendChild(well(""));
      const stack = document.createElement("div");
      stack.className = "pile";
      pile.forEach((card, row) => {
        const isTop = row === pile.length - 1;
        const count = isTop ? 1 : row === 0 ? pile.length : pile.length - row;
        const playable = isTop || (row === 0 && pile.length > 1);
        const el = makeCardElement(card, { zone: "side", index }, count, playable, rowSelected(index, row, pile.length));
        el.style.zIndex = String(row + 1);
        stack.appendChild(el);
      });
      slot.appendChild(stack);
    });
  }

  function renderCorner(index) {
    const pile = session.state.corners[index];
    return renderSlot("corner", index, "kc-corner", `${CORNER_NAME[index]} corner`, (slot) => {
      slot.appendChild(well(pile.length ? "" : "K"));
      if (pile.length) {
        const card = pile[pile.length - 1];
        const el = makeCardElement(card, { zone: "corner", index }, 1, false, false);
        slot.appendChild(el);
        slot.appendChild(badge(pile.length));
      }
    });
  }

  function renderCenter() {
    const state = session.state;
    const wrap = document.createElement("div");
    wrap.className = "kc-center";
    wrap.setAttribute("aria-label", "Stock and waste");
    wrap.appendChild(
      renderSlot("stock", null, "kc-stock", "Stock", (slot) => {
        const recyclable = state.stock.length === 0 && state.waste.length > 0;
        slot.appendChild(well(recyclable ? ICONS.recycle : "", recyclable));
        if (state.stock.length) {
          slot.appendChild(
            makeCardElement({ ...state.stock[state.stock.length - 1], faceUp: false }, { zone: "stock" }, 1, false, false),
          );
          slot.appendChild(badge(state.stock.length));
        }
      }),
    );
    wrap.appendChild(
      renderSlot("waste", null, "kc-waste", "Waste", (slot) => {
        slot.appendChild(well(""));
        if (state.waste.length) {
          const card = state.waste[state.waste.length - 1];
          const el = makeCardElement(card, { zone: "waste" }, 1, true, session.selected?.zone === "waste");
          slot.appendChild(el);
        }
      }),
    );
    return wrap;
  }

  function highlightDrops(from, on) {
    document.querySelectorAll(".slot.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
    if (!on || !from) return;
    const key = locKey(normalize(from));
    for (const move of listLegalMoves(session.state)) {
      if (move.kind !== "move" || locKey(move.from) !== key) continue;
      document.querySelector(`[data-drop="${move.to.zone}:${move.to.index}"]`)?.classList.add("drop-ok");
    }
  }

  function render() {
    const state = session.state;
    if (!state || !root.table) return;
    const board = document.createElement("div");
    board.className = "board kings";
    const grid = document.createElement("div");
    grid.className = "kc-grid";
    const cells = [
      renderCorner(0),
      renderSide(0),
      renderCorner(1),
      renderSide(3),
      renderCenter(),
      renderSide(1),
      renderCorner(2),
      renderSide(2),
      renderCorner(3),
    ];
    for (const cell of cells) grid.appendChild(cell);
    board.appendChild(grid);
    root.table.replaceChildren(board);
    if (root.moves) root.moves.textContent = String(state.moves);
    if (root.home) root.home.textContent = String(cardsInCorners(state));
    if (root.seed) root.seed.textContent = seedStatusText(state);
    if (root.undo) root.undo.disabled = session.history.length === 0;
    syncThumbDisabled();
    updateMute();
    applyHintHighlight();
    if (session.selected) highlightDrops(session.selected, true);
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
    if (root.home) root.home.textContent = String(cardsInCorners(session.state));
  }

  function hideOverlay() {
    const celebrate = session.modal === "win" && !!(session.state?.won || (session.state && isWon(session.state)));
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
    if (move.kind === "draw") {
      document.querySelector('[data-drop="stock"]')?.classList.add("hint-to");
      return;
    }
    const fromSel =
      move.from.zone === "waste"
        ? `.card[data-zone="waste"]`
        : `.card[data-zone="${move.from.zone}"][data-index="${move.from.index}"][data-count="${move.from.count ?? 1}"]`;
    document.querySelector(fromSel)?.classList.add("hint-from");
    document.querySelector(`[data-drop="${move.to.zone}:${move.to.index}"]`)?.classList.add("hint-to");
  }

  function showWin() {
    const state = session.state;
    session.modal = "win";
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="win-modal">
      <h2>Four kings home</h2>
      <ul class="stats-line">
        <li><span>Time</span>${formatTime(elapsedMs(state))}</li>
        <li><span>Moves</span>${state.moves}</li>
      </ul>
      <p data-testid="win-count">Wins ${session.stats.won}</p>
      ${winScreenTipHTML(session.stats.streak)}
      ${dailyDoneHTML()}
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close">Close</button>
        <button type="button" class="btn" data-act="replay">Replay</button>
        <button type="button" class="btn primary" data-act="new">New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function showStuck() {
    session.modal = "stuck";
    root.overlay.hidden = false;
    root.overlay.innerHTML = `<div class="modal" data-testid="win-modal">
      <h2>No more moves</h2>
      <p>The stock was turned over twice without another move.</p>
      <p data-testid="win-count">Wins ${session.stats.won}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-act="undo">Undo</button>
        <button type="button" class="btn" data-act="replay">Replay</button>
        <button type="button" class="btn primary" data-act="new">New deal</button>
      </div>
    </div>`;
    syncPlayClock();
  }

  function showHelp() {
    session.modal = "help";
    root.overlay.hidden = false;
    const gestures = `<p>Tap a card, then tap a side or a corner. Drag to choose the spot.</p><p>Double-tap a card to move it to a corner. Tap the bottom card of a side pile to take the whole pile.</p><p>Tap the stock to draw. When the stock is empty, tap it to turn the waste over.</p>`;
    const shortcuts = `<li><kbd>N</kbd> new deal</li><li><kbd>U</kbd> or <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li><li><kbd>H</kbd> hint</li><li><kbd>Space</kbd> draw</li><li><kbd>R</kbd> replay</li>`;
    root.overlay.innerHTML = `<div class="modal" data-testid="help-modal">
      <h2>King's Corners</h2>
      <div class="help-tip-row">${tipEntryHTML("help-tip")}</div>
      ${touchTipsHTML(gestures)}
      <div class="modal-actions help-deal">
        <p data-testid="deal-number">Seed ${session.state.seed}</p>
        <button type="button" class="btn" data-act="replay" data-testid="btn-replay">Replay this deal</button>
      </div>
      <p>One deck. Four side piles sit north, east, south, and west around the stock and waste. Four corner piles sit on the diagonals.</p>
      <p>Each side starts with one face-up card. A king dealt there goes to the next empty corner, and that side is dealt again. The rest of the deck is the face-down stock.</p>
      <p>Tap the stock to turn one card onto the waste. When the stock is empty, tap it to turn the waste back over. You may do that as often as you like.</p>
      <p>An empty corner takes only a king. Corners build down in alternating colors from king to ace. Cards placed in a corner stay there.</p>
      <p>Side piles build down in alternating colors. An empty side takes any card, or a whole side pile.</p>
      <p>Move the top waste card, the top card of a side, or a whole side pile. A whole pile moves when its bottom card fits. A king-led pile may fill an empty corner. Partial runs stay put.</p>
      <p>The deal is won when all 52 cards are in the corners. If you turn the stock over twice without another move, there is nothing left to try.</p>
      <p>Tap the top card of a side to select it. Tap the bottom card of a longer side to select the whole pile. Tap a destination, or drag. Double-tap a card to send it to a corner when that is legal. A king goes to the first empty corner.</p>
      ${kbdTipsHTML(shortcuts)}
      <div class="modal-actions">
        <button type="button" class="btn primary" data-act="close">Close</button>
      </div>
      ${creditHTML("help-credit")}
    </div>`;
    syncPlayClock();
  }

  function gameInProgress() {
    return session.state.moves > 0 && !session.state.won && !isWon(session.state) && !session.state.stuck;
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

  function noteWin() {
    if (!session.state?.won) return;
    if (!session.countedWin) {
      session.stats.won += 1;
      session.stats.streak = (session.stats.streak || 0) + 1;
      session.stats.bestStreak = Math.max(session.stats.bestStreak || 0, session.stats.streak);
      session.countedWin = true;
      creditDaily();
      persist();
    }
    sounds.win(session.muted);
    showWin();
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
    const resolved = extra.daily ? dailySeed("kings", dailyKey) : seed;
    session.history = [];
    session.clockPlayed = false;
    session.selected = null;
    session.hintMove = null;
    session.drag = null;
    session.countedWin = false;
    session.state = deal({ seed: resolved });
    if (dailyKey) session.state.daily = dailyKey;
    session.stats.played += 1;
    persist();
    render();
    refreshMeters();
    setStatus("Build down by color. Kings belong in the corners.");
  }

  function startDaily() {
    startDeal(undefined, { daily: true });
  }

  function replay() {
    startDeal(session.state.seed, { dailyKey: session.state.daily || null });
  }

  function doApply(action) {
    if (!session.state) return { ok: false, reason: "missing state", state: null };
    const result = apply(session.state, action);
    if (!result.ok) {
      sounds.illegal(session.muted);
      setStatus(statusFor(result));
      const from = action?.type === "move" ? action.from : action?.type === "draw" ? { zone: "stock" } : session.selected;
      nudgeBoard(from);
      if (session.selected) highlightDrops(session.selected, true);
      return { ok: false, reason: result.reason, state: session.state };
    }
    session.history.push(cloneState(session.state));
    if (session.history.length > HISTORY_CAP) session.history.shift();
    session.state = result.state;
    session.selected = null;
    session.hintMove = null;
    persist();
    render();
    refreshMeters();
    if (action?.type === "draw") {
      if (result.recycled) sounds.recycle(session.muted);
      else sounds.draw(session.muted);
    } else sounds.place(session.muted);
    if (session.state.won || isWon(session.state)) {
      if (!session.state.won) {
        session.state.won = true;
        session.state.wonAt = session.state.wonAt ?? Date.now();
      }
      noteWin();
      setStatus("Four kings home.");
    } else if (session.state.stuck) {
      showStuck();
      setStatus("No more moves.");
    } else {
      hideOverlay();
      if (action?.type === "draw") setStatus(result.recycled ? "Turned the waste over." : "Drew a card.");
      else if (action?.to?.zone === "corner") setStatus("Moved to a corner.");
      else setStatus("Moved to a side.");
    }
    return { ok: true, state: session.state };
  }

  function doMove(from, to) {
    const src = normalize(from);
    return doApply({ type: "move", from: src, to });
  }

  function doUndo() {
    if (!session.history.length) return;
    const wasWin = session.countedWin && session.state.won;
    session.state = continueClock(session.state, session.history.pop());
    session.selected = null;
    session.hintMove = null;
    session.drag = null;
    if (wasWin && !session.state.won) {
      session.stats.won = Math.max(0, session.stats.won - 1);
      session.stats.streak = Math.max(0, (session.stats.streak || 0) - 1);
      session.countedWin = false;
    }
    hideOverlay();
    persist();
    render();
    refreshMeters();
    sounds.undo(session.muted);
    if (session.state.won || isWon(session.state)) showWin();
    else if (session.state.stuck) {
      showStuck();
      setStatus("No more moves.");
    } else setStatus("Undid the last move.");
  }

  function doDouble(from) {
    const src = normalize(from);
    if (!isMovable(src)) {
      sounds.illegal(session.muted);
      setStatus("That card cannot move to a corner.");
      nudgeBoard(src);
      return;
    }
    const key = locKey(src);
    const moves = listLegalMoves(session.state).filter(
      (move) => move.kind === "move" && move.to.zone === "corner" && locKey(move.from) === key,
    );
    if (!moves.length) {
      sounds.illegal(session.muted);
      setStatus("That card cannot move to a corner.");
      nudgeBoard(src);
      return;
    }
    doApply({ type: "move", from: moves[0].from, to: moves[0].to });
  }

  function onActivate(loc, isDouble) {
    if (isDouble && isMovable(loc)) {
      doDouble(loc);
      return;
    }
    if (isWholePileTap(loc)) {
      const next = { zone: "side", index: loc.index, count: loc.count };
      if (locKey(session.selected) === locKey(next)) {
        session.selected = null;
        render();
        return;
      }
      session.selected = next;
      render();
      setStatus("Choose a destination, or drag the card.");
      return;
    }
    const dest = { zone: loc.zone, index: loc.index };
    const src = normalize(loc);
    if (session.selected && locKey(session.selected) !== locKey(src) && canDrop(session.selected, dest)) {
      doMove(session.selected, dest);
      return;
    }
    if (isMovable(loc)) {
      if (locKey(session.selected) === locKey(src)) {
        session.selected = null;
        render();
        return;
      }
      const prev = session.selected ? { ...session.selected } : null;
      const rejected = !!(prev && locKey(prev) !== locKey(src));
      session.selected = src;
      render();
      if (rejected) {
        sounds.illegal(session.muted);
        setStatus("That card cannot move there.");
        nudgeBoard(prev);
      } else {
        setStatus("Choose a destination, or drag the card.");
      }
      return;
    }
    if (session.selected && (dest.zone === "side" || dest.zone === "corner")) {
      doMove(session.selected, dest);
      return;
    }
    setStatus("Only the top card or the whole pile can move.");
    nudgeBoard(loc);
  }

  function cardsFor(from) {
    if (from.zone === "waste") {
      const card = session.state.waste.at(-1);
      return card ? [card] : [];
    }
    if (from.zone !== "side") return [];
    const pile = pileAt(from.index);
    const count = from.count ?? 1;
    if (count === pile.length) return pile.slice();
    if (count === 1 && pile.length) return [pile.at(-1)];
    return [];
  }

  function moveGhost(x, y) {
    const ghost = session.drag?.ghost;
    if (!ghost) return;
    const cardW = ghost.querySelector(".card")?.offsetWidth || 36;
    ghost.style.transform = `translate(${x - cardW / 2}px, ${y - 18}px)`;
  }

  function startDrag(from, x, y, originEl) {
    const cards = cardsFor(from);
    if (!cards.length || !originEl) return;
    session.drag = { from, x, y, originEl };
    document.documentElement.classList.add("is-dragging");
    const ghost = document.createElement("div");
    ghost.className = "ghost";
    cards.forEach((card, i) => {
      ghost.appendChild(makeCardElement(card, from, cards.length - i, false, false));
    });
    root.dragLayer.appendChild(ghost);
    session.drag.ghost = ghost;
    if ((from.count ?? 1) > 1) {
      originEl.closest(".slot")?.querySelectorAll(".card").forEach((el) => el.classList.add("is-ghost-source"));
    } else originEl.classList.add("is-ghost-source");
    moveGhost(x, y);
    highlightDrops(from, true);
  }

  function clearDragChrome() {
    document.documentElement.classList.remove("is-dragging");
    if (root.dragLayer) root.dragLayer.innerHTML = "";
    document.querySelectorAll(".is-ghost-source").forEach((el) => el.classList.remove("is-ghost-source"));
    document.querySelectorAll(".slot.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
  }

  function dropTarget(node) {
    const slot = node?.closest?.("[data-drop]");
    if (!slot) return null;
    const zone = slot.dataset.zone;
    if (zone !== "side" && zone !== "corner") return null;
    return { zone, index: Number(slot.dataset.index) };
  }

  function endDrag(x, y) {
    const drag = session.drag;
    session.drag = null;
    clearDragChrome();
    const to = dropTarget(document.elementFromPoint(x, y));
    if (!to) {
      sounds.illegal(session.muted);
      setStatus("That card cannot move there.");
      nudgeBoard(drag.from);
      if (session.selected) highlightDrops(session.selected, true);
      return false;
    }
    return doMove(drag.from, to);
  }

  function onPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    if (!root.overlay?.hidden) return;
    if (session.state?.won) return;
    resumeAudio();
    const cardEl = event.target.closest?.(".card");
    const slot = event.target.closest?.("[data-drop]");
    if (!cardEl && !slot) {
      if (session.selected) {
        session.selected = null;
        render();
      }
      return;
    }
    if (slot?.dataset.zone === "stock" && (!cardEl || cardEl.dataset.zone === "stock")) {
      event.preventDefault();
      session.drag = { stock: true, x: event.clientX, y: event.clientY };
      return;
    }
    if (!cardEl) {
      event.preventDefault();
      session.drag = {
        destOnly: true,
        from: {
          zone: slot.dataset.zone,
          index: slot.dataset.index == null || slot.dataset.index === "" ? undefined : Number(slot.dataset.index),
        },
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }
    const loc = parseLoc(cardEl);
    if (!loc || loc.zone === "corner") {
      event.preventDefault();
      session.drag = {
        destOnly: true,
        from: loc ?? { zone: slot?.dataset.zone, index: Number(slot?.dataset.index) },
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }
    event.preventDefault();
    cardEl.setPointerCapture?.(event.pointerId);
    session.drag = {
      from: loc,
      x: event.clientX,
      y: event.clientY,
      originEl: cardEl,
      pending: isMovable(loc),
    };
  }

  function onPointerMove(event) {
    const drag = session.drag;
    if (!drag?.pending && !drag?.ghost) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.pending && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (drag.pending) {
      drag.pending = false;
      startDrag(drag.from, event.clientX, event.clientY, drag.originEl);
    } else moveGhost(event.clientX, event.clientY);
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
    if (drag.stock) {
      doApply({ type: "draw" });
      session.lastClick = { key: "", at: 0 };
      return;
    }
    if (drag.destOnly) {
      const dest = { zone: drag.from?.zone, index: drag.from?.index };
      if (session.selected && (dest.zone === "side" || dest.zone === "corner")) doMove(session.selected, dest);
      return;
    }
    const key = locKey(normalize(drag.from));
    const now = performance.now();
    const isDouble = key && key === session.lastClick.key && now - session.lastClick.at < DOUBLE_MS;
    session.lastClick = { key, at: now };
    onActivate(drag.from, isDouble);
  }

  listen(root.table, "pointerdown", onPointerDown);
  listen(window, "pointermove", onPointerMove);
  listen(window, "pointerup", onPointerUp);
  listen(window, "pointercancel", () => {
    if (session.drag?.ghost) clearDragChrome();
    session.drag = null;
    if (session.selected) highlightDrops(session.selected, true);
  });
  listenLayout(listen, fit);
  if (window.ResizeObserver) {
    observer = new ResizeObserver(() => fit());
    const topbar = document.querySelector(".topbar");
    const status = document.querySelector(".status");
    if (topbar) observer.observe(topbar);
    if (status) observer.observe(status);
  }
  function doHint() {
    const move = findHint(session.state);
    session.hintMove = move;
    render();
    if (!move) setStatus("No moves — try Undo or a new deal.");
    else if (move.kind === "draw") setStatus("Draw from the stock.");
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
    const btn = event.target.closest("[data-act]");
    if (!btn) {
      if (event.target === root.overlay && (session.modal === "help" || session.modal === "confirm")) {
        hideOverlay();
      }
      return;
    }
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
    } else if (btn.dataset.act === "undo") doUndo();
  });
  listen(window, "keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.target.matches?.("input, textarea")) {
      if (event.key === "Escape") hideOverlay();
      return;
    }
    if (key === "escape") {
      if (session.modal) hideOverlay();
      else if (!session.modal && session.selected) {
        session.selected = null;
        render();
      }
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
    if (bootDailyConfirm) confirmNewDeal({ daily: true });
    else if (session.state.stuck) {
      showStuck();
      setStatus("No more moves.");
    } else setStatus("Build down by color. Kings belong in the corners.");
  } else if (wantDaily) startDaily();
  else startDeal(honorSeed ? urlSeed : undefined);

  return {
    getState: () => session.state,
    setState(next) {
      session.drag = null;
      session.selected = null;
      session.hintMove = null;
      session.state = next;
      if (next && isWon(next)) {
        next.won = true;
        if (next.wonAt == null) next.wonAt = Date.now();
      }
      session.countedWin = false;
      session.clockPlayed = (next?.moves > 0) || session.history.length > 0;
      persist();
      render();
      refreshMeters();
      if (session.state?.won || isWon(session.state)) showWin();
      else if (session.state?.stuck) showStuck();
      else hideOverlay();
    },
    newGame(options) {
      const seed = options && typeof options === "object" ? options.seed : options;
      startDeal(seed);
    },
    undo: doUndo,
    hint: doHint,
    move: (from, to) => doMove(from, to),
    apply: (action) => doApply(action),
    historyLength: () => session.history.length,
    listMoves: () => listLegalMoves(session.state),
    isAnimating: () => false,
    unmount() {
      if (session.state) persist();
      alive = false;
      document.documentElement.classList.remove("is-dragging");
      observer?.disconnect();
      clockObserver.disconnect();
      ac.abort();
      window.clearInterval(timer);
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
