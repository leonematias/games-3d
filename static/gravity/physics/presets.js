/** Seeded initial conditions. Exported scenarios store the bodies, not a promise to rerun the generator. */

import { DEFAULT_BODY_COUNT, MAX_BODIES } from './constants.js';
import { barycentricCircular, circularSpeed } from './gravity.js';
import { makeRng } from './prng.js';

const PALETTE = [
  [0.98, 0.84, 0.48],
  [0.45, 0.74, 1],
  [1, 0.48, 0.32],
  [0.52, 0.95, 0.78],
  [0.78, 0.56, 1],
  [1, 0.66, 0.78],
  [0.95, 0.95, 0.92],
  [0.62, 0.78, 0.95],
];

export const PRESET_INFO = {
  'random-cloud': {
    name: 'Random cloud',
    blurb: 'A spherical cloud with a little spin. Bodies clump and merge.',
  },
  'solar-system': {
    name: 'Solar system',
    blurb: 'One heavy center and many light bodies on softened circular orbits.',
  },
  'binary-stars': {
    name: 'Binary stars',
    blurb: 'Two stars on a barycentric orbit, with light bodies around them.',
  },
  'rotating-disk': {
    name: 'Rotating disk',
    blurb: 'A thin disk around a heavy center. Not an equilibrium galaxy.',
  },
  'colliding-disks': {
    name: 'Colliding disks',
    blurb: 'Two simplified particle disks on a collision course. Not a model of real galaxies.',
  },
  'black-hole': {
    name: 'Black hole',
    blurb: 'A very heavy center. Stars on slow orbits fall in and merge with it. Orbit fraction is the share of a circular orbit: 0 falls straight in, and 1 stays in orbit. Softened Newtonian gravity, not a relativistic black hole.',
  },
};

export function defaultParams(preset, count = DEFAULT_BODY_COUNT) {
  const n = clampCount(count);
  switch (preset) {
    case 'solar-system':
      return { count: n, centralMass: 800, inner: 6, outer: 46, particleMass: 0.02, inclination: 0.08, radiusDiversity: 0.75 };
    case 'binary-stars':
      return { count: n, mass1: 220, mass2: 160, separation: 10, particleMass: 0.015, radiusDiversity: 0.75 };
    case 'rotating-disk':
      return { count: n, centralMass: 500, inner: 2.5, outer: 16, thickness: 0.35, dispersion: 0.05, particleMass: 0.04, spin: 1, radiusDiversity: 0.75 };
    case 'colliding-disks':
      return {
        count: n, centralMass: 140, inner: 1.6, outer: 7, thickness: 0.28,
        separation: 20, impact: 2.5, bulkSpeed: 1.6, tilt: 0.55,
        spin1: 1, spin2: -1, particleMass: 0.08, radiusDiversity: 0.75,
      };
    case 'black-hole':
      return {
        count: n, centralMass: 6000, inner: 8, outer: 26, thickness: 1.1,
        plunge: 0.38, spin: 1, particleMass: 0.06, radiusDiversity: 0.75,
      };
    case 'random-cloud':
    default:
      return { count: n, radius: 14, dispersion: 0.35, spin: 0.15, minMass: 0.35, maxMass: 1.8, radiusDiversity: 0.75 };
  }
}

export function presetPhysics(preset) {
  if (preset === 'solar-system' || preset === 'binary-stars') {
    return { G: 1, dt: 0.01, epsilon: 0.35, collisionMode: 'pass' };
  }
  if (preset === 'rotating-disk') {
    return { G: 1, dt: 0.01, epsilon: 0.4, collisionMode: 'pass' };
  }
  if (preset === 'colliding-disks') {
    return { G: 1, dt: 0.008, epsilon: 0.4, collisionMode: 'merge' };
  }
  if (preset === 'black-hole') {
    return { G: 1, dt: 0.004, epsilon: 0.5, collisionMode: 'merge' };
  }
  return { G: 1, dt: 0.01, epsilon: 0.45, collisionMode: 'merge' };
}

export function generatePreset(preset, seed, params = {}) {
  if (!Object.prototype.hasOwnProperty.call(PRESET_INFO, preset)) {
    throw new Error(`Unknown preset ${preset}`);
  }
  const merged = { ...defaultParams(preset, params.count), ...params, count: clampCount(params.count ?? defaultParams(preset).count) };
  const rng = makeRng(seed);
  let bodies;
  if (preset === 'random-cloud') bodies = randomCloud(rng, merged);
  else if (preset === 'solar-system') bodies = solarSystem(rng, merged);
  else if (preset === 'binary-stars') bodies = binaryStars(rng, merged);
  else if (preset === 'rotating-disk') bodies = rotatingDisk(rng, merged);
  else if (preset === 'black-hole') bodies = blackHole(rng, merged);
  else bodies = collidingDisks(seed, merged);

  assignIds(bodies);
  const info = PRESET_INFO[preset];
  return {
    schemaVersion: 1,
    name: info.name,
    notes: preset === 'colliding-disks' || preset === 'black-hole' ? info.blurb : '',
    seed: seed >>> 0,
    preset,
    presetParams: merged,
    physics: presetPhysics(preset),
    view: defaultView(),
    bodies,
  };
}

export function defaultView() {
  return {
    colorMode: 'cluster',
    trails: true,
    trailLength: 48,
    trailMode: 'selection',
    quality: 'full',
    pixelRatioMax: 1.5,
    showRadii: false,
    follow: 'none',
    pointScale: 7,
  };
}

function randomCloud(rng, params) {
  const bodies = [];
  for (let i = 0; i < params.count; i++) {
    const mass = params.minMass + (params.maxMass - params.minMass) * rng();
    const position = sampleBall(rng, params.radius);
    const spin = params.spin;
    const velocity = [
      -position[2] * spin + rng.gauss() * params.dispersion,
      rng.gauss() * params.dispersion * 0.45,
      position[0] * spin + rng.gauss() * params.dispersion,
    ];
    const base = scaledRadius(mass, 1, 0.16, 0.04);
    bodies.push(body(position, velocity, mass, diverseRadius(rng, base, params.radiusDiversity), palette(i % PALETTE.length), i % 6));
  }
  centerBodies(bodies, true);
  return bodies;
}

function solarSystem(rng, params) {
  const sun = body([0, 0, 0], [0, 0, 0], params.centralMass, scaledRadius(params.centralMass, 800, 1.15, 0.2), PALETTE[0], 0);
  const bodies = [sun];
  const n = params.count - 1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const radius = params.inner + (params.outer - params.inner) * Math.sqrt(t);
    const phi = i * 2.399963229728653;
    const incl = (rng() - 0.5) * params.inclination;
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    const x = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * cosI;
    const y = radius * Math.sin(phi) * sinI;
    const speed = circularSpeed(1, params.centralMass, Math.hypot(x, y, z), presetPhysics('solar-system').epsilon);
    const planar = Math.hypot(x, z) || 1;
    const tx = -z / planar;
    const tz = x / planar;
    const velocity = [tx * speed, rng.gauss() * speed * 0.002, tz * speed];
    const cluster = 1 + (i % 5);
    const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.02, 0.12, 0.04), params.radiusDiversity);
    bodies.push(body([x, y, z], velocity, params.particleMass, size, palette(cluster), cluster));
  }
  centerBodies(bodies, true);
  return bodies;
}

function binaryStars(rng, params) {
  const physics = presetPhysics('binary-stars');
  const pair = barycentricCircular(physics.G, params.mass1, params.mass2, params.separation, physics.epsilon);
  const bodies = [
    body(pair.bodies[0].position, pair.bodies[0].velocity, params.mass1, scaledRadius(params.mass1, 220, 0.85, 0.2), PALETTE[0], 1),
    body(pair.bodies[1].position, pair.bodies[1].velocity, params.mass2, scaledRadius(params.mass2, 160, 0.75, 0.2), PALETTE[2], 2),
  ];
  const extras = params.count - 2;
  for (let i = 0; i < extras; i++) {
    const aroundBary = i % 5 === 0;
    if (aroundBary) {
      const radius = params.separation * (1.8 + rng() * 2.2);
      const phi = rng() * Math.PI * 2;
      const position = [Math.cos(phi) * radius, (rng() - 0.5) * 0.4, Math.sin(phi) * radius];
      const speed = circularSpeed(physics.G, params.mass1 + params.mass2, radius, physics.epsilon);
      const velocity = [-Math.sin(phi) * speed, 0, Math.cos(phi) * speed];
      const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.015, 0.1, 0.04), params.radiusDiversity);
      bodies.push(body(position, velocity, params.particleMass, size, PALETTE[4], 0));
    } else {
      const star = i % 2 === 0 ? bodies[0] : bodies[1];
      const radius = 1.4 + rng() * (params.separation * 0.28);
      const phi = rng() * Math.PI * 2;
      const offset = [Math.cos(phi) * radius, (rng() - 0.5) * 0.25, Math.sin(phi) * radius];
      const speed = circularSpeed(physics.G, star.mass, radius, physics.epsilon);
      const position = [
        star.position[0] + offset[0],
        star.position[1] + offset[1],
        star.position[2] + offset[2],
      ];
      const velocity = [
        star.velocity[0] - Math.sin(phi) * speed,
        star.velocity[1],
        star.velocity[2] + Math.cos(phi) * speed,
      ];
      const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.015, 0.1, 0.04), params.radiusDiversity);
      bodies.push(body(position, velocity, params.particleMass, size, star.color, star.cluster));
    }
  }
  centerBodies(bodies, true);
  return bodies;
}

function rotatingDisk(rng, params) {
  const physics = presetPhysics('rotating-disk');
  const bodies = [body([0, 0, 0], [0, 0, 0], params.centralMass, scaledRadius(params.centralMass, 500, 0.9, 0.2), PALETTE[0], 0)];
  for (let i = 1; i < params.count; i++) {
    const radius = Math.sqrt(params.inner * params.inner + rng() * (params.outer * params.outer - params.inner * params.inner));
    const phi = rng() * Math.PI * 2;
    const y = (rng() * 2 - 1) * params.thickness;
    const x = Math.cos(phi) * radius;
    const z = Math.sin(phi) * radius;
    const speed = circularSpeed(physics.G, params.centralMass, Math.hypot(x, y, z), physics.epsilon);
    const sign = params.spin >= 0 ? 1 : -1;
    const jitter = params.dispersion * speed;
    const velocity = [
      -Math.sin(phi) * speed * sign + rng.gauss() * jitter,
      rng.gauss() * jitter * 0.35,
      Math.cos(phi) * speed * sign + rng.gauss() * jitter,
    ];
    const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.04, 0.11, 0.04), params.radiusDiversity);
    bodies.push(body([x, y, z], velocity, params.particleMass, size, PALETTE[1 + (i % 3)], 1));
  }
  centerBodies(bodies, true);
  return bodies;
}

function blackHole(rng, params) {
  const physics = presetPhysics('black-hole');
  const holeRadius = scaledRadius(params.centralMass, 6000, 2.6, 0.45);
  const bodies = [body([0, 0, 0], [0, 0, 0], params.centralMass, holeRadius, [0.08, 0.07, 0.06], 0)];
  const plunge = Math.min(1.5, Math.max(0, Number(params.plunge) || 0));
  const sign = params.spin >= 0 ? 1 : -1;
  const inner = Math.max(0, params.inner);
  const outer = Math.max(inner, params.outer);
  for (let i = 1; i < params.count; i++) {
    const radius = Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner));
    const phi = rng() * Math.PI * 2;
    const y = (rng() * 2 - 1) * params.thickness;
    const x = Math.cos(phi) * radius;
    const z = Math.sin(phi) * radius;
    const fraction = plunge * (1 + (rng() * 2 - 1) * 0.2);
    const speed = circularSpeed(physics.G, params.centralMass, Math.hypot(x, y, z), physics.epsilon) * fraction;
    const velocity = [
      -Math.sin(phi) * speed * sign,
      rng.gauss() * speed * 0.03,
      Math.cos(phi) * speed * sign,
    ];
    const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.06, 0.12, 0.04), params.radiusDiversity);
    bodies.push(body([x, y, z], velocity, params.particleMass, size, PALETTE[1], 1));
  }
  centerBodies(bodies, true);
  return bodies;
}

function collidingDisks(seed, params) {
  const physics = presetPhysics('colliding-disks');
  const left = makeDisk(makeRng(seed >>> 0), halfCount(params.count, 0), params, physics, 1, params.spin1);
  const right = makeDisk(makeRng((seed + 101) >>> 0), halfCount(params.count, 1), params, physics, 2, params.spin2);
  centerBodies(left, true);
  centerBodies(right, true);
  placeDisk(left, [-params.separation / 2, 0, 0], 0, [params.bulkSpeed, 0, 0]);
  placeDisk(right, [params.separation / 2, 0, params.impact], params.tilt, [-params.bulkSpeed, 0, 0]);
  return left.concat(right);
}

function makeDisk(rng, count, params, physics, cluster, spin) {
  const color = palette(cluster);
  const bodies = [body([0, 0, 0], [0, 0, 0], params.centralMass, scaledRadius(params.centralMass, 140, 0.7, 0.2), color, cluster)];
  const sign = spin >= 0 ? 1 : -1;
  for (let i = 1; i < count; i++) {
    const radius = Math.sqrt(params.inner * params.inner + rng() * (params.outer * params.outer - params.inner * params.inner));
    const phi = rng() * Math.PI * 2;
    const x = Math.cos(phi) * radius;
    const z = Math.sin(phi) * radius;
    const y = (rng() * 2 - 1) * params.thickness;
    const speed = circularSpeed(physics.G, params.centralMass, Math.hypot(x, y, z), physics.epsilon) * 0.92;
    const velocity = [-Math.sin(phi) * speed * sign, rng.gauss() * 0.02, Math.cos(phi) * speed * sign];
    const size = diverseRadius(rng, scaledRadius(params.particleMass, 0.08, 0.1, 0.04), params.radiusDiversity);
    bodies.push(body([x, y, z], velocity, params.particleMass, size, color, cluster));
  }
  return bodies;
}

function placeDisk(bodies, offset, tilt, bulk) {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (const item of bodies) {
    const y = item.position[1];
    const z = item.position[2];
    item.position[1] = y * c - z * s;
    item.position[2] = y * s + z * c;
    const vy = item.velocity[1];
    const vz = item.velocity[2];
    item.velocity[1] = vy * c - vz * s;
    item.velocity[2] = vy * s + vz * c;
    item.position[0] += offset[0];
    item.position[1] += offset[1];
    item.position[2] += offset[2];
    item.velocity[0] += bulk[0];
    item.velocity[1] += bulk[1];
    item.velocity[2] += bulk[2];
  }
}

function sampleBall(rng, radius) {
  const r = radius * Math.cbrt(rng());
  const cosTheta = rng() * 2 - 1;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const phi = rng() * Math.PI * 2;
  return [
    r * sinTheta * Math.cos(phi),
    r * cosTheta,
    r * sinTheta * Math.sin(phi),
  ];
}

export function centerBodies(bodies, stripMomentum) {
  let mass = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  for (const item of bodies) {
    mass += item.mass;
    cx += item.mass * item.position[0];
    cy += item.mass * item.position[1];
    cz += item.mass * item.position[2];
    px += item.mass * item.velocity[0];
    py += item.mass * item.velocity[1];
    pz += item.mass * item.velocity[2];
  }
  if (mass === 0) return;
  cx /= mass;
  cy /= mass;
  cz /= mass;
  const vx = px / mass;
  const vy = py / mass;
  const vz = pz / mass;
  for (const item of bodies) {
    item.position[0] -= cx;
    item.position[1] -= cy;
    item.position[2] -= cz;
    if (stripMomentum) {
      item.velocity[0] -= vx;
      item.velocity[1] -= vy;
      item.velocity[2] -= vz;
    }
  }
}

/** Same cube-root scaling the Add body groups use. Reference mass keeps today's default size. */
function scaledRadius(mass, referenceMass, referenceRadius, floor) {
  const ratio = Math.cbrt(Math.max(mass, 1e-12) / referenceMass);
  return Math.max(floor, referenceRadius * ratio);
}

/**
 * Spread a base radius in log space. One rng draw is always consumed, so editing
 * the diversity changes sizes without reshuffling positions.
 * Diversity 0 keeps the base. Diversity 1 runs from base/3 to base*3.
 */
function diverseRadius(rng, base, diversity) {
  const unit = rng();
  const spread = Math.min(1, Math.max(0, Number(diversity) || 0));
  if (spread === 0) return base;
  const factor = Math.exp((unit * 2 - 1) * spread * Math.log(3));
  return Math.max(0.04, base * factor);
}

function body(position, velocity, mass, radius, color, cluster) {
  return {
    position: position.slice(),
    velocity: velocity.slice(),
    mass,
    radius,
    color: color.slice(),
    cluster,
  };
}

function assignIds(bodies) {
  let id = 1;
  for (const item of bodies) item.id = id++;
}

function palette(index) {
  return PALETTE[Math.abs(index) % PALETTE.length];
}

function clampCount(count) {
  const n = count === undefined ? DEFAULT_BODY_COUNT : count | 0;
  if (n < 2) return 2;
  if (n > MAX_BODIES) return MAX_BODIES;
  return n;
}

function halfCount(count, index) {
  const left = Math.ceil(count / 2);
  return index === 0 ? left : count - left;
}
