/**
 * Fair play clock shared by every game.
 * `startedAt` of 0 or null means the player has not moved yet.
 * `pausedAt`, when set, freezes the clock (open overlay or a hidden tab).
 * `wonAt`, when set, is the result time. Resume shifts it with `startedAt`
 * so closing a win dialog does not shrink the recorded time.
 */

export function startClock(state, now = Date.now()) {
  if (!state || state.startedAt) return state;
  state.startedAt = now;
  return state;
}

export function pauseClock(state, now = Date.now()) {
  if (!state || !state.startedAt || state.pausedAt) return state;
  state.pausedAt = now;
  return state;
}

export function resumeClock(state, now = Date.now()) {
  if (!state || !state.pausedAt) return state;
  const delta = Math.max(0, now - state.pausedAt);
  state.startedAt += delta;
  if (state.wonAt) state.wonAt += delta;
  state.pausedAt = 0;
  return state;
}

/** Pause when `paused` is true, otherwise resume. A no-op clock stays unstarted. */
export function syncClock(state, paused, now = Date.now()) {
  if (!state) return state;
  return paused ? pauseClock(state, now) : resumeClock(state, now);
}

export function elapsed(state, now = Date.now()) {
  if (!state?.startedAt) return 0;
  let end = now;
  if (state.pausedAt) end = state.pausedAt;
  if (state.wonAt && state.wonAt < end) end = state.wonAt;
  return Math.max(0, end - state.startedAt);
}

/**
 * Rebuild `startedAt` after a reload so the saved elapsed time continues.
 * A deal that never started stays at 0. Pause is cleared; the caller pauses
 * again if it reopens a dialog. A missing `savedAt` keeps the previous
 * fallback: drop think-time and show the elapsed time as of `startedAt`.
 */
export function restoreClock(state, savedAt, now = Date.now()) {
  if (!state) return state;
  if (!state.startedAt) {
    state.startedAt = 0;
    state.pausedAt = 0;
    return state;
  }
  const at = typeof savedAt === "number" ? savedAt : state.startedAt;
  const frozen = elapsed(state, at);
  const nextStart = now - frozen;
  const delta = nextStart - state.startedAt;
  state.startedAt = nextStart;
  if (state.wonAt) state.wonAt += delta;
  state.pausedAt = 0;
  return state;
}

/** Copy the live clock onto an undo snapshot so elapsed time does not jump. */
export function transferClock(current, next) {
  if (!next) return next;
  next.startedAt = current?.startedAt || 0;
  next.pausedAt = current?.pausedAt || 0;
  return next;
}
