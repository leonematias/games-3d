// Plays the music library in backend/sounds/music/ (rendered by backend/sounds/music_tools/musiclab.py).
// One track at a time, with crossfades, loops that have no seam, optional layers and one-shot stingers.
//
//   import { createMusic } from '/games-3d/static/music/music-player.js';
//   const music = createMusic({ context: ctx, volume: 0.5 });     // share the game's AudioContext if it has one
//   music.play('tank/iron-road');                                 // fades in; a second play() crossfades
//   music.setLayer('combat', 1);                                  // bring a layer in over 1.5 s
//   music.stinger('shared/victory');                              // one shot over the music, which dips under it
//   music.stop({ fade: 2 });
//
// Browsers only start audio after a key press or a click: call music.resume() from the first input handler.

export function createMusic({ context = null, base = '/games-3d/sounds/music/', volume = 0.6, destination = null } = {}) {
  let ctx = context;
  let out = null;          // master volume
  let dip = null;          // ducks the music under stingers and on duck()
  let manifest = null;
  let current = null;
  let request = 0;
  let muted = false;
  let cacheBust = '';
  const buffers = new Map();      // file -> Promise<AudioBuffer>

  // The jukebox renders new files while a page is open. Drop the cached manifest and decoded audio.
  function reload() {
    manifest = null;
    buffers.clear();
    cacheBust = `?t=${Date.now()}`;
  }

  function ensure() {
    if (out) return;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createGain();
    out.gain.value = muted ? 0 : volume;
    out.connect(destination || ctx.destination);
    dip = ctx.createGain();
    dip.connect(out);
  }

  function tracks() {
    manifest = manifest || fetch(`${base}manifest.json${cacheBust}`).then((r) => {
      if (!r.ok) throw new Error(`music manifest: ${r.status}`);
      return r.json();
    }).then((m) => m.tracks);
    return manifest;
  }

  function load(file) {
    ensure();
    if (!buffers.has(file)) {
      buffers.set(file, fetch(base + file + cacheBust).then((r) => {
        if (!r.ok) throw new Error(`${file}: ${r.status}`);
        return r.arrayBuffer();
      }).then((data) => ctx.decodeAudioData(data)).catch((error) => { buffers.delete(file); throw error; }));
    }
    return buffers.get(file);
  }

  async function info(id) {
    const entry = (await tracks())[id];
    if (!entry) throw new Error(`no music track "${id}" in ${base}manifest.json`);
    return entry;
  }

  function ramp(param, value, seconds, at = ctx.currentTime) {
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
    param.linearRampToValueAtTime(value, at + Math.max(0.01, seconds));
  }

  // layers: { name: level } for the start; a layer that is not named starts silent, except "base".
  async function play(id, { fade = 1.2, layers = null, offset = 0, loop = true } = {}) {
    ensure();
    if (current && current.id === id) return current;
    const token = ++request;
    const entry = await info(id);
    const names = Object.keys(entry.files);
    const decoded = await Promise.all(names.map((name) => load(entry.files[name])));
    if (token !== request) return null;                    // a later play() or stop() won
    stop({ fade });
    const when = ctx.currentTime + 0.06;
    const voice = { id, info: entry, gain: ctx.createGain(), layers: {}, startedAt: when, offset, looping: !!(entry.loop && loop) };
    voice.gain.gain.setValueAtTime(0, when);
    voice.gain.gain.linearRampToValueAtTime(1, when + Math.max(0.01, fade));
    voice.gain.connect(dip);
    names.forEach((name, i) => {
      const source = ctx.createBufferSource();
      source.buffer = decoded[i];
      if (voice.looping) {
        source.loop = true;
        source.loopStart = entry.loop[0];
        source.loopEnd = entry.loop[1];
      }
      const gain = ctx.createGain();
      gain.gain.value = layers && name in layers ? layers[name] : (name === 'base' ? 1 : 0);
      source.connect(gain).connect(voice.gain);
      source.start(when, Math.max(0, offset));
      voice.layers[name] = { source, gain };
    });
    if (!voice.looping) voice.layers[names[0]].source.onended = () => { if (current === voice) current = null; };
    current = voice;
    for (const [file] of buffers) {                         // decoded audio is large: keep only what plays
      if (!names.some((name) => entry.files[name] === file) && !file.startsWith('shared/')) buffers.delete(file);
    }
    return voice;
  }

  function stop({ fade = 1.0 } = {}) {
    request++;
    const voice = current;
    current = null;
    if (!voice) return;
    const end = ctx.currentTime + Math.max(0.01, fade);
    ramp(voice.gain.gain, 0, fade);
    for (const layer of Object.values(voice.layers)) layer.source.stop(end + 0.05);
  }

  function setLayer(name, level, seconds = 1.5) {
    const layer = current && current.layers[name];
    if (layer) ramp(layer.gain.gain, level, seconds);
    return !!layer;
  }

  // 0 = only "base"; 1 = every layer in. With one extra layer this is a combat dial.
  function setIntensity(amount, seconds = 1.5) {
    if (!current) return;
    for (const name of Object.keys(current.layers)) if (name !== 'base') setLayer(name, Math.max(0, Math.min(1, amount)), seconds);
  }

  function setVolume(value, seconds = 0.2) {
    volume = value;
    if (out && !muted) ramp(out.gain, value, seconds);
  }

  function setMuted(flag) {
    muted = !!flag;
    if (out) ramp(out.gain, muted ? 0 : volume, 0.15);
  }

  // Pull the music down to `level` (0..1) and leave it there until duck(1).
  function duck(level = 0.35, seconds = 0.4) {
    ensure();
    ramp(dip.gain, level, seconds);
  }

  // A one-shot (victory, defeat) straight to the output. The music dips under it and comes back.
  async function stinger(id, { under = 0.3, gain = 1 } = {}) {
    ensure();
    const entry = await info(id);
    const buffer = await load(Object.values(entry.files)[0]);
    const source = ctx.createBufferSource();
    const level = ctx.createGain();
    level.gain.value = gain;
    source.buffer = buffer;
    source.connect(level).connect(out);
    ramp(dip.gain, under, 0.25);
    source.onended = () => ramp(dip.gain, 1, 1.2);
    source.start();
    return buffer.duration;
  }

  // Seconds into the music, wrapped into the loop: 0 is the first bar of the intro and info.body[0]
  // is the bar the loop returns to. Use with info.barSeconds and info.sections to act on a bar line.
  function position() {
    if (!current) return 0;
    let t = Math.max(0, ctx.currentTime - current.startedAt) + current.offset;
    const { loop, body } = current.info;
    if (!current.looping) return t;
    if (t >= loop[1]) t = loop[0] + ((t - loop[0]) % (loop[1] - loop[0]));
    // The file repeats the loop's first seconds after its last bar (see musiclab/mixer.py).
    return t < body[1] ? t : body[0] + (t - body[1]);
  }

  return {
    play, stop, setLayer, setIntensity, setVolume, setMuted, duck, stinger, position, tracks, reload,
    preload: async (ids) => { for (const id of ids) for (const file of Object.values((await info(id)).files)) await load(file); },
    resume: () => { ensure(); return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve(); },
    get current() { return current ? current.id : null; },
    get context() { ensure(); return ctx; },
  };
}

// The few calls a game makes, wrapped so that music can never break a game: a missing track, a failed
// download or a blocked audio context is logged once and the game carries on in silence.
//
//   const music = createGameMusic({ track: 'tankterrain/open-country' });
//   window.addEventListener('keydown', () => music.start());     // every input handler; the first call starts the loop
//   music.startOnInput();                                        // or this once: the same for any key or press on the page
//   music.intensity(chased ? 1 : 0);                             // every frame is fine: it acts only on a change
//   music.pause(true); music.pause(false);                       // under a pause card or a menu
//   music.setMuted(muted);                                       // from the game's own mute key
//   music.win().then((played) => { if (!played) sounds.fanfare(); });   // the loop stops, the stinger plays
//   music.lose();
export function createGameMusic({ track, volume = 0.5, context = null, base = '/games-3d/sounds/music/', win = 'shared/victory', lose = 'shared/defeat' } = {}) {
  const music = createMusic({ context, base, volume });
  let selectedTrack = track;
  let started = false;
  let ended = false;
  let warned = false;
  let applied = null;

  const quiet = (promise) => promise.catch((error) => {
    if (!warned) console.warn('music:', error && error.message ? error.message : error);
    warned = true;
    return null;
  });

  function finish(id) {
    if (ended) return Promise.resolve(null);
    ended = true;
    if (!started) return Promise.resolve(null);
    return quiet(music.resume().then(() => {
      music.stop({ fade: 0.8 });
      return music.stinger(id, { under: 1 });
    }));
  }

  return {
    music,
    get track() { return selectedTrack; },
    selectTrack(id, { fade = 1.2 } = {}) {
      if (!id || id === selectedTrack) return;
      selectedTrack = id;
      applied = null;
      if (started && !ended) quiet(music.resume().then(() => music.play(selectedTrack, { fade })));
    },
    start() {
      if (started || ended) return;
      started = true;
      quiet(music.resume().then(() => music.play(selectedTrack, { fade: 2 })).then(() => music.preload([win, lose])));
    },
    startOnInput() {
      const go = () => this.start();
      window.addEventListener('keydown', go);
      window.addEventListener('pointerdown', go);
    },
    // 0 is the base layer alone, 1 brings every other layer in. A track without layers ignores it.
    intensity(amount, seconds = 1.5) {
      if (music.current !== selectedTrack || applied === amount) return;
      applied = amount;
      music.setIntensity(amount, seconds);
    },
    pause(flag) { if (started) quiet(Promise.resolve().then(() => music.duck(flag ? 0.3 : 1, 0.4))); },
    setMuted(flag) { music.setMuted(flag); },
    // Both resolve to the stinger's length in seconds, or null when nothing could be played.
    win: () => finish(win),
    lose: () => finish(lose),
    get started() { return started; },
    get ended() { return ended; },
    get playing() { return music.current; },
    get level() { return applied; },
  };
}
