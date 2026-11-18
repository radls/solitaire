import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_SHA, APP_VERSION, appVersionLabel } from "../src/app-version.js";
import { resolveBuildSha } from "../scripts/resolve-build-sha.js";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function gitExec(args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8" });
}

describe("appVersionLabel", () => {
  it("formats a version and short SHA with a middle dot", () => {
    expect(appVersionLabel("1.1.0", "da6d54b")).toBe("v1.1.0 · da6d54b");
    expect(appVersionLabel("1.1.0", "local")).toBe("v1.1.0 · local");
  });

  it("uses the package.json version and the SHA from resolveBuildSha", () => {
    const sha = resolveBuildSha({ env: process.env, root, exec: gitExec, realpath: realpathSync });
    expect(APP_VERSION).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_SHA).toBe(sha);
    expect(appVersionLabel()).toBe(`v${pkg.version} · ${sha}`);
  });
});

describe("resolveBuildSha", () => {
  it("uses a valid GITHUB_SHA and slices it to 7 lowercase characters", () => {
    expect(resolveBuildSha({
      env: { GITHUB_SHA: "22b75049f19bd57bf0eb6e72e9a5f1b59b701e80" },
      root: "/nope",
      exec: () => { throw new Error("git should not run"); },
    })).toBe("22b7504");
  });

  it("lowercases an uppercase GITHUB_SHA", () => {
    expect(resolveBuildSha({
      env: { GITHUB_SHA: "22B75049F19BD57BF0EB6E72E9A5F1B59B701E80" },
    })).toBe("22b7504");
  });

  it("falls back to local for a malformed GITHUB_SHA when git is unavailable", () => {
    expect(resolveBuildSha({
      env: { GITHUB_SHA: "not-a-sha" },
      root: "/tmp",
      exec: () => { throw new Error("no git"); },
      realpath: realpathSync,
    })).toBe("local");
  });

  it("falls back to local when there is no env and no git", () => {
    expect(resolveBuildSha({ env: {} })).toBe("local");
    expect(resolveBuildSha({
      env: {},
      root: "/tmp",
      exec: () => { throw new Error("no git"); },
      realpath: realpathSync,
    })).toBe("local");
  });

  it("ignores a parent git repo and falls back to local", () => {
    const parent = mkdtempSync(join(tmpdir(), "sol-outer-"));
    const app = join(parent, "app");
    try {
      mkdirSync(app);
      writeFileSync(join(parent, "README"), "outer\n");
      gitExec(["git", "-C", parent, "init", "-q"]);
      gitExec(["git", "-C", parent, "config", "user.email", "test@example.com"]);
      gitExec(["git", "-C", parent, "config", "user.name", "Test"]);
      gitExec(["git", "-C", parent, "add", "README"]);
      gitExec(["git", "-C", parent, "commit", "-qm", "outer"]);
      expect(resolveBuildSha({
        env: {},
        root: app,
        exec: gitExec,
        realpath: realpathSync,
      })).toBe("local");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("uses HEAD when root is this repository", () => {
    const head = gitExec(["git", "-C", root, "rev-parse", "HEAD"]).trim().slice(0, 7).toLowerCase();
    expect(head).toMatch(/^[0-9a-f]{7}$/);
    expect(resolveBuildSha({
      env: {},
      root,
      exec: gitExec,
      realpath: realpathSync,
    })).toBe(head);
  });
});
