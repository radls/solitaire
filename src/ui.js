import { shareCardHTML } from "./share.js";
import { formatDailyLabel } from "./daily.js";
import { SUIT_GLYPH } from "./game/cards.js";
import { armCardSettle, cancelCardSettle, makeCardElement } from "./card-view.js";
import {
  autoCompleteStep,
  autoMove,
  canAutoComplete,
  cloneState,
  continueClock,
  deal,
  dealPlayable,
  draw,
  elapsedMs,
  hint as findHint,
  isStuck,
  listLegalMoves,
  moveCards,
  recycleNote,
  scoreParts,
  timePenaltyNote,
  timedScore,
} from "./game/klondike.js";
import { meterElapsed, restoreClock, syncClock } from "./game/clock.js";
import { resumeAudio, sounds } from "./audio.js";
import { load, loadPrefs, markPickDone, save, savePrefs } from "./storage.js";
import { offerInstallHint } from "./install-hint.js";
import { paintDragTilt, shakeMoved } from "./motion.js";
import { createSlides } from "./slide.js";
import { creditHTML, stuckTipHTML, tipEntryHTML, toggleTipPanel, winScreenTipHTML } from "./tip.js";
import { dailyDoneText, dailySeed, nextDailyStreak, seedStatusText, todayKey, tomorrowDealHTML } from "./daily.js";
import { winCelebrateHTML } from "./celebrate.js";
import { hintFromSelector } from "./hint-target.js";
import { scheduleGlowClear, stopBoardPaint } from "./board-timers.js";
import { bumpWinStreak, notePersonalBest, personalBestHTML } from "./records.js";
import { abandonsStreak, dailyAlongsidePlan, flattenSlots, isDailyBoard, placeBoard, takeSlots } from "./slots.js";
import { formatPickResult, pickForDate, pickOpenPlan } from "./groks-pick.js";
import {
  bindThumb,
  growKlondikePeeks,
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

const ICONS = {
  mute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`,
  unmute: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5-4.5-1.4 1.4A6.5 6.5 0 0 1 18 12a6.5 6.5 0 0 1-3.9 5.9l1.4 1.4A8.5 8.5 0 0 0 20 12a8.5 8.5 0 0 0-4.5-7.5zM16 4.2 4.2 16l1.4 1.4L17.4 5.6 16 4.2z"/></svg>`,
  recycle: `<svg viewBox="0 0 24 24"><path d="M4 8a8 8 0 0 1 13.2-6M20 16a8 8 0 0 1-13.2 6"/><path d="M17 3h4v4M7 21H3v-4"/></svg>`,
};

export function mount(options = {}) {
  const ac = new AbortController();
  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, { ...options, signal: ac.signal });
  };

  const kicker = document.getElementById("game-kicker");
  if (kicker) kicker.textContent = "Klondike";
  const scoreWrap = document.getElementById("meter-score-wrap");
  if (scoreWrap) scoreWrap.hidden = false;
  document.body.dataset.game = "klondike";

  const toolbar = document.getElementById("toolbar");
  if (toolbar) {
    toolbar.innerHTML = `
      <div class="segmented" role="group" aria-label="Draw mode">
        <button type="button" id="btn-draw-1" data-draw="1" aria-label="Draw 1"><span class="long">Draw 1</span><span class="short">1</span></button>
        <button type="button" id="btn-draw-3" data-draw="3" aria-label="Draw 3"><span class="long">Draw 3</span><span class="short">3</span></button>
      </div>
      <button type="button" class="btn" id="btn-undo" data-testid="btn-undo" title="Undo (U)">Undo</button>
      <button type="button" class="btn" id="btn-new" data-testid="btn-new" title="New game (N)">New</button>
      <button type="button" class="btn" id="btn-hint" data-testid="btn-hint" title="Hint (H)">Hint</button>
      <button type="button" class="btn" id="btn-finish" hidden title="Send remaining cards to foundations (A)">Finish</button>
      <button type="button" class="icon-btn" id="btn-mute" data-testid="btn-sound" aria-label="Turn sound on"></button>
      <button type="button" class="icon-btn" id="btn-help" aria-label="Help">?</button>`;
  }

  const root = {
    table: document.getElementById("table"),
    overlay: document.getElementById("overlay"),
    dragLayer: document.getElementById("drag-layer"),
    time: document.getElementById("meter-time"),
    moves: document.getElementById("meter-moves"),
    score: document.getElementById("meter-score"),
    status: document.getElementById("status-text"),
    seed: document.getElementById("status-seed"),
    undo: document.getElementById("btn-undo"),
    finish: document.getElementById("btn-finish"),
    mute: document.getElementById("btn-mute"),
    draw1: document.getElementById("btn-draw-1"),
    draw3: document.getElementById("btn-draw-3"),
  };

  const stored = load();
  const slots0 = takeSlots(stored, { nested: true });
  const session = {
    state: null,
    history: [],
    slots: slots0,
    selected: null,
    hintMove: null,
    drag: null,
    lastClick: { key: "", at: 0 },
    muted: loadPrefs().sound !== true,
    stats: stored.stats,
    autoTimer: 0,
    modal: null,
    clockPlayed: false,
    bestNote: "",
    glow: { columns: [], foundations: [] },
    alive: true,
    glowTimer: 0,
    finishing: false,
    finishFast: false,
  };

  const slides = createSlides();

  function interruptMotion() {
    slides.interrupt();
    session.finishing = false;
    session.finishFast = false;
    if (session.autoTimer) window.clearTimeout(session.autoTimer);
    session.autoTimer = 0;
  }

  const params = new URLSearchParams(location.search);
  const urlSeed = params.has("seed") ? Number(params.get("seed")) : undefined;
  const urlDraw = params.get("draw") === "3" ? 3 : params.get("draw") === "1" ? 1 : null;
  const initialDraw = urlDraw ?? stored.drawCount;
  const today = todayKey();
  const pickEntry = pickForDate(today);
  const wantPick = pickEntry?.game === "klondike" && (options.pick === true || params.get("pick") === "1");
  const wantDaily = !wantPick && (options.daily === true || (params.get("daily") === "1" && params.get("game") === "klondike"));
  const wantCasual = options.casual === true;
  const openRules = {
    isFinished: (state) => !!state.won,
    needsConfirm: (state) => state.moves > 0 && !state.won,
  };
  let bootPickConfirm = false;

  function adopt(pack) {
    session.state = structuredClone(pack.state);
    session.history = structuredClone(pack.history ?? []);
    restoreClock(session.state, pack.savedAt);
  }

  if (wantPick) {
    const casual = slots0.casual?.state && !slots0.casual.state.won ? slots0.casual : null;
    const plan = pickOpenPlan(casual?.state ?? null, today, openRules);
    if ((plan === "resume" || plan === "confirm") && casual) {
      adopt(casual);
      bootPickConfirm = plan === "confirm";
    } else {
      session.history = [];
      session.state = deal({ seed: pickEntry.seed, drawCount: 1 });
      session.state.daily = today;
      session.state.pick = today;
    }
  } else if (wantDaily) {
    const plan = dailyAlongsidePlan(slots0.daily?.state, today, (state) => !!state.won);
    if ((plan === "resume" || plan === "done") && slots0.daily?.state) adopt(slots0.daily);
    else {
      session.history = [];
      session.state = deal({ seed: dailySeed("klondike", today), drawCount: initialDraw });
      session.state.daily = today;
    }
  } else if (Number.isFinite(urlSeed)) {
    session.history = [];
    session.state = deal({ seed: urlSeed, drawCount: initialDraw });
  } else if (!wantCasual && slots0.active === "daily" && slots0.daily?.state && !slots0.daily.state.won) {
    adopt(slots0.daily);
  } else if (slots0.casual?.state && !slots0.casual.state.won) {
    adopt(slots0.casual);
  } else {
    session.history = [];
    session.state = dealPlayable({ drawCount: initialDraw });
  }
  session.countedPlay = session.state.moves > 0;

  function persist() {
    session.slots = placeBoard(session.slots, session.state, session.history, Date.now(), {
      dropCasual: (state) => !!state?.won,
    });
    save(
      flattenSlots(session.slots, {
        nested: true,
        stats: session.stats,
        extra: { drawCount: session.state?.drawCount ?? stored.drawCount, muted: session.muted },
      }),
    );
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
    if (loc.zone === "waste") return "waste";
    if (loc.zone === "stock") return "stock";
    return `${loc.zone}:${loc.index}:${loc.count ?? 1}`;
  }

  function parseLoc(el) {
    if (!el) return null;
    const zone = el.dataset.zone;
    if (!zone) return null;
    if (zone === "waste" || zone === "stock") return { zone };
    return {
      zone,
      index: Number(el.dataset.index),
      count: Number(el.dataset.count || 1),
    };
  }

  function parseDrop(el) {
    if (!el) return null;
    const drop = el.closest("[data-drop]")?.dataset.drop;
    if (!drop) return null;
    const [zone, index] = drop.split(":");
    if (zone === "waste" || zone === "stock") return { zone };
    return { zone, index: Number(index) };
  }

  function isSelected(loc, count) {
    const sel = session.selected;
    if (!sel) return false;
    return sel.zone === loc.zone && sel.index === loc.index && (sel.count ?? 1) === count;
  }

  function makeCardEl(card, loc, count, playable) {
    return makeCardElement(card, loc, count, playable, isSelected(loc, count));
  }

  function well(content = "") {
    const el = document.createElement("div");
    el.className = "well";
    el.innerHTML = content;
    return el;
  }

  function renderSlot(zone, index, contentFn) {
    const slot = document.createElement("div");
    slot.className = `slot ${zone}`;
    slot.dataset.drop = index == null ? zone : `${zone}:${index}`;
    slot.dataset.zone = zone;
    if (index != null) slot.dataset.index = String(index);
    contentFn(slot);
    return slot;
  }

  function render() {
    if (session.alive === false) return;
    const slideFrom = slides.capture(root.table);
    const state = session.state;
    const table = root.table;
    table.innerHTML = "";
    const board = document.createElement("div");
    board.className = "board";

    const topRow = document.createElement("div");
    topRow.className = "row top";

    const stockWaste = document.createElement("div");
    stockWaste.className = "stock-waste";

    stockWaste.appendChild(
      renderSlot("stock", null, (slot) => {
        if (state.stock.length) {
          slot.appendChild(well());
          const back = makeCardEl(
            { ...state.stock[state.stock.length - 1], faceUp: false },
            { zone: "stock" },
            1,
            true,
          );
          slot.appendChild(back);
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = String(state.stock.length);
          slot.appendChild(badge);
        } else {
          const empty = well(state.waste.length ? ICONS.recycle : "");
          if (state.waste.length) empty.classList.add("recycle");
          slot.appendChild(empty);
        }
      }),
    );

    stockWaste.appendChild(
      renderSlot("waste", null, (slot) => {
        slot.appendChild(well());
        const shown = state.waste.slice(-3);
        shown.forEach((card, i) => {
          const playable = i === shown.length - 1;
          const el = makeCardEl(card, { zone: "waste" }, 1, playable);
          if (playable) el.dataset.wasteTop = "1";
          el.style.left = `calc(${i} * var(--waste-spread, 20px))`;
          if (!playable) el.style.pointerEvents = "none";
          slot.appendChild(el);
        });
      }),
    );

    const foundations = document.createElement("div");
    foundations.className = "foundations";
    state.foundations.forEach((pile, index) => {
      foundations.appendChild(
        renderSlot("foundation", index, (slot) => {
          if (session.glow.foundations.includes(index)) slot.classList.add("pile-glow");
          const glyph = pile.length ? SUIT_GLYPH[pile[0].suit] : "A";
          slot.appendChild(well(glyph));
          if (pile.length) {
            const card = pile[pile.length - 1];
            slot.appendChild(makeCardEl(card, { zone: "foundation", index }, 1, true));
          }
        }),
      );
    });

    topRow.append(stockWaste, foundations);

    const tableau = document.createElement("div");
    tableau.className = "row tableau";
    state.tableau.forEach((pile, index) => {
      tableau.appendChild(
        renderSlot("tableau", index, (slot) => {
          if (session.glow.columns.includes(index)) slot.classList.add("pile-glow");
          slot.appendChild(well(pile.length ? "" : "K"));
          const stack = document.createElement("div");
          stack.className = "pile";
          pile.forEach((card, row) => {
            const count = pile.length - row;
            const playable = card.faceUp;
            const el = makeCardEl(card, { zone: "tableau", index }, count, playable);
            el.style.zIndex = String(row);
            stack.appendChild(el);
          });
          slot.appendChild(stack);
        }),
      );
    });

    board.append(topRow, tableau);
    if (state.moves === 0 && !state.won) {
      const choice = document.createElement("div");
      choice.className = "draw-choice";
      choice.dataset.testid = "draw-choice";
      choice.innerHTML = `<p>Draw from the stock</p>
        <div class="draw-choice-row">
          <button type="button" class="btn${state.drawCount === 1 ? " primary" : ""}" data-draw="1">Draw 1</button>
          <button type="button" class="btn${state.drawCount === 3 ? " primary" : ""}" data-draw="3">Draw 3</button>
        </div>`;
      topRow.appendChild(choice);
    }
    table.appendChild(board);

    root.moves.textContent = String(state.moves);
    root.seed.textContent = seedStatusText(state);
    root.undo.disabled = session.history.length === 0;
    syncThumbDisabled();
    root.draw1.classList.toggle("active", state.drawCount === 1);
    root.draw3.classList.toggle("active", state.drawCount === 3);
    root.finish.hidden = !canAutoComplete(state) || state.won;
    refreshMeters();
    applyHintHighlight();
    updateMuteButton();
    fit();
    requestAnimationFrame(() => fit());
    if (slideFrom.size === 0 && (state.moves ?? 0) === 0) slides.setDeal(true);
    slides.play(root.table, slideFrom);
  }

  function clearLayoutVars() {
    for (const key of ["--card-w", "--card-h", "--peek-up", "--peek-down", "--col-gap", "--waste-extra", "--waste-spread"]) {
      document.body.style.removeProperty(key);
    }
  }

  function pileHeight(pile, cardH, peekUp, peekDown) {
    if (!pile.length) return cardH;
    let height = cardH;
    for (let i = 1; i < pile.length; i++) height += pile[i].faceUp ? peekUp : peekDown;
    return height;
  }

  function verticalChrome(board) {
    const table = root.table;
    const ts = table ? getComputedStyle(table) : null;
    const padY = ts ? (parseFloat(ts.paddingTop) || 0) + (parseFloat(ts.paddingBottom) || 0) : 0;
    const gap = board ? parseFloat(getComputedStyle(board).rowGap) || 0 : 0;
    return padY + gap;
  }

  function applyFit(cardW, cardH, peekUp, peekDown, gap, width) {
    const style = document.body.style;
    style.setProperty("--card-w", `${cardW}px`);
    style.setProperty("--card-h", `${cardH}px`);
    style.setProperty("--peek-up", `${peekUp}px`);
    style.setProperty("--peek-down", `${peekDown}px`);
    style.setProperty("--col-gap", `${gap}px`);
    style.setProperty("--waste-extra", width < 720 ? "26px" : "2.6rem");
    style.setProperty("--waste-spread", width < 720 ? "12px" : "20px");
  }

  function fit() {
    const board = root.table?.querySelector(".board");
    if (!board || !session.state) return;
    const width = board.clientWidth;
    if (!width) return;
    const gap = width < 800 ? 4 : Math.min(16, Math.round(width * 0.012));
    let cardW = Math.min(120, Math.floor((width - gap * 6) / 7));
    if (cardW < 28 && window.innerWidth > 600) return;
    cardW = Math.max(24, cardW);
    let cardH = Math.round(cardW * 1.42);
    let peekUp = Math.round(cardW * 0.3);
    let peekDown = Math.round(cardW * 0.16);
    const headerH = document.querySelector(".topbar")?.offsetHeight ?? 0;
    const statusH = document.querySelector(".status")?.offsetHeight ?? 0;
    const topH = board.querySelector(".row.top")?.offsetHeight || cardH;

    if (window.innerWidth <= 600) {
      const contentSpace = Math.floor(
        window.innerHeight - layoutBottomInset() - headerH - statusH - verticalChrome(board) - 4,
      );
      const fitsWidth = (w) => {
        const ch = Math.round(w * 1.42);
        let tallest = ch;
        for (const pile of session.state.tableau) tallest = Math.max(tallest, pileHeight(pile, ch, 1, 1));
        return ch + tallest <= contentSpace;
      };
      if (!fitsWidth(cardW)) cardW = shrinkToFit(cardW, 24, fitsWidth);
      cardH = Math.round(cardW * 1.42);
      peekUp = Math.round(cardW * 0.3);
      peekDown = Math.round(cardW * 0.16);
      const avail = contentSpace - cardH;
      const fits = (up, down) =>
        session.state.tableau.every((pile) => pileHeight(pile, cardH, up, down) <= avail);
      if (avail > 0 && !fits(peekUp, peekDown)) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (fits(Math.max(1, Math.round(peekUp * mid)), Math.max(1, Math.round(peekDown * mid)))) lo = mid;
          else hi = mid;
        }
        peekUp = Math.max(1, Math.round(peekUp * lo));
        peekDown = Math.max(1, Math.round(peekDown * lo));
      } else if (isPhonePortrait() && fits(peekUp, peekDown)) {
        const grown = growKlondikePeeks({
          peekUp,
          peekDown,
          cardH,
          avail,
          piles: session.state.tableau,
        });
        peekUp = grown.peekUp;
        peekDown = grown.peekDown;
      }
      applyFit(cardW, cardH, peekUp, peekDown, gap, width);
      return;
    }

    const avail = window.innerHeight - layoutBottomInset() - headerH - statusH - topH - verticalChrome(board) - 4;
    const fits = (up, down) =>
      session.state.tableau.every((pile) => pileHeight(pile, cardH, up, down) <= avail);
    if (avail > cardH && !fits(peekUp, peekDown)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(Math.max(1, Math.round(peekUp * mid)), Math.max(1, Math.round(peekDown * mid)))) lo = mid;
        else hi = mid;
      }
      const up = Math.max(1, Math.round(peekUp * lo));
      const down = Math.max(1, Math.round(peekDown * lo));
      if (fits(Math.max(14, up), Math.max(7, down))) {
        peekUp = Math.max(14, up);
        peekDown = Math.max(7, down);
      } else {
        peekUp = up;
        peekDown = down;
      }
    }
    applyFit(cardW, cardH, peekUp, peekDown, gap, width);
  }

  function nudgeBoard(from) {
    shakeMoved(from || session.selected);
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
    syncPlayClock();
    const now = Date.now();
    root.time.textContent = formatTime(readMeter(now));
    const parts = scoreParts(session.state, now);
    root.score.textContent = String(parts.display);
    let note = document.getElementById("score-note");
    if (!note && root.score) {
      note = document.createElement("span");
      note.id = "score-note";
      note.dataset.testid = "score-note";
      note.className = "score-note";
      root.score.insertAdjacentElement("afterend", note);
    }
    if (note) {
      const text = timePenaltyNote(parts);
      note.textContent = text;
      note.hidden = !text;
    }
  }

  function updateMuteButton() {
    root.mute.innerHTML = session.muted ? ICONS.unmute : ICONS.mute;
    root.mute.setAttribute("aria-label", session.muted ? "Turn sound on" : "Turn sound off");
    root.mute.setAttribute("aria-pressed", session.muted ? "false" : "true");
  }

  function applyHintHighlight() {
    const move = session.hintMove;
    if (!move) return;
    if (move.kind === "draw") {
      document.querySelector('[data-drop="stock"]')?.classList.add("hint-to");
      return;
    }
    document.querySelector(hintFromSelector(move))?.classList.add("hint-from");
    const toSel =
      move.to.index == null
        ? `[data-drop="${move.to.zone}"]`
        : `[data-drop="${move.to.zone}:${move.to.index}"]`;
    document.querySelector(toSel)?.classList.add("hint-to");
  }

  function recordWin() {
    countPlay();
    const stats = session.stats;
    stats.won += 1;
    const bumped = bumpWinStreak(stats);
    stats.streak = bumped.streak;
    stats.bestStreak = bumped.bestStreak;
    const time = elapsedMs(session.state, session.state.wonAt);
    const judged = notePersonalBest(stats, { timeMs: time, moves: session.state.moves });
    stats.bestTimeMs = judged.stats.bestTimeMs;
    stats.fewestMoves = judged.stats.fewestMoves;
    session.bestNote = judged.note;
    creditDaily();
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
    return `<p class="daily-done" data-testid="daily-done">${dailyDoneText(session.stats.dailyStreak)}</p>${shareCardHTML({
      game: "klondike",
      dateLabel: formatDailyLabel(key).replace("Daily · ", ""),
      time: formatTime(elapsedMs(session.state, session.state.wonAt || Date.now())),
      moves: session.state.moves,
      streak: session.stats.dailyStreak,
      seed: session.state.seed,
      drawCount: session.state.drawCount,
    })}`;
  }

  function pickResultHTML() {
    const state = session.state;
    if (!state?.pick) return "";
    const entry = pickForDate(state.pick);
    if (!entry) return "";
    const view = formatPickResult(entry, {
      won: true,
      moves: state.moves || 0,
      elapsedMs: elapsedMs(state, state.wonAt || Date.now()),
      undoUsed: state.undoUsed === true,
      cardsLeft: 0,
    });
    if (view.met) markPickDone(state.pick);
    return view.html;
  }

  function showOverlay(html, { win = false, modal = null } = {}) {
    session.modal = modal;
    root.overlay.hidden = false;
    root.overlay.innerHTML = html;
    root.overlay.querySelector(".modal")?.classList.toggle("win", win);
    syncPlayClock();
  }

  function hideOverlay() {
    const celebrate = session.modal === "win" && !!session.state?.won;
    const wasStuck = session.modal === "stuck";
    session.modal = null;
    root.overlay.hidden = true;
    root.overlay.innerHTML = "";
    syncPlayClock();
    if (wasStuck && session.state && !session.state.won && isStuck(session.state)) {
      setStatus("No useful moves.");
    }
    if (celebrate) offerInstallHint();
  }

  function showStuck() {
    const undoDisabled = session.history.length ? "" : " disabled";
    showOverlay(
      `<div class="modal" data-testid="stuck-modal">
        <h2>No useful moves</h2>
        <p>Drawing and moving cards won't open anything new.</p>
        ${stuckTipHTML()}
        <div class="modal-actions">
          <button type="button" class="btn" data-act="undo" data-testid="stuck-undo"${undoDisabled}>Undo</button>
          <button type="button" class="btn" data-act="replay" data-testid="stuck-replay">Replay this deal</button>
          <button type="button" class="btn primary" data-act="new" data-testid="stuck-new">New deal</button>
        </div>
      </div>`,
      { modal: "stuck" },
    );
  }

  function showIfStuck() {
    if (!session.state || session.state.won || !isStuck(session.state)) return false;
    session.hintMove = null;
    showStuck();
    setStatus("No useful moves.");
    return true;
  }

  function showWin() {
    const s = session.state;
    const stats = session.stats;
    const playedShown = Math.max(stats.played || 0, stats.won || 0);
    showOverlay(
      `<div class="modal win" data-testid="win-modal">
        <p class="big">You won</p>
        ${winCelebrateHTML()}
        <p>${formatTime(elapsedMs(s, s.wonAt))} · ${s.moves} moves · ${timedScore(s, s.wonAt)} points</p>
        <ul class="stats-line">
          <li data-testid="win-count"><span>Wins</span>${stats.won} / ${playedShown}</li>
          <li><span>Streak</span>${stats.streak}</li>
          <li><span>Best time</span>${stats.bestTimeMs == null ? "—" : formatTime(stats.bestTimeMs)}</li>
          <li><span>Fewest moves</span>${stats.fewestMoves ?? "—"}</li>
        </ul>
        ${personalBestHTML(session.bestNote)}
        ${dailyDoneHTML()}
        ${s.daily === todayKey() ? tomorrowDealHTML() : ""}
        ${pickResultHTML()}
        ${winScreenTipHTML(stats.streak)}
        <div class="modal-actions">
          <button class="btn primary" data-act="again">Play again</button>
        </div>
      </div>`,
      { win: true, modal: "win" },
    );
  }

  function showHelp() {
    const stats = session.stats;
    const playedShown = Math.max(stats.played || 0, stats.won || 0);
    const gestures = `<p>Tap a card, then tap a column or foundation. Double-tap sends it to the best spot.</p><p>Drag a card to choose the spot. Tap the stock to draw.</p>`;
    const shortcuts = `<li><kbd>N</kbd> new game</li>
        <li><kbd>U</kbd> or <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</li>
        <li><kbd>H</kbd> hint</li>
        <li><kbd>Space</kbd> draw</li>
        <li><kbd>A</kbd> finish (when every card is face up)</li>
        <li>Double-tap a card to send it to a foundation</li>`;
    showOverlay(`<div class="modal" data-testid="help-modal">
      <h2>Klondike</h2>
      <div class="help-tip-row">${tipEntryHTML("help-tip")}</div>
      ${touchTipsHTML(gestures)}
      <p>Build the four foundations up by suit from ace to king. On the tableau, stack cards down in alternating colors. Empty columns take kings.</p>
      <p>The score on the board is the move score minus 2 points for every 10 seconds. That time cost shows beside the score. Turning the waste over costs 20 points in Draw 3 and 100 in Draw 1. The cost is already in the move score, and the status line names it.</p>
      <p>When no useful moves remain, a panel offers Undo, Replay this deal, or New deal.</p>
      ${kbdTipsHTML(shortcuts)}
      <p>Won ${stats.won} of ${playedShown} games. Streak ${stats.streak}.</p>
      <div class="modal-actions">
        <button class="btn primary" data-act="close">Close</button>
      </div>
      ${creditHTML("help-credit")}
    </div>`, { modal: "help" });
  }

  function confirmNew(drawCount, extra = {}) {
    interruptMotion();
    if (extra.daily) {
      startDaily(drawCount);
      return;
    }
    if (isDailyBoard(session.state) && !extra.pick) {
      startNewGame(drawCount);
      return;
    }
    if (session.state.moves > 0 && !session.state.won) {
      const dailyAttr = extra.daily ? ` data-daily="1"` : "";
      const pickAttr = extra.pick ? ` data-pick="1"` : "";
      showOverlay(`<div class="modal" data-testid="confirm-modal">
        <h2>Start a new game?</h2>
        <p>The current deal will be abandoned and your streak will reset.</p>
        <div class="modal-actions">
          <button class="btn" data-act="close" data-testid="confirm-cancel">Keep playing</button>
          <button class="btn primary" data-act="new" data-testid="confirm-ok" data-draw="${drawCount}"${dailyAttr}${pickAttr}>New game</button>
        </div>
      </div>`, { modal: "confirm" });
      return;
    }
    if (extra.pick) startPick();
    else if (extra.daily) startDaily(drawCount);
    else startNewGame(drawCount);
  }

  function startNewGame(drawCount = session.state.drawCount, seed, extra = {}) {
    if (drawCount && typeof drawCount === "object") {
      extra = drawCount;
      seed = extra.seed;
      drawCount = extra.drawCount ?? session.state.drawCount;
    }
    const previous = session.state;
    const previousDaily = previous?.daily || null;
    const previousPick = previous?.pick || null;
    const startingDaily = !!(extra.dailyKey && !extra.pickKey);
    if (abandonsStreak(previous, { toDaily: startingDaily })) session.stats.streak = 0;
    session.slots = placeBoard(session.slots, previous, session.history, Date.now(), {
      dropCasual: (state) => !!state?.won,
    });
    hideOverlay();
    session.history = [];
    session.clockPlayed = false;
    session.selected = null;
    session.hintMove = null;
    session.countedPlay = false;
    const explicitSeed = seed != null && seed !== "" && Number.isFinite(Number(seed));
    session.state = explicitSeed ? deal({ drawCount, seed }) : dealPlayable({ drawCount });
    const dailyKey = extra.dailyKey || (extra.keepDaily ? previousDaily : null);
    const pickKey = extra.pickKey || (extra.keepDaily ? previousPick : null);
    if (dailyKey) session.state.daily = dailyKey;
    if (pickKey) session.state.pick = pickKey;
    persist();
    render();
    if (!showIfStuck()) {
      setStatus(drawCount === 3 ? "Draw three from the stock." : "Draw one from the stock.");
    }
  }

  function startDaily(drawCount = session.state?.drawCount) {
    const key = todayKey();
    const draw = drawCount === 3 ? 3 : 1;
    startNewGame(draw, dailySeed("klondike", key), { dailyKey: key });
  }

  function startPick() {
    const entry = pickForDate(todayKey());
    if (!entry || entry.game !== "klondike") return;
    startNewGame(1, entry.seed, { dailyKey: entry.date, pickKey: entry.date });
  }

  function replayDeal() {
    startNewGame(session.state.drawCount, session.state.seed, { keepDaily: true, pickKey: session.state.pick || null });
  }

  function countPlay() {
    if (!session.countedPlay) {
      session.stats.played += 1;
      session.countedPlay = true;
    }
  }

  function statusForSuccess(result, to) {
    if (result.recycled) return `Recycled the waste. ${recycleNote(session.state.drawCount)}`;
    if (result.drawn != null) return "Drew from the stock.";
    if (result.flipped) return "Card turned over.";
    if (to?.zone === "foundation" || result.foundationIndex != null) return "Moved to the foundation.";
    if (to?.zone === "tableau" && Number.isInteger(to.index)) return `Moved to column ${to.index + 1}.`;
    return "Moved the card.";
  }

  function commit(result, sound, to, from) {
    if (!result.ok) {
      sounds.illegal(session.muted);
      setStatus("That card cannot move there.");
      nudgeBoard(from);
      return false;
    }
    countPlay();
    session.history.push(cloneState(session.state));
    if (session.history.length > 200) session.history.shift();
    session.state = result.state;
    session.selected = null;
    session.hintMove = null;
    markGlow(result);
    if (session.state.won) recordWin();
    persist();
    render();
    if (sound === "draw") sounds.draw(session.muted);
    else if (sound === "recycle") sounds.recycle(session.muted);
    else sounds.place(session.muted);
    if (result.flipped) sounds.flip(session.muted);
    if (session.state.won) {
      sounds.win(session.muted);
      showWin();
      setStatus("All four foundations complete.");
    } else if (!showIfStuck()) {
      setStatus(statusForSuccess(result, to));
    }
    return true;
  }

  function tryMove(from, to) {
    return commit(moveCards(session.state, from, to), "place", to, from);
  }

  function doDraw() {
    interruptMotion();
    const result = draw(session.state);
    commit(result, result.recycled ? "recycle" : "draw", null, { zone: "stock" });
  }

  function doUndo() {
    interruptMotion();
    if (!session.history.length || session.state.won) return;
    session.state = continueClock(session.state, session.history.pop());
    session.state.undoUsed = true;
    session.selected = null;
    session.hintMove = null;
    persist();
    render();
    sounds.undo(session.muted);
    if (!showIfStuck()) {
      if (session.modal === "stuck") hideOverlay();
      setStatus("Undid the last move.");
    }
  }

  function markGlow(result) {
    session.glow = {
      columns: result?.revealedColumns || [],
      foundations: result?.completedFoundations || [],
    };
    if (session.glow.columns.length || session.glow.foundations.length) {
      scheduleGlowClear(session, () => {
        session.glow = { columns: [], foundations: [] };
        render();
      });
    } else if (session.glowTimer) {
      window.clearTimeout(session.glowTimer);
      session.glowTimer = 0;
    }
  }

  function doHint() {
    interruptMotion();
    const move = findHint(session.state);
    if (move) {
      session.hintMove = move;
      render();
      if (move.kind === "draw") setStatus("Draw from the stock.");
      else setStatus("A legal move is highlighted.");
      return move;
    }
    session.hintMove = null;
    if (showIfStuck()) {
      render();
      return null;
    }
    render();
    setStatus("No useful moves — try undo or a new game.");
    return null;
  }

  function doAuto(from) {
    return commit(autoMove(session.state, from), "place", null, from);
  }

  async function doFinish() {
    if (!canAutoComplete(session.state) || session.state.won) return;
    if (session.finishing) {
      session.finishFast = true;
      slides.finishNow();
      return;
    }
    const token = slides.beginChain();
    session.finishing = true;
    session.finishFast = false;
    try {
      while (slides.chainIs(token) && canAutoComplete(session.state) && !session.state.won) {
        const result = autoCompleteStep(session.state);
        if (!result.ok) break;
        if (session.finishFast) slides.setInstant(true);
        else slides.setFast(true);
        commit(result, "place");
        if (!slides.chainIs(token)) break;
        if (session.finishFast) {
          slides.finishNow();
          continue;
        }
        await slides.whenDone();
      }
    } finally {
      if (slides.chainIs(token)) session.finishing = false;
    }
  }

  function legalDrop(from, to) {
    if (!from || !to) return false;
    if (to.zone === "stock" || to.zone === "waste") return false;
    return listLegalMoves(session.state).some(
      (move) =>
        locKey(move.from) === locKey(from) &&
        move.to.zone === to.zone &&
        (move.to.index ?? null) === (to.index ?? null),
    );
  }

  function highlightDrops(from, on) {
    document.querySelectorAll(".slot.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
    if (!on || !from) return;
    for (const move of listLegalMoves(session.state)) {
      if (locKey(move.from) !== locKey(from)) continue;
      const sel =
        move.to.index == null
          ? `[data-drop="${move.to.zone}"]`
          : `[data-drop="${move.to.zone}:${move.to.index}"]`;
      document.querySelector(sel)?.classList.add("drop-ok");
    }
  }

  function cardsFor(from) {
    if (from.zone === "waste") return session.state.waste.slice(-1);
    if (from.zone === "foundation") {
      return session.state.foundations[from.index].slice(-1);
    }
    const pile = session.state.tableau[from.index];
    return pile.slice(pile.length - (from.count ?? 1));
  }

  function startDrag(from, x, y, originEl) {
    const cards = cardsFor(from).filter((c) => c.faceUp);
    if (!cards.length) return;
    session.drag = { from, x, y, originEl };
    document.documentElement.classList.add("is-dragging");
    const ghost = document.createElement("div");
    ghost.className = "ghost";
    cards.forEach((card, i) => {
      const el = makeCardEl(card, from, cards.length - i, false);
      ghost.appendChild(el);
    });
    root.dragLayer.appendChild(ghost);
    session.drag.ghost = ghost;
    originEl.classList.add("is-ghost-source");
    if (from.zone === "tableau") {
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
    ghost.style.transform = `translate(${x - 28}px, ${y - 20}px)`;
    paintDragTilt(ghost, session.drag, x);
  }

  function endDrag(x, y) {
    const drag = session.drag;
    const tilt = drag?.tilt || 0;
    const ids = drag?.from ? cardsFor(drag.from).map((card) => card.id) : [];
    const ghosts = slides.capture(root.dragLayer);
    session.drag = null;
    document.documentElement.classList.remove("is-dragging");
    root.dragLayer.innerHTML = "";
    document.querySelectorAll(".is-ghost-source").forEach((el) => el.classList.remove("is-ghost-source"));
    highlightDrops(null, false);
    if (!drag) return false;
    const to = parseDrop(document.elementFromPoint(x, y));
    if (to && legalDrop(drag.from, to)) {
      slides.prefer(ghosts);
      armCardSettle(ids, tilt);
    }
    if (to) {
      const ok = tryMove(drag.from, to);
      if (!ok) {
        cancelCardSettle();
        slides.clearPrefer();
      }
      return ok;
    }
    slides.clearPrefer();
    sounds.illegal(session.muted);
    setStatus("That card cannot move there.");
    nudgeBoard(drag.from);
    return false;
  }

  function onActivate(loc, cardEl, isDouble) {
    if (loc.zone === "stock") {
      doDraw();
      return;
    }
    if (isDouble) {
      doAuto(loc);
      return;
    }
    if (session.selected) {
      if (locKey(session.selected) === locKey(loc)) {
        session.selected = null;
        render();
        return;
      }
      if (tryMove(session.selected, loc)) return;
      if (cardEl?.classList.contains("playable")) {
        session.selected = loc;
        render();
        return;
      }
    }
    if (cardEl?.classList.contains("playable")) {
      session.selected = loc;
      render();
      setStatus("Choose a destination, or drag the card.");
    }
  }

  function onPointerDown(event) {
    // A press on the stock is a draw; a card sliding out of it must not claim the press.
    const onStock = event.target.closest?.('[data-drop="stock"]');
    const picked = slides.pickAt(event.clientX, event.clientY);
    const moving = onStock && picked?.dataset.zone !== "stock" ? null : picked;
    interruptMotion();
    if (event.button != null && event.button !== 0) return;
    if (!root.overlay.hidden) return;
    if (event.target.closest("[data-testid='draw-choice']")) return;
    resumeAudio();
    const cardEl = moving || event.target.closest(".card");
    const slot = (moving || event.target).closest("[data-drop]");
    const loc = parseLoc(cardEl) || parseDrop(slot);
    if (!loc) {
      session.selected = null;
      render();
      return;
    }
    if (loc.zone === "stock") {
      event.preventDefault();
      cardEl?.setPointerCapture?.(event.pointerId);
      session.drag = { from: loc, x: event.clientX, y: event.clientY, clickOnly: true, originEl: cardEl };
      return;
    }
    if (!cardEl || cardEl.classList.contains("face-down")) {
      if (session.selected && loc.zone !== "waste") {
        tryMove(session.selected, loc);
      }
      return;
    }
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
    if (!drag) return;
    if (drag.clickOnly) return;
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
    const x = event.clientX;
    const y = event.clientY;
    if (drag.ghost) {
      endDrag(x, y);
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
  listen(root.table, "click", (event) => {
    const btn = event.target.closest("[data-testid='draw-choice'] [data-draw]");
    if (!btn) return;
    event.preventDefault();
    confirmNew(Number(btn.dataset.draw));
  });
  listen(window, "pointermove", onPointerMove);
  listen(window, "pointerup", onPointerUp);
  listen(window, "pointercancel", () => {
    document.documentElement.classList.remove("is-dragging");
    if (session.drag?.ghost) endDrag(-1, -1);
    session.drag = null;
  });
  listenLayout(listen, fit);

  const onNew = () => confirmNew(session.state.drawCount);
  listen(document.getElementById("btn-new"), "click", onNew);
  listen(root.undo, "click", doUndo);
  listen(document.getElementById("btn-hint"), "click", doHint);
  bindThumb(listen, { undo: doUndo, hint: doHint, newGame: onNew });
  listen(root.finish, "click", doFinish);
  listen(root.mute, "click", () => {
    session.muted = !session.muted;
    savePrefs({ sound: !session.muted });
    persist();
    updateMuteButton();
  });
  listen(document.getElementById("btn-help"), "click", showHelp);
  listen(root.draw1, "click", () => confirmNew(1));
  listen(root.draw3, "click", () => confirmNew(3));

  listen(root.overlay, "click", (event) => {
    if (event.target.closest(".tip-panel")) return;
    const btn = event.target.closest("[data-act]");
    if (!btn) {
      if (event.target === root.overlay && session.modal === "stuck") hideOverlay();
      return;
    }
    const act = btn.dataset.act;
    if (act === "tip") {
      toggleTipPanel(btn.closest(".modal"));
      return;
    }
    if (act === "close") hideOverlay();
    else if (act === "undo") doUndo();
    else if (act === "replay") replayDeal();
    else if (act === "again" || act === "new") {
      const drawCount = Number(btn.dataset.draw || session.state.drawCount);
      if (btn.dataset.pick === "1") startPick();
      else if (btn.dataset.daily === "1") startDaily(drawCount);
      else startNewGame(drawCount);
    }
  });

  listen(window, "keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (!root.overlay.hidden) hideOverlay();
      else {
        session.selected = null;
        render();
      }
      return;
    }
    if (!root.overlay.hidden) return;
    if (key === "n") confirmNew(session.state.drawCount);
    else if (key === "u" || (key === "z" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      doUndo();
    } else if (key === "h") doHint();
    else if (key === " ") {
      event.preventDefault();
      doDraw();
    } else if (key === "a") doFinish();
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
  persist();
  render();
  if (bootPickConfirm) confirmNew(1, { pick: true });
  else if (session.state?.won) showWin();
  else if (!showIfStuck()) setStatus("Move cards on the tableau, or draw from the stock.");

  return {
    getState: () => session.state,
    setState(next) {
      interruptMotion();
      session.state = next;
      session.selected = null;
      session.hintMove = null;
      session.clockPlayed = (next?.moves > 0) || session.history.length > 0;
      persist();
      render();
      if (session.state?.won) showWin();
      else if (!showIfStuck() && session.modal === "stuck") hideOverlay();
    },
    newGame: startNewGame,
    draw: doDraw,
    undo: doUndo,
    hint: doHint,
    listMoves: () => listLegalMoves(session.state),
    move(from, to) {
      interruptMotion();
      const result = moveCards(session.state, from, to);
      if (!result.ok) {
        sounds.illegal(session.muted);
        setStatus("That card cannot move there.");
        nudgeBoard(from);
        return result;
      }
      commit(result, "place", to);
      return { ok: true, state: session.state };
    },
    historyLength: () => session.history.length,
    isAnimating: () => session.finishing || slides.running(),
    unmount() {
      interruptMotion();
      stopBoardPaint(session);
      persist();
      ac.abort();
      window.clearInterval(timer);
      clockObserver.disconnect();
      document.documentElement.classList.remove("is-dragging");
      clearLayoutVars();
      if (session.autoTimer) window.clearTimeout(session.autoTimer);
      session.autoTimer = 0;
      if (root.dragLayer) root.dragLayer.innerHTML = "";
      if (root.table) root.table.innerHTML = "";
      if (toolbar) toolbar.innerHTML = "";
      hideOverlay();
    },
  };
}
