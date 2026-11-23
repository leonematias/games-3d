// Original procedural foley for the outpost: wood, machinery, suit movement, and heat.
// Accepting a context also makes every cue renderable in an OfflineAudioContext.
export function createSounds({ context }) {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -13;
  limiter.knee.value = 7;
  limiter.ratio.value = 7;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  limiter.connect(context.destination);
  const master = context.createGain();
  master.gain.value = 0.72;
  master.connect(limiter);
  const room = context.createDelay(0.2);
  room.delayTime.value = 0.075;
  const roomFilter = context.createBiquadFilter();
  roomFilter.type = 'lowpass';
  roomFilter.frequency.value = 1450;
  const roomGain = context.createGain();
  roomGain.gain.value = 0.13;
  room.connect(roomFilter).connect(roomGain).connect(master);
  const send = context.createGain();
  send.gain.value = 0.2;
  send.connect(room);
  const route = node => { node.connect(master); node.connect(send); };
  const now = () => context.currentTime;

  function envelope(node, start, duration, level, attack = 0.008) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    node.connect(gain);
    route(gain);
    return gain;
  }
  function pulse({ from, to = from, duration = 0.2, level = 0.1, type = 'sine', delay = 0, attack = 0.008 }) {
    const start = now() + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    envelope(oscillator, start, duration, level, attack);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
  function noise({ duration = 0.2, level = 0.1, from = 1100, to = from, type = 'bandpass', delay = 0, attack = 0.005, q = 0.7 }) {
    const start = now() + delay;
    const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(30, from), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + duration);
    source.connect(filter);
    envelope(filter, start, duration, level, attack);
    source.start(start);
    source.stop(start + duration);
  }

  return {
    grab() {
      noise({ duration: 0.16, level: 0.26, from: 1250, to: 290, type: 'lowpass' });
      pulse({ from: 94, to: 62, duration: 0.18, level: 0.19 });
      noise({ duration: 0.09, level: 0.1, from: 2400, to: 1150, delay: 0.05 });
    },
    drop() {
      noise({ duration: 0.17, level: 0.22, from: 1100, to: 300, type: 'lowpass' });
      pulse({ from: 85, to: 52, duration: 0.21, level: 0.15 });
    },
    throw() {
      noise({ duration: 0.3, level: 0.25, from: 250, to: 2200, type: 'bandpass', attack: 0.025 });
      pulse({ from: 112, to: 68, duration: 0.25, level: 0.16 });
    },
    push() {
      noise({ duration: 0.34, level: 0.17, from: 380, to: 580, type: 'bandpass', attack: 0.035, q: 1.3 });
      pulse({ from: 67, to: 55, duration: 0.16, level: 0.07 });
    },
    break() {
      noise({ duration: 0.28, level: 0.38, from: 3500, to: 430, type: 'lowpass' });
      pulse({ from: 130, to: 48, duration: 0.3, level: 0.27 });
      for (let i = 0; i < 4; i++) noise({ duration: 0.08 + Math.random() * 0.1, level: 0.11, from: 1800 + i * 300, to: 400, delay: 0.06 + i * 0.055 });
    },
    hardHit() {
      pulse({ from: 290, to: 95, duration: 0.22, level: 0.18, type: 'triangle' });
      noise({ duration: 0.12, level: 0.18, from: 2600, to: 750, type: 'bandpass' });
    },
    explode() {
      noise({ duration: 0.68, level: 0.45, from: 1200, to: 110, type: 'lowpass' });
      pulse({ from: 100, to: 31, duration: 0.62, level: 0.31, type: 'sawtooth' });
      for (let i = 0; i < 4; i++) noise({ duration: 0.18, level: 0.13, from: 2700, to: 450, delay: i * 0.075 });
    },
    vent() {
      noise({ duration: 0.64, level: 0.28, from: 230, to: 1250, type: 'bandpass', attack: 0.04 });
      pulse({ from: 82, to: 54, duration: 0.58, level: 0.16, type: 'sawtooth' });
    },
    monsterAttack() {
      noise({ duration: 0.42, level: 0.25, from: 480, to: 125, type: 'bandpass' });
      pulse({ from: 155, to: 73, duration: 0.42, level: 0.19, type: 'sawtooth' });
    },
    monsterHit() {
      noise({ duration: 0.21, level: 0.27, from: 900, to: 240, type: 'lowpass' });
      pulse({ from: 205, to: 81, duration: 0.25, level: 0.18, type: 'sawtooth' });
    },
    monsterDie() {
      noise({ duration: 0.72, level: 0.32, from: 760, to: 110, type: 'bandpass' });
      pulse({ from: 165, to: 40, duration: 0.74, level: 0.25, type: 'sawtooth' });
      noise({ duration: 0.3, level: 0.14, from: 1450, to: 240, delay: 0.33 });
    },
    key() {
      pulse({ from: 740, to: 690, duration: 0.24, level: 0.11, type: 'sine' });
      pulse({ from: 1110, to: 980, duration: 0.26, level: 0.06, type: 'sine', delay: 0.07 });
      noise({ duration: 0.12, level: 0.08, from: 3900, to: 1800, delay: 0.03 });
    },
    door() {
      noise({ duration: 1.55, level: 0.19, from: 570, to: 130, type: 'bandpass', attack: 0.09, q: 1.6 });
      pulse({ from: 78, to: 46, duration: 1.45, level: 0.17, type: 'sawtooth', attack: 0.12 });
      noise({ duration: 0.19, level: 0.22, from: 1400, to: 220, type: 'lowpass', delay: 1.38 });
      pulse({ from: 82, to: 44, duration: 0.27, level: 0.19, delay: 1.39 });
    },
    denied() {
      pulse({ from: 180, to: 145, duration: 0.17, level: 0.1, type: 'sine' });
      pulse({ from: 165, to: 118, duration: 0.17, level: 0.1, type: 'sine', delay: 0.18 });
    },
    hazard() {
      noise({ duration: 0.9, level: 0.34, from: 3200, to: 260, type: 'bandpass', attack: 0.018 });
      pulse({ from: 92, to: 40, duration: 0.65, level: 0.23, type: 'sawtooth' });
      for (let i = 0; i < 6; i++) noise({ duration: 0.06, level: 0.085, from: 3300, to: 750, delay: i * 0.1 });
    },
    climb() {
      noise({ duration: 0.52, level: 0.19, from: 190, to: 580, type: 'bandpass', attack: 0.11 });
      pulse({ from: 118, to: 75, duration: 0.48, level: 0.12, type: 'sawtooth', attack: 0.08 });
      noise({ duration: 0.13, level: 0.13, from: 1250, to: 380, type: 'lowpass', delay: 0.53 });
    },
    step() {
      noise({ duration: 0.1, level: 0.09, from: 650, to: 190, type: 'lowpass' });
      pulse({ from: 63, to: 47, duration: 0.11, level: 0.045 });
    },
    win() {
      noise({ duration: 0.7, level: 0.16, from: 280, to: 2200, type: 'bandpass', attack: 0.1 });
      pulse({ from: 220, to: 330, duration: 0.5, level: 0.1, delay: 0.12 });
      pulse({ from: 330, to: 440, duration: 0.65, level: 0.1, delay: 0.3 });
    },
  };
}
