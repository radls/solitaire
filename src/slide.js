/**
 * FLIP slides for cards that change piles.
 * The translate lives on a wrapper outside `.card` so Batch 7's flipper
 * (the direct preserve-3d child of the perspective card) still turns.
 * Transforms are cleared when the slide ends.
 */

export const MOVE_PX = 1.5;
export const WASTE_NUDGE_PX = 8;

export function easeOvershoots(ease) {
  const match = String(ease || "").match(
    /cubic-bezier\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)/,
  );
  if (!match) return false;
  const y1 = Number(match[2]);
  const y2 = Number(match[4]);
  return y1 < -0.001 || y1 > 1.001 || y2 < -0.001 || y2 > 1.001;
}

export function slideDelta(from, to) {
  return {
    dx: (Number(from?.x) || 0) - (Number(to?.x) || 0),
    dy: (Number(from?.y) || 0) - (Number(to?.y) || 0),
  };
}

/**
 * deal — new card flies from the stock
 * move — zone or pile changed, or the drag ghost is the origin
 * nudge — waste fan shifts sideways
 * still — same pile, ignore peek reflow
 * appear — a buried card revealed in place
 */
export function classifySlide({ prev, next, delta, fromGhost = false, deal = false }) {
  const dist = Math.hypot(delta?.dx || 0, delta?.dy || 0);
  if (!prev) {
    if (!deal) return "appear";
    return dist > MOVE_PX ? "deal" : "still";
  }
  const zoneChanged = prev.zone !== next.zone || String(prev.index ?? "") !== String(next.index ?? "");
  if ((zoneChanged || fromGhost) && dist > MOVE_PX) return "move";
  if (next.zone === "waste" && dist > WASTE_NUDGE_PX) return "nudge";
  return "still";
}

export function profileFromTokens({
  reduced = false,
  fast = false,
  instant = false,
  ms = 200,
  fastMs = 120,
  gentle = false,
  ease = "ease-out",
} = {}) {
  if (reduced || instant) {
    return { ms: 0, ease: "linear", instant: true, gentle: false, overshoot: false };
  }
  const duration = Math.max(0, fast ? fastMs : ms);
  return {
    ms: duration,
    ease: ease || "ease-out",
    instant: duration <= 0,
    gentle: !!gentle,
    overshoot: easeOvershoots(ease),
  };
}

function prefersReduced() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

function readCssNumber(style, name, fallback) {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readCssMs(style, name, fallback) {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallback;
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("ms")) return value;
  if (raw.endsWith("s")) return value * 1000;
  return value;
}

function readProfile(fast, instant) {
  let ms = 200;
  let fastMs = 120;
  let gentle = false;
  let ease = "ease-out";
  try {
    const style = getComputedStyle(document.documentElement);
    ms = readCssMs(style, "--slide-ms", ms);
    fastMs = readCssMs(style, "--slide-fast-ms", fastMs);
    gentle = readCssNumber(style, "--slide-gentle", 0) > 0;
    const named = style.getPropertyValue("--slide-ease").trim();
    if (named) ease = named;
  } catch {
    /* keep classic defaults when computed style is unavailable */
  }
  return profileFromTokens({ reduced: prefersReduced(), fast, instant, ms, fastMs, gentle, ease });
}

export function captureRects(root) {
  const map = new Map();
  if (!root?.querySelectorAll) return map;
  for (const el of root.querySelectorAll(".card[data-id]")) {
    const id = el.dataset.id;
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    map.set(id, {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
      zone: el.dataset.zone || "",
      index: el.dataset.index ?? "",
    });
  }
  return map;
}

function stockOrigin(root) {
  const slot = root.querySelector?.(".slot.stock, .slot.kc-stock");
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  if (rect.width < 1) return null;
  return { x: rect.left, y: rect.top };
}

function savedStyle(card) {
  return {
    margin: card.style.margin,
    position: card.style.position,
    inset: card.style.inset,
    top: card.style.top,
    right: card.style.right,
    bottom: card.style.bottom,
    left: card.style.left,
    width: card.style.width,
    height: card.style.height,
    pointerEvents: card.style.pointerEvents,
  };
}

function restoreCard(card, saved) {
  if (!card || !saved) return;
  card.style.margin = saved.margin;
  card.style.position = saved.position;
  card.style.inset = saved.inset;
  card.style.top = saved.top;
  card.style.right = saved.right;
  card.style.bottom = saved.bottom;
  card.style.left = saved.left;
  card.style.width = saved.width;
  card.style.height = saved.height;
  card.style.pointerEvents = saved.pointerEvents;
}

function unwrap(job) {
  const { card, host, saved, owned } = job;
  if (!owned || !card || !host) return;
  restoreCard(card, saved);
  if (card.parentElement === host) host.replaceWith(card);
}

function clearHostMotion(host) {
  if (!host) return;
  host.style.transition = "";
  host.style.transform = "";
  host.classList.remove("is-sliding");
  delete host.dataset.sliding;
  host.getAnimations?.().forEach((anim) => {
    try {
      anim.cancel();
    } catch {
      /* already gone */
    }
  });
}

function wrapCard(card) {
  const parent = card.parentElement;
  if (!parent) return null;
  const before = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const saved = savedStyle(card);
  const host = document.createElement("div");
  host.className = "card-slide";
  host.style.boxSizing = "border-box";
  host.style.width = `${before.width}px`;
  host.style.height = `${before.height}px`;
  host.style.marginTop = cs.marginTop;
  host.style.marginRight = cs.marginRight;
  host.style.marginBottom = cs.marginBottom;
  host.style.marginLeft = cs.marginLeft;
  host.style.pointerEvents = "none";
  if (cs.zIndex && cs.zIndex !== "auto") host.style.zIndex = cs.zIndex;
  if (cs.position === "absolute" || cs.position === "fixed") {
    host.style.position = cs.position;
    host.style.top = cs.top;
    host.style.left = cs.left;
    if (cs.right !== "auto") host.style.right = cs.right;
  } else {
    host.style.position = "relative";
  }
  parent.insertBefore(host, card);
  host.appendChild(card);
  card.style.margin = "0";
  card.style.position = "absolute";
  card.style.inset = "0";
  card.style.width = "auto";
  card.style.height = "auto";
  card.style.pointerEvents = "auto";
  return { card, host, saved, owned: true };
}

function paintInvert(job) {
  const host = job.host;
  if (!host?.isConnected) return;
  host.style.transform = "none";
  const fresh = job.card.getBoundingClientRect();
  const dx = job.sourceX - fresh.left;
  const dy = job.sourceY - fresh.top;
  job.dx = dx;
  job.dy = dy;
  if (Math.hypot(dx, dy) <= MOVE_PX) {
    clearHostMotion(host);
    unwrap(job);
    job.dead = true;
    return;
  }
  host.classList.add("is-sliding");
  host.dataset.sliding = "1";
  host.dataset.slideMs = String(job.ms);
  host.dataset.slideEase = job.ease;
  host.dataset.slideGentle = job.gentle ? "1" : "0";
  const z = parseInt(host.style.zIndex || "0", 10) || 0;
  host.style.zIndex = String(Math.max(z, 30));
  host.style.transform = `translate(${dx}px, ${dy}px)`;
}

export function createSlides() {
  let runId = 0;
  let chainToken = 0;
  let pending = Promise.resolve();
  let resolvePending = () => {};
  let jobs = [];
  let override = null;
  let flags = { fast: false, deal: false, instant: false };
  let activeRun = 0;

  const SWEEP_MS = 120;
  const KEEP_FRAMES = 3;

  function sample(run) {
    if (run !== activeRun) return;
    const now = performance.now();
    for (const job of jobs) {
      if (!job.card?.isConnected) continue;
      const r = job.card.getBoundingClientRect();
      // Keep the last few frames even when they are old: if rAF stalls while the
      // animation clock runs (WebKit), the card jumps far between two samples, and
      // the box the user aimed at is the one from before the gap.
      const prior = job.seen || [];
      job.seen = prior.filter((it, k) => now - it.t <= SWEEP_MS || k >= prior.length - KEEP_FRAMES);
      job.seen.push({ t: now, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }

  function pump(run) {
    if (run !== activeRun) return;
    sample(run);
    requestAnimationFrame(() => pump(run));
  }

  /**
   * The moving card a press at (x, y) is aimed at, read before anything snaps.
   * A press lands a frame or two after the eye saw the card, so the area it
   * swept over the last few frames counts too. Topmost (latest) job wins.
   */
  function pickAt(x, y) {
    const run = activeRun;
    const inside = (a) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom;
    if (!run) return pickRecent(inside);
    sample(run);

    for (let i = jobs.length - 1; i >= 0; i--) {
      const seen = jobs[i].seen || [];
      if (seen.length && inside(seen[seen.length - 1])) return jobs[i].card;
    }
    for (let i = jobs.length - 1; i >= 0; i--) {
      // Only a card still in flight can claim the strip it just crossed.
      const state = jobs[i].anim?.playState;
      if (state === "idle" || state === "finished") continue;
      const seen = jobs[i].seen || [];
      for (let k = 1; k < seen.length; k++) {
        const a = seen[k - 1];
        const b = seen[k];
        const box = {
          left: Math.min(a.left, b.left),
          right: Math.max(a.right, b.right),
          top: Math.min(a.top, b.top),
          bottom: Math.max(a.bottom, b.bottom),
        };
        if (inside(box)) return jobs[i].card;
      }
    }
    return null;
  }

  /**
   * A slide can end entirely inside a stalled stretch of frames (WebKit), so
   * the press arrives after settle while the user still saw the card mid-way.
   * For a short grace period after settle, the boxes it was last painted at
   * still claim the press.
   */
  let recent = null;
  const GRACE_MS = 200;

  function pickRecent(inside) {
    if (!recent || performance.now() - recent.t > GRACE_MS) return null;
    for (let i = recent.jobs.length - 1; i >= 0; i--) {
      const { card, seen } = recent.jobs[i];
      if (!card?.isConnected) continue;
      for (let k = 0; k < seen.length; k++) {
        const a = seen[k];
        const b = seen[k + 1] || a;
        const box = {
          left: Math.min(a.left, b.left),
          right: Math.max(a.right, b.right),
          top: Math.min(a.top, b.top),
          bottom: Math.max(a.bottom, b.bottom),
        };
        if (inside(box)) return card;
      }
    }
    return null;
  }

  function settle(run) {
    if (run !== activeRun) return;
    recent = { t: performance.now(), jobs: jobs.map((job) => ({ card: job.card, seen: job.seen || [] })) };
    for (const job of jobs) {
      clearHostMotion(job.host);
      unwrap(job);
    }
    jobs = [];
    activeRun = 0;
    const resolve = resolvePending;
    resolvePending = () => {};
    pending = Promise.resolve();
    resolve();
  }

  function finishNow() {
    const run = activeRun;
    if (!run) return;
    for (const job of jobs) {
      try {
        job.anim?.finish();
      } catch {
        /* detached node */
      }
    }
    settle(run);
  }

  function interrupt() {
    chainToken += 1;
    flags = { fast: false, deal: false, instant: false };
    override = null;
    finishNow();
    return chainToken;
  }

  function beginChain() {
    chainToken += 1;
    return chainToken;
  }

  function chainIs(token) {
    return token === chainToken;
  }

  function prefer(rects) {
    if (rects?.size) override = rects;
  }

  function clearPrefer() {
    override = null;
  }

  function setFast(on) {
    flags.fast = !!on;
  }

  function setDeal(on) {
    flags.deal = !!on;
  }

  function setInstant(on) {
    flags.instant = !!on;
  }

  function running() {
    return jobs.some((job) => job.host?.isConnected && job.host.classList.contains("is-sliding") && !job.dead);
  }

  function whenDone() {
    return pending;
  }

  function play(root, before, extra = {}) {
    const opts = {
      fast: flags.fast || !!extra.fast,
      deal: flags.deal || !!extra.deal,
      instant: flags.instant || !!extra.instant,
    };
    flags = { fast: false, deal: false, instant: false };
    const from = before instanceof Map ? new Map(before) : new Map();
    if (override) {
      for (const [id, ghost] of override) {
        const prev = from.get(id);
        from.set(id, {
          zone: prev?.zone ?? ghost.zone ?? "",
          index: prev?.index ?? ghost.index ?? "",
          x: ghost.x,
          y: ghost.y,
          w: ghost.w,
          h: ghost.h,
          fromGhost: true,
        });
      }
      override = null;
    }

    finishNow();
    const run = ++runId;
    activeRun = run;
    pending = new Promise((resolve) => {
      resolvePending = resolve;
    });

    const profile = readProfile(!!opts.fast, !!opts.instant);
    if (!root || profile.instant) {
      settle(run);
      return pending;
    }

    const deal = !!opts.deal;
    const origin = stockOrigin(root);
    const cards = [...root.querySelectorAll(".card[data-id]")].filter((el) => !el.closest("#drag-layer"));
    const seen = new Set();
    const planned = [];
    for (const card of cards) {
      const id = card.dataset.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const now = card.getBoundingClientRect();
      const prev = from.get(id) || null;
      const next = { zone: card.dataset.zone || "", index: card.dataset.index ?? "" };
      // Cards that were under the stock (a draw of more than the visible top) spawn from that slot.
      const fromStock = !prev && (deal || next.zone === "waste");
      const source = prev || (fromStock && origin ? { x: origin.x, y: origin.y, zone: "", index: "" } : null);
      if (!source) continue;
      const full = slideDelta(source, now);
      const kind = classifySlide({
        prev: prev ? { zone: prev.zone, index: prev.index } : null,
        next,
        delta: full,
        fromGhost: !!prev?.fromGhost,
        deal: fromStock,
      });
      if (kind === "still" || kind === "appear") continue;
      planned.push({ card, sourceX: source.x, sourceY: source.y });
    }

    if (!planned.length) {
      settle(run);
      return pending;
    }

    for (const item of planned) {
      const wrapped = wrapCard(item.card);
      if (!wrapped) continue;
      jobs.push({
        ...wrapped,
        sourceX: item.sourceX,
        sourceY: item.sourceY,
        ms: profile.ms,
        ease: profile.ease,
        gentle: profile.gentle,
        dead: false,
        anim: null,
      });
    }
    for (const job of jobs) paintInvert(job);
    jobs = jobs.filter((job) => !job.dead);
    if (!jobs.length) {
      settle(run);
      return pending;
    }
    sample(run);

    const beginMotion = () => {
      if (run !== activeRun) return;
      let pendingAnims = 0;
      for (const job of jobs) {
        if (!job.host?.isConnected || job.dead) continue;
        let anim;
        try {
          anim = job.host.animate(
            [{ transform: `translate(${job.dx}px, ${job.dy}px)` }, { transform: "translate(0px, 0px)" }],
            { duration: profile.ms, easing: profile.ease, fill: "both" },
          );
        } catch {
          anim = job.host.animate(
            [{ transform: `translate(${job.dx}px, ${job.dy}px)` }, { transform: "translate(0px, 0px)" }],
            { duration: profile.ms, easing: "ease-out", fill: "both" },
          );
        }
        job.anim = anim;
        pendingAnims += 1;
        anim.onfinish = () => {
          pendingAnims -= 1;
          if (pendingAnims <= 0) settle(run);
        };
      }
      if (!pendingAnims) settle(run);
      else {
        window.setTimeout(() => settle(run), profile.ms + 120);
      }
    };

    requestAnimationFrame(() => {
      if (run !== activeRun) return;
      for (const job of jobs) paintInvert(job);
      jobs = jobs.filter((job) => !job.dead);
      if (!jobs.length) {
        settle(run);
        return;
      }
      sample(run);
      requestAnimationFrame(beginMotion);
      requestAnimationFrame(() => pump(run));
    });

    return pending;
  }

  return {
    capture: captureRects,
    prefer,
    clearPrefer,
    setFast,
    setDeal,
    setInstant,
    play,
    finishNow,
    interrupt,
    pickAt,
    beginChain,
    chainIs,
    whenDone,
    running,
  };
}
