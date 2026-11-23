/** Application state, worker commands, selection, and the overlay. */

import { MAX_BODIES, MAX_JSON_BYTES, PRESET_IDS } from './physics/constants.js';
import { validateScenario } from './physics/scenario.js';
import { PlacementTool } from './interaction/placement.js';
import { pickBody, pointerRay, SimulationRenderer } from './render/renderer.js';
import { SimulatorUI } from './ui.js';

const STATIC_EXPORT = document.querySelector('meta[name="static-export"]') !== null;
const SCENARIOS_KEY = 'gravity-scenarios';

function storedScenarios() {
  const scenarios = JSON.parse(localStorage.getItem(SCENARIOS_KEY) || '[]');
  if (!Array.isArray(scenarios)) throw new Error('Saved scenarios are damaged');
  return scenarios;
}

function scenarioSummaries() {
  return storedScenarios().map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    preset: scenario.preset,
    bodies: scenario.bodies.length,
    updatedAt: scenario.updatedAt,
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class SimulatorController {
  constructor(canvas) {
    this.canvas = canvas;
    this.ui = new SimulatorUI();
    this.renderer = new SimulationRenderer(canvas);
    this.placement = new PlacementTool();
    this.worker = new Worker(new URL('./worker/physics.worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextRequest = 1;
    this.snapshot = null;
    this.selectedId = null;
    this.exactBody = null;
    this.generation = 0;
    this.framedGeneration = 0;
    this.fps = 0;
    this.frames = 0;
    this._fpsFrames = 0;
    this._fpsStamp = performance.now();
    this.ready = false;
    this.readyPromise = new Promise((resolve) => { this._ready = resolve; });
    this._toastKey = '';
    this.worker.onmessage = (event) => this.onMessage(event.data);
    this.worker.onerror = (event) => this.ui.toast(event.message || 'The simulation worker stopped');
    this.ui.bind({
      randomize: () => this.randomize(),
      applyPreset: () => this.applyFromUI(),
      reset: () => this.command({ type: 'RESET' }),
      save: () => this.ui.openSave(this.snapshot && this.snapshot.meta ? this.snapshot.meta.name : 'Scenario'),
      load: () => this.showLoad(),
      exportCurrent: () => this.download('current'),
      exportInitial: () => this.download('initial'),
      importFile: (file) => this.importFile(file),
      confirmSave: (name) => this.save(name),
      beginPlace: () => this.beginPlace(),
      confirmPlace: () => this.confirmPlace(),
      cancelPlace: () => this.cancelPlace(),
      orbitAssist: () => this.orbitAssist(),
      applyEdit: () => this.applyEdit(),
      deleteBody: () => this.deleteSelected(),
      applyPhysics: () => this.applyPhysics(),
      play: () => this.togglePlay(false),
      reverse: () => this.togglePlay(true),
      step: (direction) => this.command({ type: 'STEP', direction }),
      seek: (tick) => this.command({ type: 'SEEK', tick }),
      speed: (speed) => this.command({ type: 'SET_SPEED', speed, reverse: this.snapshot ? this.snapshot.reverse : false }),
      frame: () => this.renderer.frame(this.snapshot),
      top: () => this.renderer.setTopView(),
      orbitView: () => this.renderer.setOrbitView(),
      placeEdited: () => this.ui.readPlace(this.placement),
      viewEdited: () => this.renderer.setVisual(this.ui.readView()),
    });
    this.bindPointers();
    this.bindKeys();
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      this.worker.postMessage({ type: 'VISIBILITY', hidden: document.hidden, requestId: this.nextRequest++ });
    });
    window.addEventListener('pagehide', () => this.dispose());
    this.renderer.setVisual(this.ui.readView());
    this.loop();
  }

  async start() {
    const query = new URLSearchParams(location.search);
    const preset = PRESET_IDS.includes(query.get('preset')) ? query.get('preset') : 'random-cloud';
    const seed = Number(query.get('seed') || 1);
    const count = Number(query.get('count') || 256);
    this.ui.setPreset(preset, Number.isFinite(seed) ? seed : 1, Number.isFinite(count) ? count : 256);
    try {
      await this.request({ type: 'APPLY_PRESET', preset, seed: seed >>> 0, params: { count } });
      if (query.get('play') !== '0') await this.request({ type: 'PLAY', reverse: false, speed: 1 });
    } catch (error) {
      this.ui.toast(error.message);
    }
    this.ready = true;
    this._ready();
  }

  request(command) {
    const requestId = this.nextRequest++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    this.worker.postMessage({ ...command, requestId });
    return promise;
  }

  command(command) {
    this.request(command).catch((error) => this.ui.toast(error.message));
  }

  onMessage(message) {
    // Copy first. The originals go back to the worker so the next frame can be published.
    const originals = message.frame && message.ids ? {
      ids: message.ids,
      positions: message.positions,
      velocities: message.velocities,
      masses: message.masses,
      radii: message.radii,
      colors: message.colors,
      clusters: message.clusters,
    } : null;
    const snapshot = originals ? adoptSnapshot(message) : null;
    if (snapshot) {
      message.ids = snapshot.ids;
      message.positions = snapshot.positions;
      message.velocities = snapshot.velocities;
      message.masses = snapshot.masses;
      message.radii = snapshot.radii;
      message.colors = snapshot.colors;
      message.clusters = snapshot.clusters;
    }
    let handled = false;
    if (message.requestId != null && this.pending.has(message.requestId)) {
      handled = true;
      const pending = this.pending.get(message.requestId);
      this.pending.delete(message.requestId);
      if (message.ok === false) pending.reject(new Error(message.error || 'Command failed'));
      else pending.resolve(message);
    }
    if (originals) this.ackFrame(originals);
    if (message.superseded || message.disposed) return;
    if (message.ok === false && message.error && !handled) this.ui.toast(message.error);
    if (!snapshot) {
      if (message.body && message.body.id === this.selectedId) this.exactBody = message.body;
      return;
    }
    if (message.generation < this.generation) return;
    const changedRun = message.generation !== this.generation;
    this.generation = message.generation;
    this.snapshot = snapshot;
    if (this.selectedId != null && message.merges) {
      for (const merge of message.merges) {
        if (merge.removedIds.includes(this.selectedId)) this.selectedId = merge.survivorId;
      }
    }
    if (changedRun) {
      this.selectedId = null;
      this.exactBody = null;
      this.renderer.clearTrails();
      this.renderer.frame(this.snapshot);
      this.framedGeneration = message.generation;
    }
    this.note(changedRun ? { ...message, futureReplaced: false } : message);
    this.ui.sync(this.snapshot);
    if (!this.snapshot.playing && this.selectedId != null && !this.exactBody) {
      this.request({ type: 'GET_BODY', id: this.selectedId }).catch(() => {});
    }
  }

  note(message) {
    let key = '';
    let text = '';
    if (message.pausedReason === 'nonfinite') {
      const ids = (message.diagnostics && message.diagnostics.nonfinite) || [];
      key = `nan:${ids.join(',')}`;
      text = `Paused. Body ${ids.join(', ') || '?'} produced a non-finite value. Nothing was clamped.`;
    } else if (message.pausedReason === 'oldest') {
      key = 'oldest';
      text = 'Reverse reached the oldest retained moment.';
    } else if (message.futureReplaced) {
      key = `future:${message.tick}`;
      text = 'The recorded future after this moment was replaced.';
    }
    if (key && key !== this._toastKey) {
      this._toastKey = key;
      this.ui.toast(text);
    }
    if (!key) this._toastKey = '';
  }

  loop = () => {
    this._fpsFrames += 1;
    const time = performance.now();
    if (time - this._fpsStamp > 500) {
      this.fps = (this._fpsFrames * 1000) / (time - this._fpsStamp);
      this._fpsFrames = 0;
      this._fpsStamp = time;
    }
    if (this.snapshot) this.frames += 1;
    const view = this.ui.readView();
    this.renderer.setVisual(view);
    const physics = this.snapshot ? this.snapshot.physics : { G: 1, epsilon: 0.45 };
    if (this.placement.active) this.placement.ensureShape(physics);
    const group = this.placement.active && this.placement.kind !== 'single' && this.placement.localBodies
      ? { bodies: this.placement.placedBodies(physics), extent: this.placement.extent }
      : null;
    this.renderer.render(this.snapshot, {
      ...view,
      selectedId: this.selectedId,
    }, {
      active: this.placement.active,
      available: this.placement.available || this.placement.phase === 'locked',
      position: this.placement.position,
      velocity: this.placement.velocity,
      radius: this.placement.radius,
      height: this.placement.height,
      scale: this.placement.scale,
      color: this.placement.color,
      group,
    }, this.followPoint());
    this.ui.writePlace(this.placement);
    this.ui.syncInspector(this.snapshot, this.selectedId, this.exactBody, this.snapshot && this.snapshot.playing);
    this.ui.syncDiagnostics(this.snapshot, this.fps);
    requestAnimationFrame(this.loop);
  };

  followPoint() {
    if (!this.snapshot) return null;
    const view = this.ui.readView();
    if (view.follow === 'selection' && this.selectedId != null) {
      const index = this.snapshot.indexOf(this.selectedId);
      if (index < 0) return null;
      const k = index * 3;
      return {
        x: this.snapshot.positions[k],
        y: this.snapshot.positions[k + 1],
        z: this.snapshot.positions[k + 2],
      };
    }
    if (view.follow === 'com' && this.snapshot.com) {
      return { x: this.snapshot.com[0], y: this.snapshot.com[1], z: this.snapshot.com[2] };
    }
    return null;
  }

  togglePlay(reverse) {
    if (!this.snapshot) return;
    if (this.snapshot.playing && this.snapshot.reverse === reverse) {
      this.command({ type: 'PAUSE' });
      return;
    }
    this.exactBody = null;
    this.command({ type: 'PLAY', reverse, speed: Number(this.ui.els.speedSelect.value) || 1 });
  }

  select(id) {
    this.selectedId = id;
    this.exactBody = null;
    if (id != null) this.ui.showTab('body');
    if (id != null && this.snapshot && !this.snapshot.playing) {
      this.request({ type: 'GET_BODY', id }).catch((error) => this.ui.toast(error.message));
    }
  }

  async beginPlace() {
    const playing = Boolean(this.snapshot && this.snapshot.playing);
    this.ui.readPlace(this.placement);
    this.placement.begin(playing && this.placement.pauseWhilePlacing);
    this.renderer.setRotateEnabled(false);
    if (this.placement.pauseWhilePlacing && playing) {
      try { await this.request({ type: 'PAUSE' }); } catch (error) { this.ui.toast(error.message); }
    }
  }

  async confirmPlace() {
    if (!this.placement.active) return;
    this.ui.readPlace(this.placement);
    if (this.placement.phase !== 'locked') {
      this.ui.toast('Click the grid to lock a position first.');
      return;
    }
    if (!this.placement.position.every(Number.isFinite) || !this.placement.velocity.every(Number.isFinite)) {
      this.ui.toast('Position and velocity need finite numbers.');
      return;
    }
    const physics = this.snapshot ? this.snapshot.physics : { G: 1, epsilon: 0.45 };
    const grouped = this.placement.kind !== 'single';
    let bodies;
    try {
      bodies = grouped ? this.placement.payloads(physics) : [this.placement.payload()];
    } catch (error) {
      this.ui.toast(error.message);
      return;
    }
    if (this.snapshot && this.snapshot.count + bodies.length > MAX_BODIES) {
      this.ui.toast(`Body count is limited to ${MAX_BODIES}`);
      return;
    }
    const wasPlaying = this.placement.cancel();
    this.renderer.setRotateEnabled(true);
    this.renderer.setCameraEnabled(true);
    try {
      const message = await this.request(grouped
        ? { type: 'ADD_BODIES', bodies }
        : { type: 'ADD_BODY', body: bodies[0] });
      if (message.addedId) this.select(message.addedId);
      if (wasPlaying) await this.request({ type: 'PLAY', reverse: false, speed: Number(this.ui.els.speedSelect.value) || 1 });
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  cancelPlace() {
    if (!this.placement.active) {
      this.select(null);
      return;
    }
    const wasPlaying = this.placement.cancel();
    this.renderer.setRotateEnabled(true);
    this.renderer.setCameraEnabled(true);
    if (wasPlaying) this.command({ type: 'PLAY', reverse: false, speed: Number(this.ui.els.speedSelect.value) || 1 });
  }

  orbitAssist() {
    this.ui.readPlace(this.placement);
    const selected = this.exactBody && this.exactBody.id === this.selectedId
      ? this.exactBody
      : bodyFromSnapshot(this.snapshot, this.selectedId);
    if (!selected) {
      this.ui.toast('Select a body before using orbit assist.');
      return;
    }
    const physics = this.snapshot ? this.snapshot.physics : { G: 1, epsilon: 0.45 };
    const ok = this.placement.orbitAround(selected, physics.G, physics.epsilon);
    if (!ok) this.ui.toast('Lock a position away from the selected body first.');
    this.ui.writePlace(this.placement);
  }

  async applyEdit() {
    if (this.selectedId == null || !this.exactBody) return;
    const fields = this.ui.readEdit();
    const same = closeVec(fields.position, this.exactBody.position)
      && closeVec(fields.velocity, this.exactBody.velocity)
      && Math.abs(fields.mass - this.exactBody.mass) < 1e-9
      && Math.abs(fields.radius - this.exactBody.radius) < 1e-9;
    if (same) return;
    try {
      await this.request({ type: 'EDIT_BODY', id: this.selectedId, fields });
      this.exactBody = null;
      await this.request({ type: 'GET_BODY', id: this.selectedId });
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  deleteSelected() {
    if (this.selectedId == null) return;
    const id = this.selectedId;
    this.selectedId = null;
    this.exactBody = null;
    this.command({ type: 'DELETE_BODY', id });
  }

  async applyFromUI() {
    const { preset, seed, params } = this.ui.readPreset();
    if (!Number.isFinite(seed) || !Number.isFinite(params.count)) {
      this.ui.toast('Seed and body count need finite numbers.');
      return;
    }
    try {
      await this.request({ type: 'APPLY_PRESET', preset, seed: seed >>> 0, params });
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  randomize() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    this.ui.els.seed.value = String(buffer[0] || 1);
    this.applyFromUI();
  }

  applyPhysics() {
    const physics = this.ui.readPhysics();
    this.command({ type: 'SET_PHYSICS', physics });
  }

  async download(which) {
    try {
      const message = await this.request({ type: 'EXPORT_STATE', which, view: this.ui.readView() });
      const scenario = message.scenario;
      if (!scenario) throw new Error('Export did not return a scenario');
      scenario.view = this.ui.readView();
      const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${(scenario.name || 'gravity').replace(/\s+/g, '-').toLowerCase()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  async save(name) {
    try {
      const message = await this.request({ type: 'EXPORT_STATE', which: 'current', view: this.ui.readView() });
      const scenario = message.scenario;
      scenario.name = name || scenario.name;
      scenario.view = this.ui.readView();
      if (STATIC_EXPORT) {
        const scenarios = storedScenarios();
        scenario.id = `g${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
        scenario.updatedAt = new Date().toISOString();
        scenarios.push(scenario);
        localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
        this.ui.toast(`Saved “${scenario.name}”.`);
        return;
      }
      const response = await fetch('/games-3d/gravity/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Save failed');
      this.ui.toast(`Saved “${payload.name || name}”.`);
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  async showLoad() {
    try {
      if (STATIC_EXPORT) {
        this.ui.openLoad(scenarioSummaries(), (id) => this.openScenario(id), (id) => this.deleteScenario(id));
        return;
      }
      const response = await fetch('/games-3d/gravity/api/scenarios');
      const payload = await response.json();
      this.ui.openLoad(payload.scenarios || [], (id) => this.openScenario(id), (id) => this.deleteScenario(id));
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  async openScenario(id) {
    try {
      if (STATIC_EXPORT) {
        const scenario = storedScenarios().find((item) => item.id === id);
        if (!scenario) throw new Error('Scenario not found');
        const error = validateScenario(scenario);
        if (error) throw new Error(error);
        await this.request({ type: 'LOAD_SCENARIO', scenario });
        this.ui.closeLoad();
        return;
      }
      const response = await fetch(`/games-3d/gravity/api/scenarios/${id}`);
      const scenario = await response.json();
      if (!response.ok) throw new Error(scenario.error || 'Load failed');
      const error = validateScenario(scenario);
      if (error) throw new Error(error);
      await this.request({ type: 'LOAD_SCENARIO', scenario });
      this.ui.closeLoad();
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  async deleteScenario(id) {
    try {
      if (STATIC_EXPORT) {
        localStorage.setItem(SCENARIOS_KEY, JSON.stringify(storedScenarios().filter((item) => item.id !== id)));
        this.showLoad();
        return;
      }
      const response = await fetch(`/games-3d/gravity/api/scenarios/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Delete failed');
      }
      this.showLoad();
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  async importFile(file) {
    try {
      const text = await file.text();
      if (text.length > MAX_JSON_BYTES) throw new Error('Scenario file is too large');
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('That file is not JSON'); }
      const error = validateScenario(data);
      if (error) throw new Error(error);
      await this.request({ type: 'LOAD_SCENARIO', scenario: data });
      this.ui.toast(`Loaded “${data.name || file.name}”.`);
    } catch (error) {
      this.ui.toast(error.message);
    }
  }

  bindPointers() {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.press = { x: event.clientX, y: event.clientY };
      if (!this.placement.active) return;
      this.placement.pointer(pointerRay(this.renderer.camera, this.canvas, event), 'down');
      this.renderer.setCameraEnabled(false);
      try { this.canvas.setPointerCapture(event.pointerId); } catch { /* a synthetic pointer has no capture id */ }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.placement.active) return;
      this.placement.pointer(pointerRay(this.renderer.camera, this.canvas, event), 'move');
    });
    this.canvas.addEventListener('pointerup', (event) => {
      if (event.button !== 0) return;
      const moved = this.press ? Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) : 0;
      if (this.placement.active) {
        this.placement.pointer(pointerRay(this.renderer.camera, this.canvas, event), 'up');
        this.renderer.setCameraEnabled(true);
        return;
      }
      if (moved < 5) this.select(pickBody(this.renderer.camera, this.canvas, event, this.snapshot));
    });
  }

  bindKeys() {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelPlace();
        return;
      }
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === ' ' && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY')) return;
      if (event.key === ' ') {
        event.preventDefault();
        const reverse = Boolean(this.snapshot && this.snapshot.reverse && this.snapshot.playing);
        if (this.snapshot && this.snapshot.playing) this.command({ type: 'PAUSE' });
        else this.command({ type: 'PLAY', reverse: Boolean(this.snapshot && this.snapshot.reverse), speed: Number(this.ui.els.speedSelect.value) || 1 });
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.command({ type: 'STEP', direction: -1 });
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.command({ type: 'STEP', direction: 1 });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && tag !== 'BUTTON') {
        event.preventDefault();
        this.deleteSelected();
      } else if (event.key === 'Enter' && this.placement.active) {
        event.preventDefault();
        this.confirmPlace();
      }
    });
  }

  selfTest() {
    const errors = [];
    this.renderer.setTopView();
    const top = basis(this.renderer.viewBasis());
    if (top.forward.y > -0.95) errors.push(`top view looks along y ${top.forward.y.toFixed(3)}`);
    if (top.up.z > -0.9) errors.push(`top view screen-up z ${top.up.z.toFixed(3)}`);
    if (top.right.x < 0.9) errors.push(`top view screen-right x ${top.right.x.toFixed(3)}`);
    this.renderer.setOrbitView();
    const orbit = basis(this.renderer.viewBasis());
    if (orbit.up.y < 0.9) errors.push(`orbit view up y ${orbit.up.y.toFixed(3)}`);
    return { ok: errors.length === 0, errors, top, orbit };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ type: 'DISPOSE', requestId: this.nextRequest++ });
    this.renderer.dispose();
    for (const pending of this.pending.values()) pending.reject(new Error('disposed'));
    this.pending.clear();
  }

  ackFrame(buffers) {
    const transfers = [];
    for (const array of Object.values(buffers)) {
      if (array && array.buffer) transfers.push(array.buffer);
    }
    this.worker.postMessage({ type: 'ACK_FRAME', buffers }, transfers);
  }

  api() {
    const controller = this;
    return {
      request: (command) => controller.request(command),
      whenReady: () => controller.readyPromise,
      selfTest: () => controller.selfTest(),
      snapshot: () => controller.snapshot,
      select: (id) => controller.select(id),
      get ready() { return controller.ready; },
      get frames() { return controller.frames; },
      get selectedId() { return controller.selectedId; },
      placement: controller.placement,
    };
  }
}

function adoptSnapshot(message) {
  const snapshot = {
    generation: message.generation,
    tick: message.tick,
    head: message.head,
    oldest: message.oldest,
    playing: message.playing,
    speed: message.speed,
    reverse: message.reverse,
    count: message.count,
    ids: new Int32Array(message.ids),
    positions: new Float32Array(message.positions),
    velocities: new Float32Array(message.velocities),
    masses: new Float32Array(message.masses),
    radii: new Float32Array(message.radii),
    colors: new Float32Array(message.colors),
    clusters: new Int32Array(message.clusters),
    com: message.com,
    diagnostics: message.diagnostics,
    physics: message.physics,
    meta: message.meta,
    futureReplaced: message.futureReplaced,
    pausedReason: message.pausedReason,
  };
  snapshot.indexOf = (id) => snapshot.ids.indexOf(id);
  return snapshot;
}

function bodyFromSnapshot(snapshot, id) {
  if (!snapshot || id == null) return null;
  const index = snapshot.indexOf(id);
  if (index < 0) return null;
  const k = index * 3;
  return {
    id,
    mass: snapshot.masses[index],
    position: [snapshot.positions[k], snapshot.positions[k + 1], snapshot.positions[k + 2]],
    velocity: [snapshot.velocities[k], snapshot.velocities[k + 1], snapshot.velocities[k + 2]],
  };
}

function closeVec(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
}

function basis(frame) {
  return {
    right: { x: frame.right.x, y: frame.right.y, z: frame.right.z },
    up: { x: frame.up.x, y: frame.up.y, z: frame.up.z },
    forward: { x: frame.forward.x, y: frame.forward.y, z: frame.forward.z },
  };
}
