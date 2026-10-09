# Solitaire

Klondike solitaire. Vanilla JS + Vite. Port **5180**.

## Rules of the house

- Card rules and game state live in `src/game/`. That code must not import the DOM.
- UI lives in `src/ui.js`, `src/ui-freecell.js`, `src/ui-kings.js`, `src/styles.css`, `src/audio.js`, `src/storage.js`.
- King's Corners rules live in `src/game/kings.js`. The board is `src/ui-kings.js`. Saves use `grok-solitaire:kings`.
- Mutations go through `apply()` / `draw()` / `moveCards()` so undo stays a stack of snapshots.
- Prefer extending `src/game/klondike.js` over putting rules in click handlers.

## Commands

```bash
npm install
npm test
npm run dev    # http://127.0.0.1:5180
```
