// WebAudio synthesis for the fighter: engine, cannon, missiles, explosions,
// lock tones, the missile alert, EMP, hits and stingers. No audio files.

export function createSounds() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null;
  let alertTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      startEngine();
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds = 1.5) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  let noise = null;

  function startEngine() {
    noise = noiseBuffer(2);
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(master);
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 48;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.12;
    low.connect(lowGain).connect(gain);
    const mid = ctx.createOscillator();
    mid.type = 'triangle';
    mid.frequency.value = 96;
    const midGain = ctx.createGain();
    midGain.gain.value = 0.08;
    mid.connect(midGain).connect(gain);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;
    src.connect(band).connect(noiseGain).connect(gain);
    low.start(); mid.start(); src.start();
    engine = { gain, low, mid, band, noiseGain };
  }

  // throttle 0..1, boost 0..1
  function setEngine(throttle, boost) {
    if (!engine) return;
    const t = ctx.currentTime;
    engine.gain.gain.setTargetAtTime(0.18 + throttle * 0.2 + boost * 0.3, t, 0.08);
    engine.low.frequency.setTargetAtTime(44 + throttle * 30 + boost * 40, t, 0.1);
    engine.mid.frequency.setTargetAtTime(88 + throttle * 60 + boost * 90, t, 0.1);
    engine.band.frequency.setTargetAtTime(380 + throttle * 500 + boost * 1400, t, 0.1);
  }

  function burst({ seconds = 0.3, from = 2000, to = 200, gain = 0.5, type = 'lowpass', q = 0.8, delay = 0 }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noise || noiseBuffer(2);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    const t = ctx.currentTime + delay;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + seconds + 0.05);
  }

  function tone({ freq = 800, to = null, seconds = 0.1, gain = 0.2, type = 'square', delay = 0 }) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  let gunAcc = 0;
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setEngine,
    gun() {
      if (!ctx) return;
      gunAcc++;
      burst({ seconds: 0.07, from: 2600, to: 400, gain: 0.35, q: 0.5 });
      if (gunAcc % 2 === 0) tone({ freq: 160, to: 60, seconds: 0.05, gain: 0.25, type: 'square' });
    },
    enemyGun() { burst({ seconds: 0.08, from: 1800, to: 300, gain: 0.12 }); },
    missileLaunch(enemy) {
      burst({ seconds: enemy ? 0.5 : 0.9, from: 600, to: 3000, gain: enemy ? 0.15 : 0.4, type: 'bandpass', q: 1.2 });
      tone({ freq: 220, to: 90, seconds: 0.4, gain: enemy ? 0.08 : 0.2, type: 'sawtooth' });
    },
    bombDrop() { tone({ freq: 1300, to: 400, seconds: 1.6, gain: 0.08, type: 'sine' }); },
    explosion(size = 1) {
      burst({ seconds: 0.9 * size + 0.3, from: 1500, to: 60, gain: Math.min(1, 0.5 + size * 0.4), q: 0.4 });
      tone({ freq: 70, to: 30, seconds: 0.6 + size * 0.3, gain: 0.5, type: 'sine' });
      burst({ seconds: 0.25, from: 6000, to: 1000, gain: 0.3, type: 'highpass', delay: 0.02 });
    },
    hit() { tone({ freq: 900, to: 300, seconds: 0.05, gain: 0.12, type: 'square' }); },
    damage() {
      burst({ seconds: 0.3, from: 900, to: 100, gain: 0.5 });
      tone({ freq: 120, to: 40, seconds: 0.3, gain: 0.3, type: 'sine' });
    },
    lockTick() { tone({ freq: 1100, seconds: 0.05, gain: 0.08, type: 'sine' }); },
    locked() { tone({ freq: 1400, seconds: 0.18, gain: 0.12, type: 'sine' }); tone({ freq: 1400, seconds: 0.18, gain: 0.12, type: 'sine', delay: 0.22 }); },
    alert(on) {
      if (on && !alertTimer) {
        let flip = false;
        alertTimer = setInterval(() => { tone({ freq: flip ? 1000 : 740, seconds: 0.12, gain: 0.1, type: 'square' }); flip = !flip; }, 180);
      } else if (!on && alertTimer) { clearInterval(alertTimer); alertTimer = null; }
    },
    emp() {
      tone({ freq: 3000, to: 60, seconds: 1.1, gain: 0.35, type: 'sawtooth' });
      burst({ seconds: 1.2, from: 8000, to: 200, gain: 0.4, type: 'highpass' });
    },
    boost(on) { if (on) burst({ seconds: 0.6, from: 300, to: 2500, gain: 0.25, type: 'bandpass', q: 1 }); },
    stinger() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, seconds: 0.35, gain: 0.15, type: 'triangle', delay: i * 0.09 })); },
    fanfare() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, seconds: 0.6, gain: 0.16, type: 'triangle', delay: i * 0.13 })); },
    down() { tone({ freq: 400, to: 60, seconds: 1.4, gain: 0.3, type: 'sawtooth' }); },
    eject() {
      burst({ seconds: 0.25, from: 3000, to: 200, gain: 0.7, q: 0.5 });
      burst({ seconds: 1.1, from: 400, to: 2600, gain: 0.35, type: 'bandpass', q: 1.4, delay: 0.1 });
      tone({ freq: 90, to: 40, seconds: 0.5, gain: 0.4, type: 'sine' });
    },
    chute() { burst({ seconds: 0.5, from: 1200, to: 300, gain: 0.3 }); burst({ seconds: 0.9, from: 500, to: 900, gain: 0.12, type: 'bandpass', q: 0.6, delay: 0.3 }); },
    land() { burst({ seconds: 0.3, from: 700, to: 120, gain: 0.3 }); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    get muted() { return muted; }
  };
}
