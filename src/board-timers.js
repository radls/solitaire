/** Clear the column/foundation glow. A board that has been left does not paint. */
export function scheduleGlowClear(session, paint, delay = 1800) {
  if (session.glowTimer) clearTimeout(session.glowTimer);
  session.glowTimer = setTimeout(() => {
    session.glowTimer = 0;
    if (session.alive === false) return;
    paint();
  }, delay);
}

/** Stop a pending glow paint. Called when the board is unmounted. */
export function stopBoardPaint(session) {
  session.alive = false;
  if (session.glowTimer) clearTimeout(session.glowTimer);
  session.glowTimer = 0;
}
