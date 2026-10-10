import { describe, expect, it } from "vitest";
import {
  elapsed,
  pauseClock,
  restoreClock,
  resumeClock,
  startClock,
  syncClock,
  transferClock,
} from "../src/game/clock.js";

function board(partial = {}) {
  return { startedAt: 0, pausedAt: 0, wonAt: null, ...partial };
}

describe("fair play clock", () => {
  it("stays at 0 until the first move starts it", () => {
    const state = board();
    expect(elapsed(state, 25_000)).toBe(0);
    pauseClock(state, 25_000);
    expect(state.pausedAt).toBe(0);
    startClock(state, 10_000);
    expect(state.startedAt).toBe(10_000);
    startClock(state, 99_000);
    expect(state.startedAt).toBe(10_000);
    expect(elapsed(state, 16_000)).toBe(6_000);
  });

  it("freezes while paused and shifts the start when play resumes", () => {
    const state = board({ startedAt: 10_000 });
    pauseClock(state, 18_000);
    pauseClock(state, 30_000);
    expect(state.pausedAt).toBe(18_000);
    expect(elapsed(state, 40_000)).toBe(8_000);
    resumeClock(state, 40_000);
    expect(state.pausedAt).toBe(0);
    expect(state.startedAt).toBe(32_000);
    expect(elapsed(state, 40_000)).toBe(8_000);
    expect(elapsed(state, 45_000)).toBe(13_000);
    resumeClock(state, 50_000);
    expect(state.startedAt).toBe(32_000);
  });

  it("keeps a finished time stable across a pause", () => {
    const state = board({ startedAt: 10_000, wonAt: 25_000 });
    expect(elapsed(state, 90_000)).toBe(15_000);
    pauseClock(state, 26_000);
    expect(elapsed(state, 80_000)).toBe(15_000);
    resumeClock(state, 46_000);
    expect(elapsed(state, 100_000)).toBe(15_000);
    expect(state.wonAt - state.startedAt).toBe(15_000);
  });

  it("syncClock pauses and resumes from one flag", () => {
    const state = board({ startedAt: 1_000 });
    syncClock(state, true, 4_000);
    expect(elapsed(state, 9_000)).toBe(3_000);
    syncClock(state, false, 9_000);
    expect(state.startedAt).toBe(6_000);
    expect(elapsed(state, 9_000)).toBe(3_000);
  });

  it("restores a running deal and leaves an unstarted deal at 0:00", () => {
    const running = board({ startedAt: 5_000 });
    restoreClock(running, 12_000, 50_000);
    expect(running.startedAt).toBe(43_000);
    expect(elapsed(running, 50_000)).toBe(7_000);
    expect(running.pausedAt).toBe(0);

    const paused = board({ startedAt: 5_000, pausedAt: 9_000 });
    restoreClock(paused, 20_000, 50_000);
    expect(elapsed(paused, 50_000)).toBe(4_000);
    expect(paused.pausedAt).toBe(0);

    const fresh = board({ startedAt: 0 });
    restoreClock(fresh, 20_000, 50_000);
    expect(fresh.startedAt).toBe(0);
    expect(elapsed(fresh, 80_000)).toBe(0);
  });

  it("copies the live clock onto an undo snapshot", () => {
    const live = board({ startedAt: 8_000, pausedAt: 12_000 });
    const snapshot = board({ startedAt: 0, moves: 0 });
    transferClock(live, snapshot);
    expect(snapshot.startedAt).toBe(8_000);
    expect(snapshot.pausedAt).toBe(12_000);
    expect(live.startedAt).toBe(8_000);
  });
});
