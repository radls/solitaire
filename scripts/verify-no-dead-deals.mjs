// Batch 5 #3: every random deal must open with at least one legal move.
// Run: node scripts/verify-no-dead-deals.mjs [N]
import * as K from "../src/game/klondike.js";
import * as F from "../src/game/freecell.js";
import * as G from "../src/game/golf.js";
import * as C from "../src/game/kings.js";
const N = Number(process.argv[2]) || 5000;
const r = () => Math.floor(Math.random() * 2 ** 32);
const games = {
  "klondike draw1": () => K.dealPlayable({ drawCount: 1 }),
  "klondike draw3": () => K.dealPlayable({ drawCount: 3 }),
  freecell: () => F.deal(1 + Math.floor(Math.random() * 32000)),
  golf: () => G.deal({ seed: r() }),
  kings: () => C.deal({ seed: r() }),
};
const listers = { "klondike draw1": K, "klondike draw3": K, freecell: F, golf: G, kings: C };
let bad = 0;
for (const [name, mk] of Object.entries(games)) {
  let dead = 0, stuck = 0;
  for (let i = 0; i < N; i++) {
    const s = mk();
    if (!listers[name].listLegalMoves(s).length) dead++;
    if (name.startsWith("klondike") && K.isStuck(s)) stuck++;
  }
  bad += dead + stuck;
  console.log(`${name}: ${N} deals, ${dead} with no legal move${name.startsWith("klondike") ? `, ${stuck} stuck` : ""}`);
}
process.exit(bad ? 1 : 0);
