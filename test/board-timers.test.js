import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleGlowClear, stopBoardPaint } from "../src/board-timers.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("board glow timer", () => {
  it("does not repaint after the board is left", () => {
    vi.useFakeTimers();
    const session = { alive: true, glowTimer: 0 };
    let paints = 0;
    scheduleGlowClear(session, () => {
      paints += 1;
    });
    stopBoardPaint(session);
    vi.advanceTimersByTime(2000);
    expect(paints).toBe(0);
    expect(session.alive).toBe(false);
    expect(session.glowTimer).toBe(0);
  });

  it("repaints while the board is still on screen", () => {
    vi.useFakeTimers();
    const session = { alive: true, glowTimer: 0 };
    let paints = 0;
    scheduleGlowClear(session, () => {
      paints += 1;
    });
    vi.advanceTimersByTime(1800);
    expect(paints).toBe(1);
  });
});
