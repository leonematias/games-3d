// Small synthesized cues. Nothing is loaded from disk; the first gesture
// resumes the audio context.
export function createSounds() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioCtx ? new AudioCtx() : null;
  function envGain(duration, peak) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    return gain;
  }
  function tone(freq, duration, type, peak) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(envGain(duration, peak));
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }
  function noise(duration, peak, freq) {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    src.connect(filter);
    filter.connect(envGain(duration, peak));
    src.start();
  }
  let stepTimer = 0;
  let rexTimer = 0;
  let rainGain = null;
  let rainSource = null;
  return {
    unlock() { ctx?.resume(); },
    chomp() {
      tone(160, 0.14, 'triangle', 0.12);
      tone(70, 0.2, 'sine', 0.08);
    },
    roar(scale = 1) {
      if (!ctx) return;
      const peak = 0.08 * scale;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.7);
      osc.connect(envGain(0.75, peak));
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      noise(0.5, peak * 0.6, 400);
    },
    bite() { noise(0.22, 0.16, 900); tone(90, 0.18, 'square', 0.05); },
    whip() {
      noise(0.16, 0.1, 500);
      tone(220, 0.12, 'sawtooth', 0.05);
      tone(90, 0.2, 'sine', 0.06);
    },
    growl() {
      tone(64, 0.32, 'sawtooth', 0.045);
      noise(0.28, 0.04, 180);
    },
    drink() {
      noise(0.14, 0.045, 1600);
      tone(420, 0.12, 'sine', 0.035);
    },
    splash() {
      noise(0.28, 0.1, 1400);
      tone(280, 0.16, 'sine', 0.05);
    },
    creak() {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(210, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.45);
      osc.connect(envGain(0.5, 0.05));
      osc.start();
      osc.stop(ctx.currentTime + 0.52);
    },
    impact() {
      noise(0.4, 0.16, 220);
      tone(48, 0.32, 'sine', 0.08);
    },
    win() {
      [262, 330, 392, 523].forEach((freq, i) => setTimeout(() => tone(freq, 0.28, 'triangle', 0.07), i * 140));
    },
    footsteps(dt, speedRatio) {
      if (!ctx || speedRatio < 0.15) { stepTimer = 0; return; }
      stepTimer -= dt;
      if (stepTimer > 0) return;
      stepTimer = 0.42 - speedRatio * 0.18;
      noise(0.07, 0.03 + speedRatio * 0.03, 220);
    },
    rexSteps(dt, loud) {
      if (!ctx || loud < 0.05) return;
      rexTimer -= dt;
      if (rexTimer > 0) return;
      rexTimer = 0.5 - Math.min(0.22, loud * 0.22);
      noise(0.1, 0.02 + loud * 0.14, 130);
    },
    setRain(on) {
      if (!ctx) return;
      if (!rainSource) {
        const length = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        rainSource = ctx.createBufferSource();
        rainSource.buffer = buffer;
        rainSource.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        rainGain = ctx.createGain();
        rainGain.gain.value = 0;
        rainSource.connect(filter);
        filter.connect(rainGain);
        rainGain.connect(ctx.destination);
        rainSource.start();
      }
      rainGain.gain.value = on ? 0.02 : 0;
    }
  };
}
