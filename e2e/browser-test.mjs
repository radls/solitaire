// Browser test (not part of npm test). Needs playwright-core + Chrome, e.g.:
//   cd /workspace/pwtools && npm i playwright-core && BASE=http://127.0.0.1:4173/solitaire/ node e2e.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
const SHOTS = "/workspace/GrokBuildApps/solitaire/shots";
const results = [];
const ok = (game, P, name, cond, note = "") => { results.push({ game, P, name, pass: !!cond, note }); console.log(`${cond ? "PASS" : "FAIL"} [${P}] ${game}: ${name}${note ? " — " + note : ""}`); };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const H = (page, fn, arg) => page.evaluate(fn, arg);
const S = (page) => H(page, () => JSON.stringify(window.__solitaire.getState()));
const strip = (s) => { const o = JSON.parse(s); delete o.startedAt; delete o.savedAt; return JSON.stringify(o); };

async function tapEl(page, loc, touch) { try { if (touch) await loc.tap({ timeout: 4000 }); else await loc.click({ timeout: 4000 }); } catch (e) { console.log("  (tap failed: " + e.message.split("\n")[0] + ")"); } await page.waitForTimeout(150); }
async function drag(page, ctx, srcLoc, dstLoc, touch) {
  const sb = await srcLoc.boundingBox(); const db = await dstLoc.boundingBox();
  const sx = sb.x + sb.width / 2, sy = sb.y + Math.min(12, sb.height / 2), dx = db.x + db.width / 2, dy = db.y + db.height / 2;
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy }] });
    for (let k = 1; k <= 12; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx + (dx - sx) * k / 12, y: sy + (dy - sy) * k / 12 }] }); await page.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(dx, dy, { steps: 12 }); await page.mouse.up();
  }
  await page.waitForTimeout(300);
}
async function pick(page, id) {
  if (await H(page, () => window.__solitaire.game()) === id) return;
  const home = page.locator('[data-testid="btn-home"]');
  if (await home.isVisible().catch(() => false)) { await home.click(); await page.waitForTimeout(200); }
  await page.locator(`[data-testid="pick-${id}"]`).click(); await page.waitForTimeout(300);
}
async function closeModal(page) { const m = page.locator('#overlay:not([hidden]) .modal'); if (await m.isVisible().catch(() => false)) { await page.keyboard.press("Escape"); await page.waitForTimeout(150); } }
const winVisible = (page) => page.locator('[data-testid="win-modal"]').isVisible().catch(() => false);


async function layoutChecks(page, G, P, label) {
  const r = await page.evaluate(() => {
    const bad = [];
    const area = document.getElementById("table");
    const els = [document.documentElement, document.body, area, ...(area ? area.querySelectorAll("*") : [])];
    for (const el of els) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      const scroller = el === document.documentElement || /(auto|scroll)/.test(cs.overflowY);
      if (scroller && el.scrollHeight > el.clientHeight + 1) bad.push(`${el.tagName}.${(el.className || "").toString().trim().replace(/\s+/g, ".")} ${el.scrollHeight}>${el.clientHeight}`);
    }
    const btns = [...document.querySelectorAll("header button, .topbar button, .toolbar button")].filter((b) => b.offsetParent && b.getClientRects().length);
    const small = btns.filter((b) => b.getBoundingClientRect().height < 43.5).map((b) => `${b.id || b.textContent.trim() || b.getAttribute("aria-label")}:${Math.round(b.getBoundingClientRect().height)}`);
    const offscreen = btns.filter((b) => { const q = b.getBoundingClientRect(); return q.right > window.innerWidth + 1 || q.left < -1; }).map((b) => b.id || b.textContent.trim());
    return { bad, small, offscreen, count: btns.length, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok(G, P, `no vertical scrollbar in card area (${label})`, r.bad.length === 0, r.bad.join(", "));
  ok(G, P, `toolbar buttons >= 44px (${label})`, r.small.length === 0 && r.count > 0, r.small.join(", ") || `${r.count} buttons`);
  ok(G, P, `no horizontal scroll / offscreen buttons (${label})`, !r.hscroll && r.offscreen.length === 0, r.offscreen.join(", "));
}
const statusText = (page) => page.locator("#status-text").textContent();

async function common(page, P) {
  const theme = await H(page, () => document.documentElement.dataset.theme);
  ok("shell", P, "night theme is default", theme === "night", theme);
  const vp = await H(page, () => document.querySelector('meta[name=viewport]').content);
  ok("shell", P, "viewport blocks zoom", /user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp), vp);
  ok("shell", P, "picker shows 3 games", (await page.locator('[data-testid^="pick-"]').count()) === 3);
  const surprise = await H(page, () => /surprise/i.test(document.body.innerText));
  ok("shell", P, "no 'surprise' copy", !surprise);
}

async function klondike(page, ctx, P, touch) {
  const G = "klondike";
  await pick(page, G);
  ok(G, P, "active", await H(page, () => window.__solitaire.game()) === G);
  await layoutChecks(page, G, P, "deal");
  let st = JSON.parse(await S(page));
  ok(G, P, "deal 52 cards / 7 cols", st.tableau.length === 7 && st.tableau.flat().length + st.stock.length + st.waste.length + st.foundations.flat().length === 52);
  // ensure a non-draw legal move exists (draw up to 30)
  let mv = null;
  for (let i = 0; i < 30; i++) {
    const ms = await H(page, () => window.__solitaire.listMoves());
    mv = ms.find(m => m.kind !== "draw" && m.to.zone === "tableau" && m.from.zone === "tableau") || ms.find(m => m.kind !== "draw" && m.from.zone === "waste") || ms.find(m => m.kind !== "draw");
    if (mv) break;
    await tapEl(page, page.locator('[data-drop="stock"]').first(), touch);
  }
  // illegal: find tableau top a -> tableau b not legal
  st = JSON.parse(await S(page));
  const legal = await H(page, () => window.__solitaire.listMoves());
  let ill = null;
  for (let a = 0; a < 7 && !ill; a++) for (let b = 0; b < 7 && !ill; b++) {
    if (a === b || !st.tableau[a].length || !st.tableau[b].length) continue;
    if (!legal.some(m => m.from.zone === "tableau" && m.from.index === a && m.from.count === 1 && m.to.zone === "tableau" && m.to.index === b)) ill = [a, b];
  }
  if (ill) {
    const before = strip(await S(page));
    await tapEl(page, page.locator(`.card[data-zone="tableau"][data-index="${ill[0]}"][data-count="1"]`), touch);
    await tapEl(page, page.locator(`[data-drop="tableau:${ill[1]}"]`), touch);
    ok(G, P, "illegal tap move rejected", strip(await S(page)) === before, `col${ill[0]}->col${ill[1]}`);
    await page.keyboard.press("Escape");
  } else ok(G, P, "illegal tap move rejected", false, "no illegal pair found");
  // legal tap move
  if (mv) {
    const h0 = await H(page, () => window.__solitaire.historyLength());
    const before = await S(page);
    const fromSel = mv.from.zone === "waste" ? `.card[data-zone="waste"].playable, .card[data-zone="waste"]` : `.card[data-zone="${mv.from.zone}"][data-index="${mv.from.index}"][data-count="${mv.from.count ?? 1}"]`;
    await tapEl(page, page.locator(fromSel).last(), touch);
    const st1 = await statusText(page);
    await tapEl(page, page.locator(`[data-drop="${mv.to.zone}:${mv.to.index}"]`), touch);
    const h1 = await H(page, () => window.__solitaire.historyLength());
    ok(G, P, "legal tap-select-tap move", h1 === h0 + 1, JSON.stringify(mv));
    const st2 = await statusText(page);
    ok(G, P, "status text updates after tap move", st2 !== st1 && !/destination/i.test(st2), `"${st1}" -> "${st2}"`);
    await tapEl(page, page.locator('[data-testid="btn-undo"]'), false);
    ok(G, P, "undo restores state", strip(await S(page)) === strip(before));
  } else ok(G, P, "legal tap-select-tap move", false, "no legal move found");
  // drag
  const ms2 = await H(page, () => window.__solitaire.listMoves());
  const dm = ms2.find(m => m.kind !== "draw" && m.from.zone === "tableau");
  if (dm) {
    const h0 = await H(page, () => window.__solitaire.historyLength());
    await drag(page, ctx, page.locator(`.card[data-zone="tableau"][data-index="${dm.from.index}"][data-count="${dm.from.count}"]`), page.locator(`[data-drop="${dm.to.zone}:${dm.to.index}"]`), touch);
    ok(G, P, "drag move", (await H(page, () => window.__solitaire.historyLength())) === h0 + 1, JSON.stringify(dm));
  } else ok(G, P, "drag move", true, "no tableau move in this deal; skipped");
  await page.screenshot({ path: `${SHOTS}/${P}-klondike.png` });
  // persistence + timer continuity across reload + undo
  const snap = strip(await S(page));
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(600);
  ok(G, P, "reload returns to last game", await H(page, () => window.__solitaire.game()) === G);
  await pick(page, G);
  ok(G, P, "state persists across reload", strip(await S(page)) === snap);
  const e0 = await H(page, () => Date.now() - window.__solitaire.getState().startedAt);
  if (await H(page, () => window.__solitaire.historyLength()) > 0) {
    await tapEl(page, page.locator('[data-testid="btn-undo"]'), false);
    const e1 = await H(page, () => Date.now() - window.__solitaire.getState().startedAt);
    ok(G, P, "timer continuous on undo after reload", Math.abs(e1 - e0) < 1500, `${e0}ms -> ${e1}ms`);
  } else ok(G, P, "timer continuous on undo after reload", true, "no history; skipped");
  // long column layout check
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()].map(c => ({ ...c }));
    const suitsAlt = ["spades", "hearts", "clubs", "diamonds"];
    const run = []; for (let r = 13; r >= 1; r--) run.push(`${suitsAlt[(13 - r) % 2 === 0 ? 0 : 1]}-${r}`);
    const runSet = new Set(run);
    const rest = all.filter(c => !runSet.has(c.id));
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    s.tableau = Array.from({ length: 7 }, () => []);
    s.tableau[6] = [...rest.slice(0, 6).map(c => ({ ...c, faceUp: false })), ...run.map(id => ({ ...by[id], faceUp: true }))];
    rest.slice(6, 12).forEach((c, i) => s.tableau[i].push({ ...c, faceUp: true }));
    s.stock = rest.slice(12).map(c => ({ ...c, faceUp: false })); s.waste = []; s.foundations = [[], [], [], []]; s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(300);
  await layoutChecks(page, G, P, "19-card column");
  await page.screenshot({ path: `${SHOTS}/${P}-klondike-long.png` });
  // win
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()];
    const by = Object.fromEntries(all.map(c => [c.id, { ...c, faceUp: true }]));
    const suits = ["spades", "hearts", "diamonds", "clubs"];
    s.foundations = suits.map(su => Array.from({ length: su === "spades" ? 12 : 13 }, (_, i) => by[`${su}-${i + 1}`]));
    s.tableau = Array.from({ length: 7 }, () => []); s.tableau[0] = [by["spades-13"]]; s.stock = []; s.waste = []; s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  await tapEl(page, page.locator('.card[data-zone="tableau"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="foundation:0"]'), touch);
  await page.waitForTimeout(400);
  ok(G, P, "win detected + calm win modal", await winVisible(page));
  await page.screenshot({ path: `${SHOTS}/${P}-klondike-win.png` });
  await closeModal(page);
}

async function freecell(page, ctx, P, touch) {
  const G = "freecell";
  await pick(page, G);
  ok(G, P, "active", await H(page, () => window.__solitaire.game()) === G);
  await layoutChecks(page, G, P, "deal");
  await tapEl(page, page.locator('[data-testid="deal-number"]'), false);
  const inp = page.locator('[data-testid="deal-input"]');
  const fs = await inp.evaluate(el => parseFloat(getComputedStyle(el).fontSize)).catch(() => 0);
  ok(G, P, "deal input font ≥16px (no iOS zoom)", fs >= 16, `${fs}px`);
  await inp.fill("1"); await inp.press("Enter"); await page.waitForTimeout(300);
  if (await inp.isVisible().catch(() => false)) { await page.locator('#overlay button:has-text("Deal")').last().click(); await page.waitForTimeout(300); }
  let st = JSON.parse(await S(page));
  ok(G, P, "enter deal #1", st.dealNumber === 1 && JSON.stringify(st.cascades.map(c => c.length)) === "[7,7,7,7,6,6,6,6]");
  ok(G, P, "deal #1 col1 = JD KD 2S 4C 3S 6D 6S", st.cascades[0].map(c => c.id).join(",") === "diamonds-11,diamonds-13,spades-2,clubs-4,spades-3,diamonds-6,spades-6");
  // illegal: 6S (c0) onto 9C (c1)
  let before = strip(await S(page));
  await tapEl(page, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="cascade:1"]'), touch);
  ok(G, P, "illegal move rejected (6S on 9C)", strip(await S(page)) === before);
  await page.keyboard.press("Escape");
  // legal tap: 6S -> freecell 0
  before = await S(page);
  await tapEl(page, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), touch);
  const fs1 = await statusText(page);
  await tapEl(page, page.locator('[data-drop="freecell:0"]'), touch);
  const fs2 = await statusText(page);
  ok(G, P, "status text updates after tap move", fs2 !== fs1 && !/destination/i.test(fs2), `"${fs1}" -> "${fs2}"`);
  st = JSON.parse(await S(page));
  ok(G, P, "legal tap move to free cell", st.cascades[0].length === 6 && st.freecells[0]?.id === "spades-6");
  // drag: 6D (c0) -> freecell 1
  await drag(page, ctx, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), page.locator('[data-drop="freecell:1"]'), touch);
  st = JSON.parse(await S(page));
  ok(G, P, "drag move to free cell", st.freecells[1]?.id === "diamonds-6");
  await tapEl(page, page.locator('[data-testid="btn-undo"]'), false);
  await tapEl(page, page.locator('[data-testid="btn-undo"]'), false);
  ok(G, P, "undo x2 restores deal", strip(await S(page)) === strip(before));
  // supermove limit through engine hook: 4 full freecells, no empty cascades -> 2-card run illegal
  const sm = await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.cascades.flat(), ...s.freecells.filter(Boolean), ...s.foundations.flat()];
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const used = new Set(["spades-9", "hearts-8", "clubs-10", "hearts-10", "diamonds-9", "clubs-3", "clubs-4", "clubs-5", "clubs-6"]);
    const rest = all.filter(c => !used.has(c.id));
    s.foundations = [[], [], [], []];
    s.freecells = [by["clubs-3"], by["clubs-4"], by["clubs-5"], by["clubs-6"]];
    s.cascades = Array.from({ length: 8 }, () => []);
    s.cascades[0] = [by["clubs-10"], by["spades-9"], by["hearts-8"]]; // wait: 9S on 10C same color; base irrelevant
    s.cascades[1] = [by["hearts-10"]];
    rest.forEach((c, i) => s.cascades[2 + (i % 6)].push(c));
    s.won = false;
    window.__solitaire.setState(s);
    const r1 = window.__solitaire.move({ zone: "cascade", index: 0, count: 2 }, { zone: "cascade", index: 1 });
    const res1 = !!(r1 && r1.ok);
    return { twoCardWithNoFree: res1 };
  });
  ok(G, P, "supermove limit enforced (2 cards, 0 free, 0 empty)", sm.twoCardWithNoFree === false, JSON.stringify(sm));
  await page.waitForTimeout(200);
  await layoutChecks(page, G, P, "long cascades");
  await page.screenshot({ path: `${SHOTS}/${P}-freecell.png` });
  // persistence
  const snap = strip(await S(page));
  await page.reload(); await page.waitForTimeout(600);
  await pick(page, G);
  ok(G, P, "state persists across reload", strip(await S(page)) === snap);
  // win
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.cascades.flat(), ...s.freecells.filter(Boolean), ...s.foundations.flat()];
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    s.freecells = [null, null, null, null];
    s.cascades = Array.from({ length: 8 }, () => []);
    s.foundations = suits.map(su => Array.from({ length: su === "spades" ? 12 : 13 }, (_, i) => by[`${su}-${i + 1}`]));
    s.cascades[0] = [by["spades-13"]]; s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  await tapEl(page, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="foundation:3"]'), touch);
  await page.waitForTimeout(400);
  ok(G, P, "win detected + calm win modal", await winVisible(page));
  await page.screenshot({ path: `${SHOTS}/${P}-freecell-win.png` });
  await closeModal(page);
}

async function golf(page, ctx, P, touch) {
  const G = "golf";
  await pick(page, G);
  ok(G, P, "active", await H(page, () => window.__solitaire.game()) === G);
  await H(page, () => window.__solitaire.newGame({ seed: 4242 }));
  await page.waitForTimeout(300);
  let st = JSON.parse(await S(page));
  ok(G, P, "deal 7x5 + waste 1 + stock 16", st.columns.length === 7 && st.columns.every(c => c.length === 5) && st.waste.length === 1 && st.stock.length === 16, `seed ${st.seed}`);
  const seedTxt = await page.locator('[data-testid="deal-number"]').textContent();
  ok(G, P, "seed shown", /\d/.test(seedTxt), seedTxt);
  await layoutChecks(page, G, P, "deal");
  // ensure a playable column exists (draw if needed)
  let moves = await H(page, () => window.__solitaire.listMoves());
  for (let i = 0; i < 16 && !moves.some(m => m.type === "play"); i++) { await tapEl(page, page.locator('[data-drop="stock"]'), touch); moves = await H(page, () => window.__solitaire.listMoves()); }
  st = JSON.parse(await S(page));
  const playCols = moves.filter(m => m.type === "play").map(m => m.col);
  const badCol = [0, 1, 2, 3, 4, 5, 6].find(c => st.columns[c].length && !playCols.includes(c));
  if (badCol != null) {
    const before = strip(await S(page));
    await tapEl(page, page.locator(`.card[data-zone="column"][data-index="${badCol}"]`).last(), touch);
    ok(G, P, "illegal tap rejected", strip(await S(page)) === before, `col ${badCol}`);
  } else ok(G, P, "illegal tap rejected", true, "every column playable; skipped");
  if (playCols.length) {
    const before = await S(page);
    const c = playCols[0];
    await tapEl(page, page.locator(`.card[data-zone="column"][data-index="${c}"]`).last(), touch);
    st = JSON.parse(await S(page));
    ok(G, P, "legal tap play to waste", st.columns[c].length === JSON.parse(before).columns[c].length - 1);
    await tapEl(page, page.locator('[data-testid="btn-undo"]'), false);
    ok(G, P, "undo restores state", strip(await S(page)) === strip(before));
    await drag(page, ctx, page.locator(`.card[data-zone="column"][data-index="${c}"]`).last(), page.locator('[data-drop="waste"]'), touch);
    st = JSON.parse(await S(page));
    ok(G, P, "drag play to waste", st.columns[c].length === JSON.parse(before).columns[c].length - 1);
  } else ok(G, P, "legal tap play to waste", false, "no playable column after drawing");
  // stock draw is legal
  const sb = JSON.parse(await S(page)).stock.length;
  if (sb) { await tapEl(page, page.locator('[data-drop="stock"]'), touch); ok(G, P, "stock draw", JSON.parse(await S(page)).stock.length === sb - 1); }
  await page.screenshot({ path: `${SHOTS}/${P}-golf.png` });
  // persistence
  const snap = strip(await S(page));
  await page.reload(); await page.waitForTimeout(600);
  ok(G, P, "reload returns to last game", await H(page, () => window.__solitaire.game()) === G);
  await pick(page, G);
  ok(G, P, "state persists across reload", strip(await S(page)) === snap);
  // no-wrap check via forced state: waste K, column top A -> not playable
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["spades", "hearts", "diamonds", "clubs"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, { ...c }]));
    const used = ["hearts-13", "spades-1", "clubs-12", "diamonds-5", "hearts-4"];
    const rest = all.filter(c => !used.includes(c.id));
    s.columns = Array.from({ length: 7 }, () => []);
    s.columns[0] = [{ ...by["spades-1"], faceUp: true }];
    s.columns[1] = [{ ...by["clubs-12"], faceUp: true }];
    s.waste = [...rest.slice(0, 40).map(c => ({ ...c, faceUp: true })), { ...by["hearts-13"], faceUp: true }];
    s.stock = rest.slice(40, 42).map(c => ({ ...c, faceUp: false }));
    s.over = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  let b4 = strip(await S(page));
  await tapEl(page, page.locator('.card[data-zone="column"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('.card[data-zone="column"][data-index="1"]').last(), touch);
  ok(G, P, "no wrap: A and Q not playable on K", strip(await S(page)) === b4);
  await closeModal(page);
  // cleared: waste 4H, column [5D], stock 2 cards
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["spades", "hearts", "diamonds", "clubs"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, { ...c }]));
    const rest = all.filter(c => !["diamonds-5", "hearts-4"].includes(c.id));
    s.columns = Array.from({ length: 7 }, () => []);
    s.columns[3] = [{ ...by["diamonds-5"], faceUp: true }];
    s.waste = [...rest.slice(0, 30).map(c => ({ ...c, faceUp: true })), { ...by["hearts-4"], faceUp: true }];
    s.stock = rest.slice(30, 32).map(c => ({ ...c, faceUp: false }));
    s.over = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  await tapEl(page, page.locator('.card[data-zone="column"][data-index="3"]').last(), touch);
  await page.waitForTimeout(400);
  const txt = await page.locator('[data-testid="win-modal"]').innerText().catch(() => "");
  ok(G, P, "course cleared detected + score -2", (await winVisible(page)) && /-2/.test(txt), txt.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: `${SHOTS}/${P}-golf-cleared.png` });
  await closeModal(page);
  // stuck round end via last stock draw
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["spades", "hearts", "diamonds", "clubs"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, { ...c }]));
    const rest = all.filter(c => !["spades-13", "hearts-2", "diamonds-9"].includes(c.id));
    s.columns = Array.from({ length: 7 }, () => []);
    s.columns[0] = [{ ...by["spades-13"], faceUp: true }];
    s.waste = [...rest.slice(0, 30).map(c => ({ ...c, faceUp: true })), { ...by["hearts-2"], faceUp: true }];
    s.stock = [{ ...by["diamonds-9"], faceUp: false }];
    s.over = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(200);
  await tapEl(page, page.locator('[data-drop="stock"]'), touch);
  await page.waitForTimeout(400);
  const t2 = await page.locator('[data-testid="win-modal"]').innerText().catch(() => "");
  ok(G, P, "stuck round over detected + score 1", (await winVisible(page)) && /round over/i.test(t2) && /\b1\b/.test(t2), t2.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: `${SHOTS}/${P}-golf-roundover.png` });
  await closeModal(page);
}

for (const vp of [
  { P: "desktop", opts: { viewport: { width: 1280, height: 800 } }, touch: false },
  { P: "mobile", opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, touch: true },
]) {
  const ctx = await browser.newContext(vp.opts);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE); await page.waitForTimeout(600);
  await common(page, vp.P);
  await layoutChecks(page, "shell", vp.P, "picker");
  await page.screenshot({ path: `${SHOTS}/${vp.P}-picker.png` });
  for (const [name, fn] of [["klondike", klondike], ["freecell", freecell], ["golf", golf]]) {
    try { await fn(page, ctx, vp.P, vp.touch); } catch (e) { ok(name, vp.P, "exception", false, e.message.split("\n")[0]); }
    const sw = await H(page, () => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(name, vp.P, "no horizontal scroll", sw);
  }
  // theme toggle + sound default
  const prefs = await H(page, () => JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}"));
  ok("shell", vp.P, "sound off by default", prefs.sound !== true, JSON.stringify(prefs));
  await page.locator('[data-testid="btn-theme"]').first().click(); await page.waitForTimeout(200);
  const t2 = await H(page, () => document.documentElement.dataset.theme);
  await page.reload(); await page.waitForTimeout(500);
  const t3 = await H(page, () => document.documentElement.dataset.theme);
  ok("shell", vp.P, "theme toggle to classic persists", t2 === "classic" && t3 === "classic", `${t2}/${t3}`);
  await page.screenshot({ path: `${SHOTS}/${vp.P}-classic-theme.png` });
  await page.locator('[data-testid="btn-theme"]').first().click(); await page.waitForTimeout(200);
  ok("shell", vp.P, "no console errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}
await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
for (const g of ["shell", "klondike", "freecell", "golf"]) { const rs = results.filter(r => r.game === g); console.log(`${g}: ${rs.filter(r => r.pass).length}/${rs.length}`); }
process.exit(fails.length ? 1 : 0);
