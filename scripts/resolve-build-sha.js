/** Resolve the short SHA shown on the Games picker. Always returns a string; never throws. */

function fromEnv(env) {
  const raw = String(env?.GITHUB_SHA ?? "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(raw)) return raw.slice(0, 7).toLowerCase();
  return null;
}

function samePath(realpath, a, b) {
  try {
    return realpath(a) === realpath(b);
  } catch {
    return false;
  }
}

/**
 * @param {{ env?: Record<string, string | undefined>, root?: string, exec?: (args: string[]) => string, realpath?: (path: string) => string }} [opts]
 * @returns {string} 7-char lowercase SHA, or "local" when SHA/git can't be trusted
 */
export function resolveBuildSha({ env = {}, root, exec, realpath } = {}) {
  try {
    const sha = fromEnv(env);
    if (sha) return sha;
    if (typeof exec !== "function" || typeof realpath !== "function" || !root) return "local";
    const toplevel = String(exec(["git", "-C", root, "rev-parse", "--show-toplevel"]) ?? "").trim();
    if (!toplevel || !samePath(realpath, toplevel, root)) return "local";
    const full = String(exec(["git", "-C", root, "rev-parse", "HEAD"]) ?? "").trim();
    if (/^[0-9a-f]{7,40}$/i.test(full)) return full.slice(0, 7).toLowerCase();
  } catch {
    // No git, a parent repo, or a failed exec — use the fallback.
  }
  return "local";
}
