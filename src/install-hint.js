import { load, loadFreeCell, loadGolf, loadKings, loadPrefs, savePrefs } from "./storage.js";

/**
 * Whether the home-screen hint may appear.
 * Pure: no storage, no display mode, no DOM.
 * Show after at least one win (Golf counts a cleared round), and never again
 * once the player dismisses it or installs, and never in a standalone window.
 */
export function shouldShowInstallHint(prefs, { standalone, totalWins } = {}) {
  if (standalone) return false;
  const hint = prefs && typeof prefs === "object" ? prefs.installHint : null;
  if (hint === "dismissed" || hint === "installed") return false;
  const wins = Number(totalWins);
  return Number.isFinite(wins) && wins >= 1;
}

export function isStandaloneDisplay() {
  try {
    if (typeof navigator !== "undefined" && navigator.standalone) return true;
    if (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function recordedWins() {
  const klondike = load()?.stats?.won || 0;
  const freecell = loadFreeCell()?.stats?.won || 0;
  const golf = loadGolf()?.stats?.cleared || 0;
  const kings = loadKings()?.stats?.won || 0;
  return klondike + freecell + golf + kings;
}

let deferredPrompt = null;
let wired = false;

function hintEl() {
  return typeof document === "undefined" ? null : document.getElementById("install-hint");
}

function refit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("resize"));
}

function syncInstallActions() {
  const go = typeof document === "undefined" ? null : document.getElementById("install-go");
  const share = typeof document === "undefined" ? null : document.getElementById("install-share");
  const canInstall = !!deferredPrompt;
  if (go) go.hidden = !canInstall;
  if (share) share.hidden = canInstall;
}

export function hideInstallHint() {
  const el = hintEl();
  if (!el || el.hidden) return;
  el.hidden = true;
  refit();
}

function remember(installHint) {
  savePrefs({ installHint });
  hideInstallHint();
}

export function bootInstallHint() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    syncInstallActions();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    remember("installed");
  });
  document.getElementById("install-dismiss")?.addEventListener("click", () => {
    remember("dismissed");
  });
  document.getElementById("install-go")?.addEventListener("click", async () => {
    const promptEvent = deferredPrompt;
    if (!promptEvent) return;
    deferredPrompt = null;
    syncInstallActions();
    let outcome = "dismissed";
    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") outcome = "installed";
    } catch {
      outcome = "dismissed";
    }
    remember(outcome);
  });
}

/** After a win screen closes. Reads stored wins; Golf's cleared rounds count. */
export function offerInstallHint() {
  if (typeof document === "undefined") return;
  const el = hintEl();
  if (!el) return;
  const prefs = loadPrefs();
  if (!shouldShowInstallHint(prefs, { standalone: isStandaloneDisplay(), totalWins: recordedWins() })) return;
  syncInstallActions();
  if (!el.hidden) return;
  el.hidden = false;
  refit();
}
