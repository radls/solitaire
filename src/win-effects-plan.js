/**
 * Win-effect plan. Pure: no DOM.
 * | win                    | kind      |
 * | reduce (any)           | glow      |
 * | Grok's pick (any)      | both      |
 * | daily deal (any)       | fireworks |
 * | Klondike draw 3        | both      |
 * | Klondike draw 1        | confetti  |
 * | FreeCell               | fireworks |
 * | Golf / King's Corners  | confetti  |
 * Pick beats daily, daily beats casual draw-3, reduce beats everything.
 * Classic: confetti 90 (narrow 55), bursts 5 (4), sparks 36 (26), 3200ms, speed 1, bright, flash false.
 * Bedtime ~1/3 (confetti<=30, bursts<=2, sparks<=16), 4200ms, speed 0.5, dim gold/amber/rose (L<=55%, a<=0.6).
 * Caps: confetti<=120, bursts*sparks<=200. Reduce zeroes confetti, bursts, sparks, and duration.
 */
const CLASSIC = ["#ff4d6d", "#ffd166", "#2ec27e", "#4cc9f0", "#f72585", "#ffe566", "#b388ff"];
const BEDTIME = [
  "hsla(42, 28%, 50%, 0.55)",
  "hsla(28, 30%, 48%, 0.5)",
  "hsla(350, 22%, 52%, 0.5)",
  "hsla(18, 26%, 46%, 0.48)",
  "hsla(8, 20%, 50%, 0.45)",
];

export function winEffectsPlan({
  game, daily = false, pick = false, reduce = false, bedtime = false, narrow = false, drawCount = 1,
} = {}) {
  let kind = "confetti";
  if (reduce) kind = "glow";
  else if (pick) kind = "both";
  else if (daily || game === "freecell") kind = "fireworks";
  else if (game === "klondike" && drawCount === 3) kind = "both";

  let confetti = narrow ? 55 : 90;
  let bursts = narrow ? 4 : 5;
  let sparks = narrow ? 26 : 36;
  let durationMs = 3200;
  let speed = 1;
  if (bedtime) {
    confetti = Math.min(30, Math.round(confetti / 3));
    bursts = Math.min(2, Math.max(1, Math.round(bursts / 3)));
    sparks = Math.min(16, Math.round(sparks / 3));
    durationMs = 4200;
    speed = 0.5;
  }
  if (reduce) {
    confetti = 0;
    bursts = 0;
    sparks = 0;
    durationMs = 0;
  }
  confetti = Math.min(120, Math.max(0, confetti));
  bursts = Math.max(0, bursts | 0);
  sparks = Math.max(0, sparks | 0);
  if (bursts > 0 && bursts * sparks > 200) sparks = Math.floor(200 / bursts);
  return {
    kind, gentle: !!bedtime, confetti, bursts, sparks, durationMs, speed,
    palette: bedtime ? BEDTIME : CLASSIC, flash: false, glow: true,
  };
}
