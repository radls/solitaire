/** DOM selector for the card a hint is pointing at. Waste moves use only the top card. */
export function hintFromSelector(move) {
  if (!move?.from) return null;
  if (move.kind === "draw" || move.type === "draw" || move.from.zone === "stock") {
    return '[data-drop="stock"]';
  }
  if (move.from.zone === "waste") return '.card[data-zone="waste"][data-waste-top="1"]';
  const count = move.from.count ?? 1;
  const index = move.from.index ?? "";
  return `.card[data-zone="${move.from.zone}"][data-index="${index}"][data-count="${count}"]`;
}
