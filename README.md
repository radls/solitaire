# Solitaire

Klondike, FreeCell, and Golf for the browser. First app in [Grok Build Apps](../).

King's Corners is included too.

**Play:** [https://radls.github.io/solitaire/](https://radls.github.io/solitaire/)

## Local

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180).

GitHub Pages builds with `GITHUB_PAGES=true` so asset URLs use the `/solitaire/` base path. Local `npm run dev` still serves at `/`.

## Rules (Klondike)

- Seven tableau columns; only the top card of each starts face up.
- Build tableau **down by alternating color**.
- Build foundations **up by suit**, ace through king.
- Empty tableau columns accept **kings** (or a king-led face-up run).
- Stock draws **1** or **3** cards onto the waste. Only the top waste card is playable.
- Click an empty stock to recycle the waste.

## Controls

| Action | How |
| --- | --- |
| Move | Drag a face-up card or run, or tap the source then the destination (an empty slot counts) |
| To foundation | Double-tap a playable card (pointer timing, so it does not zoom the page) |
| Clear a selection | Tap empty table |
| Draw | Tap the stock, or <kbd>Space</kbd> |
| New game | Button, or <kbd>N</kbd> |
| Undo | Button, or <kbd>U</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd> |
| Hint | Button, or <kbd>H</kbd> |
| Draw 1 / 3 | Toggle in the header (starts a new game) |
| Theme | Moon / sun button in the header. Night is the default; Classic is the green felt |
| Sound | Speaker button. Off until you turn it on |

FreeCell uses the same tap-then-tap and drag controls. Golf plays on tap, and a drag onto the waste plays that card. The header stays within two rows on a phone, with 36px tap targets.

King's Corners uses tap-then-tap and drag. Double-tap a card to send it to a corner when that move is legal. Header buttons stay at least 44px tall and wrap on a narrow screen.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 5180 |
| `npm test` | Unit tests for the game engines |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve the production build |

In-progress games and stats are stored in `localStorage`:

| Key | Contents |
| --- | --- |
| `grok-solitaire-v1` | Klondike deal, undo history, and stats |
| `grok-solitaire:freecell` | FreeCell deal, undo history, and stats |
| `grok-solitaire:golf` | Golf deal, undo history, and stats |
| `grok-solitaire:kings` | King's Corners deal, undo history (capped at 200), and stats (`played`, `won`) |
| `grok-solitaire:prefs` | `lastGame`, `theme` (`night` or `classic`), and `sound` (default `false`) |

Each move, undo, and new deal is written immediately. Opening a game resumes its saved deal. A reload returns to `lastGame`.

Deal a specific shuffle with `?seed=2` (and `?draw=3` if you want draw-three). Useful when reproducing a game. Open FreeCell directly with `?game=freecell`, or Golf with `?game=golf` (add `&seed=2` for a known deal). Open King's Corners with `?game=kings` or `?game=kings&seed=2`.

Night is the default theme (dark table, dim gold, muted suits). Classic keeps the green felt. The choice is applied before first paint. Sound stays off until the speaker button is turned on, and that choice is shared by every game.

## Rules (FreeCell)

- Microsoft deal numbers **1–32000**. Deal #1 is the classic first shuffle. The generator is `seed = (seed * 214013 + 2531011) mod 2^31`, `rand = seed >> 16`.
- Eight cascades, all cards face up. Four free cells, four foundations.
- Build cascades **down by alternating color**. Any card or legal run may move to an empty cascade.
- Build foundations **up by suit**, ace through king.
- A free cell holds one card.
- Supermove limit onto a cascade: `(emptyFreeCells + 1) * 2^emptyCascades`. An empty cascade you are moving onto is not counted.
- After each move, safe cards (aces, twos, or a card whose both opposite-color foundations are at least one rank lower) go to the foundations in the same undo step.

Sound starts off.

## Rules (Golf)

- Seven columns of five face-up cards. The next card starts the waste. Sixteen cards remain face down in the stock.
- Play the exposed card of a column onto the waste when its rank is one higher or one lower. Suit does not matter. Only the exposed card can be played.
- No wrap: nothing can be played on a King, and Aces take only a 2. A king can be played on a queen. A queen can be played on a jack, and not on a king.
- Draw the stock one card at a time, once through. The stock does not recycle.
- Clear the columns. Score is the number of cards left in the columns, or minus the cards still in the stock when the columns are clear. Lower is better.

## Rules (King's Corners)

- One 52-card deck. The header shows **Seed N**. New deal shuffles a new seed. Replay keeps the same seed. Open a known deal with `?game=kings&seed=2`.
- The layout is a cross. Side piles sit north, east, south, and west around a central stock and waste. Corner piles sit on the four diagonals.
- Deal one face-up card to each side, in order north, east, south, west. A king dealt to a side goes to the next empty corner instead (northwest, then northeast, then southwest, then southeast), and that side is dealt again. The remaining cards are the face-down stock.
- Tap the stock to turn one card face up onto the waste. When the stock is empty, tap it to turn the waste back over into the stock. The previous bottom card is drawn next. Redeals are unlimited and add no penalty. Each draw and each turn-over counts as a move.
- An empty corner accepts only a king. Corners build down in alternating colors, king through ace. A finished corner holds 13 cards. Cards in a corner stay there. Undo is the only way to take one back.
- Side piles build down in alternating colors. An empty side accepts any single card or any whole side pile.
- You may move the top waste card, the top card of a side pile, or a whole side pile. A whole pile moves onto another side or a corner when its bottom card fits that build. A king-led pile may move onto an empty corner. Partial runs do not move.
- The deal is won when all 52 cards sit in the four corners.
- Turning the stock over means recycling the waste into the stock. Do that twice in a row without a card move and the deal is stuck. A calm panel offers Undo, New deal, and Replay. Any card move clears the pass count.
- Tap a side's top card to select that card. Tap the bottom card of a longer side to select the whole pile. Then tap a destination, or drag. Dragging from the bottom card drags the whole pile. Double-tap sends the selection to a corner when the move is legal. A king goes to the first empty corner.


