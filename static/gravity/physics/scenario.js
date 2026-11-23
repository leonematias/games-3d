/** Versioned scenario JSON. Validation rejects a file before it replaces the live world. */

import {
  COLLISION_MODES,
  COLOR_MODES,
  MAX_BODIES,
  MAX_JSON_BYTES,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  SCHEMA_VERSION,
} from './constants.js';
import { defaultView } from './presets.js';

export function validateScenario(data) {
  try {
    normalizeScenario(data);
    return null;
  } catch (error) {
    return error.message || 'Invalid scenario';
  }
}

export function normalizeScenario(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Scenario must be an object');
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schemaVersion ${data.schemaVersion}`);
  const name = cleanString(data.name, 'Scenario', MAX_NAME_LENGTH);
  const notes = cleanString(data.notes || '', '', MAX_NOTES_LENGTH);
  const seed = data.seed === undefined ? 1 : data.seed;
  if (!Number.isInteger(seed) && !(typeof seed === 'number' && Number.isFinite(seed))) {
    throw new Error('Seed must be a finite number');
  }
  const preset = typeof data.preset === 'string' ? data.preset.slice(0, 40) : 'custom';
  const presetParams = cleanParams(data.presetParams);
  const physics = cleanPhysics(data.physics);
  const view = cleanView(data.view);
  if (!Array.isArray(data.bodies)) throw new Error('Scenario needs a body list');
  if (data.bodies.length < 1) throw new Error('Scenario needs at least one body');
  if (data.bodies.length > MAX_BODIES) throw new Error(`Body count is limited to ${MAX_BODIES}`);
  const seen = new Set();
  const bodies = data.bodies.map((body, index) => cleanBody(body, index, seen));
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    notes,
    seed: seed >>> 0,
    preset,
    presetParams,
    physics,
    view,
    bodies,
  };
}

export function scenarioFromArrays(world, name) {
  const bodies = [];
  const store = world.store;
  for (let i = 0; i < store.count; i++) {
    const k = i * 3;
    bodies.push({
      id: store.ids[i],
      position: [store.pos[k], store.pos[k + 1], store.pos[k + 2]],
      velocity: [store.vel[k], store.vel[k + 1], store.vel[k + 2]],
      mass: store.mass[i],
      radius: store.radius[i],
      color: [store.color[k], store.color[k + 1], store.color[k + 2]],
      cluster: store.cluster[i],
    });
  }
  return normalizeScenario({
    schemaVersion: SCHEMA_VERSION,
    name: name || world.name,
    notes: world.notes || '',
    seed: world.seed,
    preset: world.preset,
    presetParams: world.presetParams,
    physics: { G: world.G, dt: world.dt, epsilon: world.epsilon, collisionMode: world.collisionMode },
    view: world.view,
    bodies,
  });
}

export function assertJsonSize(text) {
  const bytes = typeof text === 'string' ? text.length : 0;
  if (bytes > MAX_JSON_BYTES) throw new Error('Scenario file is too large');
}

function cleanBody(body, index, seen) {
  if (!body || typeof body !== 'object') throw new Error(`Body ${index} is not an object`);
  const id = body.id;
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new Error(`Body ${index} has an invalid id`);
  if (seen.has(id)) throw new Error(`Duplicate body id ${id}`);
  seen.add(id);
  const position = cleanVec(body.position, `Body ${id} position`);
  const velocity = cleanVec(body.velocity, `Body ${id} velocity`);
  const mass = finite(body.mass, `Body ${id} mass`);
  const radius = finite(body.radius, `Body ${id} radius`);
  if (mass <= 0) throw new Error(`Body ${id} mass must be positive`);
  if (radius <= 0) throw new Error(`Body ${id} radius must be positive`);
  const color = cleanColor(body.color, id);
  const cluster = body.cluster === undefined ? 0 : body.cluster;
  if (!Number.isInteger(cluster) || cluster < 0 || cluster > 100000) throw new Error(`Body ${id} cluster is invalid`);
  return { id, position, velocity, mass, radius, color, cluster };
}

function cleanPhysics(physics) {
  const source = physics || {};
  const G = finite(source.G === undefined ? 1 : source.G, 'G');
  const dt = finite(source.dt === undefined ? 0.01 : source.dt, 'dt');
  const epsilon = finite(source.epsilon === undefined ? 0.45 : source.epsilon, 'epsilon');
  if (G <= 0) throw new Error('G must be positive');
  if (dt <= 0) throw new Error('dt must be positive');
  if (epsilon <= 0) throw new Error('epsilon must be positive');
  if (!COLLISION_MODES.includes(source.collisionMode)) throw new Error('Unsupported collision mode');
  return { G, dt, epsilon, collisionMode: source.collisionMode };
}

function cleanView(view) {
  const defaults = defaultView();
  const source = view && typeof view === 'object' ? view : {};
  const colorMode = COLOR_MODES.includes(source.colorMode) ? source.colorMode : defaults.colorMode;
  const trailMode = source.trailMode === 'sample' ? 'sample' : 'selection';
  const quality = source.quality === 'reduced' ? 'reduced' : 'full';
  const follow = ['none', 'selection', 'com'].includes(source.follow) ? source.follow : 'none';
  return {
    colorMode,
    trails: source.trails !== false,
    trailLength: clampInt(source.trailLength, 4, 240, defaults.trailLength),
    trailMode,
    quality,
    pixelRatioMax: clampNumber(source.pixelRatioMax, 0.5, 2, defaults.pixelRatioMax),
    showRadii: Boolean(source.showRadii),
    follow,
    pointScale: clampNumber(source.pointScale, 1, 40, defaults.pointScale),
  };
}

function cleanParams(params) {
  if (params === undefined || params === null) return {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new Error('presetParams must be an object');
  const keys = Object.keys(params);
  if (keys.length > 32) throw new Error('presetParams has too many fields');
  const clean = {};
  for (const key of keys) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)) throw new Error('Invalid preset parameter name');
    const value = params[key];
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Preset parameter ${key} is not finite`);
      clean[key] = value;
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, 40);
    } else {
      throw new Error(`Preset parameter ${key} must be a number or a short string`);
    }
  }
  return clean;
}

function cleanVec(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} needs three numbers`);
  return [finite(value[0], label), finite(value[1], label), finite(value[2], label)];
}

function cleanColor(value, id) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`Body ${id} color needs three numbers`);
  return value.map((channel, index) => {
    const number = finite(channel, `Body ${id} color`);
    if (number < 0 || number > 1) throw new Error(`Body ${id} color channel ${index} is outside 0..1`);
    return number;
  });
}

function cleanString(value, fallback, max) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new Error('Name must be text');
  if (value.length > max) throw new Error('Text field is too long');
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value | 0));
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
