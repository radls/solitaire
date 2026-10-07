import { cardName, rankLabel, SUIT_GLYPH, suitColor } from "./game/cards.js";

const PIP = {
  2: [
    [50, 18],
    [50, 80, 1],
  ],
  3: [
    [50, 18],
    [50, 49],
    [50, 80, 1],
  ],
  4: [
    [24, 18],
    [76, 18],
    [24, 80, 1],
    [76, 80, 1],
  ],
  5: [
    [24, 18],
    [76, 18],
    [50, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  6: [
    [24, 18],
    [76, 18],
    [24, 49],
    [76, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  7: [
    [24, 18],
    [76, 18],
    [50, 34],
    [24, 49],
    [76, 49],
    [24, 80, 1],
    [76, 80, 1],
  ],
  8: [
    [24, 18],
    [76, 18],
    [50, 34],
    [24, 49],
    [76, 49],
    [50, 64, 1],
    [24, 80, 1],
    [76, 80, 1],
  ],
  9: [
    [24, 16],
    [76, 16],
    [24, 38],
    [76, 38],
    [50, 49],
    [24, 62, 1],
    [76, 62, 1],
    [24, 84, 1],
    [76, 84, 1],
  ],
  10: [
    [24, 14],
    [76, 14],
    [50, 26],
    [24, 36],
    [76, 36],
    [24, 64, 1],
    [76, 64, 1],
    [50, 74, 1],
    [24, 84, 1],
    [76, 84, 1],
  ],
};

function cardFaceHTML(card) {
  const glyph = SUIT_GLYPH[card.suit];
  const label = rankLabel(card.rank);
  const corner = `<span class="corner tl">${label}<span class="suit">${glyph}</span></span><span class="corner br">${label}<span class="suit">${glyph}</span></span>`;
  if (card.rank === 1) return `${corner}<div class="pips ace">${glyph}</div>`;
  if (card.rank >= 11) return `${corner}<div class="face-mark">${label}<span>${glyph}</span></div>`;
  const pips = (PIP[card.rank] ?? [])
    .map(
      ([x, y, rot]) =>
        `<span class="pip" style="left:${x}%;top:${y}%;${rot ? "transform:translate(-50%,-50%) rotate(180deg)" : ""}">${glyph}</span>`,
    )
    .join("");
  return `${corner}<div class="pips">${pips}</div>`;
}

export function makeCardElement(card, loc, count, playable, selected) {
  const el = document.createElement("article");
  const color = card.faceUp ? suitColor(card.suit) : "";
  el.className = `card ${card.faceUp ? "face-up" : "face-down"} ${color}`.trim();
  if (playable && card.faceUp) el.classList.add("playable");
  if (selected) el.classList.add("selected");
  el.dataset.id = card.id;
  el.dataset.zone = loc.zone;
  if (loc.index != null) el.dataset.index = String(loc.index);
  el.dataset.count = String(count);
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", card.faceUp ? cardName(card) : "Face-down card");
  if (card.faceUp) el.innerHTML = cardFaceHTML(card);
  return el;
}
