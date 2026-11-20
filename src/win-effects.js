import { winEffectsPlan } from "./win-effects-plan.js";

const FADE = 700;
const hook = {
  active() { return running; },
  raf() { return live; },
  canvases() {
    const list = doc()?.querySelectorAll?.('canvas[data-testid="win-fx"]');
    return list ? list.length : canvas ? 1 : 0;
  },
  plan() { return last; },
  starts: 0,
  stops: 0,
};
let running = false, live = false, rafId = 0, gen = 0, run = 0;
let canvas = null, g = null, parts = [], last = null, t0 = 0, prev = 0, W = 1, H = 1, dpr = 1;
const ev = [];
const doc = () => globalThis.document;
const view = () => globalThis.window || globalThis;
const clock = () => globalThis.performance?.now?.() ?? Date.now();

function publish() {
  globalThis.__winFx = hook;
  if (globalThis.window) globalThis.window.__winFx = hook;
}
function listen(target, type, fn) {
  if (typeof target?.addEventListener !== "function") return;
  target.addEventListener(type, fn);
  ev.push(target, type, fn);
}
function unbind() {
  for (let i = 0; i < ev.length; i += 3) ev[i].removeEventListener(ev[i + 1], ev[i + 2]);
  ev.length = 0;
}
function addGlow() { doc()?.querySelector?.("#overlay .modal.win")?.classList?.add?.("win-glow"); }
function clearGlow() {
  const list = doc()?.querySelectorAll?.(".win-glow");
  if (!list) return;
  for (let i = 0; i < list.length; i++) list[i].classList?.remove?.("win-glow");
}
function onVis() {
  const d = doc();
  if (d && (d.hidden === true || d.visibilityState === "hidden")) stopWinEffects();
}
function fit() {
  if (!canvas) return;
  const w = view();
  W = w.innerWidth || 800;
  H = w.innerHeight || 600;
  dpr = Math.min(2, w.devicePixelRatio || 1);
  canvas.width = Math.max(1, (W * dpr) | 0);
  canvas.height = Math.max(1, (H * dpr) | 0);
  if (canvas.style) { canvas.style.width = W + "px"; canvas.style.height = H + "px"; }
  g?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
}
function bind() {
  const w = view();
  listen(doc(), "visibilitychange", onVis);
  listen(w, "pagehide", stopWinEffects);
  listen(w, "popstate", stopWinEffects);
  listen(w, "hashchange", stopWinEffects);
  listen(w, "resize", fit);
}
function arm(fn) {
  const w = view();
  const raf = w.requestAnimationFrame?.bind(w) || globalThis.requestAnimationFrame?.bind(globalThis);
  if (!raf) return;
  rafId = raf(fn) || 0;
  live = true;
}
function spawn(plan) {
  const pal = plan.palette?.length ? plan.palette : ["#d4b46a"];
  const n = plan.kind === "confetti" || plan.kind === "both" ? plan.confetti : 0;
  const bursts = plan.kind === "fireworks" || plan.kind === "both" ? plan.bursts : 0;
  const sparks = bursts ? plan.sparks : 0;
  parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      k: 0, x: Math.random() * W, y: Math.random() * H * 0.62 - 16,
      vx: (Math.random() - 0.5) * 1.5, vy: 1.15 + Math.random() * 1.5,
      w: 5 + (i % 4), h: 8 + (i % 3), rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.2, ph: Math.random() * 6.28,
      c: pal[i % pal.length], delay: (i % 10) * 40,
    });
  }
  for (let b = 0; b < bursts; b++) {
    const tx = W * (0.2 + 0.6 * ((b + 0.5) / bursts));
    const ty = H * (0.2 + (b % 3) * 0.07);
    const rocket = { k: 1, x: tx, y: H + 6, vy: -10.5, ty, c: pal[b % pal.length], delay: 160 + b * 420, lit: 0, burst: 0, s0: 0, s1: 0 };
    parts.push(rocket);
    rocket.s0 = parts.length;
    for (let s = 0; s < sparks; s++) {
      const ang = (s / sparks) * 6.283185;
      const sp = 1.6 + (s % 5) * 0.45;
      parts.push({ k: 2, x: tx, y: ty, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 2.5, h: 2.5, c: pal[(b + s) % pal.length], on: 0, life: 1 });
    }
    rocket.s1 = parts.length;
  }
  if (canvas?.dataset) canvas.dataset.particles = String(parts.length);
}
function tick(ts) {
  if (run !== gen || !live) return;
  const now = ts || clock();
  const elapsed = now - t0;
  if (!last || elapsed >= last.durationMs + FADE) return stopWinEffects();
  const k = Math.min(2.2, ((prev ? Math.min(34, now - prev) : 16.7) / 16.67)) * (last.speed || 1);
  prev = now;
  const fade = elapsed <= last.durationMs ? 1 : 1 - (elapsed - last.durationMs) / FADE;
  const gentle = !!last.gentle;
  if (g?.setTransform) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.delay && elapsed < p.delay) continue;
    if (p.k === 0) {
      p.vy += 0.05 * k;
      p.x += (p.vx + Math.sin(p.ph + elapsed * 0.004) * 0.45) * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      if (!g?.fillRect) continue;
      g.globalAlpha = fade * (gentle ? 0.55 : 0.95);
      g.fillStyle = p.c;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    } else if (p.k === 1 && !p.lit) {
      p.y += p.vy * k;
      if (p.y <= p.ty) {
        p.y = p.ty; p.lit = 1; p.burst = elapsed;
        for (let s = p.s0; s < p.s1; s++) { parts[s].on = 1; parts[s].x = p.x; parts[s].y = p.y; }
      } else if (g?.fillRect) {
        g.globalAlpha = fade * (gentle ? 0.45 : 0.9);
        g.fillStyle = p.c;
        g.fillRect(p.x - 1.5, p.y, 3, 8);
      }
    } else if (p.k === 1 && p.lit && !gentle && g?.arc && elapsed - p.burst < 150) {
      g.globalAlpha = fade * (1 - (elapsed - p.burst) / 150) * 0.8;
      g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.283185); g.fill();
    } else if (p.k === 2 && p.on) {
      p.vy += 0.07 * k; p.x += p.vx * k; p.y += p.vy * k; p.life -= 0.014 * k;
      if (p.life <= 0) { p.on = 0; continue; }
      if (!g?.fillRect) continue;
      g.globalAlpha = p.life * fade * (gentle ? 0.5 : 0.92);
      g.fillStyle = p.c;
      g.fillRect(p.x, p.y, p.w, p.h);
    }
  }
  if (g) g.globalAlpha = 1;
  if (run === gen && live) arm(tick);
}

export function stopWinEffects() {
  const was = running || live || !!canvas || ev.length > 0;
  gen += 1; live = false; running = false;
  const cancel = view().cancelAnimationFrame || globalThis.cancelAnimationFrame;
  if (rafId && cancel) cancel(rafId);
  rafId = 0;
  canvas?.remove?.();
  canvas = null; g = null; parts = [];
  unbind(); clearGlow();
  if (was) hook.stops += 1;
}

export function startWinEffects(plan) {
  stopWinEffects();
  run = gen; last = plan || null; publish();
  hook.starts += 1; running = true;
  if (!plan || plan.kind === "glow") { addGlow(); bind(); return; }
  const d = doc();
  if (!d?.body?.appendChild) return;
  canvas = d.createElement("canvas");
  canvas.setAttribute?.("data-testid", "win-fx");
  canvas.setAttribute?.("aria-hidden", "true");
  if (canvas.dataset) {
    canvas.dataset.testid = "win-fx";
    canvas.dataset.kind = plan.kind;
    canvas.dataset.gentle = plan.gentle ? "1" : "0";
    canvas.dataset.game = plan.game || "";
    canvas.dataset.particles = "0";
  }
  const style = canvas.style;
  if (style) { style.position = "fixed"; style.inset = "0"; style.pointerEvents = "none"; style.zIndex = "60"; }
  d.body.appendChild(canvas);
  g = canvas.getContext?.("2d") || null;
  fit(); spawn(plan); bind();
  t0 = clock(); prev = 0;
  arm(tick);
}

function reducedNow() {
  const root = doc()?.documentElement;
  let reduce = false;
  try { reduce = view().matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true; } catch { reduce = false; }
  if (root?.classList?.contains?.("reduce-motion") || root?.dataset?.motion === "reduce") reduce = true;
  return reduce;
}

export function presentWinEffects(session, game, state) {
  const token = state?.wonAt ?? state?.seed ?? 1;
  if (session?.fxOn && session.fxToken === token) {
    if (last?.kind === "glow") addGlow();
    return;
  }
  if (session) { session.fxOn = true; session.fxToken = token; }
  const next = winEffectsPlan({
    game, daily: !!state?.daily, pick: !!state?.pick, drawCount: state?.drawCount,
    reduce: reducedNow(), bedtime: doc()?.documentElement?.dataset?.theme !== "classic",
    narrow: (view().innerWidth || 0) < 500,
  });
  next.game = game;
  startWinEffects(next);
}

export function dismissWinEffects(session) {
  if (session) { session.fxOn = false; session.fxToken = 0; }
  stopWinEffects();
}

publish();
