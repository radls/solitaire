// Browser test (not part of npm test). Needs playwright-core + Chrome, e.g.:
//   cd /workspace/pwtools && npm i playwright-core && BASE=http://127.0.0.1:4173/solitaire/ node e2e.mjs
//   CRONLY=1 / B2ONLY=1 / B3ONLY=1 / B4ONLY=1 run only those groups.
import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://127.0.0.1:4173/solitaire/";
const SHOTS = "/workspace/GrokBuildApps/solitaire/shots";
const results = [];
const ok = (game, P, name, cond, note = "") => { results.push({ game, P, name, pass: !!cond, note }); console.log(`${cond ? "PASS" : "FAIL"} [${P}] ${game}: ${name}${note ? " — " + note : ""}`); };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const H = (page, fn, arg) => page.evaluate(fn, arg);
const S = (page) => H(page, () => JSON.stringify(window.__solitaire.getState()));
const strip = (s) => { const o = JSON.parse(s); delete o.startedAt; delete o.pausedAt; delete o.savedAt; return JSON.stringify(o); };

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
    const tops = [];
    for (const b of btns) { const t = b.getBoundingClientRect().top; if (!tops.some(x => Math.abs(x - t) < 12)) tops.push(t); }
    const order = btns.map(b => b.id);
    const iu = order.indexOf("btn-undo"), inw = order.indexOf("btn-new");
    const adjacent = iu < 0 || inw < 0 ? null : Math.abs(iu - inw) === 1 && Math.abs(btns[iu].getBoundingClientRect().top - btns[inw].getBoundingClientRect().top) < 12;
    const seedInHeader = [...document.querySelectorAll('header [data-testid="deal-number"], .topbar [data-testid="deal-number"], .toolbar [data-testid="deal-number"]')].filter(e => e.offsetParent).length;
    return { bad, small, offscreen, count: btns.length, rows: tops.length, adjacent, seedInHeader, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  ok(G, P, `header buttons in <= 2 rows (${label})`, r.rows <= 2, `${r.rows} rows`);
  if (r.adjacent !== null) ok(G, P, `New sits next to Undo (${label})`, r.adjacent);
  if (["freecell", "golf", "kings"].includes(G)) ok(G, P, `Seed/deal chip not in main toolbar (${label})`, r.seedInHeader === 0, `${r.seedInHeader}`);
  ok(G, P, `no vertical scrollbar in card area (${label})`, r.bad.length === 0, r.bad.join(", "));
  ok(G, P, `toolbar buttons >= 44px (${label})`, r.small.length === 0 && r.count > 0, r.small.join(", ") || `${r.count} buttons`);
  ok(G, P, `no horizontal scroll / offscreen buttons (${label})`, !r.hscroll && r.offscreen.length === 0, r.offscreen.join(", "));
}
const statusText = (page) => page.locator("#status-text").textContent();

async function openHelp(page) {
  await page.locator('[data-testid="btn-help"], #btn-help').first().click(); await page.waitForTimeout(250);
}
async function helpDealText(page) {
  await openHelp(page);
  const t = await page.locator('#overlay [data-testid="deal-number"]').first().textContent().catch(() => "");
  return t;
}
async function winCountOk(page, G, P) {
  const t = await page.locator('[data-testid="win-modal"] [data-testid="win-count"]').first().textContent().catch(() => "");
  ok(G, P, "win screen shows win count", /[1-9]/.test(t), t.trim());
  const mOf = t.match(/(\d+) of (\d+)/);
  if (mOf) ok(G, P, "win count is coherent (N of M, M >= N, never 'of 0')", Number(mOf[2]) >= Number(mOf[1]) && Number(mOf[2]) > 0, t.trim());
}
async function hintCheck(page, G, P) {
  await page.waitForTimeout(500);
  const before = await statusText(page);
  await page.locator('[data-testid="btn-hint"]:visible, [data-testid="thumb-hint"]:visible').first().click(); await page.waitForTimeout(250);
  const h = await H(page, () => document.querySelectorAll(".hint-from, .hint-to").length);
  const after = await statusText(page);
  ok(G, P, "Hint highlights a move or the stock", h > 0 && after !== before, `${h} highlighted; "${after}"`);
}
async function confirmCheck(page, G, P, touch) {
  // requires moves > 0 and game in progress
  const st0 = strip(await S(page));
  await page.locator('[data-testid="btn-new"]:visible, [data-testid="thumb-new"]:visible').first().click(); await page.waitForTimeout(250);
  const vis = await page.locator('[data-testid="confirm-modal"]').isVisible().catch(() => false);
  ok(G, P, "New mid-game asks to confirm", vis);
  if (vis) { await page.locator('[data-testid="confirm-cancel"]').click(); await page.waitForTimeout(200); }
  ok(G, P, "Keep playing keeps progress", strip(await S(page)) === st0);
  // replay (golf/kings)
  if (G === "golf" || G === "kings") {
    let rb = page.locator('[data-testid="btn-replay"]').first();
    if (!(await rb.isVisible().catch(() => false))) { await openHelp(page); rb = page.locator('#overlay [data-testid="btn-replay"]').first(); }
    await rb.click().catch(() => {}); await page.waitForTimeout(250);
    const v2 = await page.locator('[data-testid="confirm-modal"]').isVisible().catch(() => false);
    ok(G, P, "Replay mid-game asks to confirm", v2);
    if (v2) { await page.locator('[data-testid="confirm-cancel"]').click(); await page.waitForTimeout(200); }
    await closeModal(page);
    ok(G, P, "cancelled Replay keeps progress", strip(await S(page)) === st0);
  }
}

async function tipCheck(page, G, P) {
  const BTC = "bc1qqhkwfx9l7umufx66s8kzep8yamtvhafea73fdj";
  const btn = page.locator('[data-testid="win-modal"] [data-testid="btn-tip"]').first();
  const vis = await btn.isVisible().catch(() => false);
  const h = vis ? (await btn.boundingBox()).height : 0;
  ok(G, P, "win screen has a Tip button >= 44px", vis && h >= 43.5, `${h}px`);
  if (!vis) return;
  const label = ((await btn.textContent()) || "").trim();
  ok(G, P, "Tip button says '🪙 Buy me some tokens in BTC'", label === "🪙 Buy me some tokens in BTC", label);
  const prominent = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="win-modal"]'); const t = m.querySelector('[data-testid="btn-tip"]');
    const others = [...m.querySelectorAll("button")].filter(b => b !== t && /new deal|replay|play again|close/i.test(b.textContent));
    return others.length > 0 && others.every(b => t.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  ok(G, P, "Tip sits above the New/Replay/Close row", prominent);
  await btn.click(); await page.waitForTimeout(300);
  const panel = page.locator('[data-testid="tip-panel"]');
  ok(G, P, "Tip opens the tip panel", await panel.isVisible().catch(() => false));
  ok(G, P, "panel heading 'Buy me some tokens in BTC'", /Buy me some tokens in BTC/.test(await panel.innerText().catch(() => "")) && !/coffee/i.test(await panel.innerText().catch(() => "")));
  const addr = ((await page.locator('[data-testid="tip-btc-address"]').textContent().catch(() => "")) || "").trim();
  ok(G, P, "Bitcoin address shown exactly", addr === BTC, addr);
  const qr = await page.locator('[data-testid="tip-btc-qr"] svg').count();
  ok(G, P, "Bitcoin QR rendered", qr > 0);
  const open = await page.locator('[data-testid="tip-btc-open"]').getAttribute("href").catch(() => null);
  ok(G, P, "wallet link is bitcoin: URI", open === `bitcoin:${BTC}`, open);
  const note = await page.locator('[data-testid="tip-x-note"]').textContent().catch(() => "");
  ok(G, P, "X Money note mentions @ZeusRadls (text only)", /Or tip via X Money by messaging @ZeusRadls/.test(note) && (await page.locator('[data-testid="tip-panel"] a[href*="x.com"]').count()) === 0, note);
  const noStripe = await page.evaluate(() => !/stripe/i.test(document.querySelector('[data-testid="tip-panel"]').innerHTML));
  ok(G, P, "no Stripe in tip panel", noStripe);
  const copy = page.locator('[data-testid="tip-btc-copy"]');
  await copy.click().catch(() => {}); await page.waitForTimeout(250);
  const ct = (await copy.textContent().catch(() => "")).trim();
  ok(G, P, "Copy address gives feedback", /copied|select/i.test(ct), ct);
  const clip = await page.evaluate(() => navigator.clipboard?.readText?.().catch(() => null) ?? null).catch(() => null);
  if (clip !== null) ok(G, P, "clipboard holds the address", clip === BTC, clip);
  const fit = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="win-modal"]'); const r = m.getBoundingClientRect();
    const scrollable = m.scrollHeight <= m.clientHeight + 1 || /(auto|scroll)/.test(getComputedStyle(m).overflowY);
    const smallTargets = [...m.querySelectorAll('[data-testid="tip-panel"] button, [data-testid="tip-panel"] a')].filter(e => e.getBoundingClientRect().height < 43.5).length;
    return { inView: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, scrollable, noH: document.documentElement.scrollWidth <= innerWidth + 1, smallTargets };
  });
  ok(G, P, "tip panel fits (in viewport, no sideways scroll, 44px targets)", fit.inView && fit.scrollable && fit.noH && fit.smallTargets === 0, JSON.stringify(fit));
  if (P === "mobile") await page.screenshot({ path: `${SHOTS}/${P}-${G}-tip.png` });
  ok(G, P, "win screen still open after Tip/Copy", await winVisible(page));
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click(); await page.waitForTimeout(200);
  ok(G, P, "Tip again hides the panel", !(await panel.isVisible().catch(() => false)));
}

async function common(page, P) {
  const theme = await H(page, () => document.documentElement.dataset.theme);
  ok("shell", P, "night theme is default", theme === "night", theme);
  const vp = await H(page, () => document.querySelector('meta[name=viewport]').content);
  ok("shell", P, "viewport blocks zoom", /user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp), vp);
  ok("shell", P, "picker shows 4 games", (await page.locator('[data-testid^="pick-"][data-pick]').count()) === 4);
  const surprise = await H(page, () => /surprise/i.test(document.body.innerText));
  ok("shell", P, "no 'surprise' copy", !surprise);
  for (const g of ["klondike", "freecell", "golf", "kings"]) {
    const t = ((await page.locator(`[data-testid="daily-${g}"]`).innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    ok("shell", P, `fresh picker: ${g} Today button shows Streak 0`, /Today's deal\s*·\s*Streak 0/.test(t), t);
  }
  const wrap = await H(page, () => [...document.querySelectorAll('[data-testid^="daily-"]')].map(b => { const r = b.getBoundingClientRect(), tile = b.closest(".pick-tile")?.getBoundingClientRect(); return { over: b.scrollWidth > b.clientWidth + 1 || (tile && (r.right > tile.right + 1 || r.left < tile.left - 1)), h: r.height }; }));
  ok("shell", P, "Today buttons fit their card (no overflow, >= 44px)", wrap.every(w => !w.over && w.h >= 43.5), JSON.stringify(wrap));
  ok("shell", P, "picker says progress is saved on this device", /saved on this device/i.test(await page.locator("#status-text").textContent()));
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
    await page.waitForTimeout(600); // avoid the app's double-tap window from the previous tap
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
    await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
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
    await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
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
  await winCountOk(page, G, P);
  await tipCheck(page, G, P);
  await page.screenshot({ path: `${SHOTS}/${P}-klondike-win.png` });
  await closeModal(page);
}

async function freecell(page, ctx, P, touch) {
  const G = "freecell";
  await pick(page, G);
  ok(G, P, "active", await H(page, () => window.__solitaire.game()) === G);
  await layoutChecks(page, G, P, "deal");
  await openHelp(page);
  ok(G, P, "Help shows deal number", /\d/.test(await page.locator('#overlay [data-testid="deal-number"]').first().textContent().catch(() => "")));
  const inp = page.locator('[data-testid="deal-input"]');
  if (!(await inp.isVisible().catch(() => false))) { await page.locator('#overlay button', { hasText: /deal/i }).first().click().catch(() => {}); await page.waitForTimeout(250); }
  const fs = await inp.evaluate(el => parseFloat(getComputedStyle(el).fontSize)).catch(() => 0);
  ok(G, P, "deal input font ≥16px (no iOS zoom)", fs >= 16, `${fs}px`);
  await inp.fill("1"); await inp.press("Enter"); await page.waitForTimeout(300);
  if (await inp.isVisible().catch(() => false)) { await page.locator('#overlay button:has-text("Deal")').last().click(); await page.waitForTimeout(300); }
  let st = JSON.parse(await S(page));
  ok(G, P, "enter deal #1", st.dealNumber === 1 && JSON.stringify(st.cascades.map(c => c.length)) === "[7,7,7,7,6,6,6,6]");
  ok(G, P, "deal #1 col1 = JD KD 2S 4C 3S 6D 6S", st.cascades[0].map(c => c.id).join(",") === "diamonds-11,diamonds-13,spades-2,clubs-4,spades-3,diamonds-6,spades-6");
  await page.waitForTimeout(600);
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
  await hintCheck(page, G, P);
  await confirmCheck(page, G, P, touch);
  // drag: 6D (c0) -> freecell 1
  await drag(page, ctx, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), page.locator('[data-drop="freecell:1"]'), touch);
  st = JSON.parse(await S(page));
  ok(G, P, "drag move to free cell", st.freecells[1]?.id === "diamonds-6");
  await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
  await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
  ok(G, P, "undo x2 restores deal", strip(await S(page)) === strip(before));
  // QA path: 2 moves, Help -> Deal (same #) must confirm; Keep playing keeps progress; go-ahead resets
  await page.waitForTimeout(600);
  for (const fcIdx of [0, 1]) {
    await tapEl(page, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), touch);
    await tapEl(page, page.locator(`[data-drop="freecell:${fcIdx}"]`), touch);
    await page.waitForTimeout(600);
  }
  const twoMoves = JSON.parse(await S(page));
  ok(G, P, "made 2 moves before Help -> Deal", twoMoves.moves >= 2, `moves=${twoMoves.moves}`);
  const snap2 = strip(JSON.stringify(twoMoves));
  await openHelp(page);
  await page.locator('[data-deal-form] button[type="submit"], #overlay form button').first().click();
  await page.waitForTimeout(250);
  ok(G, P, "Help -> Deal (same #) mid-game asks to confirm", await page.locator('[data-testid="confirm-modal"]').isVisible().catch(() => false));
  await page.locator('[data-testid="confirm-cancel"]').click().catch(() => {}); await page.waitForTimeout(200);
  ok(G, P, "Keep playing after Help -> Deal keeps progress", strip(await S(page)) === snap2 && !(await page.locator('#overlay:not([hidden]) .modal').isVisible().catch(() => false)));
  await openHelp(page);
  await page.locator('[data-testid="deal-input"]').fill("2");
  await page.locator('[data-testid="deal-input"]').press("Enter");
  await page.waitForTimeout(250);
  const conf2 = await page.locator('[data-testid="confirm-modal"]').isVisible().catch(() => false);
  ok(G, P, "Help -> Deal (new #) mid-game asks to confirm", conf2);
  await page.locator('[data-testid="confirm-ok"]').click().catch(() => {}); await page.waitForTimeout(300);
  const after2 = JSON.parse(await S(page));
  ok(G, P, "confirming Deal starts that deal fresh", after2.dealNumber === 2 && after2.moves === 0 && (await H(page, () => window.__solitaire.historyLength())) === 0, `deal=${after2.dealNumber} moves=${after2.moves}`);
  // with 0 moves, Deal acts immediately
  await openHelp(page);
  await page.locator('[data-testid="deal-input"]').fill("1");
  await page.locator('[data-testid="deal-input"]').press("Enter");
  await page.waitForTimeout(300);
  const after1 = JSON.parse(await S(page));
  ok(G, P, "Deal with 0 moves acts immediately", after1.dealNumber === 1 && !(await page.locator('[data-testid="confirm-modal"]').isVisible().catch(() => false)));
  await closeModal(page);
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
  // finish animation: last user move triggers stepwise foundation moves, win modal only after the last card lands
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["clubs", "diamonds", "hearts", "spades"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const upto = { clubs: 10, diamonds: 10, hearts: 10, spades: 10 };
    s.freecells = [null, null, null, null];
    s.foundations = suits.map(su => Array.from({ length: upto[su] }, (_, i) => by[`${su}-${i + 1}`]));
    s.cascades = Array.from({ length: 8 }, () => []);
    s.cascades[0] = [by["clubs-13"], by["hearts-12"], by["spades-11"]];
    s.cascades[1] = [by["diamonds-13"], by["spades-12"], by["hearts-11"]];
    s.cascades[2] = [by["hearts-13"], by["clubs-12"], by["diamonds-11"]];
    s.cascades[3] = [by["spades-13"], by["diamonds-12"], by["clubs-11"]];
    s.cascades[4] = [by["clubs-12"] ? by["hearts-12"] : null].filter(Boolean).slice(0, 0);
    s.cascades[5] = [by["spades-12"]].slice(0, 0);
    // put the four 11s? already placed; the four Jacks (11) are tops; move a 10-level blocker: put JS on top of the free cell route
    s.won = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(250);
  const finBtn = page.locator('[data-testid="btn-finish"]');
  const finVisible = await finBtn.isVisible().catch(() => false);
  ok(G, P, "Finish button shown for a solved board", finVisible);
  // user move: JS (cascade 0 top) to a free cell, which should kick off the stepwise finish
  await tapEl(page, page.locator('.card[data-zone="cascade"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="freecell:0"]'), touch);
  const samples = []; let modalEarly = false; let sawAnim = false;
  for (let i = 0; i < 60; i++) {
    const r = await H(page, () => ({ f: window.__solitaire.getState().foundations.flat().length, a: !!window.__solitaire.isAnimating?.(), m: !!document.querySelector('[data-testid="win-modal"]')?.offsetParent }));
    samples.push(r.f); if (r.a) sawAnim = true;
    if (r.m && r.f < 52) modalEarly = true;
    if (r.f === 52 && r.m) break;
    await page.waitForTimeout(60);
  }
  const distinct = [...new Set(samples)];
  ok(G, P, "finish animates cards one by one", sawAnim && distinct.length >= 3, `foundation counts seen: ${distinct.join(",")}`);
  ok(G, P, "win modal waits for the last card", !modalEarly && (await winVisible(page)), `final ${samples.at(-1)}`);
  ok(G, P, "Tip shown on win screen after the finish animation", await page.locator('[data-testid="win-modal"] [data-testid="btn-tip"]').isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/${P}-freecell-finish-win.png` });
  await closeModal(page);
  // Finish button path
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["clubs", "diamonds", "hearts", "spades"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    s.freecells = [null, null, null, null];
    s.foundations = suits.map(su => Array.from({ length: 9 }, (_, i) => by[`${su}-${i + 1}`]));
    s.cascades = Array.from({ length: 8 }, () => []);
    suits.forEach((su, i) => { s.cascades[i] = [by[`${su}-13`], by[`${su}-12`], by[`${su}-11`], by[`${su}-10`]]; });
    s.won = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(250);
  const fb = page.locator('[data-testid="btn-finish"]');
  ok(G, P, "Finish button visible (same-suit stacks)", await fb.isVisible().catch(() => false));
  const fbH = await fb.evaluate(el => el.getBoundingClientRect().height).catch(() => 0);
  ok(G, P, "Finish button >= 44px", fbH >= 43.5, `${fbH}px`);
  await tapEl(page, fb, touch);
  let done = false; const s2 = [];
  for (let i = 0; i < 80 && !done; i++) { const f = await H(page, () => window.__solitaire.getState().foundations.flat().length); s2.push(f); done = f === 52 && (await winVisible(page)); if (!done) await page.waitForTimeout(60); }
  ok(G, P, "Finish button completes without stalling", done, `counts ${[...new Set(s2)].join(",")}`);
  await closeModal(page);
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
  await winCountOk(page, G, P);
  await tipCheck(page, G, P);
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
  const seedTxt = await helpDealText(page);
  ok(G, P, "seed shown in Help", /4242/.test(seedTxt), seedTxt);
  await closeModal(page);
  await layoutChecks(page, G, P, "deal");
  await hintCheck(page, G, P);
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
    await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
    ok(G, P, "undo restores state", strip(await S(page)) === strip(before));
    await drag(page, ctx, page.locator(`.card[data-zone="column"][data-index="${c}"]`).last(), page.locator('[data-drop="waste"]'), touch);
    st = JSON.parse(await S(page));
    ok(G, P, "drag play to waste", st.columns[c].length === JSON.parse(before).columns[c].length - 1);
    await confirmCheck(page, G, P, touch);
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
  await winCountOk(page, G, P);
  await tipCheck(page, G, P);
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

async function kings(page, ctx, P, touch) {
  const G = "kings";
  await pick(page, G);
  ok(G, P, "active from picker", await H(page, () => window.__solitaire.game()) === G);
  await H(page, () => window.__solitaire.newGame({ seed: 777 }));
  await page.waitForTimeout(300);
  let st = JSON.parse(await S(page));
  const total = st.sides.flat().length + st.corners.flat().length + st.stock.length + st.waste.length;
  const ids = new Set([...st.sides.flat(), ...st.corners.flat(), ...st.stock, ...st.waste].map(c => c.id));
  ok(G, P, "deal: 4 sides, kings in corners, 52 unique", st.sides.length === 4 && st.sides.every(p => p.length === 1 && p[0].rank !== 13) && st.corners.every(c => c.every(x => x.rank === 13)) && total === 52 && ids.size === 52, `seed ${st.seed}`);
  ok(G, P, "seed shown in Help", /777/.test(await helpDealText(page)));
  await closeModal(page);
  await hintCheck(page, G, P);
  await layoutChecks(page, G, P, "deal");
  // illegal tap: side a top -> side b where not legal
  const legal = await H(page, () => window.__solitaire.listMoves());
  let ill = null;
  for (let a = 0; a < 4 && !ill; a++) for (let b = 0; b < 4 && !ill; b++) {
    if (a === b || !st.sides[a].length || !st.sides[b].length) continue;
    if (!legal.some(m => m.from?.zone === "side" && m.from.index === a && m.to?.zone === "side" && m.to.index === b)) ill = [a, b];
  }
  if (ill) {
    const before = strip(await S(page));
    await tapEl(page, page.locator(`.card[data-zone="side"][data-index="${ill[0]}"]`).last(), touch);
    await tapEl(page, page.locator(`[data-drop="side:${ill[1]}"]`), touch);
    ok(G, P, "illegal tap move rejected", strip(await S(page)) === before, `side${ill[0]}->side${ill[1]}`);
    await page.keyboard.press("Escape");
  } else ok(G, P, "illegal tap move rejected", true, "no illegal pair; skipped");
  await page.waitForTimeout(600);
  // find a legal non-draw move (draw up to 60 times)
  let mv = null;
  for (let i = 0; i < 60; i++) {
    const ms = await H(page, () => window.__solitaire.listMoves());
    mv = ms.find(m => m.kind !== "draw" && m.from?.zone === "waste") || ms.find(m => m.kind !== "draw" && m.from?.zone === "side" && (m.from.count ?? 1) === 1);
    if (mv) break;
    await tapEl(page, page.locator('[data-drop="stock"]'), touch);
  }
  if (mv) {
    await page.waitForTimeout(600);
    const before = await S(page); const h0 = await H(page, () => window.__solitaire.historyLength());
    const fromSel = mv.from.zone === "waste" ? '.card[data-zone="waste"]' : `.card[data-zone="side"][data-index="${mv.from.index}"]`;
    await tapEl(page, page.locator(fromSel).last(), touch);
    const s1 = await statusText(page);
    await tapEl(page, page.locator(`[data-drop="${mv.to.zone}:${mv.to.index}"]`), touch);
    ok(G, P, "legal tap-select-tap move", (await H(page, () => window.__solitaire.historyLength())) === h0 + 1, JSON.stringify(mv));
    const s2 = await statusText(page);
    ok(G, P, "status text updates after tap move", s2 !== s1, `"${s1}" -> "${s2}"`);
    await tapEl(page, page.locator('[data-testid="btn-undo"]:visible, [data-testid="thumb-undo"]:visible'), false);
    ok(G, P, "undo restores state", strip(await S(page)) === strip(before));
    await page.waitForTimeout(500);
    const h1 = await H(page, () => window.__solitaire.historyLength());
    await drag(page, ctx, page.locator(fromSel).last(), page.locator(`[data-drop="${mv.to.zone}:${mv.to.index}"]`), touch);
    ok(G, P, "drag move", (await H(page, () => window.__solitaire.historyLength())) === h1 + 1);
    await confirmCheck(page, G, P, touch);
  } else ok(G, P, "legal tap-select-tap move", false, "no legal move found");
  // whole-pile move via tapping the bottom card
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = []; for (const su of ["spades", "hearts", "diamonds", "clubs"]) for (let r = 1; r <= 13; r++) all.push({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const used = ["hearts-9", "spades-8", "clubs-10", "diamonds-4", "spades-6", "spades-13", "hearts-13", "clubs-13", "diamonds-13"];
    s.sides = [[by["hearts-9"], by["spades-8"]], [by["clubs-10"]], [by["diamonds-4"]], [by["spades-6"]]];
    s.corners = [[by["spades-13"]], [by["hearts-13"]], [by["clubs-13"]], [by["diamonds-13"]]];
    s.waste = []; s.stock = all.filter(c => !used.includes(c.id)).map(c => ({ ...c, faceUp: false }));
    s.won = false; s.stuck = false; s.idlePasses = 0;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(600);
  { // tap the visible strip of the bottom card (the rest of it is covered by the card above)
    const bb = await page.locator('.card[data-zone="side"][data-index="0"]').first().boundingBox();
    if (touch) await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + 6); else await page.mouse.click(bb.x + bb.width / 2, bb.y + 6);
    await page.waitForTimeout(200);
  }
  await tapEl(page, page.locator('[data-drop="side:1"]'), touch);
  st = JSON.parse(await S(page));
  ok(G, P, "whole pile moves onto a side pile", st.sides[0].length === 0 && st.sides[1].map(c => c.id).join(",") === "clubs-10,hearts-9,spades-8", JSON.stringify(st.sides.map(p => p.map(c => c.id))));
  await page.screenshot({ path: `${SHOTS}/${P}-kings.png` });
  await layoutChecks(page, G, P, "after pile move");
  // persistence
  const snap = strip(await S(page));
  await page.reload(); await page.waitForTimeout(600);
  ok(G, P, "reload returns to last game", await H(page, () => window.__solitaire.game()) === G);
  await pick(page, G);
  ok(G, P, "state persists across reload", strip(await S(page)) === snap);
  // win: all corners complete except the ace of spades on a side pile
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const mk = (su, r) => ({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    const corner = (a, b) => Array.from({ length: 13 }, (_, i) => mk(i % 2 === 0 ? a : b, 13 - i));
    s.corners = [corner("spades", "hearts"), corner("hearts", "spades"), corner("clubs", "diamonds"), corner("diamonds", "clubs")];
    const ace = s.corners[0].pop();
    s.sides = [[ace], [], [], []]; s.stock = []; s.waste = []; s.won = false; s.stuck = false; s.idlePasses = 0;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(600);
  await tapEl(page, page.locator('.card[data-zone="side"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="corner:0"]'), touch);
  await page.waitForTimeout(500);
  ok(G, P, "win detected + calm win modal", await winVisible(page));
  await winCountOk(page, G, P);
  await tipCheck(page, G, P);
  await page.screenshot({ path: `${SHOTS}/${P}-kings-win.png` });
  await closeModal(page);
}

// ---- Play CR batch 1 checks ----
const vis = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const todayKey = (page) => H(page, () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
async function home(page) { await closeModal(page); await page.locator('[data-testid="btn-home"]').first().click(); await page.waitForTimeout(300); }
async function uiBtn(page, name, P) { // phone uses the bottom thumb bar
  const t = page.locator(`[data-testid="thumb-${name}"]`);
  if (P === "mobile" && await t.isVisible().catch(() => false)) return t;
  return page.locator(`[data-testid="btn-${name}"]`).first();
}
async function crChecks(page, ctx, P, touch) {
  const C = "cr";
  // CR2 picker
  await home(page);
  const meters = await H(page, () => ["meter-time", "meter-moves", "meter-score"].map(id => document.getElementById(id)).filter(e => e && e.offsetParent && e.getClientRects().length).length);
  ok(C, P, "picker hides Time/Moves/Score placeholders", meters === 0, `${meters} visible`);
  for (const g of ["klondike", "freecell", "golf", "kings"]) {
    const t = (await page.locator(`[data-testid="pick-stats-${g}"]`).textContent().catch(() => "")).trim();
    ok(C, P, `picker stats on ${g}`, /(Wins|Cleared) \d+ · Streak \d+|No games yet/.test(t), t);
    ok(C, P, `Today's deal button on ${g}`, await vis(page, `[data-testid="daily-${g}"]`));
  }
  await page.screenshot({ path: `${SHOTS}/${P}-picker-cr.png` });
  // honest resume: fresh klondike deal with 0 moves -> no Resume
  await pick(page, "klondike");
  await H(page, () => window.__solitaire.newGame({ seed: 4242 }));
  await page.waitForTimeout(300);
  await closeModal(page);
  const mv0 = await H(page, () => window.__solitaire.getState().moves);
  // CR4: timer not started before first move
  await page.waitForTimeout(1300);
  const t0 = (await page.locator("#meter-time").textContent()).trim();
  ok(C, P, "timer waits for first move", mv0 === 0 && /^0:00$/.test(t0), `moves ${mv0}, ${t0}`);
  await home(page);
  ok(C, P, "no Resume before a real move", !(await vis(page, '[data-testid="resume-klondike"]')));
  await pick(page, "klondike");
  await tapEl(page, page.locator('[data-drop="stock"]').first(), touch);
  await page.waitForTimeout(1300);
  const t1 = (await page.locator("#meter-time").textContent()).trim();
  ok(C, P, "timer starts on first move", t1 !== "0:00", t1);
  // pause while help open
  await openHelp(page); await page.waitForTimeout(300);
  const e1 = await H(page, () => document.getElementById("meter-time").textContent);
  await page.waitForTimeout(2200);
  const e2 = await H(page, () => document.getElementById("meter-time").textContent);
  ok(C, P, "timer pauses while Help is open", e1 === e2, `${e1} -> ${e2}`);
  // CR5 rules on touch
  if (P === "mobile") {
    const order = await H(page, () => { const m = document.querySelector("#overlay .modal"); const tt = m?.querySelector('[data-testid="touch-tips"]'); const ps = m ? [...m.querySelectorAll("p, ul, ol, div[data-testid]")] : []; return { has: !!tt && !!tt.offsetParent, kbd: !!m?.querySelector('[data-testid="kbd-tips"]')?.offsetParent, firstText: tt ? ps.filter(e => !e.closest(".help-deal") && e.offsetParent).indexOf(tt) : -1 }; });
    ok(C, P, "touch: gesture tips shown first in Help", order.has && order.firstText >= 0 && order.firstText <= 1, JSON.stringify(order));
    ok(C, P, "touch: keyboard shortcuts hidden", !order.kbd);
  } else {
    const kbd = await vis(page, '#overlay [data-testid="kbd-tips"]');
    ok(C, P, "desktop: keyboard shortcuts in Help", kbd);
  }
  await closeModal(page);
  // reload keeps elapsed time
  const before = await H(page, () => document.getElementById("meter-time").textContent);
  await page.reload(); await page.waitForTimeout(700); await pick(page, "klondike");
  const after = await H(page, () => document.getElementById("meter-time").textContent);
  ok(C, P, "elapsed time kept across reload", after !== "0:00" && after >= before, `${before} -> ${after}`);
  await home(page);
  const rt = (await page.locator('[data-testid="resume-klondike"]').textContent().catch(() => "")).trim();
  ok(C, P, "Resume after a real move shows time · moves", /Resume.*\d+:\d\d.*\d+ moves?/i.test(rt), rt);
  // CR3 Klondike stuck modal
  await pick(page, "klondike");
  const stuckState = () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()].map(c => ({ ...c }));
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const tops = ["spades-9", "clubs-9", "spades-5", "clubs-5", "spades-12", "clubs-12", "spades-3"];
    const used = new Set([...tops, "hearts-1"]);
    const rest = all.filter(c => !used.has(c.id)).map(c => ({ ...c, faceUp: false }));
    s.tableau = tops.map((id, i) => [...rest.filter((_, j) => j % 7 === i), { ...by[id], faceUp: true }]);
    s.tableau[0].push({ ...by["hearts-1"], faceUp: true });
    s.stock = []; s.waste = []; s.foundations = [[], [], [], []]; s.won = false;
    window.__solitaire.setState(s);
  };
  await H(page, stuckState); await page.waitForTimeout(300);
  await page.waitForTimeout(600);
  await tapEl(page, page.locator('.card[data-zone="tableau"][data-index="0"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="foundation:0"]'), touch);
  await page.waitForTimeout(400);
  let sm = await vis(page, '[data-testid="stuck-modal"]');
  if (!sm) { // stock may still hold cards that must be cycled first; the check is reachability-based
    const st = await H(page, () => window.__solitaire.getState().stock.length);
    ok(C, P, "Klondike stuck modal (note)", true, `not shown immediately; stock ${st}`);
  }
  ok(C, P, "Klondike shows 'No more moves' modal", sm, await H(page, () => document.querySelector("#overlay")?.innerText?.slice(0, 80)));
  if (sm) {
    for (const id of ["stuck-undo", "stuck-replay", "stuck-new"]) ok(C, P, `stuck modal has ${id}`, await vis(page, `[data-testid="${id}"]`));
    await page.screenshot({ path: `${SHOTS}/${P}-klondike-stuck.png` });
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    ok(C, P, "stuck: status says No useful moves", /no useful moves/i.test(await statusText(page)));
    await (await uiBtn(page, "hint", P)).click(); await page.waitForTimeout(250);
    ok(C, P, "stuck: Hint re-opens the modal", await vis(page, '[data-testid="stuck-modal"]'));
    const h0 = await H(page, () => window.__solitaire.historyLength());
    await page.locator('[data-testid="stuck-undo"]').click(); await page.waitForTimeout(300);
    ok(C, P, "stuck: Undo takes back the last move", !(await vis(page, '[data-testid="stuck-modal"]')) && (await H(page, () => window.__solitaire.historyLength())) === h0 - 1);
    const seed = await H(page, () => window.__solitaire.getState().seed);
    await tapEl(page, page.locator('.card[data-zone="tableau"][data-index="0"]').last(), touch);
    await tapEl(page, page.locator('[data-drop="foundation:0"]'), touch); await page.waitForTimeout(400);
    await page.locator('[data-testid="stuck-replay"]').click().catch(() => {}); await page.waitForTimeout(300);
    const s2 = await H(page, () => window.__solitaire.getState());
    ok(C, P, "stuck: Replay deals the same seed fresh", s2.seed === seed && s2.moves === 0 && !(await vis(page, '#overlay .modal')), `${s2.seed}/${seed} moves ${s2.moves}`);
  }
  // CR5 thumb bar (phone) / none on desktop
  if (P === "mobile") {
    const tb = await H(page, () => { const bar = document.querySelector('[data-testid="thumb-bar"]'); if (!bar || getComputedStyle(bar).display === "none" || bar.hidden || !bar.getClientRects().length) return null; const bs = ["undo", "hint", "new"].map(n => bar.querySelector(`[data-testid="thumb-${n}"]`)); const tops = [...document.querySelectorAll('.toolbar [data-testid="btn-undo"], .toolbar [data-testid="btn-new"], .toolbar [data-testid="btn-hint"]')].filter(e => e.offsetParent).length; const r = bar.getBoundingClientRect(); return { all: bs.every(Boolean), h: Math.min(...bs.map(b => b?.getBoundingClientRect().height ?? 0)), bottom: Math.round(innerHeight - r.bottom), dupes: tops }; });
    ok(C, P, "thumb bar with Undo/Hint/New >= 44px at bottom", tb && tb.all && tb.h >= 43.5 && tb.bottom <= 2, JSON.stringify(tb));
    ok(C, P, "no duplicate Undo/Hint/New in top toolbar on phone", tb && tb.dupes === 0, JSON.stringify(tb));
    // New with 0 moves: no confirm
    const s0 = await H(page, () => window.__solitaire.getState().seed);
    await page.locator('[data-testid="thumb-new"]').tap(); await page.waitForTimeout(300);
    const cf0 = await vis(page, '[data-testid="confirm-modal"]');
    ok(C, P, "thumb New with no moves deals without confirm", !cf0 && (await H(page, () => window.__solitaire.getState().seed)) !== s0);
    await closeModal(page); await page.waitForTimeout(700);
    await tapEl(page, page.locator('[data-drop="stock"]').first(), true);
    await page.waitForTimeout(700);
    const mvA = await H(page, () => window.__solitaire.getState().moves);
    if (!mvA) await page.screenshot({ path: `${SHOTS}/${P}-thumb-debug.png` });
    await page.locator('[data-testid="thumb-new"]').tap(); await page.waitForTimeout(300);
    ok(C, P, "thumb New after a move asks to confirm", await vis(page, '[data-testid="confirm-modal"]'), `moves ${mvA}`);
    await page.locator('[data-testid="confirm-cancel"]').click().catch(() => {}); await page.waitForTimeout(200);
    const hl = await H(page, () => window.__solitaire.historyLength());
    await page.locator('[data-testid="thumb-undo"]').tap(); await page.waitForTimeout(300);
    ok(C, P, "thumb Undo works", (await H(page, () => window.__solitaire.historyLength())) === hl - 1);
    await page.locator('[data-testid="thumb-hint"]').tap(); await page.waitForTimeout(300);
    ok(C, P, "thumb Hint works", (await H(page, () => document.querySelectorAll(".hint-from, .hint-to").length)) > 0 || /stock|draw|move/i.test(await statusText(page)));
    // larger cards: FreeCell then Golf
    for (const [g, minW] of [["freecell", 44], ["golf", 51]]) {
      await pick(page, g); await closeModal(page);
      const m = await H(page, () => { const cards = [...document.querySelectorAll("#table .card")]; const w = Math.max(...cards.map(c => c.getBoundingClientRect().width)); const bottom = Math.max(...cards.map(c => c.getBoundingClientRect().bottom)); const bar = document.querySelector('[data-testid="thumb-bar"]')?.getBoundingClientRect().top ?? innerHeight; const byCol = {}; for (const c of cards) (byCol[c.dataset.zone + ":" + c.dataset.index] ||= []).push(c.getBoundingClientRect().top); const steps = Object.values(byCol).filter(a => a.length > 2).map(a => a[1] - a[0]).filter(x => x > 0); return { w: Math.round(w), step: steps.length ? Math.round(Math.min(...steps)) : null, bottom: Math.round(bottom), bar: Math.round(bar) }; });
      ok(C, P, `${g}: larger cards on phone`, m.w >= minW, JSON.stringify(m));
      ok(C, P, `${g}: cards stay above the thumb bar`, m.bottom <= m.bar + 1, JSON.stringify(m));
      ok(C, P, `${g}: overlap strip more visible (> 15px)`, m.step > 15, JSON.stringify(m));
      await layoutChecks(page, C, P, `${g} phone`);
      await page.screenshot({ path: `${SHOTS}/${P}-${g}-phone.png` });
    }
  } else {
    ok(C, P, "desktop: no thumb bar", !(await vis(page, '[data-testid="thumb-bar"]')));
  }
  // CR1 daily deal (Golf, finish it)
  await home(page);
  const key = await todayKey(page);
  await page.locator('[data-testid="daily-golf"]').click(); await page.waitForTimeout(400);
  if (await vis(page, '[data-testid="confirm-modal"]')) { await page.locator('[data-testid="confirm-ok"], [data-testid="confirm-yes"], [data-testid="confirm-modal"] .primary').first().click(); await page.waitForTimeout(300); }
  const ds = await H(page, () => window.__solitaire.getState());
  ok(C, P, "Today's deal opens Golf on today's daily", (await H(page, () => window.__solitaire.game())) === "golf" && ds.daily === key, `${ds.daily} vs ${key}`);
  const seedTxt = await H(page, () => document.getElementById("status-seed").textContent + " " + document.getElementById("status-text").textContent);
  ok(C, P, "daily label while playing", /Daily/.test(seedTxt), seedTxt);
  await home(page);
  await page.locator('[data-testid="daily-golf"]').click(); await page.waitForTimeout(400);
  ok(C, P, "daily deal is stable (same seed when reopened)", (await H(page, () => window.__solitaire.getState().seed)) === ds.seed);
  // finish it: one play left
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const mk = (su, r) => ({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    s.columns = Array.from({ length: s.columns.length }, () => []); s.columns[0] = [mk("diamonds", 5)];
    s.waste = [mk("hearts", 4)]; s.stock = [mk("clubs", 9)]; s.over = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(700);
  await tapEl(page, page.locator('.card[data-zone="column"][data-index="0"]').last(), touch);
  await page.waitForTimeout(600);
  const dd = (await page.locator('[data-testid="daily-done"]').textContent().catch(() => "")).trim();
  ok(C, P, "end screen shows today's deal done + day streak", /Today's deal done · \d+ days? in a row/.test(dd), dd);
  await home(page);
  const db = (await page.locator('[data-testid="daily-golf"]').textContent().catch(() => "")).trim();
  ok(C, P, "picker marks today's Golf as done", /Done today/.test(db), db);
  ok(C, P, "daily streak visible on the Today button (Done today ✓ · Streak N)", /Done today ✓\s*·\s*Streak [1-9]\d*/.test(db.replace(/\s+/g, " ")), db);
  const gs = (await page.locator('[data-testid="pick-stats-golf"]').textContent().catch(() => "")).trim();
  ok(C, P, "picker shows daily streak", /Daily \d+ days?/.test(gs), gs);
  await layoutChecks(page, "shell", P, "picker after CR");
  const surprise = await H(page, () => /surprise|secret/i.test(document.body.innerText));
  ok(C, P, "no surprise/secret copy on picker", !surprise);
}

// ---- Fix pass checks: legacy timer, shuffle-only stuck, daily streak visibility ----
const STORE = { klondike: "grok-solitaire-v1", freecell: "grok-solitaire:freecell", golf: "grok-solitaire:golf", kings: "grok-solitaire:kings" };
async function fixChecks(page, ctx, P, touch) {
  const C = "cr";
  for (const g of ["klondike", "freecell", "golf", "kings"]) {
    await pick(page, g); await closeModal(page);
    await H(page, () => window.__solitaire.newGame()); await page.waitForTimeout(300); await closeModal(page);
    await page.waitForTimeout(300);
    // a board saved by the old build: clock running from deal time, no moves (written from the picker so nothing overwrites it)
    await home(page);
    await H(page, ({ key, g }) => {
      const raw = JSON.parse(localStorage.getItem(key));
      const box = g === "klondike" ? raw.saved : raw;
      box.state.moves = 0; box.state.startedAt = Date.now() - 60000; box.state.pausedAt = 0; box.history = []; box.savedAt = Date.now();
      localStorage.setItem(key, JSON.stringify(raw));
    }, { key: STORE[g], g });
    await page.reload(); await page.waitForTimeout(500); await pick(page, g); await closeModal(page);
    await page.waitForTimeout(2200);
    const r = await H(page, () => ({ t: document.getElementById("meter-time").textContent.trim(), m: window.__solitaire.getState().moves }));
    ok(C, P, `${g}: timer 0:00 with MOVES 0 (old save, after reload)`, r.m === 0 && r.t === "0:00", JSON.stringify(r));
    await home(page);
    const rv = await vis(page, `[data-testid="resume-${g}"]`);
    ok(C, P, `${g}: no Resume for an untouched board`, !rv);
  }
  // Known stuck deals for manual verification
  await page.goto(BASE + "?game=klondike&seed=22&draw=3"); await page.waitForTimeout(800);
  ok(C, P, "seed 22 draw 3: stuck modal opens on its own", await vis(page, '[data-testid="stuck-modal"]'));
  const sm22 = await H(page, () => document.querySelector('[data-testid="stuck-modal"]')?.innerText || "");
  ok(C, P, "stuck modal copy says No useful moves + 3 actions", /No useful moves/.test(sm22) && /Undo/.test(sm22) && /Replay this deal/.test(sm22) && /New deal/.test(sm22), sm22.replace(/\s+/g, " "));
  await page.locator('[data-testid="stuck-new"]').click().catch(() => {}); await page.waitForTimeout(300);
  await page.goto(BASE + "?game=klondike&seed=148&draw=3"); await page.waitForTimeout(800);
  ok(C, P, "seed 148 draw 3: no modal at deal", !(await vis(page, '[data-testid="stuck-modal"]')));
  await drag(page, ctx, page.locator('.card[data-zone="tableau"][data-index="4"]').last(), page.locator('[data-drop="tableau:2"]'), touch);
  await page.waitForTimeout(500);
  ok(C, P, "seed 148 draw 3: 8♠ onto 9♥ opens the stuck modal", await vis(page, '[data-testid="stuck-modal"]'), `moves ${await H(page, () => window.__solitaire.getState().moves)}`);
  await page.locator('[data-testid="stuck-replay"]').click().catch(() => {}); await page.waitForTimeout(300);
  await page.goto(BASE); await page.waitForTimeout(500);
  // Klondike: only a pointless shuffle left -> No more moves
  await pick(page, "klondike"); await closeModal(page);
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste, ...s.foundations.flat()].map(c => ({ ...c }));
    const by = Object.fromEntries(all.map(c => [c.id, c]));
    const tops = [["spades-6", "hearts-5"], ["clubs-6"], ["spades-9", "hearts-1"], ["clubs-9"], ["spades-12"], ["clubs-12"], ["spades-3"]];
    const used = new Set(tops.flat());
    const rest = all.filter(c => !used.has(c.id)).map(c => ({ ...c, faceUp: false }));
    s.tableau = tops.map((ids, i) => [...rest.filter((_, j) => j % 7 === i), ...ids.map(id => ({ ...by[id], faceUp: true }))]);
    s.stock = []; s.waste = []; s.foundations = [[], [], [], []]; s.won = false;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(700);
  await tapEl(page, page.locator('.card[data-zone="tableau"][data-index="2"]').last(), touch);
  await tapEl(page, page.locator('[data-drop="foundation:0"]'), touch);
  await page.waitForTimeout(500);
  ok(C, P, "Klondike: No more moves when only a pointless shuffle is left", await vis(page, '[data-testid="stuck-modal"]'));
  const acts = await H(page, () => [...document.querySelectorAll('[data-testid="stuck-modal"] button')].map(b => b.textContent.trim()).join(" · "));
  ok(C, P, "stuck modal: Undo · Replay this deal · New deal", /Undo/.test(acts) && /Replay this deal/.test(acts) && /New deal/.test(acts), acts);
  await closeModal(page);
}

// ---- Batch 2: tip entry points, once-a-day tip CTA, PWA, move feedback, first-visit picker ----
const BTC_ADDR = "bc1qqhkwfx9l7umufx66s8kzep8yamtvhafea73fdj";
async function golfQuickWin(page, touch) {
  await H(page, () => {
    const s = structuredClone(window.__solitaire.getState());
    const mk = (su, r) => ({ id: `${su}-${r}`, suit: su, rank: r, faceUp: true });
    s.columns = Array.from({ length: s.columns.length }, () => []); s.columns[0] = [mk("diamonds", 5)];
    s.waste = [mk("hearts", 4)]; s.stock = [mk("clubs", 9)]; s.over = false; s.wonAt = null;
    window.__solitaire.setState(s);
  });
  await page.waitForTimeout(700);
  await tapEl(page, page.locator('.card[data-zone="column"][data-index="0"]').last(), touch);
  await page.waitForTimeout(700);
}
async function batch2(vp) {
  const B = "batch2", P = vp.P, touch = vp.touch;
  const ctx = await browser.newContext(vp.opts);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  // 5) first visit -> picker; untouched board -> picker; real move -> resume
  await page.goto(BASE); await page.waitForTimeout(700);
  ok(B, P, "first visit opens the Games picker", (await H(page, () => window.__solitaire.game())) === null && await vis(page, '[data-testid="picker"]'));
  await pick(page, "klondike"); await closeModal(page);
  await page.reload(); await page.waitForTimeout(700);
  ok(B, P, "untouched Klondike board -> picker on reload", (await H(page, () => window.__solitaire.game())) === null);
  await pick(page, "klondike"); await closeModal(page); await page.waitForTimeout(600);
  await tapEl(page, page.locator('[data-drop="stock"]').first(), touch); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(700);
  ok(B, P, "in-progress Klondike resumes on reload", (await H(page, () => window.__solitaire.game())) === "klondike");
  // 1) tip entry on picker + Help
  await home(page);
  const pt = page.locator('[data-testid="picker-tip"]');
  const ptBox = await pt.boundingBox().catch(() => null);
  ok(B, P, "picker has a soft Tip in BTC entry (>= 44px)", !!ptBox && ptBox.height >= 43.5 && (await pt.innerText().catch(() => "")).trim() === "🪙 Tip in BTC", ptBox ? `${Math.round(ptBox.height)}px` : "missing");
  const credit = await H(page, () => { const c = document.querySelector('[data-testid="credit"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { text: c.textContent.trim(), link: !!c.querySelector("a"), inView: r.bottom <= innerHeight, scroll: document.documentElement.scrollHeight > innerHeight + 1 }; });
  ok(B, P, "picker shows a quiet 'Made by Grok Bot' credit", credit && credit.text === "Made by Grok Bot" && !credit.link && credit.inView && !credit.scroll, JSON.stringify(credit));
  const ce = await H(page, () => { const a = document.querySelector('[data-testid="contact-email"]'); if (!a) return null; const r = a.getBoundingClientRect(); return { href: a.getAttribute("href"), text: a.textContent.trim(), h: Math.round(r.height), inView: r.bottom <= innerHeight && r.right <= innerWidth + 1, scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 }; });
  ok(B, P, "picker contact email is a mailto link near the credit", ce && ce.href === "mailto:radls@mail.grokbot.com" && ce.text === "radls@mail.grokbot.com" && ce.h >= 43.5 && ce.inView && !ce.scroll, JSON.stringify(ce));
  ok(B, P, "no coffee wording anywhere on the picker", !(await H(page, () => /coffee|☕/i.test(document.body.innerText))));
  await pt.click().catch(() => {}); await page.waitForTimeout(400);
  let addr = ((await page.locator('[data-testid="tip-btc-address"]:visible').first().textContent().catch(() => "")) || "").trim();
  ok(B, P, "picker Tip opens the tip panel with the exact address", addr === BTC_ADDR, addr);
  ok(B, P, "picker tip panel has QR + X note", (await page.locator('[data-testid="tip-btc-qr"]:visible svg').count()) > 0 && /@ZeusRadls/.test(await page.locator('[data-testid="tip-x-note"]:visible').first().textContent().catch(() => "")));
  const fitP = await H(page, () => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(B, P, "picker tip modal: no sideways scroll", fitP);
  if (P === "mobile") await page.screenshot({ path: `${SHOTS}/${P}-picker-tip.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);
  ok(B, P, "picker tip modal closes with Escape", !(await vis(page, '[data-testid="tip-panel"]')));
  for (const g of ["klondike", "freecell", "golf", "kings"]) {
    await pick(page, g); await closeModal(page); await openHelp(page);
    const ht = page.locator('#overlay [data-testid="help-tip"]');
    const has = await ht.count() > 0;
    if (has) { await ht.scrollIntoViewIfNeeded().catch(() => {}); await ht.click().catch(() => {}); await page.waitForTimeout(300); }
    addr = ((await page.locator('#overlay [data-testid="tip-btc-address"]').first().textContent().catch(() => "")) || "").trim();
    ok(B, P, `${g} Help shows 'Made by Grok Bot'`, ((await page.locator('#overlay [data-testid="help-credit"]').textContent().catch(() => "")) || "").trim() === "Made by Grok Bot");
    ok(B, P, `${g} Help has the contact mailto`, (await page.locator('#overlay [data-testid="help-contact-email"]').getAttribute("href").catch(() => null)) === "mailto:radls@mail.grokbot.com");
    ok(B, P, `${g} Help has a Tip entry that opens the panel`, has && addr === BTC_ADDR, addr || (await H(page, () => (document.querySelector("#overlay")?.hidden ? "overlay hidden " : "") + (document.querySelector("#overlay")?.innerText || "").slice(0, 100))));
    await closeModal(page); await closeModal(page);
  }
  // 2) once-a-day tip CTA (win), and PWA install hint after first win
  await H(page, () => localStorage.removeItem("grok-solitaire:tip"));
  await pick(page, "golf"); await closeModal(page);
  await H(page, () => window.__solitaire.newGame()); await page.waitForTimeout(300); await closeModal(page);
  await golfQuickWin(page, touch);
  const cta = page.locator('[data-testid="win-modal"] [data-testid="tip-cta"]');
  const ctaBox = await cta.boundingBox().catch(() => null);
  ok(B, P, "first win today shows the tip CTA", !!ctaBox, await H(page, () => document.querySelector("#overlay")?.innerText?.slice(0, 120)));
  ok(B, P, "tip CTA is above the fold", !!ctaBox && ctaBox.y + ctaBox.height <= (await H(page, () => innerHeight)), JSON.stringify(ctaBox));
  ok(B, P, "tip CTA has the Buy me some tokens in BTC button", await vis(page, '[data-testid="tip-cta"] [data-testid="btn-tip"], [data-testid="win-modal"] [data-testid="btn-tip"]'));
  if (P === "mobile") await page.screenshot({ path: `${SHOTS}/${P}-tip-cta.png` });
  await closeModal(page); await page.waitForTimeout(500);
  ok(B, P, "install hint appears after the first win", await vis(page, '[data-testid="install-hint"]'));
  const ih = await H(page, () => { const h = document.querySelector('[data-testid="install-hint"]'); if (!h) return null; const r = h.getBoundingClientRect(); const bar = document.querySelector('[data-testid="thumb-bar"]'); const br = bar && bar.getClientRects().length ? bar.getBoundingClientRect() : null; const btns = [...h.querySelectorAll("button")].filter(b => b.getClientRects().length).map(b => b.getBoundingClientRect().height); return { overlapBar: br ? r.bottom > br.top + 1 : false, minBtn: Math.min(...btns), inView: r.top >= 0 && r.bottom <= innerHeight + 1, text: h.innerText.slice(0, 120) }; });
  ok(B, P, "install hint sits clear of the thumb bar with 44px buttons", ih && !ih.overlapBar && ih.minBtn >= 43.5 && ih.inView, JSON.stringify(ih));
  if (P === "mobile") await page.screenshot({ path: `${SHOTS}/${P}-install-hint.png` });
  await page.locator('[data-testid="install-dismiss"]').click().catch(() => {}); await page.waitForTimeout(300);
  ok(B, P, "Not now dismisses the install hint", !(await vis(page, '[data-testid="install-hint"]')));
  await H(page, () => window.__solitaire.newGame()); await page.waitForTimeout(300); await closeModal(page);
  await golfQuickWin(page, touch);
  ok(B, P, "win screen has no contact email", !(await H(page, () => /radls@mail\.grokbot\.com/.test(document.querySelector('[data-testid="win-modal"]')?.innerText || ""))));
  ok(B, P, "second win today: no tip CTA, Tip button still there", !(await vis(page, '[data-testid="tip-cta"]')) && await vis(page, '[data-testid="win-modal"] [data-testid="btn-tip"]'));
  await closeModal(page); await page.waitForTimeout(500);
  ok(B, P, "install hint stays dismissed", !(await vis(page, '[data-testid="install-hint"]')));
  // stuck panel CTA: new day -> shown once
  await H(page, () => { const d = new Date(Date.now() - 86400000); localStorage.setItem("grok-solitaire:tip", JSON.stringify({ ctaDay: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` })); });
  await page.goto(BASE + "?game=klondike&seed=22&draw=3"); await page.waitForTimeout(900);
  ok(B, P, "stuck panel shows the tip CTA once on a new day", await vis(page, '[data-testid="stuck-modal"] [data-testid="tip-cta"]'));
  await page.reload(); await page.waitForTimeout(900);
  ok(B, P, "stuck panel: no tip CTA again the same day", await vis(page, '[data-testid="stuck-modal"]') && !(await vis(page, '[data-testid="tip-cta"]')));
  await page.locator('[data-testid="stuck-new"]').click().catch(() => {}); await page.waitForTimeout(300);
  // 3) manifest + icons
  const man = await H(page, async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; const r = await fetch(l.href); const j = await r.json(); const icons = await Promise.all((j.icons || []).map(async i => { const u = new URL(i.src, l.href); const ir = await fetch(u); return { sizes: i.sizes, purpose: i.purpose || "", ok: ir.ok, type: ir.headers.get("content-type") }; })); const apple = document.querySelector('link[rel="apple-touch-icon"]'); const ar = apple ? await fetch(apple.href) : null; return { name: j.name, display: j.display, start: j.start_url, theme: j.theme_color, icons, apple: ar?.ok ?? false }; });
  ok(B, P, "manifest linked with name/standalone/theme", man && man.name && man.display === "standalone" && !!man.theme, JSON.stringify(man && { name: man.name, display: man.display, start: man.start, theme: man.theme }));
  ok(B, P, "manifest icons 192 + 512 + maskable load as PNG", man && ["192x192", "512x512"].every(sz => man.icons.some(i => i.sizes === sz && i.ok && /png/.test(i.type))) && man.icons.some(i => /maskable/.test(i.purpose) && i.ok), JSON.stringify(man?.icons));
  ok(B, P, "apple-touch-icon loads", man && man.apple);
  // 4) feedback: invalid move shakes; hint pulses
  await pick(page, "freecell"); await closeModal(page); await page.waitForTimeout(600);
  const bad = await H(page, () => { const s = window.__solitaire.getState(); const legal = window.__solitaire.listMoves(); for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { if (a === b) continue; if (!legal.some(m => m.from?.index === a && m.to?.zone === "cascade" && m.to?.index === b)) return [a, b]; } return null; });
  const zoneC = await H(page, () => document.querySelector('.card[data-zone="cascade"]') ? "cascade" : "tableau");
  if (bad) {
    const src = page.locator(`.card[data-zone="${zoneC}"][data-index="${bad[0]}"]`).last();
    await H(page, () => { window.__shook = false; new MutationObserver(ms => { for (const m of ms) if (m.target.classList?.contains("shake") || m.target.querySelector?.(".shake")) window.__shook = true; }).observe(document.getElementById("table"), { attributes: true, subtree: true, attributeFilter: ["class"], childList: true }); });
    await drag(page, ctx, src, page.locator(`[data-drop="${zoneC}:${bad[1]}"]`), touch);
    await page.waitForTimeout(100);
    ok(B, P, "invalid drop shakes the card", await H(page, () => window.__shook || !!document.querySelector(".shake")), `${zoneC} ${bad}`);
  } else ok(B, P, "invalid drop shakes the card", false, "no illegal pair");
  await (await uiBtn(page, "hint", P)).click(); await page.waitForTimeout(200);
  const pulse = await H(page, () => { const e = document.querySelector(".hint-from, .hint-to"); if (!e) return null; const cs = getComputedStyle(e); return { anim: cs.animationName, n: document.querySelectorAll(".hint-from, .hint-to").length }; });
  ok(B, P, "Hint pulses source + target", pulse && pulse.n >= 2 && pulse.anim && pulse.anim !== "none", JSON.stringify(pulse));
  const bedtime = await H(page, () => ({ theme: document.documentElement.dataset.theme, sound: JSON.parse(localStorage.getItem("grok-solitaire:prefs") || "{}").sound }));
  ok(B, P, "night theme + sound off kept", bedtime.theme === "night" && bedtime.sound !== true, JSON.stringify(bedtime));
  ok(B, P, "no 'surprise' copy", !(await H(page, () => /surprise/i.test(document.body.innerText))));
  ok(B, P, "no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

// ---- Batch 3: help tip above fold, install copy, tap shake, tip parity, night card faces ----
async function watchShake(page) { await H(page, () => { window.__shook = false; new MutationObserver(ms => { for (const m of ms) { const t = m.target; if (t.classList?.contains("shake") || t.querySelector?.(".shake")) window.__shook = true; for (const n of m.addedNodes || []) if (n.classList?.contains("shake") || n.querySelector?.(".shake")) window.__shook = true; } }).observe(document.getElementById("table"), { attributes: true, subtree: true, attributeFilter: ["class"], childList: true }); }); }
async function batch3(vp) {
  const B = "batch3", P = vp.P, touch = vp.touch;
  const ctx = await browser.newContext(vp.opts);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(600);
  // 1) Help tip above the fold
  for (const g of ["klondike", "freecell", "golf", "kings"]) {
    await pick(page, g); await closeModal(page); await openHelp(page);
    const r = await H(page, () => { const t = document.querySelector('#overlay [data-testid="help-tip"]'); const m = document.querySelector("#overlay .modal"); if (!t) return null; const b = t.getBoundingClientRect(); return { bottom: Math.round(b.bottom), h: Math.round(b.height), vh: innerHeight, scrolled: m ? m.scrollTop : 0 }; });
    ok(B, P, `${g}: Help tip visible without scrolling`, r && r.bottom <= r.vh && r.scrolled === 0 && r.h >= 43.5, JSON.stringify(r));
    if (P === "mobile" && g === "kings") await page.screenshot({ path: `${SHOTS}/${P}-kings-help-tip.png` });
    await closeModal(page);
  }
  // 3) illegal TAP shakes (Klondike + FreeCell), hint pulse in normal play
  await pick(page, "klondike"); await closeModal(page);
  await H(page, () => window.__solitaire.newGame({ seed: 4242 })); await page.waitForTimeout(400); await closeModal(page);
  const st = await H(page, () => window.__solitaire.getState());
  const legal = await H(page, () => window.__solitaire.listMoves());
  let ill = null;
  for (let a = 0; a < 7 && !ill; a++) for (let b = 0; b < 7 && !ill; b++) { if (a === b || !st.tableau[a].length || !st.tableau[b].length) continue; if (!legal.some(m => m.from.zone === "tableau" && m.from.index === a && m.to.zone === "tableau" && m.to.index === b)) ill = [a, b]; }
  await page.waitForTimeout(600);
  await watchShake(page);
  await tapEl(page, page.locator(`.card[data-zone="tableau"][data-index="${ill[0]}"]`).last(), touch);
  await tapEl(page, page.locator(`[data-drop="tableau:${ill[1]}"]`), touch);
  await page.waitForTimeout(80);
  ok(B, P, "Klondike: illegal tap move shakes the card", await H(page, () => window.__shook || !!document.querySelector(".shake")), `col${ill[0] + 1}->col${ill[1] + 1}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
  await (await uiBtn(page, "hint", P)).click(); await page.waitForTimeout(200);
  const pulse = await H(page, () => { const e = [...document.querySelectorAll(".hint-from, .hint-to")]; return { n: e.length, anim: e.map(x => getComputedStyle(x).animationName).join(","), stuck: !!document.querySelector('[data-testid="stuck-modal"]') }; });
  ok(B, P, "Hint pulses source + target in normal play", pulse.n >= 1 && !pulse.stuck && /[a-z]/i.test(pulse.anim.replace(/none/g, "")), JSON.stringify(pulse));
  await pick(page, "freecell"); await closeModal(page); await page.waitForTimeout(600);
  const badF = await H(page, () => { const legal = window.__solitaire.listMoves(); for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { if (a === b) continue; if (!legal.some(m => m.from?.index === a && m.to?.zone === "cascade" && m.to?.index === b)) return [a, b]; } return null; });
  await watchShake(page);
  await tapEl(page, page.locator(`.card[data-zone="cascade"][data-index="${badF[0]}"]`).last(), touch);
  await tapEl(page, page.locator(`[data-drop="cascade:${badF[1]}"]`), touch);
  await page.waitForTimeout(80);
  ok(B, P, "FreeCell: illegal tap move shakes the card", await H(page, () => window.__shook || !!document.querySelector(".shake")), JSON.stringify(badF));
  await page.keyboard.press("Escape").catch(() => {});
  // 4) tip parity: stuck first today -> later win has no tip-cta
  await H(page, () => { const d = new Date(Date.now() - 86400000); localStorage.setItem("grok-solitaire:tip", JSON.stringify({ ctaDay: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` })); });
  await page.goto(BASE + "?game=klondike&seed=22&draw=3"); await page.waitForTimeout(900);
  const sc = await page.locator('[data-testid="stuck-modal"] [data-testid="tip-cta"]').boundingBox().catch(() => null);
  ok(B, P, "stuck first today: tip block shown above the fold", !!sc && sc.y + sc.height <= (await H(page, () => innerHeight)), JSON.stringify(sc));
  await page.locator('[data-testid="stuck-new"]').click().catch(() => {}); await page.waitForTimeout(300);
  await pick(page, "golf"); await closeModal(page);
  await H(page, () => window.__solitaire.newGame()); await page.waitForTimeout(300); await closeModal(page);
  await golfQuickWin(page, touch);
  ok(B, P, "then a win the same day: no second tip block (shared day key)", await winVisible(page) && !(await vis(page, '[data-testid="tip-cta"]')) && await vis(page, '[data-testid="win-modal"] [data-testid="btn-tip"]'));
  await closeModal(page); await page.waitForTimeout(400);
  // 2) install copy without beforeinstallprompt
  const ih = await H(page, () => document.querySelector('[data-testid="install-hint"]')?.innerText || "");
  ok(B, P, "install hint without install event uses menu/bookmark wording", /browser menu/i.test(ih) && /bookmark/i.test(ih) && !(/Install\b/.test(ih) && false), ih.replace(/\s+/g, " "));
  ok(B, P, "no Install button without an install event", !(await vis(page, '[data-testid="install-go"]')));
  await page.locator('[data-testid="install-dismiss"]').click().catch(() => {});
  // 5) softer night card faces
  const face = await H(page, () => {
    const card = document.querySelector(".card.face-up.red") || document.querySelector(".card.face-up");
    if (!card) return null;
    const norm = (v) => { const t = document.createElement("span"); t.style.color = v; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const cs = getComputedStyle(card);
    const faces = [cs.getPropertyValue("--ivory-top").trim(), cs.getPropertyValue("--ivory").trim()].map(norm);
    const reds = [norm(getComputedStyle(document.querySelector(".card.face-up.red .corner") || card).color)];
    const blackCard = document.querySelector(".card.face-up:not(.red) .corner");
    if (blackCard) reds.push(norm(getComputedStyle(blackCard).color));
    const Lf = Math.max(...faces.map(f => lum(parse(f))));
    const contrast = Math.min(...reds.map(c => { const L = lum(parse(c)); return (Math.max(Lf, L) + 0.05) / (Math.min(Lf, L) + 0.05); }));
    return { faces, ink: reds, faceLum: +Lf.toFixed(3), contrast: +contrast.toFixed(2), theme: document.documentElement.dataset.theme };
  });
  ok(B, P, "night card face is softer than bright cream", face && face.theme === "night" && face.faceLum < 0.58, JSON.stringify(face));
  ok(B, P, "card ranks stay readable (contrast >= 4.5)", face && face.contrast >= 4.5, JSON.stringify(face));
  if (P === "mobile") await page.screenshot({ path: `${SHOTS}/${P}-night-cards.png` });
  ok(B, P, "no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

// ---- Batch 4: random deals never start stuck; shake in normal play; install copy ----
async function batch4(vp) {
  const B = "batch4", P = vp.P, touch = vp.touch;
  const ctx = await browser.newContext(vp.opts);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  // explicit seed keeps the stuck deal
  await page.goto(BASE + "?game=klondike&seed=22&draw=3"); await page.waitForTimeout(900);
  ok(B, P, "seed=22&draw=3 still opens the stuck panel at the deal", await vis(page, '[data-testid="stuck-modal"]'));
  // random New deal whose first shuffle would be seed 22 -> reshuffled
  await H(page, () => { const real = Math.random; let n = 0; Math.random = () => (n++ === 0 ? 22.5 / 0xffffffff : real()); });
  await page.locator('[data-testid="stuck-new"]').click(); await page.waitForTimeout(600);
  const r1 = await H(page, () => ({ seed: window.__solitaire.getState().seed, dc: window.__solitaire.getState().drawCount, moves: window.__solitaire.getState().moves }));
  ok(B, P, "random New deal that would start stuck is reshuffled", r1.seed !== 22 && r1.dc === 3 && r1.moves === 0 && !(await vis(page, '[data-testid="stuck-modal"]')), JSON.stringify(r1));
  // same via the toolbar/thumb New with 0 moves
  await H(page, () => { const real = Math.random; let n = 0; Math.random = () => (n++ === 0 ? 22.5 / 0xffffffff : real()); });
  await (await uiBtn(page, "new", P)).click(); await page.waitForTimeout(600);
  const r2 = await H(page, () => window.__solitaire.getState().seed);
  ok(B, P, "toolbar New also skips a stuck-at-start shuffle", r2 !== 22 && !(await vis(page, '[data-testid="stuck-modal"]')), String(r2));
  // Replay of an explicit stuck seed keeps it
  await page.goto(BASE + "?game=klondike&seed=22&draw=3"); await page.waitForTimeout(900);
  await page.locator('[data-testid="stuck-replay"]').click(); await page.waitForTimeout(600);
  ok(B, P, "Replay this deal keeps seed 22 (stuck again)", (await H(page, () => window.__solitaire.getState().seed)) === 22 && await vis(page, '[data-testid="stuck-modal"]'));
  await page.locator('[data-testid="stuck-new"]').click(); await page.waitForTimeout(600);
  // shake: Klondike drag + Golf tap, normal play
  await closeModal(page);
  const st = await H(page, () => window.__solitaire.getState());
  const legal = await H(page, () => window.__solitaire.listMoves());
  let ill = null;
  for (let a = 0; a < 7 && !ill; a++) for (let b = 0; b < 7 && !ill; b++) { if (a === b || !st.tableau[a].length || !st.tableau[b].length) continue; if (!legal.some(m => m.from.zone === "tableau" && m.from.index === a && m.to.zone === "tableau" && m.to.index === b)) ill = [a, b]; }
  await page.waitForTimeout(600); await watchShake(page);
  await drag(page, ctx, page.locator(`.card[data-zone="tableau"][data-index="${ill[0]}"]`).last(), page.locator(`[data-drop="tableau:${ill[1]}"]`), touch);
  await page.waitForTimeout(60);
  ok(B, P, "Klondike: invalid drag shakes (no overlay)", (await H(page, () => window.__shook || !!document.querySelector(".shake"))) && !(await vis(page, "#overlay .modal")));
  await pick(page, "golf"); await closeModal(page); await page.waitForTimeout(600);
  const gi = await H(page, () => { const s = window.__solitaire.getState(); const w = s.waste[s.waste.length - 1]; for (let i = 0; i < s.columns.length; i++) { const c = s.columns[i][s.columns[i].length - 1]; if (c && Math.abs(c.rank - w.rank) !== 1) return i; } return -1; });
  await watchShake(page);
  if (gi >= 0) { await tapEl(page, page.locator(`.card[data-zone="column"][data-index="${gi}"]`).last(), touch); await page.waitForTimeout(60); }
  ok(B, P, "Golf: illegal tap shakes", gi >= 0 && await H(page, () => window.__shook || !!document.querySelector(".shake")), `col ${gi}`);
  await pick(page, "kings"); await closeModal(page); await page.waitForTimeout(600);
  const kl = await H(page, () => { const legal = window.__solitaire.listMoves(); const s = window.__solitaire.getState(); return { legal: legal.length, keys: Object.keys(s).join(",") }; });
  // first win -> install copy
  await pick(page, "golf"); await H(page, () => window.__solitaire.newGame()); await page.waitForTimeout(300); await closeModal(page);
  await golfQuickWin(page, touch); await closeModal(page); await page.waitForTimeout(500);
  const ih = await H(page, () => document.querySelector('[data-testid="install-hint"]')?.innerText || "");
  ok(B, P, "after first win: Add to Home / bookmark copy shown (no install event)", /home screen/i.test(ih) && /bookmark/i.test(ih), ih.replace(/\s+/g, " "));
  await page.locator('[data-testid="install-dismiss"]').click().catch(() => {}); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(600);
  ok(B, P, "install copy shown only once (dismissed stays hidden)", !(await vis(page, '[data-testid="install-hint"]')));
  ok(B, P, "no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

const VPS = [
  { P: "desktop", opts: { viewport: { width: 1280, height: 800 } }, touch: false },
  { P: "mobile", opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, touch: true },
];
for (const vp of [
  { P: "desktop", opts: { viewport: { width: 1280, height: 800 } }, touch: false },
  { P: "mobile", opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, touch: true },
]) {
  if (process.env.B2ONLY || process.env.B3ONLY || process.env.B4ONLY) continue;
  const ctx = await browser.newContext(vp.opts);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin }).catch(() => {});
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE); await page.waitForTimeout(600);
  await common(page, vp.P);
  await layoutChecks(page, "shell", vp.P, "picker");
  await page.screenshot({ path: `${SHOTS}/${vp.P}-picker.png` });
  for (const [name, fn] of (process.env.CRONLY ? [] : [["klondike", klondike], ["freecell", freecell], ["golf", golf], ["kings", kings]])) {
    try { await fn(page, ctx, vp.P, vp.touch); } catch (e) { ok(name, vp.P, "exception", false, e.message.split("\n")[0]); }
    const sw = await H(page, () => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(name, vp.P, "no horizontal scroll", sw);
  }
  try { await fixChecks(page, ctx, vp.P, vp.touch); } catch (e) { ok("cr", vp.P, "fix exception", false, e.message.split("\n")[0]); }
  try { await crChecks(page, ctx, vp.P, vp.touch); } catch (e) { ok("cr", vp.P, "exception", false, e.message.split("\n")[0]); }
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
for (const vp of VPS) { try { await batch4(vp); } catch (e) { ok("batch4", vp.P, "exception", false, e.message.split("\n")[0]); } }
for (const vp of VPS) { if (process.env.B4ONLY) continue; try { await batch3(vp); } catch (e) { ok("batch3", vp.P, "exception", false, e.message.split("\n")[0]); } }
for (const vp of VPS) { if (process.env.B3ONLY || process.env.B4ONLY) continue; try { await batch2(vp); } catch (e) { ok("batch2", vp.P, "exception", false, e.message.split("\n")[0]); } }
await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
for (const g of ["shell", "klondike", "freecell", "golf", "kings", "cr", "batch2", "batch3", "batch4"]) { const rs = results.filter(r => r.game === g); console.log(`${g}: ${rs.filter(r => r.pass).length}/${rs.length}`); }
process.exit(fails.length ? 1 : 0);
