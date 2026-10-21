import { deal, dealPlayable, isStuck, scoreParts, stockCanEnter } from "../src/game/klondike.js";
import { deal as dealKings, filledCorners, followHints, MOVE_GOAL } from "../src/game/kings.js";
import { abandonsStreak, placeBoard } from "../src/slots.js";
import { GROKS_PICK } from "../src/groks-pick-data.js";

const state = {
  score: 61,
  moves: 12,
  drawCount: 3,
  recycled: 0,
  startedAt: 1_000_000,
  pausedAt: 0,
  wonAt: null,
  won: false,
};
const parts = scoreParts(state, 1_000_000 + 120_000);
const dead = deal({ seed: 318285880, drawCount: 3 });
const explicit = deal({ seed: 318285880, drawCount: 3 });
let i = 0;
const seeds = [318285880, 1];
const random = () => seeds[Math.min(i++, seeds.length - 1)] / 0xffffffff;
const kept = dealPlayable({ drawCount: 3, random, tries: 3 });
const hinted = followHints(dealKings({ seed: 1 }), 40);
const kingsMoves = [...new Set(GROKS_PICK.filter((p) => p.game === "kings" && p.goal.type === "maxMoves").map((p) => p.goal.n))];
const freeMoves = [...new Set(GROKS_PICK.filter((p) => p.game === "freecell" && p.goal.type === "maxMoves").map((p) => p.goal.n))];
const klondikeMoves = [...new Set(GROKS_PICK.filter((p) => p.game === "klondike" && p.goal.type === "maxMoves").map((p) => p.goal.n))];
const casual = { moves: 4, won: false, seed: 9 };
const slots = placeBoard(
  { casual: { state: casual, history: [], savedAt: 1 }, daily: null, active: "casual" },
  { moves: 1, won: false, daily: "2026-10-20", seed: 3 },
  [],
  2,
);

const facts = {
  scoreUnchanged: state.score === 61 && state.moves === 12,
  display: parts.display,
  timePenalty: parts.timePenalty,
  deadSeed: dead.seed,
  deadStock: dead.stock.length,
  deadStuck: isStuck(dead),
  deadEnter: stockCanEnter(dead),
  explicitSeed: explicit.seed,
  keptSeed: kept.seed,
  keptEnter: stockCanEnter(kept),
  moveGoal: MOVE_GOAL,
  hintRepeated: hinted.repeated,
  hintNoProgress: hinted.noProgress,
  hintSteps: hinted.steps,
  hintCorners: filledCorners(hinted.state),
  kingsMoves,
  freeMoves,
  klondikeMoves,
  casualKept: slots.casual.state.moves,
  dailyFlag: slots.daily.state.daily,
  streakKept: abandonsStreak(casual, { toDaily: true }) === false,
};
const ok =
  facts.scoreUnchanged &&
  facts.display === 37 &&
  facts.timePenalty === 24 &&
  facts.deadStuck === false &&
  facts.deadEnter === false &&
  facts.deadStock === 24 &&
  facts.explicitSeed === 318285880 &&
  facts.keptSeed === 1 &&
  facts.keptEnter === true &&
  facts.moveGoal === 150 &&
  facts.hintRepeated === false &&
  facts.hintNoProgress === false &&
  facts.hintSteps === 40 &&
  facts.hintCorners > 0 &&
  facts.kingsMoves.length === 1 &&
  facts.kingsMoves[0] === 150 &&
  facts.freeMoves.length === 1 &&
  facts.freeMoves[0] === 120 &&
  facts.klondikeMoves[0] === 160 &&
  facts.casualKept === 4 &&
  facts.dailyFlag === "2026-10-20" &&
  facts.streakKept;
console.log(JSON.stringify(facts, null, 2));
if (!ok) {
  console.error("BLAST FAIL");
  process.exit(1);
}
console.log("BLAST OK");
