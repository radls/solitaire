# Batch 6 spec

A deeper cut of the same seven fun items and four bugs. Not a larger game. GitHub Pages and localStorage only. No ads. No new dependencies. Bedtime mode and `prefers-reduced-motion` stay in force. A celebration is on screen before any tip ask.

## What a careful solitaire engineer would add

The request already names the symptoms. The work that was missing is the measurement and the root cause:

- Score the Klondike clock and the recycle rule as separate, visible parts of one score. Do not guess which one moved.
- Treat "no dead deals" as a search claim. Run the real dealer and the real hint, and see where the search stops.
- Treat King's Corners hints as a policy that must be acyclic. A potential that rises on every hinted move cannot repeat a layout. Measure wins with that policy before picking a move goal.
- Keep the daily deal in its own saved slot so it cannot clobber or reset the game already on the table.

## Raw material

The rules in `src/game/`, the save blobs in `src/storage.js`, and a few hundred seeded deals. Not the picker copy, and not a retelling of the bug list.

## How to know it is true

`npm test`, `npm run build`, and `e2e/batch6-verify.mjs` at 1280×800 and 390×844. Shots go to `/workspace/qa-shots/solitaire-batch6/` (`SHOTS_DIR` overrides). A unit test follows King's Corners hints across seeds and fails on a repeated layout.

## Root cause: daily score 61 → 37, moves still 12

`timedScore` in `src/game/klondike.js` subtracts 2 points for every 10 seconds of play. It does not change `state.score` or `state.moves`. The meter and the win line both show that number, and they refresh four times a second.

120 seconds is exactly twelve of those steps: `61 - 12 * 2 = 37`. A recycle cannot do this. Draw 3 recycle subtracts 20 and adds a move. Draw 1 recycle subtracts 100 and adds a move. Undo restores an older move count as well as an older score.

The penalty is real and it was invisible. The player sees the score fall and has no name for it.

Show it. Next to the score, `−24 time` while the clock penalty is non-zero. On a recycle, the status says `−20 recycle` or `−100 recycle`. Help states both rules: 2 points each 10 seconds, and the recycle cost for the draw mode in use.

## Root cause: "No useful moves" with 24 stock cards

`isStuck` is a full search. On the deals below it is right: after the opening tableau moves, no waste top that Draw 3 can reveal will play, and because 24 is divisible by 3 the pass never rotates. `hint` still says "draw" whenever `stock.length > 0`, which is not the same question. The Hint button asks `isStuck` first, so the player gets the stuck panel instead of a draw.

Measured on draw 3, following the hint:

| Seed | Hint moves before the panel | Stock left |
| --- | --- | --- |
| 318285880 | 1 | 24 |
| 3564267873 | 3 | 24 |
| 619956037 | 1 | 24 |

Draw 1 openings in a sample of 200 were not stuck. The promise on the picker ("every random deal starts with a legal move") only means the opening is not already `isStuck`. A legal opening move can still be the last useful one.

Changes:

- A draw is a hint only when some card that can become the waste top, under this draw count, plays on the current tableau or a foundation. Buried Draw 3 cards are not moves.
- `dealPlayable` follows that hint line. If the line dies before the stock can be played, it deals again. Explicit seeds still deal as given, so shared links stay stable.
- The search is capped. Past the cap the deal is kept. Klondike is not solvable in the browser, so the picker must not promise a game that cannot die. Copy: "Each new deal is checked so the stock can come into play. A game can still run out of moves later."

## Root cause: Draw 3 hint points at the wrong waste card

`listLegalMoves` already uses only the waste top. The highlight does not. It uses `querySelector('.card[data-zone="waste"]')`, which is the leftmost of the three visible cards. Waste `Q♥ 5♣ 7♥` highlights `Q♥` even when the move is `7♥`.

The highlight selector for a waste move must require the top card. Same bug in King's Corners.

## King's Corners

Pointless move: a whole side pile moved onto an empty side. The multiset of piles does not change. `moveCards` rejects it. Splitting one card onto an empty side, and building onto a card, stay legal.

Hints: each suggestion must raise a potential that depends only on the layout (cards in corners, builds that can reach a corner, stock size). A rising potential cannot repeat a layout. A recycle that only restores the same pass is not a hint.

Move goal: 120 is the Grok's pick line for King's Corners (`goalFor` uses 120 for every non-Klondike max-move day). It is not a number this game was measured against. After the hint policy exists, play many seeds, record wins, and set the pick to a round number a decent run of that policy actually reaches. The number, the sample, and the spread go in this file. FreeCell's 120 is a different game and stays.

Corner meter shows how many corners have a card, as `N/4`.

## The rest of the batch

1. Golf, round over, 1–3 column cards left: `So close — N cards left` (one card when N is 1). Best score stays visible. Try again is the primary button and deals again.
2. Wins: a short card cascade, then the tip control. A soft glow when a foundation reaches a king, and when the last face-down card in a Klondike column turns up. Bedtime (night theme): fewer cards, slower, dimmer. Reduced motion: no cascade nodes, still glow only.
3. Daily deal uses a `dailySaved` slot beside the casual save. Opening it does not replace the other game and does not zero the win streak. After it ends, `Tomorrow's deal in Xh` (hours until local midnight, rounded up, at least 1).
4. Personal bests in the same localStorage stats: fastest win and fewest moves for Klondike, FreeCell, and King's Corners; best Golf score (lower is better). A quiet `New best` or `New best time` on the end screen.
5. FreeCell foundations show `n/13` on each pile.
6. A fresh Klondike deal shows a Draw 1 / Draw 3 choice in words, including on a phone, before the first move.

Shots: every e2e script writes under `SHOTS_DIR` or `/workspace/qa-shots/solitaire-batch6/`. `shots/` is removed from the index and gitignored. Changelog stays generated from git history. There is no unreleased Batch 6 block to edit.

## King's Corners goal

**150 moves.** Grok's pick says "Win in under 150 moves."

Measured with `followHints` in `src/game/kings.js` (the same hint a player gets) on seeds 1 through 80, cap 220 steps. 80 of 80 won.

| | Moves |
| --- | --- |
| Min | 108 |
| 25th | 130 |
| Median | 139 |
| 75th | 149 |
| Max | 180 |

Under 120: 2 of 80. Under 150: 62 of 80. Under 160: 74 of 80.

The limiter is the deal itself. About 48 cards start in the stock, and a win also places cards onto corners and builds. Totals bunch between 110 and 170. 120 is the low end of that band, not a typical finish, which is why the old "under 120" line was out of reach. 150 sits on the upper quartile: a decent run of this hint finishes under it. FreeCell stays at 120.
