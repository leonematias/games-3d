// WebAudio for the match. Hits are synthesized. The crowd bed is
// backend/sounds/hinchada_background.m4a and a goal plays backend/sounds/gol.m4a.
// Both are served from /sounds/. Pass `context` and `ambient: 0` to measure the hits.

const LOUDNESS = 1.7;
const BED_URL = '/games-3d/sounds/hinchada_background.m4a';
const GOAL_URL = '/games-3d/sounds/gol.m4a';
// The bed peaks near 0.68. Trim holds it back so the hits stay in front.
const BED_TRIM = 0.08;
// The goal clip peaks near 0.52. This lands it clearly over the bed.
const GOAL_TRIM = 0.65;

export function createSounds({ context = null, ambient = 1 } = {}) {
  let ctx = null;
  let master = null;
  let send = null;
  let noise = null;
  let crowdGain = null;
  let goalBuffer = null;
  let goalSrc = null;
  let goalGain = null;
  let partySrc = null;
  let muted = false;
  let swellOn = false;
  let partyOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = context || new (window.AudioContext || window.webkitAudioContext)();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -5;
      limiter.knee.value = 4;
      limiter.ratio.value = 3;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : LOUDNESS;
      master.connect(limiter).connect(ctx.destination);
      const n = Math.floor(ctx.sampleRate * 4);
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      send = ctx.createGain();
      const hall = ctx.createConvolver();
      hall.buffer = impulse(2.4, 1.7);
      send.connect(hall).connect(master);
      startCrowd();
      return true;
    } catch {
      return false;
    }
  }

  // A bowl: a near slap, then a tail that darkens. Longer than a room, shorter than a cave.
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.042);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const channel = buffer.getChannelData(c);
      const slap = Math.floor(rate * (0.016 + c * 0.005));
      channel[slap] = c ? 0.28 : 0.4;
      let low = 0;
      for (let i = pre; i < length; i++) {
        const t = (i - pre) / rate;
        low += (Math.random() * 2 - 1 - low) * (0.4 / (1 + t * 2.4));
        channel[i] += low * Math.exp(-t * decay);
      }
    }
    return buffer;
  }

  function route(node, wet = 0.3, pan = 0, panTo = null, t = 0, seconds = 0) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    if (panTo !== null) p.pan.linearRampToValueAtTime(panTo, t + seconds);
    node.connect(p).connect(master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(send);
    }
  }

  function envelope(g, t, level, attack, seconds) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  }

  function whoosh({ seconds = 0.3, type = 'bandpass', from = 900, to = 500, q = 1, level = 0.3, attack = 0.01, wet = 0.3, pan = 0, panTo = null, delay = 0, flutter = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(30, from), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + seconds);
    const g = ctx.createGain();
    envelope(g, t, level, attack, seconds);
    src.connect(f).connect(g);
    if (flutter) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = flutter;
      depth.gain.value = Math.min(from, to) * 0.35;
      lfo.connect(depth).connect(f.frequency);
      lfo.start(t);
      lfo.stop(t + seconds + 0.05);
    }
    route(g, wet, pan, panTo, t, seconds);
    src.start(t, Math.random() * 3);
    src.stop(t + seconds + 0.05);
  }

  function sub({ freq = 70, to = 40, seconds = 0.16, level = 0.3, attack = 0.005, delay = 0, wet = 0.12 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(28, to), t + seconds);
    const g = ctx.createGain();
    envelope(g, t, level, attack, seconds);
    o.connect(g);
    route(g, wet);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  // A pea whistle: two high sines, each trembling, mostly dry.
  function trill(freq, seconds, level, rate) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = rate;
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    envelope(g, t, level, 0.012, seconds);
    o.connect(trem).connect(g);
    route(g, 0.04, freq > 3000 ? 0.15 : -0.12);
    o.start(t);
    lfo.start(t);
    o.stop(t + seconds + 0.05);
    lfo.stop(t + seconds + 0.05);
  }

  function crowdTarget() {
    if (!(ambient > 0)) return 0;
    let level = 1;
    if (swellOn) level *= 1.8;
    if (partyOn) level *= 1.35;
    return level;
  }

  function applyCrowd() {
    if (!crowdGain) return;
    crowdGain.gain.setTargetAtTime(crowdTarget(), ctx.currentTime, 0.12);
  }

  function softenLoop(buffer) {
    const fade = Math.min(Math.floor(buffer.sampleRate * 0.04), Math.floor(buffer.length / 4));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < fade; i++) {
        const w = i / fade;
        data[i] *= w;
        data[data.length - 1 - i] *= w;
      }
    }
  }

  function startCrowd() {
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    route(crowdGain, 0);
    const offline = typeof ctx.startRendering === 'function';
    if (!(ambient > 0) || offline || typeof fetch !== 'function') return;
    // One decode at a time. Overlapping decodes drop the goal clip.
    let decodeChain = Promise.resolve();
    const load = (url) => {
      const job = decodeChain.then(() => fetch(url).then((res) => {
        if (!res.ok) throw new Error(url);
        return res.arrayBuffer();
      }).then((raw) => ctx.decodeAudioData(raw)));
      decodeChain = job.catch(() => {});
      return job;
    };
    load(GOAL_URL).then((buffer) => { goalBuffer = buffer; }).catch(() => {});
    load(BED_URL)
      .then((buffer) => {
        softenLoop(buffer);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const trim = ctx.createGain();
        trim.gain.value = BED_TRIM;
        src.connect(trim).connect(crowdGain);
        src.start();
        applyCrowd();
      })
      .catch(() => {});
  }

  function stopClaps() {
    if (!partySrc) return;
    try { partySrc.stop(); } catch { /* already ended */ }
    partySrc.disconnect();
    partySrc = null;
  }

  return {
    resume() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    mute() {
      muted = !muted;
      if (ensure()) master.gain.value = muted ? 0 : LOUDNESS;
      return muted;
    },
    swell(on) {
      swellOn = !!on;
      if (ensure()) applyCrowd();
    },
    party(on) {
      partyOn = !!on;
      if (!ensure()) return;
      stopClaps();
      applyCrowd();
      if (!on) return;
      const seconds = 1.6;
      const rate = ctx.sampleRate;
      const length = Math.floor(rate * seconds);
      const buffer = ctx.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      for (const at of [0.06, 0.42, 0.86]) {
        const start = Math.floor(at * rate);
        const span = Math.floor(rate * 0.045);
        for (let i = 0; i < span && start + i < length; i++) {
          data[start + i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.007));
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      filter.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.2;
      src.connect(filter).connect(g);
      route(g, 0.4, -0.2);
      src.start();
      partySrc = src;
    },
    kick() {
      whoosh({ seconds: 0.09, from: 220, to: 640, q: 0.9, level: 0.52, attack: 0.004, wet: 0.08 });
      whoosh({ seconds: 0.03, type: 'highpass', from: 2200, to: 1400, q: 0.6, level: 0.12, attack: 0.002, wet: 0.04 });
      sub({ freq: 118, to: 52, seconds: 0.11, level: 0.5, wet: 0.05 });
    },
    pass() {
      whoosh({ seconds: 0.07, from: 480, to: 980, q: 0.7, level: 1.05, attack: 0.004, wet: 0.08, pan: -0.15, panTo: 0.2 });
      sub({ freq: 96, to: 70, seconds: 0.06, level: 0.34, wet: 0.05 });
    },
    drive() {
      whoosh({ seconds: 0.26, from: 420, to: 1600, q: 0.7, level: 0.68, attack: 0.006, wet: 0.28, pan: -0.2, panTo: 0.35, flutter: 14 });
      whoosh({ seconds: 0.12, type: 'lowpass', from: 500, to: 140, q: 0.6, level: 0.44, attack: 0.004, wet: 0.15 });
      sub({ freq: 96, to: 38, seconds: 0.2, level: 0.74 });
    },
    save() {
      whoosh({ seconds: 0.08, from: 1400, to: 500, q: 0.9, level: 0.9, attack: 0.003, wet: 0.1 });
      whoosh({ seconds: 0.04, type: 'highpass', from: 2800, to: 1600, q: 0.5, level: 0.22, attack: 0.002, wet: 0.05 });
      sub({ freq: 86, to: 48, seconds: 0.07, level: 0.26 });
    },
    whistle() {
      if (!ensure()) return;
      trill(2520, 0.32, 0.16, 21);
      trill(3180, 0.32, 0.11, 27);
    },
    charge() {
      whoosh({ seconds: 0.14, from: 900, to: 2200, q: 0.7, level: 0.32, attack: 0.015, wet: 0.08, pan: 0.1 });
    },
    stopGoal() {
      if (!goalSrc || !ctx) return;
      const src = goalSrc;
      const gain = goalGain;
      goalSrc = null;
      goalGain = null;
      const t = ctx.currentTime;
      if (gain) {
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
        gain.gain.linearRampToValueAtTime(0, t + 0.1);
      }
      try { src.stop(t + 0.12); } catch { /* already ended */ }
    },
    goal() {
      if (!ensure() || !goalBuffer) return;
      if (goalSrc) {
        try { goalSrc.stop(); } catch { /* already ended */ }
      }
      const src = ctx.createBufferSource();
      src.buffer = goalBuffer;
      const trim = ctx.createGain();
      trim.gain.value = GOAL_TRIM;
      src.connect(trim);
      route(trim, 0.12);
      src.start();
      goalSrc = src;
      goalGain = trim;
      src.onended = () => {
        if (goalSrc === src) { goalSrc = null; goalGain = null; }
      };
    },
  };
}
