/**
 * Authoritative simulation thread.
 * Commands run between ticks. Rendering copies are transferable and are never the physics arrays.
 */

import { MAX_BACKLOG_TICKS, PHYSICS_BUDGET_MS, SPEEDS, TICKS_PER_SECOND } from '../physics/constants.js';
import { World } from '../physics/world.js';

const world = new World();
const pool = new Map();

let playing = false;
let heldPlay = false;
let speed = 1;
let reverse = false;
let accumulator = 0;
let lastWall = 0;
let pumping = false;
let disposed = false;
let seekToken = 0;
let inFlight = false;
let framePending = false;
let lastPublish = 0;
let frameId = 0;
let msPerTick = 0;
let speedWindowStart = 0;
let speedWindowSteps = 0;
let achieved = 0;
let lastMerges = [];
let trailCut = false;

const queue = [];

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'ACK_FRAME') {
    recycle(message.buffers);
    return;
  }
  if (message.type === 'SEEK') {
    seekToken += 1;
    message.token = seekToken;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].type === 'SEEK') {
        const dropped = queue.splice(i, 1)[0];
        postSuperseded(dropped.requestId);
      }
    }
  } else {
    seekToken += 1;
  }
  queue.push(message);
  kick();
};

function recycle(buffers) {
  if (buffers) {
    for (const array of Object.values(buffers)) {
      if (!array || typeof array.length !== 'number') continue;
      const key = `${array.constructor.name}:${array.length}`;
      if (!pool.has(key)) pool.set(key, []);
      const bucket = pool.get(key);
      if (bucket.length < 2) bucket.push(array);
    }
  }
  inFlight = false;
  if (framePending && !disposed) publish(null);
}

function alloc(Ctor, length) {
  const key = `${Ctor.name}:${length}`;
  const bucket = pool.get(key);
  if (bucket && bucket.length) return bucket.pop();
  return new Ctor(length);
}

async function kick() {
  if (pumping || disposed) return;
  pumping = true;
  try {
    while (!disposed && (queue.length || playing)) {
      while (queue.length && !disposed) {
        const command = queue.shift();
        try {
          await handle(command);
        } catch (error) {
          world.diagnostics.pausedReason = null;
          publish(command.requestId, { ok: false, error: error.message || 'Command failed' });
        }
      }
      if (!playing || disposed) break;
      runBatch();
      if (playing) await yieldNow();
    }
  } finally {
    pumping = false;
    if (!disposed && (queue.length || playing)) kick();
  }
}

async function handle(command) {
  switch (command.type) {
    case 'INIT':
    case 'APPLY_PRESET':
      playing = false;
      reverse = false;
      world.applyPreset(command.preset, command.seed, command.params || {});
      noteRetarget();
      publish(command.requestId);
      return;
    case 'LOAD_SCENARIO':
      playing = false;
      reverse = false;
      world.loadScenario(command.scenario, { asInitial: true });
      noteRetarget();
      publish(command.requestId);
      return;
    case 'RESET':
      playing = false;
      reverse = false;
      world.reset();
      noteRetarget();
      publish(command.requestId);
      return;
    case 'SET_PHYSICS':
      playing = false;
      world.setPhysics(command.physics || {});
      noteRetarget();
      publish(command.requestId);
      return;
    case 'PLAY':
      reverse = Boolean(command.reverse);
      speed = sanitizeSpeed(command.speed ?? speed);
      playing = true;
      accumulator = 0;
      lastWall = now();
      world.diagnostics.pausedReason = null;
      publish(command.requestId);
      return;
    case 'PAUSE':
      playing = false;
      publish(command.requestId);
      return;
    case 'SET_SPEED':
      speed = sanitizeSpeed(command.speed);
      if (command.reverse !== undefined) reverse = Boolean(command.reverse);
      accumulator = 0;
      lastWall = now();
      publish(command.requestId);
      return;
    case 'STEP':
      playing = false;
      stepOnce(command.direction < 0 ? -1 : 1);
      publish(command.requestId);
      return;
    case 'SEEK':
      await seekTo(command.tick, command.requestId, command.token);
      return;
    case 'ADD_BODY': {
      const wasPlaying = playing;
      playing = false;
      const result = world.addBody(command.body);
      if (result.replaced) trailCut = true;
      if (wasPlaying) resume();
      publish(command.requestId, { addedId: result.id, futureReplaced: result.replaced });
      return;
    }
    case 'ADD_BODIES': {
      const wasPlaying = playing;
      playing = false;
      const result = world.addBodies(command.bodies);
      if (result.replaced) trailCut = true;
      if (wasPlaying) resume();
      publish(command.requestId, {
        addedId: result.ids[0],
        addedIds: result.ids,
        addedCount: result.ids.length,
        futureReplaced: result.replaced,
      });
      return;
    }
    case 'EDIT_BODY': {
      if (playing) throw new Error('Pause to edit a body');
      const replaced = world.editBody(command.id, command.fields);
      if (replaced) trailCut = true;
      publish(command.requestId, { futureReplaced: replaced });
      return;
    }
    case 'DELETE_BODY': {
      const wasPlaying = playing;
      playing = false;
      const replaced = world.deleteBody(command.id);
      if (replaced) trailCut = true;
      if (wasPlaying) resume();
      publish(command.requestId, { futureReplaced: replaced, deletedId: command.id });
      return;
    }
    case 'GET_BODY':
      publish(command.requestId, { frame: false, body: world.body(command.id) });
      return;
    case 'EXPORT_STATE': {
      if (command.view) world.view = command.view;
      const scenario = world.exportScenario(command.which || 'current', world.view);
      publish(command.requestId, { scenario });
      return;
    }
    case 'VISIBILITY':
      if (command.hidden) {
        heldPlay = playing;
        playing = false;
        accumulator = 0;
      } else {
        accumulator = 0;
        lastWall = now();
        if (heldPlay) playing = true;
        heldPlay = false;
      }
      publish(command.requestId);
      return;
    case 'DISPOSE':
      disposed = true;
      playing = false;
      post({ type: 'STATE', requestId: command.requestId, ok: true, disposed: true, frame: false });
      self.close();
      return;
    default:
      throw new Error(`Unknown command ${command.type}`);
  }
}

function resume() {
  playing = true;
  accumulator = 0;
  lastWall = now();
}

function noteRetarget() {
  lastMerges = [];
  trailCut = true;
  msPerTick = 0;
  achieved = 0;
  world.diagnostics.pausedReason = null;
}

function stepOnce(direction) {
  if (direction < 0) {
    if (world.tick <= world.history.oldest) {
      world.diagnostics.pausedReason = 'oldest';
      return;
    }
    stepBackward();
    world.diagnostics.pausedReason = null;
    return;
  }
  world.diagnostics.pausedReason = null;
  if (world.tick < world.history.head) {
    world.integrate({ record: false, sample: false });
    return;
  }
  const result = world.integrate({ record: true, sample: true });
  lastMerges = result.merges || [];
  if (!result.ok) playing = false;
}

function stepBackward() {
  const target = world.tick - 1;
  const exact = world.history.nearestAtOrBefore(target);
  if (exact && exact.tick === target) {
    world.store.restore(exact);
    world.tick = exact.tick;
    return;
  }
  world.seek(target);
}

async function seekTo(tick, requestId, token) {
  playing = false;
  if (!Number.isInteger(tick)) throw new Error('Seek tick must be an integer');
  if (tick < world.history.oldest || tick > world.history.head) {
    throw new Error(`Tick ${tick} is outside retained history ${world.history.oldest}–${world.history.head}`);
  }
  const checkpoint = world.history.nearestAtOrBefore(tick);
  world.store.restore(checkpoint);
  world.tick = checkpoint.tick;
  let guard = 0;
  while (world.tick < tick) {
    if (token !== seekToken || disposed) {
      postSuperseded(requestId);
      return;
    }
    const result = world.integrate({ record: false, sample: false });
    if (!result.ok) {
      publish(requestId);
      return;
    }
    guard += 1;
    if (guard % 8 === 0) await yieldNow();
  }
  if (token !== seekToken || disposed) {
    postSuperseded(requestId);
    return;
  }
  world.diagnostics.pausedReason = null;
  publish(requestId);
}

function runBatch() {
  const time = now();
  if (!lastWall) lastWall = time;
  let elapsed = time - lastWall;
  lastWall = time;
  if (elapsed < 0) elapsed = 0;
  if (elapsed > 80) elapsed = 80;
  accumulator += (elapsed * TICKS_PER_SECOND * speed) / 1000;
  if (accumulator > MAX_BACKLOG_TICKS) accumulator = MAX_BACKLOG_TICKS;

  const started = now();
  let steps = 0;
  while (accumulator >= 1 && now() - started < PHYSICS_BUDGET_MS && !queue.length) {
    if (reverse) {
      if (world.tick <= world.history.oldest) {
        playing = false;
        world.diagnostics.pausedReason = 'oldest';
        break;
      }
      stepBackward();
    } else if (world.tick < world.history.head) {
      world.integrate({ record: false, sample: false });
    } else {
      const result = world.integrate({ record: true, sample: true });
      lastMerges = result.merges || [];
      if (!result.ok) {
        playing = false;
        break;
      }
    }
    accumulator -= 1;
    steps += 1;
  }
  if (steps > 0) {
    const sample = (now() - started) / steps;
    msPerTick = msPerTick ? msPerTick * 0.8 + sample * 0.2 : sample;
  }
  accountSpeed(steps);
  publishIfDue();
}

function accountSpeed(steps) {
  const time = now();
  if (!speedWindowStart) speedWindowStart = time;
  speedWindowSteps += steps;
  const elapsed = time - speedWindowStart;
  if (elapsed >= 400) {
    achieved = (speedWindowSteps / elapsed) * 1000 / TICKS_PER_SECOND;
    speedWindowSteps = 0;
    speedWindowStart = time;
  }
}

function publishIfDue() {
  const time = now();
  if (time - lastPublish < 32 && playing) return;
  publish(null);
}

function publish(requestId, extra = {}) {
  if (extra.frame === false) {
    post({
      type: 'STATE',
      requestId: requestId ?? null,
      ok: extra.ok !== false,
      error: extra.error || null,
      frame: false,
      generation: world.generation,
      tick: world.tick,
      head: world.history.head,
      oldest: world.history.oldest,
      playing,
      speed,
      reverse,
      ...extra,
      body: extra.body || null,
      scenario: extra.scenario || null,
    });
    return;
  }
  if (inFlight) {
    framePending = true;
    if (requestId != null) {
      post({
        type: 'STATE',
        requestId,
        ok: extra.ok !== false,
        error: extra.error || null,
        frame: false,
        superseded: false,
        generation: world.generation,
        tick: world.tick,
        head: world.history.head,
        oldest: world.history.oldest,
        playing,
        speed,
        reverse,
        addedId: extra.addedId ?? null,
        futureReplaced: Boolean(extra.futureReplaced) || trailCut,
        scenario: extra.scenario || null,
      });
    }
    return;
  }

  const count = world.store.count;
  const positions = alloc(Float32Array, count * 3);
  const velocities = alloc(Float32Array, count * 3);
  const masses = alloc(Float32Array, count);
  const radii = alloc(Float32Array, count);
  const colors = alloc(Float32Array, count * 3);
  const ids = alloc(Int32Array, count);
  const clusters = alloc(Int32Array, count);
  for (let i = 0; i < count; i++) {
    const k = i * 3;
    positions[k] = world.store.pos[k];
    positions[k + 1] = world.store.pos[k + 1];
    positions[k + 2] = world.store.pos[k + 2];
    velocities[k] = world.store.vel[k];
    velocities[k + 1] = world.store.vel[k + 1];
    velocities[k + 2] = world.store.vel[k + 2];
    masses[i] = world.store.mass[i];
    radii[i] = world.store.radius[i];
    colors[k] = world.store.color[k];
    colors[k + 1] = world.store.color[k + 1];
    colors[k + 2] = world.store.color[k + 2];
    ids[i] = world.store.ids[i];
    clusters[i] = world.store.cluster[i];
  }

  frameId += 1;
  inFlight = true;
  framePending = false;
  lastPublish = now();
  const diagnostics = world.diagnosticsSnapshot();
  diagnostics.msPerTick = msPerTick;
  diagnostics.achievedSpeed = playing ? achieved : 0;
  diagnostics.requestedSpeed = reverse ? -speed : speed;
  const transfers = [positions.buffer, velocities.buffer, masses.buffer, radii.buffer, colors.buffer, ids.buffer, clusters.buffer];
  post({
    type: 'STATE',
    requestId: requestId ?? null,
    ok: extra.ok !== false,
    error: extra.error || null,
    frame: true,
    frameId,
    generation: world.generation,
    tick: world.tick,
    head: world.history.head,
    oldest: world.history.oldest,
    playing,
    speed,
    reverse,
    count,
    ids,
    positions,
    velocities,
    masses,
    radii,
    colors,
    clusters,
    com: diagnostics.com,
    diagnostics,
    physics: {
      G: world.G,
      dt: world.dt,
      epsilon: world.epsilon,
      collisionMode: world.collisionMode,
    },
    meta: {
      preset: world.preset,
      seed: world.seed,
      name: world.name,
      notes: world.notes,
      presetParams: world.presetParams,
    },
    merges: lastMerges,
    futureReplaced: Boolean(extra.futureReplaced) || trailCut,
    addedId: extra.addedId ?? null,
    deletedId: extra.deletedId ?? null,
    scenario: extra.scenario || null,
    pausedReason: world.diagnostics.pausedReason,
  }, transfers);
  lastMerges = [];
  trailCut = false;
}

function postSuperseded(requestId) {
  post({
    type: 'STATE',
    requestId,
    ok: true,
    superseded: true,
    frame: false,
    generation: world.generation,
    tick: world.tick,
    head: world.history.head,
    oldest: world.history.oldest,
  });
}

function post(message, transfers) {
  if (disposed && message.type !== 'STATE') return;
  self.postMessage(message, transfers || []);
}

function sanitizeSpeed(value) {
  const speedValue = Number(value);
  if (!Number.isFinite(speedValue) || speedValue <= 0) return 1;
  return Math.min(SPEEDS[SPEEDS.length - 1], speedValue);
}

function now() {
  return performance.now();
}

function yieldNow() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
