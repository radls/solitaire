# Solitaire

Klondike, FreeCell, and Golf for the browser. First app in [Grok Build Apps](../).

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
| Move | Drag a face-up card or run, or click source then destination |
| To foundation | Double-click a playable card |
| Draw | Click the stock, or <kbd>Space</kbd> |
| New game | Button, or <kbd>N</kbd> |
| Undo | Button, or <kbd>U</kbd> / <kbd>Ctrl</kbd>+<kbd>Z</kbd> |
| Hint | Button, or <kbd>H</kbd> |
| Draw 1 / 3 | Toggle in the header (starts a new game) |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 5180 |
| `npm test` | Unit tests for the game engines |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve the production build |

In-progress games and stats are stored in `localStorage` under `grok-solitaire`.

Deal a specific shuffle with `?seed=2` (and `?draw=3` if you want draw-three). Useful when reproducing a game. Open FreeCell directly with `?game=freecell`, or Golf with `?game=golf` (add `&seed=2` for a known deal). The last game you opened is remembered in `localStorage` under `grok-solitaire:prefs`.

## Rules (FreeCell)

- Microsoft deal numbers **1–32000**. Deal #1 is the classic first shuffle. The generator is `seed = (seed * 214013 + 2531011) mod 2^31`, `rand = seed >> 16`.
- Eight cascades, all cards face up. Four free cells, four foundations.
- Build cascades **down by alternating color**. Any card or legal run may move to an empty cascade.
- Build foundations **up by suit**, ace through king.
- A free cell holds one card.
- Supermove limit onto a cascade: `(emptyFreeCells + 1) * 2^emptyCascades`. An empty cascade you are moving onto is not counted.
- After each move, safe cards (aces, twos, or a card whose both opposite-color foundations are at least one rank lower) go to the foundations in the same undo step.

In-progress FreeCell games are stored under `grok-solitaire:freecell`. Klondike stays on `grok-solitaire-v1`. Sound starts muted.

## Rules (Golf)

- Seven columns of five face-up cards. The next card starts the waste. Sixteen cards remain face down in the stock.
- Play the exposed card of a column onto the waste when its rank is one higher or one lower. Suit does not matter. Only the exposed card can be played.
- No wrap: nothing can be played on a King, and Aces take only a 2. A king can be played on a queen. A queen can be played on a jack, and not on a king.
- Draw the stock one card at a time, once through. The stock does not recycle.
- Clear the columns. Score is the number of cards left in the columns, or minus the cards still in the stock when the columns are clear. Lower is better.

In-progress Golf games are stored under `grok-solitaire:golf`.
