/** Build-time version and short SHA, injected by Vite from package.json and git. */

export const APP_VERSION = __APP_VERSION__;
export const APP_SHA = __APP_SHA__;

/** Label shown on the Games picker, e.g. "v1.3.0 · da6d54b". */
export function appVersionLabel(version = APP_VERSION, sha = APP_SHA) {
  return `v${version} · ${sha}`;
}
