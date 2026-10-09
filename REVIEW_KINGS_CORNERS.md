# King's Corners

## Rules

- One 52-card deck, shuffled with mulberry32. The header shows `Seed N`. New deal picks a random seed. Replay keeps the seed. `?game=kings&seed=N` opens that deal.
- The board is a cross. Side piles are north, east, south, west (indexes 0–3) around a central stock and waste. Corner piles are northwest, northeast, southwest, southeast (indexes 0–3).
- Deal one face-up card to each side, in order north, east, south, west. A king dealt to a side goes to the lowest-index empty corner instead, and that side is dealt again. Kings left in the deck stay in the stock. The stock is face down. The waste starts empty.
- Tap the stock to turn one card face up onto the waste. When the stock is empty, tap it to turn the waste back over into the stock. The pile is reversed, so the old bottom card is drawn next. Redeals are unlimited and score no penalty. Each draw and each turn-over counts as one move.
- An empty corner accepts only a king. Corners build down in alternating colors from king to ace. A finished corner holds 13 cards because an ace accepts nothing further. Cards never leave a corner except by Undo.
- Side piles build down in alternating colors. An empty side accepts any single card or any whole side pile.
- Movable: the top waste card; the top card of a side; a whole side pile. A whole pile moves onto another side or a corner when its bottom card fits the destination. A king-led pile may move onto an empty corner. A count other than 1 or the full pile length is rejected. No partial runs.
- Win when all 52 cards are in the four corners.
- An idle pass is one recycle (turning the waste back into the stock). Two recycles in a row with no card move between them set `stuck`. Drawing cards does not reset the counter. Any successful card move sets `idlePasses` back to 0 and clears `stuck`. The panel title is "No more moves", with Undo, New deal, and Replay.

## Judgement calls

- Corner order for "the next empty corner" is index order: northwest, northeast, southwest, southeast. Double-tap sends a card or a selected whole pile to the lowest-index legal corner. A king therefore lands on the first empty corner.
- "Turn the stock over" is the recycle action, not the draw that empties the stock. The stuck flag is set on the second recycle. The engine still lists legal moves while stuck; the panel is what stops play, and Undo restores the previous snapshot.
- A whole-pile move checks only the bottom card against the destination. The cards already in the pile are not rechecked.
- Empty destinations are passed to `canBuild` as `{ zone: "corner" }` or `{ zone: "side" }`. A real card is passed when the destination has a top card.
- Failed moves return the same state object. Successful moves and draws return a clone.
- The moves meter counts draws, recycles, and card moves.
- Tapping the bottom card of a side with more than one card selects the whole pile and does not drop the current selection there. Drop on that pile by tapping its top card, an empty well, or by dragging. Middle cards are not a partial run; a tap on one tries to drop the current selection.
- Dragging the bottom card drags the whole pile. Dragging the top card drags that card only.
- `played` increases on every new deal and replay. `won` increases once when the deal is won through play, and decreases if that win is undone. Replacing the state from the hook does not change those stats.
- The third meter is labeled Corners and shows how many cards are home.
- The four game tiles share a 2×2 grid, so the previous full-width third tile no longer spans the row.
