import { CONTACT_EMAIL, SITE_URL, TIP_BTC_ADDRESS, TIP_X_HANDLE } from "./config.js";
import { todayKey } from "./daily.js";

/** The one tip call to action, used on every tip button and the tip panel heading. */
export const TIP_CTA = "Donate BTC for tokens for Grok Bot";

/** Once-a-day tip reminder. `{ ctaDay: "YYYY-MM-DD" }` is the local day it was shown. */
export const TIP_STORE_KEY = "grok-solitaire:tip";

const TIP_CTA_LINE = "Enjoying a quiet game? A small BTC tip keeps it going.";

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_SET = new Set(BECH32_CHARSET);
const COPY_RESET_MS = 2000;

export function isLikelyBech32Btc(addr) {
  if (typeof addr !== "string") return false;
  if (addr.length !== 42 && addr.length !== 62) return false;
  if (!addr.startsWith("bc1")) return false;
  for (let i = 3; i < addr.length; i += 1) {
    if (!BECH32_SET.has(addr[i])) return false;
  }
  return true;
}

export function bitcoinUri(addr) {
  return `bitcoin:${addr}`;
}

function isShareUrl(url) {
  return /^https?:\/\/\S+$/.test(url);
}

/**
 * Quiet win-screen line. Empty until the player has won three in a row.
 */
export function streakLine(streak) {
  const n = Number(streak);
  if (!Number.isFinite(n)) return "";
  const count = Math.floor(n);
  if (count < 3) return "";
  return `${count} wins in a row. If these games help you unwind, a few tokens are always welcome.`;
}

/**
 * Which tip parts to show. Bitcoin only for a likely bech32 address.
 * The X Money note only when the handle is non-empty. Otherwise a
 * thanks line plus the site URL (only as a real link).
 */
export function tipSections(config = {}) {
  const source = config && typeof config === "object" ? config : {};
  const address = typeof source.TIP_BTC_ADDRESS === "string" ? source.TIP_BTC_ADDRESS : "";
  const handle = typeof source.TIP_X_HANDLE === "string" ? source.TIP_X_HANDLE.trim().replace(/^@+/, "") : "";
  const siteUrl = typeof source.SITE_URL === "string" ? source.SITE_URL.trim() : "";
  const btc = isLikelyBech32Btc(address);
  const x = handle.length > 0;
  const fallback = !btc && !x;
  return {
    btc,
    x,
    fallback,
    address: btc ? address : "",
    uri: btc ? bitcoinUri(address) : "",
    handle,
    xNote: x ? `Or tip via X Money by messaging @${handle}.` : "",
    siteUrl,
    fallbackNote: fallback ? "Thanks for playing" : "",
    shareUrl: fallback && isShareUrl(siteUrl) ? siteUrl : "",
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function tipButtonHTML() {
  return `<button type="button" class="btn tip-btn" data-act="tip" data-testid="btn-tip">${TIP_CTA}</button>`;
}

/** Streak line (only at 3+) and the tip button, on their own rows under the win stats. */
export function winTipHTML(streak) {
  const line = streakLine(streak);
  const note = line ? `<p class="tip-streak" data-testid="tip-streak">${escapeHtml(line)}</p>` : "";
  return `${note}<div class="tip-offer">${tipButtonHTML()}</div>`;
}

/** Soft entry that opens the tip panel. Picker and Help use this; it is not the once-a-day CTA. */
export function tipEntryHTML(testId) {
  const id = escapeHtml(testId);
  return `<button type="button" class="tip-entry" data-act="tip" data-testid="${id}">${TIP_CTA}</button>`;
}

function contactTestId(testId) {
  return String(testId).startsWith("help-") ? "help-contact-email" : "contact-email";
}

/**
 * Quiet maker credit. Picker uses "credit"; Help modals use "help-credit".
 * A non-empty email adds one mailto line under the credit. Pass "" to hide it.
 */
export function creditHTML(testId, email = CONTACT_EMAIL) {
  const id = escapeHtml(testId);
  const credit = `<p class="credit" data-testid="${id}">Made by Grok Bot</p>`;
  const address = typeof email === "string" ? email.trim() : "";
  if (!address) return credit;
  const safe = escapeHtml(address);
  const contactId = escapeHtml(contactTestId(testId));
  return `${credit}<p class="credit contact">Questions or ideas: <a href="mailto:${safe}" data-testid="${contactId}">${safe}</a></p>`;
}

/** One calm line and the tip button. Shown at most once per local calendar day. */
export function tipCtaHTML() {
  return `<div class="tip-cta" data-testid="tip-cta"><p>${escapeHtml(TIP_CTA_LINE)}</p><div class="tip-offer">${tipButtonHTML()}</div></div>`;
}

/**
 * True when the once-a-day block has not been shown on `today`.
 * A missing, blank, or non-string saved day counts as not yet shown.
 */
export function shouldShowTipCta(ctaDay, today) {
  const saved = typeof ctaDay === "string" ? ctaDay.trim() : "";
  const day = typeof today === "string" ? today.trim() : "";
  if (!saved || !day) return true;
  return saved !== day;
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage || null;
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Saved `ctaDay`, or null when storage is missing, unreadable, or the value is not a string. */
export function readTipCtaDay(storage) {
  try {
    const store = resolveStorage(storage);
    if (!store || typeof store.getItem !== "function") return null;
    const raw = store.getItem(TIP_STORE_KEY);
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw);
    const day = parsed && typeof parsed === "object" ? parsed.ctaDay : null;
    return typeof day === "string" && day.trim() ? day.trim() : null;
  } catch {
    return null;
  }
}

/** Remember that the once-a-day block was shown. Never throws. */
export function markTipCta(today, storage) {
  try {
    const store = resolveStorage(storage);
    if (!store || typeof store.setItem !== "function") return false;
    const day = typeof today === "string" ? today.trim() : "";
    if (!day) return false;
    store.setItem(TIP_STORE_KEY, JSON.stringify({ ctaDay: day }));
    return true;
  } catch {
    return false;
  }
}

function claimTipCta(today, storage) {
  const day = typeof today === "string" && today.trim() ? today.trim() : todayKey();
  if (!shouldShowTipCta(readTipCtaDay(storage), day)) return "";
  markTipCta(day, storage);
  return tipCtaHTML();
}

/**
 * Win screens. The first end-of-game of the local day gets the CTA.
 * Later wins that day keep the small tip button.
 */
export function winScreenTipHTML(streak, today, storage) {
  const cta = claimTipCta(today, storage);
  if (cta) return cta;
  return winTipHTML(streak);
}

/** Klondike stuck panel. Empty except on the once-a-day showing. */
export function stuckTipHTML(today, storage) {
  return claimTipCta(today, storage);
}

function tipPanelMarkup(sections) {
  const parts = [`<div class="tip-panel" data-testid="tip-panel">`, `<h3>${TIP_CTA}</h3>`];
  if (sections.btc) {
    const address = escapeHtml(sections.address);
    const uri = escapeHtml(sections.uri);
    parts.push(
      `<section class="tip-btc" data-testid="tip-btc">`,
      `<p class="tip-kicker">Bitcoin</p>`,
      `<code data-testid="tip-btc-address">${address}</code>`,
      `<button type="button" class="btn" data-testid="tip-btc-copy">Copy address</button>`,
      `<div class="tip-qr" data-testid="tip-btc-qr" role="img" aria-label="QR code for the Bitcoin address"></div>`,
      `<a class="btn" href="${uri}" data-testid="tip-btc-open">Open in wallet</a>`,
      `</section>`,
    );
  }
  if (sections.x) {
    parts.push(`<p class="tip-note" data-testid="tip-x-note">${escapeHtml(sections.xNote)}</p>`);
  }
  if (sections.fallback) {
    parts.push(`<p class="tip-note" data-testid="tip-fallback">${escapeHtml(sections.fallbackNote)}</p>`);
    if (sections.shareUrl) {
      const url = escapeHtml(sections.shareUrl);
      parts.push(`<p class="tip-share"><a href="${url}" data-testid="tip-share">${url}</a></p>`);
    }
  }
  parts.push(`</div>`);
  return parts.join("");
}

function tintQrSvg(svg) {
  if (typeof svg !== "string" || !svg.includes("<svg")) return "";
  return svg.replace('fill="white"', 'fill="#c9c2b2"').replace('fill="black"', 'fill="#1a1814"');
}

function svgFromModules(qr) {
  const count = qr.getModuleCount();
  const cell = 3;
  const margin = 2;
  const size = count * cell + margin * 2;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x = col * cell + margin;
      const y = row * cell + margin;
      path += `M${x},${y}l${cell},0 0,${cell} -${cell},0 0,-${cell}z `;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Bitcoin address QR code"><rect width="100%" height="100%" fill="#c9c2b2"/><path d="${path}" fill="#1a1814"/></svg>`;
}

async function buildQrSvg(uri) {
  let mod;
  try {
    mod = await import("qrcode-generator");
  } catch {
    return "";
  }
  try {
    const qrcode = mod.default ?? mod;
    if (typeof qrcode !== "function") return "";
    const qr = qrcode(0, "M");
    qr.addData(uri);
    qr.make();
    try {
      if (typeof qr.createSvgTag === "function") {
        const tagged = tintQrSvg(qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true }));
        if (tagged) return tagged;
      }
    } catch {
      // Fall through and draw the modules directly.
    }
    return svgFromModules(qr);
  } catch {
    return "";
  }
}

async function fillQr(slot, uri) {
  if (!slot || !uri) return;
  try {
    const svg = await buildQrSvg(uri);
    if (!svg || !slot.isConnected) return;
    slot.innerHTML = svg;
  } catch {
    // Address and copy still work when the QR cannot be drawn.
  }
}

function execCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.width = "1px";
  area.style.height = "1px";
  area.style.padding = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, area.value.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }
  try {
    return execCopy(text);
  } catch {
    return false;
  }
}

function selectContents(el) {
  if (!el) return;
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

function flashLabel(button, label) {
  const original = button.dataset.tipLabel || button.textContent || "Copy address";
  button.dataset.tipLabel = original;
  button.textContent = label;
  const pending = Number(button.dataset.tipTimer || 0);
  if (pending) window.clearTimeout(pending);
  const timer = window.setTimeout(() => {
    if (button.isConnected) button.textContent = button.dataset.tipLabel || original;
    button.removeAttribute("data-tip-timer");
  }, COPY_RESET_MS);
  button.dataset.tipTimer = String(timer);
}

async function onCopy(button, panel) {
  const code = panel.querySelector("[data-testid='tip-btc-address']");
  const text = code?.textContent ?? "";
  let ok = false;
  try {
    ok = await copyText(text);
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      selectContents(code);
    } catch {
      // Leave the address in place for a manual copy.
    }
  }
  try {
    flashLabel(button, ok ? "Copied" : "Select and copy");
  } catch {
    // The label is optional feedback. Copy already finished.
  }
}

function bindTipPanel(panel, sections) {
  panel.addEventListener("click", (event) => {
    event.stopPropagation();
    const copyBtn = event.target?.closest?.("[data-testid='tip-btc-copy']");
    if (!copyBtn || !panel.contains(copyBtn)) return;
    event.preventDefault();
    onCopy(copyBtn, panel);
  });
  if (sections.btc) fillQr(panel.querySelector("[data-testid='tip-btc-qr']"), sections.uri);
}

/** Insert the tip panel once. `position: "start"` places it above a Close row. */
export function mountTipPanel(modalEl, { position = "end" } = {}) {
  if (!modalEl) return null;
  const existing = modalEl.querySelector("[data-testid='tip-panel']");
  if (existing) return existing;
  const sections = tipSections({ TIP_BTC_ADDRESS, TIP_X_HANDLE, SITE_URL });
  const where = position === "start" ? "afterbegin" : "beforeend";
  modalEl.insertAdjacentHTML(where, tipPanelMarkup(sections));
  modalEl.classList.add("tip-open");
  const panel = modalEl.querySelector("[data-testid='tip-panel']");
  if (panel) bindTipPanel(panel, sections);
  return panel;
}

export function toggleTipPanel(modalEl) {
  if (!modalEl) return;
  const existing = modalEl.querySelector("[data-testid='tip-panel']");
  if (existing) {
    existing.remove();
    modalEl.classList.remove("tip-open");
    return;
  }
  const panel = mountTipPanel(modalEl);
  if (!panel) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  panel.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
}
