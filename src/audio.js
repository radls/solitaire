let ctx = null;

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function tone(freq, duration, { type = "sine", gain = 0.02, slide = 0 } = {}) {
  const ac = context();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const wave = type === "triangle" ? "triangle" : "sine";
  const level = Math.min(0.025, gain);
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + duration);
  g.gain.setValueAtTime(level, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export function resumeAudio() {
  const ac = context();
  if (ac?.state === "suspended") ac.resume();
}

export const sounds = {
  draw(muted) {
    if (muted) return;
    tone(240, 0.06, { type: "triangle", gain: 0.018 });
  },
  place(muted) {
    if (muted) return;
    tone(380, 0.08, { type: "triangle", gain: 0.02 });
  },
  flip(muted) {
    if (muted) return;
    tone(520, 0.07, { type: "sine", gain: 0.016, slide: 40 });
  },
  recycle(muted) {
    if (muted) return;
    tone(200, 0.1, { type: "triangle", gain: 0.018, slide: -40 });
  },
  illegal(muted) {
    if (muted) return;
    tone(140, 0.09, { type: "sine", gain: 0.016 });
  },
  undo(muted) {
    if (muted) return;
    tone(300, 0.08, { type: "sine", gain: 0.016, slide: -30 });
  },
  win(muted) {
    if (muted) return;
    tone(523, 0.14, { type: "sine", gain: 0.02 });
    setTimeout(() => tone(659, 0.18, { type: "triangle", gain: 0.018 }), 130);
  },
};
