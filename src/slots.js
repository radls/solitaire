/** Casual game and daily deal, stored side by side. */

export function isDailyBoard(state) {
  return !!(state && state.daily && !state.pick);
}

export function takeSlots(record, { nested = false } = {}) {
  let casual = null;
  if (nested) {
    if (record?.saved?.state) casual = record.saved;
  } else if (record?.state) {
    casual = {
      state: record.state,
      history: Array.isArray(record.history) ? record.history : [],
      savedAt: typeof record.savedAt === "number" ? record.savedAt : null,
    };
  }
  let daily = record?.dailySaved?.state ? record.dailySaved : null;
  let active = record?.active === "daily" ? "daily" : "casual";
  if (!daily && casual && isDailyBoard(casual.state)) {
    daily = casual;
    casual = null;
    active = "daily";
  }
  return { casual, daily, active };
}

/**
 * Write the live board into the slot it belongs to.
 * `dropCasual` drops a finished casual board (Klondike clears a won save).
 * A finished daily stays, so the same day can be shown again.
 */
export function placeBoard(slots, state, history, savedAt, { dropCasual } = {}) {
  const next = {
    casual: slots?.casual ?? null,
    daily: slots?.daily ?? null,
    active: slots?.active === "daily" ? "daily" : "casual",
  };
  if (!state) return next;
  const pack = {
    state,
    history: Array.isArray(history) ? history : [],
    savedAt: typeof savedAt === "number" ? savedAt : Date.now(),
  };
  if (isDailyBoard(state)) {
    next.daily = pack;
    next.active = "daily";
  } else if (typeof dropCasual === "function" && dropCasual(state)) {
    next.casual = null;
    next.active = "casual";
  } else {
    next.casual = pack;
    next.active = "casual";
  }
  return next;
}

export function flattenSlots(slots, { nested = false, stats, extra = {} } = {}) {
  const casual = slots?.casual ?? null;
  const daily = slots?.daily ?? null;
  const active = slots?.active === "daily" ? "daily" : "casual";
  if (nested) {
    return { ...extra, stats, saved: casual, dailySaved: daily, active };
  }
  return {
    ...extra,
    stats,
    state: casual?.state ?? null,
    history: casual?.history ?? [],
    savedAt: casual?.savedAt ?? null,
    dailySaved: daily,
    active,
  };
}

/**
 * Opening today's daily looks only at the daily slot.
 * `resume` is today's unfinished daily. `done` is today's finished daily.
 * Anything else is `deal`. The casual game is not part of this choice.
 */
export function dailyAlongsidePlan(dailyState, key, isFinished) {
  if (dailyState && dailyState.daily === key && !isFinished(dailyState)) return "resume";
  if (dailyState && dailyState.daily === key && isFinished(dailyState)) return "done";
  return "deal";
}

/** Abandoning a casual game resets the win streak. A daily never does. */
export function abandonsStreak(state, { toDaily = false } = {}) {
  if (toDaily) return false;
  if (!state || isDailyBoard(state)) return false;
  if (state.won || state.over || state.stuck) return false;
  return state.moves > 0;
}
