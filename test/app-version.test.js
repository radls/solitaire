import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { APP_SHA, APP_VERSION, appVersionLabel } from "../src/app-version.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function expectedSha() {
  const env = (process.env.GITHUB_SHA || "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(env)) return env.slice(0, 7).toLowerCase();
  return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim().slice(0, 7).toLowerCase();
}

describe("appVersionLabel", () => {
  it("formats a version and short SHA with a middle dot", () => {
    expect(appVersionLabel("1.1.0", "da6d54b")).toBe("v1.1.0 · da6d54b");
  });

  it("uses the package.json version and the commit being built", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_SHA).toMatch(/^[0-9a-f]{7}$/);
    expect(APP_SHA).toBe(expectedSha());
    expect(appVersionLabel()).toBe(`v${pkg.version} · ${expectedSha()}`);
    expect(appVersionLabel()).toMatch(/^v\d+\.\d+\.\d+ · [0-9a-f]{7}$/);
  });
});
