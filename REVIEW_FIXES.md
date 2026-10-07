# Klondike review fixes

- Sound is off by default, and every game reads and writes the shared `sound` pref.
- Finish stays hidden until the waste and the stock are empty and every tableau card is face up.
- Undo after a reload keeps the live `startedAt`, so the timer does not jump.
- Hints suggest only useful moves; tableau shuffles and empty-stock recycles are not hinted.
- A new deal is saved as soon as it starts, so leaving the game and coming back resumes it.
- An illegal drop plays the error tone once.
