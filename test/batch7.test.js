import { describe, expect, it } from "vitest";
import { stepTilt } from "../src/motion.js";

describe("card tilt", () => {
  it("eases toward the clamp and never passes it", () => {
    let tilt = 0;
    for (let i = 0; i < 16; i++) tilt = stepTilt(tilt, 4, 6);
    expect(tilt).toBeLessThanOrEqual(6);
    expect(tilt).toBeGreaterThan(5);
  });

  it("uses the smaller bedtime clamp", () => {
    let tilt = 0;
    for (let i = 0; i < 16; i++) tilt = stepTilt(tilt, 4, 3);
    expect(tilt).toBeLessThanOrEqual(3);
    expect(tilt).toBeGreaterThan(2.5);
    expect(tilt).toBeLessThan(6);
  });

  it("settles back to 0 when horizontal velocity stops", () => {
    let tilt = stepTilt(5, 0, 6);
    for (let i = 0; i < 24; i++) tilt = stepTilt(tilt, 0, 6);
    expect(tilt).toBe(0);
  });

  it("leans the other way for a leftward drag", () => {
    let tilt = 0;
    for (let i = 0; i < 16; i++) tilt = stepTilt(tilt, -4, 6);
    expect(tilt).toBeLessThan(-5);
    expect(tilt).toBeGreaterThanOrEqual(-6);
  });
});
