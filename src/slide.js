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

const NAMED_EASE = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Progress (may exceed 1 for overshoot) of a CSS easing at linear time p in [0, 1]. */
export function easeAt(ease, p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const m = String(ease || "").match(/cubic-bezier\(([^)]+)\)/);
  const pts = m ? m[1].split(",").map(Number) : NAMED_EASE[String(ease).trim()] || NAMED_EASE["ease-out"];
  const [x1, y1, x2, y2] = pts.length === 4 && pts.every(Number.isFinite) ? pts : NAMED_EASE["ease-out"];
  const bez = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (bez(x1, x2, mid) < p) lo = mid;
    else hi = mid;
  }
  return bez(y1, y2, (lo + hi) / 2);
}

/** Top-left of a sliding card `elapsed` ms into its motion (before 0: start box). */
export function slideBoxAt(b, ease, ms, elapsed) {
  const k = ms > 0 ? easeAt(ease, elapsed / ms) : 1;
  return { left: b.x0 + (b.x1 - b.x0) * k, top: b.y0 + (b.y1 - b.y0) * k };
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

  // A press is aimed at where the eye last saw a moving card, which trails the
  // live position (and in WebKit, stalled frames can let the slide finish before
  // the press is handled). The slide path is a pure function of time, so a press
  // claims a card if it falls inside the card's box at any moment in the last
  // AIM_LAG_MS of its motion. Nothing depends on which frames were painted.
  const AIM_LAG_MS = 100;
  let flight = { motionT: null, ms: 0, ease: "linear", boxes: [] };

  function pickAt(x, y) {
    const now = performance.now();
    const f = flight;
    if (!f.boxes.length) return null;
    const start = f.motionT ?? now; // not moving yet: still at the start box
    if (now - start > f.ms + AIM_LAG_MS) return null;
    for (let i = f.boxes.length - 1; i >= 0; i--) {
      const b = f.boxes[i];
      if (!b.card?.isConnected) continue;
      for (let back = 0; back <= AIM_LAG_MS; back += 8) {
        const box = slideBoxAt(b, f.ease, f.ms, now - back - start);
        if (x >= box.left && x <= box.left + b.w && y >= box.top && y <= box.top + b.h) return b.card;
      }
    }
    return null;
  }

  function settle(run) {
    if (run !== activeRun) return;
    // Ended before motion began: the aim window closes AIM_LAG_MS from now.
    if (flight.motionT == null) flight.motionT = performance.now() - flight.ms;
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
      const r = prev || now;
      planned.push({ card, sourceX: source.x, sourceY: source.y, destX: now.left, destY: now.top, w: r.w ?? r.width, h: r.h ?? r.height, fromStock: !prev });
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
        destX: item.destX,
        destY: item.destY,
        w: item.w,
        h: item.h,
        fromStock: item.fromStock,
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
    flight = {
      motionT: null,
      ms: profile.ms,
      ease: profile.ease,
      boxes: jobs
        .filter((job) => !job.fromStock)
        .map((job) => ({ card: job.card, x0: job.sourceX, y0: job.sourceY, x1: job.destX, y1: job.destY, w: job.w, h: job.h })),
    };

    const beginMotion = () => {
      if (run !== activeRun) return;
      let pendingAnims = 0;
      flight.motionT = performance.now();
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
      requestAnimationFrame(beginMotion);
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
