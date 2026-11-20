/** Table surface themes. Phase 1 ships classic-felt only; phase 2 adds six more. */

export const TABLE_STORAGE_KEY = "grok-solitaire:table";
export const DEFAULT_TABLE_ID = "classic-felt";

/**
 * Surface tokens for each color scheme.
 * Ivory is not a table token (card faces stay the same in every theme); it is
 * recorded so contrast can be checked against the surface the cards sit on.
 */
export const TABLE_THEMES = [
  {
    id: "classic-felt",
    name: "Classic felt",
    schemes: {
      classic: {
        felt: "#14633f",
        feltDeep: "#0a3324",
        feltInk: "#07281c",
        gold: "#d4b46a",
        ivory: "#fbf6ea",
      },
      night: {
        felt: "#121a17",
        feltDeep: "#0c1110",
        feltInk: "#080c0b",
        gold: "#9c8a5c",
        ivory: "#bfb8a8",
      },
    },
  },
];

const themesById = new Map(TABLE_THEMES.map((theme) => [theme.id, theme]));

export function listTableThemes() {
  return TABLE_THEMES.slice();
}

export function getTableTheme(id) {
  return themesById.get(id) ?? themesById.get(DEFAULT_TABLE_ID);
}

/**
 * Phase 1: always classic felt.
 * Phase 2: Random (default, no immediate repeat) or a pin in TABLE_STORAGE_KEY.
 */
export function pickSessionTable() {
  return DEFAULT_TABLE_ID;
}

export function applyTableTheme(id, root = globalThis.document?.documentElement) {
  const theme = getTableTheme(id);
  root?.setAttribute?.("data-table", theme.id);
  return theme.id;
}
