# Random table themes: plan (no code yet)

Goal: each table gets a "surface" theme, picked at random, without hurting card readability or the bundle.

## How it fits the code we have

- A theme is just a set of CSS custom properties on `html[data-table="<id>"]`: `--felt`, `--felt-deep`, `--felt-ink`, `--gold`, plus a `--table-bg` background (layered gradients, an optional inline SVG pattern). Cards don't change. The ivory faces, the ink and the borders stay the same in every theme.
- Bedtime (`data-theme="night"`) layers on top of the table theme. Each theme also ships a `night` variant: the same idea, darker, lower saturation, no warm highlights brighter than about 35% lightness.
- Reduced motion: themes are static. Any "living" detail (candle flicker, steam, passing scenery) is a slow CSS animation that is off under `prefers-reduced-motion`, `html.reduce-motion` and `html[data-motion="reduce"]`, and always off in Bedtime.
- Assets: CSS gradients plus at most one small inline SVG per theme (a pattern or vignette, under about 1.5 KB). No photos or webfonts. Budget: about 2 KB gzip per theme, and under 12 KB gzip for the whole set.
- Contrast rule for every theme: the empty-slot outlines and the badge text must reach WCAG 3:1 against the surface, and the surface right behind the cards stays dark enough that the ivory cards read as the brightest thing on screen. A unit test checks each theme's `--felt` against `--ivory` (≥ 7:1) and `--gold` against `--felt` (≥ 3:1).

## Randomization

- Default: **per session**. Pick a theme once when the app opens and keep it until reload. Per-deal changes would be distracting.
- Settings get a "Table" row: **Random** (default), or **pin** one theme. A pinned theme is stored in localStorage `grok-solitaire:table`.
- Random never picks the same theme twice in a row (it remembers the last ID), and it only chooses from themes the player hasn't turned off (an optional per-theme checkbox list, later).
- The daily deal and Grok's pick use the player's current theme. We don't theme by game.
- Existing players keep Classic felt as their pinned theme on first load. They opt in to Random with one tap from a small "New: table themes" note.

## Themes

| Theme | Look (surface · light · palette) | Readability | Bedtime / reduced motion | Assets · size |
|---|---|---|---|---|
| **Classic felt** (current) | Green baize, soft center light, dark edges · #14633f / #0a3324, gold accents | Already tuned | Current Bedtime felt; static | Existing CSS, 0 KB new |
| **Pub table by the fire** | Dark varnished oak, warm amber glow from one corner like a fireplace or candle · walnut #3b2416, amber #c98a3c | Darken the wood behind the tableau with a radial vignette, keep the glow off-center and low | Night: embers only, glow at 20%. Optional slow 6 s flicker on the glow layer, off in reduced motion and Bedtime | Wood grain from a repeating-linear-gradient plus an SVG noise filter, about 1.5 KB |
| **Coffee shop** | Light-medium walnut counter, daylight from the top, a faint ring stain in a corner · #6b4a33 / #4a3222, cream accents | Lighter wood makes the ivory cards weaker, so darken the play area to #3e2a1d and add a thin dark border on the cards in this theme only | Night: closing-time version, dark espresso brown. Optional steam wisp in one corner, off in reduced motion and Bedtime | Gradients plus one SVG ring stain, about 1.2 KB |
| **Library desk** | Oxblood leather desk inlay with a gold-tooled border, green banker's-lamp glow · #5a1f1f, inlay border #b8954a, lamp tint #2f5d44 | Leather is dark, so contrast is easy. Keep the gold border outside the slot grid | Night: lamp dimmed, border at 40%. Static | Gradients plus a double-line SVG border, about 1 KB |
| **Train dining car** | Navy tablecloth, brass edge, a window light band moving across slowly · #1d2a44, brass #b08d57 | Navy works well with ivory. The light band stays under 8% opacity and never crosses the foundations | Night: night train, band off, small warm lamp glow. Band animation off in reduced motion and Bedtime | Gradients plus a CSS animated band (transform only), about 1 KB |
| **Beach cabana** | Teak slats in afternoon shade, faint striped awning shadow · teak #7a5634, shadow stripes #00000022 | Brightest theme. The shade gradient keeps the card area at about #4f3922, and the cards get a drop shadow | Night: moonlit deck, cool blue-gray teak. Static | Slat stripes as repeating-linear-gradient, about 0.8 KB |
| **Midnight casino** | Deep burgundy felt, a spotlight on the center, a thin gold rail · #4a0f1c / #2a0810 | Like classic felt with a different hue, so it's safe | Night: almost black burgundy. Static | Gradients only, about 0.5 KB |

## Rollout

1. Move the current colors into a `classic-felt` table entry, with no visual change. Add the contrast unit test.
2. Add the 6 new themes, the Settings row (Random / pin) and the session picker. Add e2e screenshots of each theme at 390×844 and 1280×800, in Classic and Bedtime.
3. QA gate as usual (max 2 rounds), then bump the minor version.
