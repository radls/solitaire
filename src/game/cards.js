export const SUITS = ["spades", "hearts", "diamonds", "clubs"];

export const SUIT_GLYPH = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const SUIT_COLOR = {
  spades: "black",
  hearts: "red",
  diamonds: "red",
  clubs: "black",
};

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const RANK_LABEL = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

export function rankLabel(rank) {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitColor(suit) {
  return SUIT_COLOR[suit];
}

export function oppositeColor(a, b) {
  return SUIT_COLOR[a] !== SUIT_COLOR[b];
}

export function cardName(card) {
  return `${rankLabel(card.rank)} of ${card.suit}`;
}

export function makeCard(suit, rank, faceUp = false) {
  return { id: `${suit}-${rank}`, suit, rank, faceUp };
}

export function buildDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(makeCard(suit, rank, false));
    }
  }
  return cards;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
