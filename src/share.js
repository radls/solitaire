/**
 * Share card after a finished daily deal (Batch 5 #1).
 * No accounts: the text and a link to the same deal go to the Web Share API,
 * or to the clipboard when sharing is not available.
 */
const NAMES = { klondike: "Klondike", freecell: "FreeCell", golf: "Golf", kings: "King's Corners" };
const BASE = "https://radls.github.io/solitaire/";

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Link that opens the exact same deal: a seed (or FreeCell deal number) in the URL. */
export function shareUrl(game, { seed, drawCount } = {}, base = BASE) {
  const params = new URLSearchParams({ game });
  if (game === "freecell") params.set("deal", String(seed));
  else params.set("seed", String(seed));
  if (game === "klondike" && (drawCount === 1 || drawCount === 3)) params.set("draw", String(drawCount));
  return `${base}?${params.toString()}`;
}

export function shareText({ game, dateLabel, time, moves, streak }) {
  const name = NAMES[game] || game;
  const n = Number(streak) || 0;
  const parts = [];
  if (time) parts.push(time);
  parts.push(`${moves} ${Number(moves) === 1 ? "move" : "moves"}`);
  parts.push(`${n} ${n === 1 ? "day" : "days"} in a row`);
  return `Solitaire · ${name} daily${dateLabel ? ` (${dateLabel})` : ""}: ${parts.join(" · ")}. Play the same deal:`;
}

export function shareCardHTML(info) {
  const text = shareText(info);
  const url = shareUrl(info.game, info);
  return `<div class="share-card" data-testid="share-card">
      <p class="share-copy" data-testid="share-text">${esc(text)}</p>
      <button type="button" class="btn share-btn" data-share="1" data-testid="share-btn" data-text="${esc(text)}" data-url="${esc(url)}">Share</button>
      <p class="share-note" data-testid="share-note" aria-live="polite"></p>
    </div>`;
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the textarea copy */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

let wired = false;
export function wireShare() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener(
    "click",
    async (event) => {
      const btn = event.target.closest?.("[data-share]");
      if (!btn) return;
      event.stopPropagation();
      const text = btn.dataset.text || "";
      const url = btn.dataset.url || "";
      const note = btn.parentElement?.querySelector(".share-note");
      if (navigator.share) {
        try {
          await navigator.share({ title: "Solitaire", text, url });
          if (note) note.textContent = "Shared.";
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }
      const ok = await copyText(`${text} ${url}`);
      if (note) note.textContent = ok ? "Copied to the clipboard." : url;
    },
    true,
  );
}
