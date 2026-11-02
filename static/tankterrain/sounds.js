// WebAudio synthesis for Tank Terrain: engine rumble, every weapon, hits,
// explosions, crumbling walls, pickups and stingers. No audio files.

export function createSounds() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engine = null;
  let laser = null;
  let noise = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      noise = noiseBuffer(2);
      startEngine();
      startLaser();
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

  function startEngine() {
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(master);
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 38;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.16;
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 220;
    low.connect(lowFilter).connect(lowGain).connect(gain);
    const mid = ctx.createOscillator();
    mid.type = 'square';
    mid.frequency.value = 76;
    const midGain = ctx.createGain();
    midGain.gain.value = 0.05;
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'lowpass';
    midFilter.frequency.value = 400;
    mid.connect(midFilter).connect(midGain).connect(gain);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 180;
    band.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3;
    src.connect(band).connect(noiseGain).connect(gain);
    low.start(); mid.start(); src.start();
    engine = { gain, low, mid, band };
  }

  // Helicopter rotor: band-passed noise pulsed by a low oscillator (the blade thump).
  let rotor = null;
  function startRotor() {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 140;
    band.Q.value = 1.2;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(pulse.gain);
    src.connect(band).connect(pulse).connect(gain);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 180;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.04;
    whine.connect(whineGain).connect(gain);
    src.start(); lfo.start(); whine.start();
    rotor = { gain };
  }

  function startLaser() {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 180;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 1400;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(f).connect(gain);
    o2.connect(g2).connect(gain);
    o.start(); o2.start();
    laser = { gain, o, o2 };
  }

  function burst({ seconds = 0.3, from = 2000, to = 200, gain = 0.5, type = 'lowpass', q = 0.8, delay = 0 }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
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
    // throttle 0..1 (speed share), load 0..1 (accelerating)
    setEngine(throttle, load, alive = true) {
      if (!engine) return;
      const t = ctx.currentTime;
      engine.gain.gain.setTargetAtTime(alive ? 0.16 + throttle * 0.22 + load * 0.1 : 0, t, 0.1);
      engine.low.frequency.setTargetAtTime(34 + throttle * 36 + load * 8, t, 0.15);
      engine.mid.frequency.setTargetAtTime(68 + throttle * 72 + load * 16, t, 0.15);
      engine.band.frequency.setTargetAtTime(160 + throttle * 420, t, 0.15);
    },
    setLaser(on) {
      if (!laser) return;
      laser.gain.gain.setTargetAtTime(on ? 0.14 : 0, ctx.currentTime, 0.04);
      if (on) laser.o.frequency.setValueAtTime(150 + Math.random() * 60, ctx.currentTime);
    },
    cannon() {
      burst({ seconds: 0.5, from: 900, to: 60, gain: 0.9, q: 0.5 });
      tone({ freq: 90, to: 30, seconds: 0.45, gain: 0.5, type: 'sine' });
      burst({ seconds: 0.12, from: 5000, to: 1200, gain: 0.3, type: 'highpass' });
    },
    mg() {
      gunAcc++;
      burst({ seconds: 0.06, from: 2800, to: 500, gain: 0.3, q: 0.5 });
      if (gunAcc % 2 === 0) tone({ freq: 180, to: 70, seconds: 0.04, gain: 0.18, type: 'square' });
    },
    enemyGun() { burst({ seconds: 0.07, from: 1800, to: 300, gain: 0.1 }); },
    missile(enemy = false) {
      burst({ seconds: enemy ? 0.5 : 0.8, from: 500, to: 2800, gain: enemy ? 0.15 : 0.35, type: 'bandpass', q: 1.2 });
      tone({ freq: 240, to: 90, seconds: 0.4, gain: enemy ? 0.08 : 0.18, type: 'sawtooth' });
    },
    rocket() {
      burst({ seconds: 0.35, from: 700, to: 2200, gain: 0.3, type: 'bandpass', q: 1 });
      tone({ freq: 300, to: 120, seconds: 0.25, gain: 0.12, type: 'sawtooth' });
    },
    mortar() {
      tone({ freq: 160, to: 50, seconds: 0.3, gain: 0.5, type: 'sine' });
      burst({ seconds: 0.25, from: 600, to: 100, gain: 0.5 });
    },
    nuke() {
      tone({ freq: 60, to: 20, seconds: 2.5, gain: 0.7, type: 'sine' });
      burst({ seconds: 2.4, from: 2000, to: 40, gain: 1.0, q: 0.4 });
      burst({ seconds: 0.5, from: 8000, to: 800, gain: 0.5, type: 'highpass', delay: 0.05 });
    },
    explosion(size = 1) {
      burst({ seconds: 0.7 * size + 0.25, from: 1400, to: 60, gain: Math.min(1, 0.45 + size * 0.4), q: 0.4 });
      tone({ freq: 70, to: 30, seconds: 0.5 + size * 0.3, gain: 0.45, type: 'sine' });
      burst({ seconds: 0.2, from: 6000, to: 1000, gain: 0.25, type: 'highpass', delay: 0.02 });
    },
    crumble(size = 1) {
      burst({ seconds: 0.6 * size + 0.3, from: 700, to: 90, gain: 0.6, q: 0.6 });
      burst({ seconds: 0.4, from: 3000, to: 300, gain: 0.25, type: 'bandpass', q: 0.8, delay: 0.08 });
      tone({ freq: 120, to: 50, seconds: 0.5, gain: 0.25, type: 'triangle' });
    },
    laserTurret() { tone({ freq: 400, to: 1600, seconds: 0.5, gain: 0.12, type: 'sawtooth' }); },
    // Rotor loudness 0..1 from the nearest flying helicopter.
    setRotor(level) {
      if (!ctx) return;
      if (!rotor) startRotor();
      rotor.gain.gain.setTargetAtTime(muted ? 0 : Math.min(1, Math.max(0, level)) * 0.9, ctx.currentTime, 0.2);
    },
    checkpoint() { [660, 880, 1100].forEach((f, i) => tone({ freq: f, seconds: 0.18, gain: 0.13, type: 'triangle', delay: i * 0.1 })); },
    tip() { tone({ freq: 1500, seconds: 0.07, gain: 0.07, type: 'sine' }); tone({ freq: 2000, seconds: 0.09, gain: 0.07, type: 'sine', delay: 0.09 }); },
    armour() { tone({ freq: 2400, to: 900, seconds: 0.09, gain: 0.1, type: 'square' }); burst({ seconds: 0.08, from: 6000, to: 2000, gain: 0.1, type: 'highpass' }); },
    domeHit() { tone({ freq: 700, to: 1400, seconds: 0.15, gain: 0.1, type: 'sine' }); burst({ seconds: 0.12, from: 3000, to: 1200, gain: 0.1, type: 'bandpass', q: 3 }); },
    domeDown() { tone({ freq: 1400, to: 100, seconds: 1.6, gain: 0.25, type: 'sawtooth' }); burst({ seconds: 1.2, from: 2500, to: 100, gain: 0.4, q: 0.5 }); },
    bossRoar() { tone({ freq: 60, to: 120, seconds: 1.2, gain: 0.35, type: 'sawtooth' }); tone({ freq: 90, to: 45, seconds: 1.6, gain: 0.3, type: 'square', delay: 0.6 }); burst({ seconds: 1.0, from: 400, to: 80, gain: 0.3, q: 0.6 }); },
    radio() { for (let i = 0; i < 3; i++) burst({ seconds: 0.06, from: 2600, to: 1800, gain: 0.08, type: 'bandpass', q: 4, delay: i * 0.12 }); },
    hit() { tone({ freq: 900, to: 300, seconds: 0.05, gain: 0.1, type: 'square' }); },
    clank() { tone({ freq: 1200, to: 400, seconds: 0.08, gain: 0.12, type: 'triangle' }); burst({ seconds: 0.08, from: 4000, to: 800, gain: 0.15, type: 'highpass' }); },
    damage() {
      burst({ seconds: 0.3, from: 900, to: 100, gain: 0.5 });
      tone({ freq: 120, to: 40, seconds: 0.3, gain: 0.3, type: 'sine' });
    },
    pickup() { [660, 880, 1320].forEach((f, i) => tone({ freq: f, seconds: 0.14, gain: 0.14, type: 'triangle', delay: i * 0.07 })); },
    weaponPickup() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, seconds: 0.2, gain: 0.15, type: 'triangle', delay: i * 0.07 })); },
    empty() { tone({ freq: 300, to: 200, seconds: 0.08, gain: 0.1, type: 'square' }); },
    lockTick() { tone({ freq: 1100, seconds: 0.05, gain: 0.07, type: 'sine' }); },
    locked() { tone({ freq: 1400, seconds: 0.16, gain: 0.1, type: 'sine' }); tone({ freq: 1400, seconds: 0.16, gain: 0.1, type: 'sine', delay: 0.2 }); },
    stinger() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, seconds: 0.35, gain: 0.15, type: 'triangle', delay: i * 0.09 })); },
    fanfare() { [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone({ freq: f, seconds: 0.7, gain: 0.16, type: 'triangle', delay: i * 0.13 })); },
    down() { tone({ freq: 400, to: 60, seconds: 1.4, gain: 0.3, type: 'sawtooth' }); },
    // The fort alarm: a rising-falling siren repeated a few times.
    siren(times = 4) {
      for (let i = 0; i < times; i++) {
        tone({ freq: 500, to: 900, seconds: 0.5, gain: 0.12, type: 'sawtooth', delay: i * 1.0 });
        tone({ freq: 900, to: 500, seconds: 0.5, gain: 0.12, type: 'sawtooth', delay: i * 1.0 + 0.5 });
      }
    },
    beep() { tone({ freq: 1800, seconds: 0.09, gain: 0.12, type: 'square' }); },
    shield(on) { if (on) { tone({ freq: 300, to: 900, seconds: 0.25, gain: 0.12, type: 'sine' }); } else { tone({ freq: 900, to: 300, seconds: 0.25, gain: 0.1, type: 'sine' }); } },
    shieldHit() { tone({ freq: 1200, to: 600, seconds: 0.12, gain: 0.12, type: 'triangle' }); burst({ seconds: 0.1, from: 5000, to: 1500, gain: 0.12, type: 'bandpass', q: 2 }); },
    smoke() { burst({ seconds: 0.5, from: 1200, to: 200, gain: 0.35, q: 0.6 }); tone({ freq: 200, to: 80, seconds: 0.3, gain: 0.15, type: 'sine' }); },
    jam() { [880, 660, 440, 220].forEach((f, i) => tone({ freq: f, seconds: 0.25, gain: 0.14, type: 'square', delay: i * 0.12 })); },
    buy() { [659, 880, 1318].forEach((f, i) => tone({ freq: f, seconds: 0.16, gain: 0.14, type: 'triangle', delay: i * 0.08 })); },
    objective() { [523, 784, 1046, 1568].forEach((f, i) => tone({ freq: f, seconds: 0.4, gain: 0.15, type: 'triangle', delay: i * 0.1 })); },
    flutter() { for (let i = 0; i < 6; i++) burst({ seconds: 0.05, from: 3000, to: 1500, gain: 0.06, type: 'bandpass', q: 1.5, delay: i * 0.07 }); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      if (rotor && muted) rotor.gain.gain.value = 0;
      return muted;
    },
    get muted() { return muted; }
  };
}
