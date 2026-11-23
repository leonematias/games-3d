// WebAudio synthesis for Medieval: hoof beats, wind, sword swings and clangs,
// bow twangs, arrows, crossbow thunks, shield blocks, splintering wood,
// fire pots, pickups, the horse's whinny and the knight's whistle. No audio files.

export function createSounds() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noise = null;
  let wind = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      noise = noiseBuffer(2);
      startWind();
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

  // A soft highland wind: filtered noise with a slow wandering filter.
  function startWind() {
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    gain.connect(master);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(band.frequency);
    src.connect(band).connect(gain);
    src.start();
    lfo.start();
    wind = { gain, band };
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

  function tone({ freq = 800, to = null, seconds = 0.1, gain = 0.2, type = 'square', delay = 0, attack = 0.005 }) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  // A metallic ring: a few detuned partials.
  function clang(base = 1800, seconds = 0.35, gain = 0.12) {
    [1, 1.5, 2.27, 3.1].forEach((k, i) => tone({ freq: base * k, seconds: seconds * (1 - i * 0.15), gain: gain / (i + 1), type: 'sine' }));
    burst({ seconds: 0.06, from: 6000, to: 2000, gain: 0.15, type: 'highpass' });
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    // One hoof on the ground. `hard` is loud for a gallop, soft for a walk.
    hoof(hard = 0.5, grass = true) {
      if (!ctx) return;
      burst({ seconds: 0.07 + hard * 0.05, from: grass ? 500 : 1400, to: 90, gain: 0.12 + hard * 0.3, q: 0.9 });
      tone({ freq: 90 + hard * 40, to: 45, seconds: 0.08, gain: 0.08 + hard * 0.12, type: 'sine' });
    },
    setWind(level) { if (wind) wind.gain.gain.setTargetAtTime(0.03 + level * 0.06, ctx.currentTime, 0.4); },
    swing() { burst({ seconds: 0.22, from: 600, to: 2600, gain: 0.22, type: 'bandpass', q: 1.4 }); },
    thrust() { burst({ seconds: 0.18, from: 900, to: 3000, gain: 0.2, type: 'bandpass', q: 1.6 }); },
    clang() { clang(1700 + Math.random() * 400, 0.4, 0.14); },
    flesh() { burst({ seconds: 0.14, from: 700, to: 120, gain: 0.35, q: 0.7 }); tone({ freq: 160, to: 60, seconds: 0.12, gain: 0.15, type: 'triangle' }); },
    block() { clang(1100 + Math.random() * 200, 0.3, 0.16); burst({ seconds: 0.1, from: 900, to: 200, gain: 0.25 }); },
    bow() { tone({ freq: 220, to: 90, seconds: 0.09, gain: 0.18, type: 'triangle' }); burst({ seconds: 0.25, from: 1500, to: 4000, gain: 0.12, type: 'bandpass', q: 2 }); },
    crossbow() { burst({ seconds: 0.06, from: 2500, to: 600, gain: 0.3, q: 0.6 }); tone({ freq: 140, to: 70, seconds: 0.12, gain: 0.25, type: 'square' }); burst({ seconds: 0.3, from: 2000, to: 5000, gain: 0.1, type: 'bandpass', q: 2, delay: 0.02 }); },
    reload() { tone({ freq: 500, seconds: 0.04, gain: 0.06, type: 'square' }); tone({ freq: 380, seconds: 0.05, gain: 0.06, type: 'square', delay: 0.12 }); },
    enemyBow() { tone({ freq: 200, to: 80, seconds: 0.08, gain: 0.08, type: 'triangle' }); },
    arrowHit() { burst({ seconds: 0.09, from: 1800, to: 300, gain: 0.18 }); tone({ freq: 300, to: 120, seconds: 0.08, gain: 0.08, type: 'triangle' }); },
    whoosh() { burst({ seconds: 0.18, from: 900, to: 2400, gain: 0.08, type: 'bandpass', q: 1.2 }); },
    splinter(size = 1) {
      burst({ seconds: 0.35 * size + 0.15, from: 900, to: 150, gain: 0.5, q: 0.7 });
      [900, 1400, 2300].forEach((f, i) => tone({ freq: f, to: f * 0.5, seconds: 0.08, gain: 0.08, type: 'square', delay: i * 0.03 }));
    },
    crumble(size = 1) {
      burst({ seconds: 0.6 * size + 0.3, from: 700, to: 90, gain: 0.6, q: 0.6 });
      tone({ freq: 120, to: 50, seconds: 0.5, gain: 0.25, type: 'triangle' });
    },
    explosion(size = 1) {
      burst({ seconds: 0.6 * size + 0.25, from: 1400, to: 60, gain: Math.min(1, 0.4 + size * 0.4), q: 0.4 });
      tone({ freq: 70, to: 30, seconds: 0.5 + size * 0.3, gain: 0.4, type: 'sine' });
      burst({ seconds: 0.2, from: 6000, to: 1000, gain: 0.2, type: 'highpass', delay: 0.02 });
    },
    damage() {
      burst({ seconds: 0.25, from: 900, to: 120, gain: 0.4 });
      tone({ freq: 140, to: 60, seconds: 0.25, gain: 0.2, type: 'sawtooth' });
    },
    pickup() { [660, 880, 1320].forEach((f, i) => tone({ freq: f, seconds: 0.14, gain: 0.12, type: 'triangle', delay: i * 0.07 })); },
    weaponPickup() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, seconds: 0.2, gain: 0.14, type: 'triangle', delay: i * 0.07 })); },
    empty() { tone({ freq: 300, to: 200, seconds: 0.08, gain: 0.1, type: 'square' }); },
    lockTick() { tone({ freq: 1100, seconds: 0.05, gain: 0.06, type: 'sine' }); },
    locked() { tone({ freq: 1400, seconds: 0.16, gain: 0.09, type: 'sine' }); tone({ freq: 1400, seconds: 0.16, gain: 0.09, type: 'sine', delay: 0.2 }); },
    stinger() { [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, seconds: 0.4, gain: 0.14, type: 'triangle', delay: i * 0.1 })); },
    reserveHorn() {
      for(const [delay,freq,seconds] of [[0,147,.35],[.46,147,.35],[.92,196,.8]]){
        tone({freq,to:freq*1.02,seconds,gain:.13,type:'sawtooth',delay,attack:.06});
      }
    },
    // A horn fanfare for the banner.
    fanfare() { [392, 392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ freq: f, seconds: 0.5, gain: 0.16, type: 'sawtooth', delay: i * 0.17, attack: 0.03 })); },
    down() { tone({ freq: 300, to: 60, seconds: 1.4, gain: 0.28, type: 'sawtooth' }); burst({ seconds: 0.6, from: 800, to: 100, gain: 0.3 }); },
    // Whinny: a warbling glide.
    // A short snort as the horse is spurred on; `blown` is a longer, heavier blow.
    snort(blown = false) {
      if (!ctx) return;
      burst({ seconds: blown ? 0.55 : 0.22, from: blown ? 900 : 1400, to: 300, gain: blown ? 0.22 : 0.14, type: 'bandpass', q: 0.6 });
      if (blown) burst({ seconds: 0.5, from: 700, to: 250, gain: 0.16, type: 'bandpass', q: 0.6, delay: 0.5 });
    },
    neigh() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.15);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.9);
      const v = ctx.createOscillator();
      v.frequency.value = 14;
      const vg = ctx.createGain();
      vg.gain.value = 90;
      v.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      o.connect(f).connect(g).connect(master);
      o.start(t); v.start(t);
      o.stop(t + 1); v.stop(t + 1);
    },
    whistle() { tone({ freq: 1500, to: 2200, seconds: 0.28, gain: 0.12, type: 'sine', attack: 0.02 }); tone({ freq: 2200, to: 1700, seconds: 0.3, gain: 0.12, type: 'sine', delay: 0.32, attack: 0.02 }); },
    mount() { burst({ seconds: 0.2, from: 600, to: 200, gain: 0.2 }); tone({ freq: 220, to: 160, seconds: 0.15, gain: 0.08, type: 'triangle' }); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
    get muted() { return muted; }
  };
}
