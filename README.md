# Solitaire

Klondike solitaire for the browser. First app in [Grok Build Apps](../).

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
| `npm test` | Unit tests for the Klondike engine |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve the production build |

In-progress games and stats are stored in `localStorage` under `grok-solitaire`.

Deal a specific shuffle with `?seed=2` (and `?draw=3` if you want draw-three). Useful when reproducing a game.
