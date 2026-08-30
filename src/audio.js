let ctx = null;

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function tone(freq, duration, { type = "sine", gain = 0.05, slide = 0 } = {}) {
  const ac = context();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + duration);
  g.gain.setValueAtTime(gain, ac.currentTime);
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
    tone(240, 0.06, { type: "triangle", gain: 0.03 });
  },
  place(muted) {
    if (muted) return;
    tone(380, 0.08, { type: "triangle", gain: 0.04 });
  },
  flip(muted) {
    if (muted) return;
    tone(520, 0.07, { type: "square", gain: 0.02, slide: 80 });
  },
  recycle(muted) {
    if (muted) return;
    tone(200, 0.1, { type: "triangle", gain: 0.03, slide: -60 });
  },
  illegal(muted) {
    if (muted) return;
    tone(110, 0.12, { type: "sawtooth", gain: 0.025 });
  },
  undo(muted) {
    if (muted) return;
    tone(300, 0.08, { type: "sine", gain: 0.03, slide: -40 });
  },
  win(muted) {
    if (muted) return;
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.22, { type: "sine", gain: 0.05 }), i * 120);
    });
  },
};
