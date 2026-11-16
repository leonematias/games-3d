/** Authoritative simulation. The worker owns one World. Tests drive this class directly. */

import { CHECKPOINT_INTERVAL, HISTORY_BUDGET_BYTES, MAX_BODIES } from './constants.js';
import { BodyStore } from './body-store.js';
import { resolveMerges } from './collision.js';
import { centerOfMass, momentum, totalEnergy } from './gravity.js';
import { HistoryStore } from './history.js';
import { kickDriftKick } from './integrator.js';
import { GROUP_DROP_MAX } from './groups.js';
import { generatePreset } from './presets.js';
import { normalizeScenario, scenarioFromArrays } from './scenario.js';

export class World {
  constructor(options = {}) {
    this.store = new BodyStore();
    this.history = new HistoryStore(options.historyBudget ?? HISTORY_BUDGET_BYTES);
    this.checkpointInterval = options.checkpointInterval ?? CHECKPOINT_INTERVAL;
    this.maxBodies = options.maxBodies ?? MAX_BODIES;
    this.G = 1;
    this.dt = 0.01;
    this.epsilon = 0.45;
    this.collisionMode = 'pass';
    this.preset = 'custom';
    this.seed = 1;
    this.presetParams = {};
    this.name = 'Scenario';
    this.notes = '';
    this.view = null;
    this.tick = 0;
    this.generation = 0;
    this.initial = null;
    this.accel = new Float64Array(0);
    this.scratch = new Float64Array(0);
    this.diagnostics = emptyDiagnostics();
  }

  loadScenario(raw, { asInitial = true } = {}) {
    const scenario = normalizeScenario(raw);
    this.G = scenario.physics.G;
    this.dt = scenario.physics.dt;
    this.epsilon = scenario.physics.epsilon;
    this.collisionMode = scenario.physics.collisionMode;
    this.preset = scenario.preset;
    this.seed = scenario.seed;
    this.presetParams = scenario.presetParams;
    this.name = scenario.name;
    this.notes = scenario.notes;
    this.view = scenario.view;
    this.store.clear();
    for (const body of scenario.bodies) this.store.add(body, { keepId: true, maxBodies: this.maxBodies });
    this.tick = 0;
    this.generation += 1;
    this.history.clear();
    this._checkpoint();
    this.history.head = 0;
    if (asInitial) this.initial = scenario;
    this._resetEnergy();
    return scenario;
  }

  applyPreset(preset, seed, params) {
    return this.loadScenario(generatePreset(preset, seed, params), { asInitial: true });
  }

  reset() {
    if (!this.initial) throw new Error('Nothing to reset');
    return this.loadScenario(this.initial, { asInitial: true });
  }

  /** A physics change is a new run from the current bodies. History and the tick go back to zero. */
  setPhysics(partial) {
    const physics = {
      G: partial.G ?? this.G,
      dt: partial.dt ?? this.dt,
      epsilon: partial.epsilon ?? this.epsilon,
      collisionMode: partial.collisionMode ?? this.collisionMode,
    };
    const current = scenarioFromArrays(this, this.name);
    current.physics = physics;
    current.notes = this.notes;
    return this.loadScenario(current, { asInitial: true });
  }

  integrate({ record = true, sample = true } = {}) {
    this.store.saveRollback();
    const n = this.store.count;
    this._ensureAccel(n);
    if (n > 0) {
      const badAccel = kickDriftKick(this.store, this.G, this.epsilon, this.dt, this.accel, this.scratch);
      if (badAccel.length) return this._fail(badAccel.map((index) => this.store.ids[index]));
    }
    let merges = [];
    let energyBeforeMerge = 0;
    const measureMerge = record && sample && this.collisionMode === 'merge';
    if (this.collisionMode === 'merge') {
      if (measureMerge) energyBeforeMerge = totalEnergy(this.store, this.G, this.epsilon);
      merges = resolveMerges(this.store);
      if (measureMerge && merges.length) {
        const after = totalEnergy(this.store, this.G, this.epsilon);
        this.diagnostics.mergeLoss += energyBeforeMerge - after;
      }
    }
    const bad = this.store.nonfiniteIds();
    if (bad.length) return this._fail(bad);

    this.tick += 1;
    if (record) {
      this.history.head = this.tick;
      if (this.tick % this.checkpointInterval === 0) this._checkpoint();
      if (sample && this.tick % this.checkpointInterval === 0) this._sampleEnergy();
      this.diagnostics.steps += 1;
    }
    return { ok: true, merges };
  }

  /**
   * Restore an exact recorded tick by replaying forward from the nearest checkpoint.
   * Replay does not append history and does not add to the diagnostic counters.
   */
  seek(tick) {
    if (!Number.isInteger(tick)) throw new Error('Seek tick must be an integer');
    if (tick < this.history.oldest || tick > this.history.head) {
      throw new Error(`Tick ${tick} is outside retained history ${this.history.oldest}–${this.history.head}`);
    }
    const cp = this.history.nearestAtOrBefore(tick);
    if (!cp) throw new Error('No checkpoint can reconstruct that tick');
    this.store.restore(cp);
    this.tick = cp.tick;
    while (this.tick < tick) {
      const result = this.integrate({ record: false, sample: false });
      if (!result.ok) throw new Error(`Replay became non-finite at body ${result.ids.join(', ')}`);
    }
  }

  addBody(body) {
    assertNewBody(body);
    if (this.store.count >= this.maxBodies) throw new Error(`Body count is limited to ${this.maxBodies}`);
    let id = 0;
    const replaced = this._edit(() => {
      id = this.store.add({
        position: body.position,
        velocity: body.velocity,
        mass: body.mass,
        radius: body.radius,
        color: body.color,
        cluster: body.cluster || 0,
      }, { maxBodies: this.maxBodies });
    });
    return { id, replaced };
  }

  /** One checkpoint for the whole drop. Rejects the batch before any body is inserted. */
  addBodies(list) {
    if (!Array.isArray(list) || list.length === 0) throw new Error('Add at least one body');
    if (list.length > GROUP_DROP_MAX) throw new Error(`A single drop is limited to ${GROUP_DROP_MAX} bodies`);
    for (const body of list) assertNewBody(body);
    if (this.store.count + list.length > this.maxBodies) {
      throw new Error(`Body count is limited to ${this.maxBodies}`);
    }
    const ids = [];
    const replaced = this._edit(() => {
      for (const body of list) {
        ids.push(this.store.add({
          position: body.position,
          velocity: body.velocity,
          mass: body.mass,
          radius: body.radius,
          color: body.color,
          cluster: body.cluster || 0,
        }, { maxBodies: this.maxBodies }));
      }
    });
    return { ids, replaced };
  }

  editBody(id, fields) {
    if (this.store.indexOf(id) < 0) throw new Error(`No body ${id}`);
    assertEdit(fields);
    return this._edit(() => this.store.write(id, fields));
  }

  deleteBody(id) {
    if (this.store.indexOf(id) < 0) throw new Error(`No body ${id}`);
    if (this.store.count <= 1) throw new Error('At least one body has to remain');
    return this._edit(() => this.store.removeId(id));
  }

  exportScenario(which = 'current', view = this.view) {
    if (which === 'initial') {
      if (!this.initial) throw new Error('No initial scenario');
      return normalizeScenario({ ...this.initial, view: view || this.initial.view });
    }
    const scenario = scenarioFromArrays(this, this.name);
    scenario.notes = this.notes;
    if (view) scenario.view = normalizeScenario({ ...scenario, view }).view;
    return scenario;
  }

  body(id) {
    return this.store.get(id);
  }

  diagnosticsSnapshot() {
    const com = centerOfMass(this.store);
    const motion = momentum(this.store);
    return {
      ...this.diagnostics,
      count: this.store.count,
      tick: this.tick,
      head: this.history.head,
      oldest: this.history.oldest,
      historyBytes: this.history.bytes,
      historyBudget: this.history.budget,
      com,
      momentum: motion.p,
      generation: this.generation,
    };
  }

  _edit(mutator) {
    const replaced = this.tick < this.history.head;
    this.history.truncateAfter(this.tick);
    mutator();
    const bad = this.store.nonfiniteIds();
    if (bad.length) throw new Error(`Edit produced a non-finite value on body ${bad.join(', ')}`);
    this._checkpoint();
    this.history.head = this.tick;
    this._resetEnergy();
    return replaced;
  }

  _checkpoint() {
    const n = this.store.count;
    this.history.put({
      tick: this.tick,
      nextId: this.store.nextId,
      count: n,
      ids: this.store.ids.slice(0, n),
      pos: this.store.pos.slice(0, n * 3),
      vel: this.store.vel.slice(0, n * 3),
      mass: this.store.mass.slice(0, n),
      radius: this.store.radius.slice(0, n),
      color: this.store.color.slice(0, n * 3),
      cluster: this.store.cluster.slice(0, n),
      lineage: this.store.lineage,
    });
  }

  _ensureAccel(count) {
    const need = Math.max(count, 1) * 3;
    if (this.accel.length < need) {
      this.accel = new Float64Array(need);
      this.scratch = new Float64Array(need);
    }
  }

  _fail(ids) {
    this.store.restoreRollback();
    this.diagnostics.nonfinite = ids;
    this.diagnostics.pausedReason = 'nonfinite';
    return { ok: false, ids, merges: [] };
  }

  _resetEnergy() {
    const energy = this.store.count ? totalEnergy(this.store, this.G, this.epsilon) : 0;
    this.diagnostics.energy = energy;
    this.diagnostics.energyBaseline = energy;
    this.diagnostics.mergeLoss = 0;
    this.diagnostics.integrationDrift = 0;
    this.diagnostics.nonfinite = [];
    this.diagnostics.pausedReason = null;
    this.diagnostics.steps = 0;
  }

  _sampleEnergy() {
    const energy = totalEnergy(this.store, this.G, this.epsilon);
    this.diagnostics.energy = energy;
    this.diagnostics.integrationDrift = (energy + this.diagnostics.mergeLoss) - this.diagnostics.energyBaseline;
  }
}

function assertNewBody(body) {
  if (!body) throw new Error('Missing body');
  assertVec(body.position, 'Position');
  assertVec(body.velocity, 'Velocity');
  if (!(body.mass > 0) || !Number.isFinite(body.mass)) throw new Error('Mass must be positive');
  if (!(body.radius > 0) || !Number.isFinite(body.radius)) throw new Error('Radius must be positive');
  if (!Array.isArray(body.color) || body.color.length !== 3) throw new Error('Color needs three numbers');
  for (const channel of body.color) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 1) throw new Error('Color channels must be between 0 and 1');
  }
}

function assertEdit(fields) {
  if (fields.position) assertVec(fields.position, 'Position');
  if (fields.velocity) assertVec(fields.velocity, 'Velocity');
  if (fields.mass !== undefined && (!(fields.mass > 0) || !Number.isFinite(fields.mass))) throw new Error('Mass must be positive');
  if (fields.radius !== undefined && (!(fields.radius > 0) || !Number.isFinite(fields.radius))) throw new Error('Radius must be positive');
  if (fields.color) {
    if (!Array.isArray(fields.color) || fields.color.length !== 3) throw new Error('Color needs three numbers');
  }
}

function assertVec(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} needs three numbers`);
  if (!value.every(Number.isFinite)) throw new Error(`${label} must be finite`);
}

function emptyDiagnostics() {
  return {
    energy: 0,
    energyBaseline: 0,
    mergeLoss: 0,
    integrationDrift: 0,
    nonfinite: [],
    pausedReason: null,
    steps: 0,
  };
}
