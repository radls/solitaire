// Behavior checks that drive the built app. Chromium only.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173
// BASE=http://127.0.0.1:4173/solitaire/ node e2e/playtest-behavior.mjs
import { chromium } from "playwright-core";
import { dailySeed, formatDailyLabel } from "../src/daily.js";

const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
let bad = 0;
const check = (name, cond, note) => {
  if (!cond) bad += 1;
  console.log(cond ? "PASS" : "FAIL", name, note == null ? "" : JSON.stringify(note));
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const today = () => ymd(new Date());
const yesterday = () => ymd(new Date(Date.now() - 86400000));

async function openPage(vp = { viewport: { width: 1280, height: 800 } }, init) {
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", (error) => page.errs.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") page.errs.push(msg.text());
  });
  if (init) await page.addInitScript(init.fn, init.arg);
  return [ctx, page];
}

async function ready(page) {
  await page.waitForFunction(() => typeof window.__solitaire?.getState === "function", null, { timeout: 8000 });
  // The hook appears as soon as a game mounts, which can be mid-deal. Wait
  // until opening slides have finished so a fallback draw is not dropped.
  await page.waitForFunction(() => {
    const api = window.__solitaire;
    if (typeof api?.getState !== "function") return false;
    if (!api.game?.()) return true;
    if (!api.getState()) return false;
    if (api.isAnimating?.()) return false;
    return !!document.querySelector("#table .card");
  }, null, { timeout: 8000 });
}

function stripClock(raw) {
  const state = JSON.parse(raw);
  delete state.pausedAt;
  delete state.startedAt;
  return JSON.stringify(state);
}

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Draw 1/3: cancel keeps the deal; OK switches and starts at 0 moves.
for (const [name, vp] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["phone", phone]]) {
  const [ctx, page] = await openPage(vp);
  await page.goto(`${BASE}?game=klondike&seed=12345`);
  await ready(page);
  const move = (await page.evaluate(() => window.__solitaire.listMoves())).find((item) => item.kind !== "draw");
  await page.evaluate((item) => window.__solitaire.move(item.from, item.to), move);
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => ({
    s: JSON.stringify(window.__solitaire.getState()),
    h: window.__solitaire.historyLength(),
    d: window.__solitaire.getState().drawCount,
  }));
  const other = before.d === 3 ? "#btn-draw-1" : "#btn-draw-3";
  await page.locator(other).click();
  await page.waitForTimeout(250);
  const modal = await page.locator('[data-testid="confirm-modal"]').isVisible();
  await page.locator('[data-testid="confirm-cancel"]').click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    s: JSON.stringify(window.__solitaire.getState()),
    h: window.__solitaire.historyLength(),
    d: window.__solitaire.getState().drawCount,
    pressed: [
      document.querySelector("#btn-draw-1")?.getAttribute("aria-pressed"),
      document.querySelector("#btn-draw-3")?.getAttribute("aria-pressed"),
    ],
  }));
  check(
    `${name} draw toggle asks, cancel keeps game`,
    modal && stripClock(after.s) === stripClock(before.s) && after.h === before.h && after.d === before.d,
    { modal, h: [before.h, after.h], d: [before.d, after.d], pressed: after.pressed },
  );
  await page.locator(other).click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="confirm-ok"]').click();
  await page.waitForTimeout(400);
  const ok = await page.evaluate(() => ({
    d: window.__solitaire.getState().drawCount,
    moves: window.__solitaire.getState().moves,
  }));
  check(`${name} draw toggle OK switches`, ok.d !== before.d && ok.moves === 0, ok);
  check(`${name} no console errors (draw)`, page.errs.length === 0, page.errs);
  await ctx.close();
}

// Undo after a win stays closed for FreeCell and King's Corners.
for (const game of ["freecell", "kings"]) {
  const [ctx, page] = await openPage();
  await page.goto(`${BASE}?game=${game}`);
  await ready(page);
  await page.evaluate(({ game: which }) => {
    const card = (suit, rank) => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true });
    const state = structuredClone(window.__solitaire.getState());
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    if (which === "freecell") {
      state.foundations = suits.map((suit, index) => Array.from({ length: index === 3 ? 12 : 13 }, (_, rank) => card(suit, rank + 1)));
      state.cascades = state.cascades.map(() => []);
      state.cascades[0] = [card("spades", 13)];
      state.freecells = state.freecells.map(() => null);
    } else {
      const plan = [["spades", "hearts"], ["clubs", "diamonds"], ["hearts", "spades"], ["diamonds", "clubs"]];
      state.corners = plan.map(([odd, even], index) => Array.from({ length: index === 3 ? 12 : 13 }, (_, step) => {
        const rank = 13 - step;
        return card(rank % 2 ? odd : even, rank);
      }));
      state.sides = [[card("diamonds", 1)], [], [], []];
      state.stock = [];
      state.waste = [];
    }
    state.won = false;
    state.moves = 5;
    window.__solitaire.setState(state);
  }, { game });
  await page.waitForTimeout(300);
  const move = (await page.evaluate(() => window.__solitaire.listMoves())).find((item) => item.kind !== "draw");
  const res = await page.evaluate((item) => window.__solitaire.move(item.from, item.to)?.ok, move);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(() => ({
    h: window.__solitaire.historyLength(),
    won: window.__solitaire.getState().won,
  }));
  const undoDisabled = await page.evaluate(() => document.getElementById("btn-undo")?.disabled);
  await page.evaluate(() => window.__solitaire.undo());
  await page.keyboard.press("z");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    h: window.__solitaire.historyLength(),
    won: window.__solitaire.getState().won,
  }));
  check(
    `${game} undo blocked after win`,
    res === true && before.won === true && after.won === true && after.h === before.h && undoDisabled === true,
    { res, before, after, undoDisabled },
  );
  await ctx.close();
}

// Golf: a phone tap that ends the round leaves the dialog open. A fail does not credit; a clear does.
const legacy = {
  played: 9,
  cleared: 3,
  bestScore: 2,
  streak: 1,
  bestStreak: 2,
  dailyStreak: 4,
  dailyBest: 6,
  dailyLast: yesterday(),
};
for (const outcome of ["fail", "clear"]) {
  const [ctx, page] = await openPage(phone, {
    fn: (stats) => {
      if (!sessionStorage.getItem("qa-golf")) {
        localStorage.setItem("grok-solitaire:golf", JSON.stringify({ state: null, history: [], stats, savedAt: Date.now() }));
        sessionStorage.setItem("qa-golf", "1");
      }
    },
    arg: legacy,
  });
  await page.goto(`${BASE}?game=golf`);
  await ready(page);
  const loaded = await page.evaluate(() => JSON.parse(localStorage.getItem("grok-solitaire:golf")).stats);
  const day = today();
  await page.evaluate(({ outcome: which, day: daily }) => {
    const card = (suit, rank) => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true });
    const state = structuredClone(window.__solitaire.getState());
    state.columns = state.columns.map(() => []);
    if (which === "fail") {
      state.columns[0] = [card("hearts", 9)];
      state.columns[1] = [card("clubs", 11)];
      state.waste = [card("clubs", 5)];
      state.stock = [{ ...card("hearts", 2), faceUp: false }];
    } else {
      state.columns[0] = [card("hearts", 6)];
      state.waste = [card("clubs", 5)];
      state.stock = [];
    }
    state.over = false;
    state.moves = 3;
    state.daily = daily;
    state.wonAt = null;
    window.__solitaire.setState(state);
  }, { outcome, day });
  await page.waitForTimeout(400);
  const target = outcome === "fail" ? "[data-drop='stock'], .stock" : '.card[data-id="hearts-6"]';
  const box = await page.locator(target).first().boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1200);
  const end = await page.evaluate(() => ({
    over: window.__solitaire.getState().over,
    overlay: !document.getElementById("overlay")?.hidden && !!document.querySelector("#overlay .modal"),
    text: document.querySelector("#overlay .modal")?.innerText?.replace(/\s+/g, " ").slice(0, 300) || "",
    stats: JSON.parse(localStorage.getItem("grok-solitaire:golf")).stats,
    undoDisabled: document.getElementById("btn-undo")?.disabled ?? document.getElementById("thumb-undo")?.disabled,
  }));
  check(
    `golf ${outcome}: legacy daily stats loaded`,
    loaded.dailyStreak === 4 && loaded.dailyBest === 6 && loaded.dailyLast === legacy.dailyLast,
    { dailyStreak: loaded.dailyStreak, dailyBest: loaded.dailyBest, dailyLast: loaded.dailyLast },
  );
  if (outcome === "fail") {
    check(
      "golf failed daily: no credit",
      end.over === true && end.stats.dailyLast === legacy.dailyLast && end.stats.dailyStreak === 4 && end.stats.dailyBest === 6 && !/done|New best/i.test(end.text),
      { over: end.over, dailyLast: end.stats.dailyLast, dailyStreak: end.stats.dailyStreak, text: end.text },
    );
  } else {
    check(
      "golf cleared daily: credited +1",
      end.over === true && end.stats.dailyLast === day && end.stats.dailyStreak === 5 && end.stats.dailyBest === 6,
      { over: end.over, dailyLast: end.stats.dailyLast, dailyStreak: end.stats.dailyStreak, dailyBest: end.stats.dailyBest },
    );
  }
  check(`golf ${outcome}: phone tap leaves dialog open`, end.overlay === true, end.text);
  check(`golf ${outcome}: undo disabled after end`, end.undoDisabled === true, end.undoDisabled);
  check(`golf ${outcome}: no console errors`, page.errs.length === 0, page.errs);
  await ctx.close();
}

// Grok's pick: a casual in-progress game confirms. OK deals today's pick. Resume is only today's pick.
{
  const [ctx, page] = await openPage();
  await page.goto(BASE);
  await ready(page);
  const pick = await page.evaluate(() => window.__solitaire.pickToday());
  check("pick present today", !!pick?.game, pick && { game: pick.game, date: pick.date });
  if (pick) {
    await page.goto(`${BASE}?game=${pick.game}`);
    await ready(page);
    const moves = await page.evaluate(() => {
      const api = window.__solitaire;
      const list = api.listMoves?.() || [];
      const play = list.find((item) => item && item.from && item.to && item.kind !== "draw" && item.type !== "draw");
      if (play) api.move(play.from, play.to);
      else if (api.apply) api.apply({ type: "draw" });
      else if (api.draw) api.draw();
      return api.getState()?.moves || 0;
    });
    await page.waitForTimeout(400);
    const saved = await page.evaluate(() => {
      const state = window.__solitaire.getState();
      return {
        seed: state?.seed ?? state?.dealNumber,
        moves: state?.moves || 0,
        pick: state?.pick || null,
      };
    });
    check("pick setup has a casual move", moves > 0 && saved.moves > 0 && saved.pick == null, saved);

    async function showPicker() {
      await page.goto(BASE);
      await page.waitForTimeout(400);
      const play = page.locator('[data-testid="groks-pick-play"]');
      if (!(await play.count())) {
        await page.getByRole("button", { name: /^Games$/ }).first().click();
        await page.waitForTimeout(400);
      }
      await play.waitFor({ state: "visible", timeout: 5000 });
      return play;
    }

    const play = await showPicker();
    const label = (await play.innerText()).trim();
    await play.click();
    await page.waitForTimeout(500);
    const asked = await page.evaluate(() => {
      const state = window.__solitaire.getState();
      return {
        seed: state?.seed ?? state?.dealNumber,
        moves: state?.moves || 0,
        pick: state?.pick || null,
        confirm: !!document.querySelector('[data-testid="confirm-modal"]'),
      };
    });
    check(
      "pick: casual save asks instead of resuming",
      label === "Play" && asked.confirm === true && asked.seed === saved.seed && asked.moves === saved.moves && asked.pick == null,
      { label, saved, asked },
    );
    await page.locator('[data-testid="confirm-cancel"]').click();
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => {
      const state = window.__solitaire.getState();
      return {
        seed: state?.seed ?? state?.dealNumber,
        moves: state?.moves || 0,
        pick: state?.pick || null,
        confirm: !!document.querySelector('[data-testid="confirm-modal"]'),
      };
    });
    check(
      "pick: cancel keeps the casual save",
      kept.confirm === false && kept.seed === saved.seed && kept.moves === saved.moves && kept.pick == null,
      kept,
    );

    const again = await showPicker();
    await again.click();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="confirm-ok"]').click();
    await page.waitForTimeout(500);
    const dealt = await page.evaluate(() => {
      const state = window.__solitaire.getState();
      return {
        game: window.__solitaire.game(),
        seed: state?.seed ?? state?.dealNumber,
        moves: state?.moves || 0,
        pick: state?.pick || null,
        daily: state?.daily || null,
        confirm: !!document.querySelector('[data-testid="confirm-modal"]'),
      };
    });
    check(
      "pick: confirm deals today's pick",
      dealt.confirm === false && dealt.game === pick.game && dealt.seed === pick.seed && dealt.pick === pick.date && dealt.daily === pick.date && dealt.moves === 0 && dealt.seed !== saved.seed,
      { pick: { game: pick.game, date: pick.date, seed: pick.seed }, dealt },
    );

    await page.evaluate(() => {
      const state = window.__solitaire.getState();
      state.moves = Math.max(1, state.moves || 0);
      state.won = false;
      state.over = false;
      window.__solitaire.setState(state);
    });
    await page.waitForTimeout(300);
    const resumeSeed = await page.evaluate(() => window.__solitaire.getState().seed ?? window.__solitaire.getState().dealNumber);
    const resumeBtn = await showPicker();
    const resumeLabel = (await resumeBtn.innerText()).trim();
    await resumeBtn.click();
    await page.waitForTimeout(500);
    const resumed = await page.evaluate(() => {
      const state = window.__solitaire.getState();
      return {
        seed: state?.seed ?? state?.dealNumber,
        moves: state?.moves || 0,
        pick: state?.pick || null,
        confirm: !!document.querySelector('[data-testid="confirm-modal"]'),
      };
    });
    check(
      "pick: today's pick resumes without confirm",
      resumeLabel === "Resume" && resumed.confirm === false && resumed.seed === resumeSeed && resumed.moves >= 1 && resumed.pick === pick.date,
      { resumeLabel, resumeSeed, resumed },
    );
  }
  check("pick: no console errors", page.errs.length === 0, page.errs);
  await ctx.close();
}

// Draw 1/3 on an unplayed or in-progress older daily keeps that day's deal.
{
  const older = yesterday();
  const expectedSeed = dailySeed("klondike", older);
  const dayLabel = formatDailyLabel(older).replace(/^Daily · /, "");
  const [ctx, page] = await openPage();
  await page.goto(`${BASE}?game=klondike&seed=12345&draw=1`);
  await ready(page);
  async function dismissOverlay() {
    if (await page.locator("#overlay:not([hidden]) .modal").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }
  await dismissOverlay();
  await page.evaluate((key) => {
    const state = window.__solitaire.getState();
    state.daily = key;
    state.pick = null;
    state.moves = 0;
    state.won = false;
    state.drawCount = 1;
    window.__solitaire.setState(state);
  }, older);
  await page.waitForTimeout(200);
  await dismissOverlay();
  await page.locator("#btn-draw-3").click();
  await page.waitForTimeout(400);
  const switched = await page.evaluate(() => {
    const state = window.__solitaire.getState();
    return {
      daily: state.daily,
      seed: state.seed,
      draw: state.drawCount,
      moves: state.moves,
      pick: state.pick || null,
      confirm: !!document.querySelector('[data-testid="confirm-modal"]'),
    };
  });
  check(
    "unplayed older daily keeps that day when draw changes",
    older !== today() && switched.confirm === false && switched.daily === older && switched.seed === expectedSeed && switched.draw === 3 && switched.moves === 0 && switched.pick == null,
    { older, expectedSeed, switched },
  );

  await page.evaluate((key) => {
    const state = window.__solitaire.getState();
    state.daily = key;
    state.pick = null;
    state.moves = 4;
    state.won = false;
    state.drawCount = 3;
    window.__solitaire.setState(state);
  }, older);
  await page.waitForTimeout(200);
  await dismissOverlay();
  const beforeSeed = await page.evaluate(() => window.__solitaire.getState().seed);
  await page.locator("#btn-draw-1").click();
  await page.waitForTimeout(250);
  const modalText = ((await page.locator('[data-testid="confirm-modal"]').innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  await page.locator('[data-testid="confirm-cancel"]').click();
  await page.waitForTimeout(200);
  const cancelled = await page.evaluate(() => {
    const state = window.__solitaire.getState();
    return { daily: state.daily, seed: state.seed, draw: state.drawCount, moves: state.moves };
  });
  check(
    "older daily confirm names that day and cancel keeps it",
    modalText.includes(dayLabel) && !/today's daily/.test(modalText) && cancelled.daily === older && cancelled.seed === beforeSeed && cancelled.draw === 3 && cancelled.moves === 4,
    { dayLabel, modalText, cancelled },
  );
  await page.locator("#btn-draw-1").click();
  await page.waitForTimeout(250);
  await page.locator('[data-testid="confirm-ok"]').click();
  await page.waitForTimeout(400);
  const confirmed = await page.evaluate(() => {
    const state = window.__solitaire.getState();
    return { daily: state.daily, seed: state.seed, draw: state.drawCount, moves: state.moves, pick: state.pick || null };
  });
  check(
    "older daily confirm keeps that day and seed",
    confirmed.daily === older && confirmed.seed === expectedSeed && confirmed.draw === 1 && confirmed.moves === 0 && confirmed.pick == null,
    { older, expectedSeed, confirmed },
  );
  check("older daily: no console errors", page.errs.length === 0, page.errs);
  await ctx.close();
}

await browser.close();
console.log("FAILURES", bad);
process.exit(bad ? 1 : 0);
