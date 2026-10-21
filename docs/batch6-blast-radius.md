# Batch 6 blast radius

## What it does

Klondike's meter subtracts 2 points per 10 seconds from `state.score` and never writes that subtraction back. Draw 3 hints highlight only the waste top. A random deal is skipped when the hint line dies before the stock can be played; an explicit seed is still dealt as given. King's Corners hints must raise a layout-only potential, so they cannot repeat a position, and the pick goal is 150. The daily deal is a second save slot. A win cascade and a pile glow are presentation. Personal bests are extra fields on the existing stats object.

## The one fact it's safe because of

The score the player saw fall (61 to 37, moves still 12) is a display subtraction. `state.score` and `state.moves` stay put. Step 4: the script below imports `scoreParts` from `src/game/klondike.js` and checks the object after the call.

That same run also locks the two neighbors that would have been easy to break: an explicit dead seed is still that seed, and FreeCell's move goal stays 120 while King's Corners moves to 150.

## Proof

Re-run from the repo:

```bash
node scripts/batch6-blast.mjs
```

The script is the one that produced the output below. It imports `scoreParts`, `deal`, `dealPlayable`, `isStuck`, `stockCanEnter`, `followHints`, `MOVE_GOAL`, `placeBoard`, `abandonsStreak`, and `GROKS_PICK`.

```json
{
  "scoreUnchanged": true,
  "display": 37,
  "timePenalty": 24,
  "deadSeed": 318285880,
  "deadStock": 24,
  "deadStuck": false,
  "deadEnter": false,
  "explicitSeed": 318285880,
  "keptSeed": 1,
  "keptEnter": true,
  "moveGoal": 150,
  "hintRepeated": false,
  "hintNoProgress": false,
  "hintSteps": 40,
  "hintCorners": 3,
  "kingsMoves": [150],
  "freeMoves": [120],
  "klondikeMoves": [160],
  "casualKept": 4,
  "dailyFlag": "2026-10-20",
  "streakKept": true
}
```

`BLAST OK` on 2026-10-20. `npm test` was 211 passed. `e2e/batch6-verify.mjs` was 48/48 at 1280×800 and 390×844.

## Risks

- The stock search stops at 16 hinted moves (`stockCanEnter` in `src/game/klondike.js`). Past the cap the deal is kept. A later dead end is still possible. Likelihood: real. Cost: the stuck panel, which is now an honest end rather than a broken promise. The picker copy says a game can still run out of moves.
- A daily win still increments the casual win streak inside `recordWin` (`src/ui.js`). Opening the daily does not zero it. Likelihood: every daily win. Cost: the Games streak counts daily wins too. That matches "a win is a win" and is not the reset bug.
- `?game=klondike` with no `casual` flag resumes whichever slot is active. The Games tile passes `{ casual: true }`. A refresh mid-daily returns to the daily; the tile returns to the casual board. Likelihood: only when both slots exist. Cost: the player sees the other game. That is the split the daily feature asked for.
- "Under 150" is strict. 18 of the 80 measured King's Corners wins were 150 or more (`docs/batch6-spec.md`). A careful player can miss Grok's pick. That is the goal, not a rules change.

## Cleared

- Recycle cannot explain 61 → 37 with moves stuck at 12. Draw 3 recycle subtracts 20 and adds a move (`draw` in `src/game/klondike.js`). The proof state has `recycled: 0` and moves stay 12.
- `deal({ seed: 318285880, drawCount: 3 })` is still seed 318285880. Shared links do not get redrawn. `dealPlayable` is the only path that skips it, and the script shows it keeping seed 1.
- Grok's pick max-move lines: Klondike 160, FreeCell 120, King's Corners 150. No other goal type was rewritten.
- `dailyOpenPlan` is unchanged and still what Grok's pick confirm uses. The daily button uses `dailyAlongsidePlan`.
- King's Corners help is still three short bullets (e2e). The 150-move sentence is in More.
- Reduced motion does not delete the glow. The e2e read a non-`none` `box-shadow` on `.pile-glow` and on the celebrate block when `prefers-reduced-motion: reduce` and the cascade count was 0.
- Putting a daily board in `placeBoard` left the casual pack's 4 moves in place, and `abandonsStreak(..., { toDaily: true })` was false.

## Before you merge

Run `npm test`, `node scripts/batch6-blast.mjs`, and `e2e/batch6-verify.mjs` against `GITHUB_PAGES=true` preview on port 4173. The failure that matters is a meter that writes `timedScore` back into `state.score`, a random deal of seed 318285880 on draw 3, or a King's Corners hint that reports `repeated: true`.
