import { afterEach, describe, expect, it } from "vitest";
import { motionPolicy, paintDragTilt, smoothAxis, stepTilt } from "../src/motion.js";

function ghost() {
  const props = {};
  return {
    style: {
      setProperty(name, value) {
        props[name] = value;
      },
    },
    dataset: {},
    props,
  };
}

describe("drag physics", () => {
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  it("keeps a lean for a frame after the pointer stops", () => {
    const drag = { tilt: 4, vx: 1.2, tiltX: 20, tiltT: 0 };
    const el = ghost();
    const tilt = paintDragTilt(el, drag, 20, 16, 10);
    expect(Math.abs(tilt)).toBeGreaterThan(1);
    expect(drag.vx).toBeGreaterThan(0.4);
    expect(drag.vx).toBeLessThan(1.2);
    expect(el.props["--card-drag-ry"]).not.toBe("0.00deg");
  });

  it("bends with vertical speed and stays inside the clamp", () => {
    const drag = {};
    const el = ghost();
    let tilt = 0;
    for (let i = 0; i <= 8; i += 1) tilt = paintDragTilt(el, drag, i * 18, i * 16, i * 14);
    expect(Math.abs(tilt)).toBeLessThanOrEqual(6);
    expect(Math.abs(tilt)).toBeGreaterThan(0);
    const bend = Math.abs(parseFloat(el.props["--card-drag-rx"]));
    expect(bend).toBeGreaterThan(0);
    expect(bend).toBeLessThanOrEqual(6 * 0.55 + 0.01);
  });

  it("eases back to flat after the pointer rests", () => {
    const drag = {};
    const el = ghost();
    for (let i = 1; i <= 6; i += 1) paintDragTilt(el, drag, i * 24, i * 16, 0);
    for (let i = 7; i <= 90; i += 1) paintDragTilt(el, drag, 144, i * 16, 0);
    expect(drag.tilt).toBe(0);
    expect(drag.vx).toBe(0);
  });

  it("drops the wobble when reduced motion is on", () => {
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    globalThis.document = { documentElement: { dataset: { theme: "classic" } } };
    const drag = { tilt: 5, vx: 2, tiltX: 0, tiltT: 0 };
    const el = ghost();
    expect(paintDragTilt(el, drag, 40, 16, 10)).toBe(0);
    expect(el.dataset.tilt).toBe("0.00");
    expect(el.props["--card-tilt"]).toBe("0.00deg");
    expect(el.props["--card-drag-ry"]).toBe("0.00deg");
  });

  it("keeps a bedtime drag level, with no velocity tilt", () => {
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    globalThis.document = { documentElement: { dataset: { theme: "night" } } };
    const drag = { tilt: 5, vx: 2, tiltX: 0, tiltT: 0 };
    const el = ghost();
    expect(paintDragTilt(el, drag, 40, 16, 10)).toBe(0);
    expect(el.dataset.tilt).toBe("0.00");
    expect(el.props["--card-tilt"]).toBe("0.00deg");
    expect(el.props["--card-drag-ry"]).toBe("0.00deg");
    expect(el.props["--card-drag-rx"]).toBe("0.00deg");
  });

  it("turns wobble and bounce off in bedtime, keeps a quiet sheen, and turns all motion off when reduced", () => {
    expect(motionPolicy({ reduce: false, bedtime: false })).toMatchObject({
      dragWobble: true,
      settleBounce: true,
      sheenMotion: true,
      sheenQuiet: false,
    });
    expect(motionPolicy({ reduce: false, bedtime: true })).toMatchObject({
      dragWobble: false,
      settleBounce: false,
      sheenMotion: true,
      sheenQuiet: true,
    });
    expect(motionPolicy({ reduce: true, bedtime: false })).toMatchObject({
      dragWobble: false,
      settleBounce: false,
      sheenMotion: false,
      sheenQuiet: true,
    });
    expect(motionPolicy({ reduce: true, bedtime: true })).toMatchObject({
      dragWobble: false,
      settleBounce: false,
      sheenMotion: false,
      sheenQuiet: true,
    });
    const eased = smoothAxis(2, 0);
    expect(eased).toBeGreaterThan(0.8);
    expect(eased).toBeLessThan(2);
    expect(stepTilt(3, 0, 6)).toBeGreaterThan(1);
  });
});
