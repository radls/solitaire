// Batch 6 browser check. Desktop 1280×800 and iPhone 390×844.
// GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npx vite preview --host 127.0.0.1 --port 4173
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4173/solitaire/";
const SH = process.env.SHOTS_DIR || "/workspace/qa-shots/solitaire-batch6";
mkdirSync(SH, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results = [];
const ok = (P, name, cond, note = "") => {
  results.push({ P, name, pass: !!cond, note });
  console.log(`${cond ? "PASS" : "FAIL"} [${P}] ${name}${note ? " — " + note : ""}`);
};
const VPS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};

async function newPage(P, extra = {}, init) {
  const ctx = await browser.newContext({ ...VPS[P], ...extra });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") page.errs.push(m.text());
  });
  return [ctx, page];
}

function card(suit, rank, faceUp = true) {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

async function clickHint(page) {
  const thumb = page.locator("#thumb-hint");
  if (await thumb.isVisible()) await thumb.click();
  else await page.locator("#btn-hint").click();
}

async function winKlondike(page) {
  await page.evaluate(() => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()];
    const by = Object.fromEntries(all.map((c) => [c.id, { ...c, faceUp: true }]));
    const suits = ["spades", "hearts", "diamonds", "clubs"];
    s.foundations = suits.map((su) => Array.from({ length: su === "spades" ? 12 : 13 }, (_, i) => by[`${su}-${i + 1}`]));
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [by["spades-13"]];
    s.stock = [];
    s.waste = [];
    s.won = false;
    s.moves = Math.max(s.moves, 41);
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  return page.evaluate(() => window.__solitaire.move({ zone: "tableau", index: 0 }, { zone: "foundation", index: 0 }));
}

const PROMISE = "Each new deal is checked so the stock can come into play. A game can still run out of moves later.";

for (const P of ["desktop", "phone"]) {
  let [ctx, page] = await newPage(P);
  await page.goto(BASE);
  await page.waitForTimeout(500);
  const promise = (await page.locator('[data-testid="no-dead-deals"]').textContent())?.trim();
  ok(P, "A honest deal promise", promise === PROMISE, promise || "");
  await page.screenshot({ path: `${SH}/${P}-promise.png`, fullPage: true });
  ok(P, "no console errors (picker)", !page.errs.length, page.errs.join("|"));
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(600);
  const choice = page.locator('[data-testid="draw-choice"]');
  const choiceText = (await choice.innerText()).replace(/\s+/g, " ");
  const box = await choice.boundingBox();
  const vw = P === "phone" ? 390 : 1280;
  ok(P, "7 draw choice words visible at the start", /Draw 1/.test(choiceText) && /Draw 3/.test(choiceText) && !!box && box.width > 80 && box.x >= 0 && box.x + box.width <= vw + 1, choiceText);
  await page.screenshot({ path: `${SH}/${P}-draw-choice.png` });
  await choice.locator('[data-draw="3"]').click();
  await page.waitForTimeout(300);
  ok(P, "7 Draw 3 starts that mode", (await page.evaluate(() => window.__solitaire.getState().drawCount)) === 3);
  const opening = await page.evaluate(() => {
    const s = window.__solitaire.getState();
    return { stock: s.stock.length, stuck: !!document.querySelector("[data-testid='stuck-modal']") };
  });
  ok(P, "A opening is not a dead stock", !opening.stuck && opening.stock > 0, JSON.stringify(opening));
  for (let n = 0; n < 3; n++) {
    await clickHint(page);
    await page.waitForTimeout(150);
  }
  const afterHints = await page.evaluate(() => {
    const s = window.__solitaire.getState();
    return {
      stock: s.stock.length,
      stuck: !!document.querySelector("[data-testid='stuck-modal']"),
      hintDraw: !!document.querySelector("[data-drop='stock'].hint-to"),
    };
  });
  ok(P, "A three hints do not call a full stock dead", !(afterHints.stuck && afterHints.stock === 24), JSON.stringify(afterHints));
  await page.screenshot({ path: `${SH}/${P}-hints.png` });

  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    s.drawCount = 3;
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [c("spades", 8)];
    s.foundations = [[], [], [], []];
    s.waste = [c("hearts", 12), c("clubs", 5), c("hearts", 7)];
    s.stock = [c("diamonds", 2, false)];
    s.moves = 4;
    s.won = false;
    s.score = 10;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(150);
  await clickHint(page);
  await page.waitForTimeout(150);
  const wasteHint = await page.evaluate(() => {
    const lit = document.querySelector(".card.hint-from");
    return {
      id: lit?.dataset.id || "",
      top: lit?.dataset.wasteTop || "",
      queenLit: !!document.querySelector('.card[data-id="hearts-12"].hint-from'),
    };
  });
  ok(P, "B hint lights the waste top", wasteHint.id === "hearts-7" && wasteHint.top === "1" && !wasteHint.queenLit, JSON.stringify(wasteHint));
  await page.screenshot({ path: `${SH}/${P}-waste-top.png` });

  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    s.moves = 12;
    s.score = 61;
    s.recycled = 0;
    s.startedAt = Date.now() - 120000;
    s.pausedAt = 0;
    s.wonAt = null;
    s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  const score = await page.evaluate(() => ({
    meter: document.getElementById("meter-score")?.textContent,
    note: document.querySelector("[data-testid='score-note']")?.textContent || "",
    moves: document.getElementById("meter-moves")?.textContent,
  }));
  ok(P, "C time penalty is visible and moves stay", score.meter === "37" && score.note === "−24 time" && score.moves === "12", JSON.stringify(score));
  await page.screenshot({ path: `${SH}/${P}-score-note.png` });
  await page.click("#btn-help");
  await page.waitForTimeout(200);
  const help = await page.locator("[data-testid='help-modal']").innerText();
  ok(P, "C help names time and recycle", /2 points/.test(help) && /20/.test(help) && /100/.test(help));
  await page.screenshot({ path: `${SH}/${P}-score-help.png`, fullPage: true });
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [c("spades", 6)];
    s.tableau[1] = [c("hearts", 1, false), c("diamonds", 5)];
    s.foundations = [[], [], [], []];
    s.stock = [];
    s.waste = [];
    s.moves = 3;
    s.won = false;
    window.__solitaire.setState(s);
  });
  const flip = await page.evaluate(() => window.__solitaire.move({ zone: "tableau", index: 1 }, { zone: "tableau", index: 0 }));
  await page.waitForTimeout(80);
  const glow = await page.evaluate(() => ({
    n: document.querySelectorAll(".pile-glow").length,
    shadow: getComputedStyle(document.querySelector(".pile-glow") || document.body).boxShadow,
  }));
  ok(P, "2 last face-down glows", flip?.ok === true && glow.n > 0 && glow.shadow !== "none", JSON.stringify({ ok: flip?.ok, reason: flip?.reason, glow }));
  await page.screenshot({ path: `${SH}/${P}-column-glow.png` });
  await ctx.close();

  [ctx, page] = await newPage(P, { reducedMotion: "reduce" });
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    const c = (suit, rank) => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true });
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[0] = [c("spades", 13)];
    s.foundations = [Array.from({ length: 12 }, (_, i) => c("spades", i + 1)), [], [], []];
    s.stock = [];
    s.waste = [];
    s.moves = 9;
    s.won = false;
    window.__solitaire.setState(s);
  });
  const king = await page.evaluate(() => window.__solitaire.move({ zone: "tableau", index: 0 }, { zone: "foundation", index: 0 }));
  await page.waitForTimeout(80);
  const still = await page.evaluate(() => {
    const el = document.querySelector(".pile-glow");
    return { n: document.querySelectorAll(".pile-glow").length, shadow: el ? getComputedStyle(el).boxShadow : "" };
  });
  ok(P, "2 reduced motion keeps a still foundation glow", king?.ok === true && still.n > 0 && still.shadow !== "none", JSON.stringify(still));
  await page.screenshot({ path: `${SH}/${P}-reduced-glow.png` });
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(400);
  const won = await winKlondike(page);
  await page.waitForTimeout(300);
  const win = await page.evaluate(() => {
    const celebrate = document.querySelector("[data-testid='celebrate']");
    const tip = document.querySelector("[data-testid='tip-cta']");
    return {
      cascade: celebrate?.querySelectorAll(".cascade-card").length ?? -1,
      dim: celebrate?.classList.contains("dim") === true,
      glow: celebrate?.dataset.glow || "",
      best: document.querySelector("[data-testid='new-best']")?.textContent || "",
      tipAfter: !!(celebrate && tip && celebrate.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING),
      tipOpen: !!document.querySelector("[data-testid='tip-panel']"),
    };
  });
  ok(P, "2 bedtime cascade before any tip", won?.ok === true && win.cascade === 7 && win.dim && win.glow === "1" && win.tipAfter && !win.tipOpen, JSON.stringify(win));
  ok(P, "5 quiet new best on a first win", win.best === "New best", win.best);
  await page.screenshot({ path: `${SH}/${P}-win-bedtime.png` });
  await ctx.close();

  [ctx, page] = await newPage(P, { reducedMotion: "reduce" });
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(300);
  await page.click("#btn-theme");
  await page.waitForTimeout(150);
  await winKlondike(page);
  await page.waitForTimeout(250);
  const reducedWin = await page.evaluate(() => {
    const celebrate = document.querySelector("[data-testid='celebrate']");
    return {
      cascade: celebrate?.querySelectorAll(".cascade-card").length ?? -1,
      glow: celebrate?.dataset.glow || "",
      shadow: celebrate ? getComputedStyle(celebrate).boxShadow : "",
    };
  });
  ok(P, "2 reduced motion win is a still glow", reducedWin.cascade === 0 && reducedWin.glow === "1" && reducedWin.shadow !== "none", JSON.stringify(reducedWin));
  await page.screenshot({ path: `${SH}/${P}-win-reduced.png` });
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(300);
  await page.click("#btn-theme");
  await page.waitForTimeout(150);
  await winKlondike(page);
  await page.waitForTimeout(250);
  const classicN = await page.locator("[data-testid='celebrate'] .cascade-card").count();
  ok(P, "2 classic cascade is the longer fall", classicN === 16, String(classicN));
  await page.screenshot({ path: `${SH}/${P}-win-classic.png` });
  await ctx.close();

  [ctx, page] = await newPage(P, {}, () => {
    localStorage.setItem(
      "grok-solitaire:golf",
      JSON.stringify({
        state: null,
        history: [],
        stats: { played: 2, cleared: 1, bestScore: 4, streak: 1, bestStreak: 1, dailyStreak: 0, dailyBest: 0, dailyLast: null },
      }),
    );
  });
  await page.goto(`${BASE}?game=golf`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = window.__solitaire.getState();
    const c = (suit, rank, faceUp = true) => ({ id: `${suit}-${rank}`, suit, rank, faceUp });
    s.columns = [[c("hearts", 5)], [c("clubs", 2)], [], [], [], [], []];
    s.waste = [c("spades", 12)];
    s.stock = [c("diamonds", 9, false)];
    s.over = false;
    s.moves = 18;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(250);
  await page.locator("[data-drop='stock']").click();
  await page.waitForTimeout(400);
  const near = await page.evaluate(() => ({
    title: document.querySelector("#overlay h2")?.textContent || "",
    primary: document.querySelector("#overlay .btn.primary")?.textContent || "",
    best: document.querySelector("[data-testid='best-score']")?.textContent || "",
    note: document.querySelector("[data-testid='new-best']")?.textContent || "",
    cascade: document.querySelectorAll("[data-testid='celebrate'] .cascade-card").length,
    over: !!window.__solitaire.getState().over,
  }));
  ok(P, "1 near miss names the cards and Try again", near.over === true && near.title === "So close — 2 cards left" && near.primary === "Try again" && near.cascade === 0, JSON.stringify(near));
  ok(P, "1 near miss judges the best from the real stock draw", /2/.test(near.best) && near.note === "New best", JSON.stringify(near));
  await page.screenshot({ path: `${SH}/${P}-golf-near.png` });
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=freecell`);
  await page.waitForTimeout(600);
  const counts = await page.locator("[data-testid='foundation-count']").allTextContents();
  ok(P, "6 four foundation counts", counts.length === 4 && counts.every((t) => /^\d+\/13$/.test(t.trim())), counts.join(" "));
  await page.screenshot({ path: `${SH}/${P}-freecell-counts.png` });
  await ctx.close();

  [ctx, page] = await newPage(P);
  await page.goto(`${BASE}?game=kings`);
  await page.waitForTimeout(600);
  const corners = (await page.locator("#meter-score").textContent())?.trim();
  await page.click("#btn-help");
  await page.waitForTimeout(200);
  const bullets = await page.locator("[data-testid='kings-help-short'] li").count();
  const goal = await page.locator("[data-testid='help-modal']").evaluate((el) => el.textContent || "");
  ok(P, "3 corners read N/4", /^\d\/4$/.test(corners || ""), corners || "");
  ok(P, "3 help stays three bullets and names the move goal", bullets === 3 && /under 150 moves/.test(goal), `bullets ${bullets}`);
  await page.screenshot({ path: `${SH}/${P}-kings-corners.png` });
  await page.screenshot({ path: `${SH}/${P}-kings-help.png`, fullPage: true });
  await ctx.close();

  [ctx, page] = await newPage(P, {}, () => {
    localStorage.setItem(
      "grok-solitaire-v1",
      JSON.stringify({
        drawCount: 1,
        muted: true,
        stats: {
          played: 3,
          won: 3,
          streak: 5,
          bestStreak: 5,
          bestTimeMs: 80000,
          fewestMoves: 40,
          dailyStreak: 1,
          dailyBest: 1,
          dailyLast: null,
        },
        saved: null,
      }),
    );
  });
  await page.goto(`${BASE}?game=klondike`);
  await page.waitForTimeout(500);
  await page.locator("[data-drop='stock']").click();
  await page.waitForTimeout(250);
  const casualSeed = await page.evaluate(() => window.__solitaire.getState().seed);
  await page.click("#btn-home");
  await page.waitForTimeout(300);
  await page.locator("[data-testid='daily-klondike']").click();
  await page.waitForTimeout(500);
  const alongside = await page.evaluate((casual) => {
    const live = window.__solitaire.getState();
    const raw = JSON.parse(localStorage.getItem("grok-solitaire-v1") || "{}");
    return {
      daily: live.daily || "",
      liveSeed: live.seed,
      streak: raw.stats?.streak,
      casualMoves: raw.saved?.state?.moves ?? null,
      casualSeed: raw.saved?.state?.seed ?? null,
      casualDaily: raw.saved?.state?.daily || "",
      sameSeed: casual,
    };
  }, casualSeed);
  ok(
    P,
    "4 daily sits beside the casual game and keeps the streak",
    !!alongside.daily && alongside.streak === 5 && alongside.casualMoves >= 1 && alongside.casualSeed === casualSeed && !alongside.casualDaily && alongside.liveSeed !== casualSeed,
    JSON.stringify(alongside),
  );
  await winKlondike(page);
  await page.waitForTimeout(300);
  const tomorrow = (await page.locator("[data-testid='tomorrow-deal']").textContent())?.trim() || "";
  const tipPos = await page.evaluate(() => {
    const t = document.querySelector("[data-testid='tomorrow-deal']");
    const tip = document.querySelector("[data-testid='tip-cta']");
    return !!(t && tip && t.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  ok(P, "4 tomorrow's deal after the daily", /^Tomorrow's deal in \d+h$/.test(tomorrow) && tipPos, tomorrow);
  await page.screenshot({ path: `${SH}/${P}-daily-tomorrow.png` });
  await page.evaluate(() => document.getElementById("btn-home").click());
  await page.waitForTimeout(400);
  const pickerTomorrow = (await page.locator("[data-testid='tomorrow-deal']").textContent())?.trim() || "";
  const pickerStreak = (await page.locator("[data-testid='pick-stats-klondike']").textContent()) || "";
  ok(P, "4 tomorrow on the picker and the streak survived", /^Tomorrow's deal in \d+h$/.test(pickerTomorrow) && /Streak [1-9]/.test(pickerStreak), `${pickerTomorrow} | ${pickerStreak}`);
  await page.screenshot({ path: `${SH}/${P}-picker-tomorrow.png`, fullPage: true });
  ok(P, "no console errors (daily)", !page.errs.length, page.errs.join("|"));
  await ctx.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
if (failed.length) process.exit(1);
