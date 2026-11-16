/** Groups dropped by the Add body panel. Preset generators stay untouched. */

import { barycentricCircular, circularSpeed } from './gravity.js';
import { centerBodies } from './presets.js';
import { makeRng } from './prng.js';

export const GROUP_DROP_MAX = 256;

export const GROUP_KINDS = [
  { id: 'single', name: 'Single body' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'disk', name: 'Rotating disk' },
  { id: 'solar', name: 'Solar system' },
  { id: 'binary', name: 'Binary' },
];

export const GROUP_INFO = {
  single: { name: 'Single body', blurb: '' },
  cloud: {
    name: 'Cloud',
    blurb: 'A ball of bodies with a little spin around the vertical axis. The locked point is the center.',
  },
  disk: {
    name: 'Rotating disk',
    blurb: 'A thin disk around a heavy center. The body count includes that center. Orbital speed uses the current G, the current softening, and the central mass only. Spin is the direction seen from above. Not a model of a real galaxy.',
  },
  solar: {
    name: 'Solar system',
    blurb: 'One heavy center and lighter bodies on softened circular orbits. The body count includes the center. Inclination is in radians.',
  },
  binary: {
    name: 'Binary',
    blurb: 'Two stars orbit their common center, with lighter bodies around them. The body count includes both stars. Speeds use the current G and softening.',
  },
};

/** [key, label, step, mode]. mode "sign" is a direction. mode "int" is a whole number. */
export const GROUP_FIELDS = {
  cloud: [
    ['count', 'Bodies', 1, 'int'],
    ['radius', 'Radius', 0.1],
    ['dispersion', 'Velocity dispersion', 0.01],
    ['spin', 'Spin', 0.01],
    ['minMass', 'Minimum mass', 0.01],
    ['maxMass', 'Maximum mass', 0.01],
  ],
  disk: [
    ['count', 'Bodies', 1, 'int'],
    ['centralMass', 'Central mass', 1],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['thickness', 'Thickness', 0.01],
    ['dispersion', 'Velocity scatter', 0.01],
    ['particleMass', 'Particle mass', 0.001],
    ['spin', 'Spin', 1, 'sign'],
  ],
  solar: [
    ['count', 'Bodies', 1, 'int'],
    ['centralMass', 'Central mass', 1],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['particleMass', 'Orbiter mass', 0.001],
    ['inclination', 'Inclination', 0.01],
  ],
  binary: [
    ['count', 'Bodies', 1, 'int'],
    ['mass1', 'Star A mass', 1],
    ['mass2', 'Star B mass', 1],
    ['separation', 'Separation', 0.1],
    ['particleMass', 'Orbiter mass', 0.001],
  ],
};

const KIND_NOUN = {
  cloud: 'A cloud',
  disk: 'A rotating disk',
  solar: 'A solar system',
  binary: 'A binary',
};

export function defaultGroupParams(kind) {
  switch (kind) {
    case 'cloud':
      return { count: 32, radius: 5, dispersion: 0.2, spin: 0.15, minMass: 0.4, maxMass: 1.2 };
    case 'disk':
      return {
        count: 32, centralMass: 40, inner: 0.8, outer: 4.5, thickness: 0.22,
        dispersion: 0.04, particleMass: 0.04, spin: 1,
      };
    case 'solar':
      return { count: 13, centralMass: 80, inner: 1.6, outer: 7, particleMass: 0.03, inclination: 0.1 };
    case 'binary':
      return { count: 10, mass1: 30, mass2: 18, separation: 3.5, particleMass: 0.02 };
    default:
      throw new Error(`Unknown group ${kind}`);
  }
}

/**
 * Local bodies centered on the origin with net momentum removed.
 * Circular speeds use the live G and epsilon, not a preset's fixed physics.
 */
export function buildGroup(kind, params, seed, physics = {}) {
  if (!GROUP_FIELDS[kind]) throw new Error(`Unknown group ${kind}`);
  const spec = resolveGroupParams(kind, params);
  const G = Number(physics.G);
  const epsilon = Number(physics.epsilon);
  if (!Number.isFinite(G) || G < 0) throw new Error('G must be zero or positive');
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new Error('Softening must be zero or positive');
  const color = normalizeColor(physics.color);
  const rng = makeRng(seed);
  let bodies;
  if (kind === 'cloud') bodies = cloudBodies(rng, spec, color);
  else if (kind === 'disk') bodies = diskBodies(rng, spec, color, G, epsilon);
  else if (kind === 'solar') bodies = solarBodies(rng, spec, color, G, epsilon);
  else bodies = binaryBodies(rng, spec, color, G, epsilon);
  centerBodies(bodies, true);
  return { bodies, extent: groupExtent(bodies) };
}

/** Unit circle in the XZ plane. Y is up, so the placement plane is XZ. Point 0 is +X, the quarter turn is +Z. */
export function placementRing(segments = 64) {
  const count = Math.max(8, segments | 0);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle);
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(angle);
  }
  return positions;
}

export function resolveGroupParams(kind, overrides = {}) {
  const defaults = defaultGroupParams(kind);
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (overrides[key] !== undefined) merged[key] = overrides[key];
  }
  const labels = Object.fromEntries(GROUP_FIELDS[kind].map((field) => [field[0], field[1]]));
  const num = (key) => {
    const value = Number(merged[key]);
    if (!Number.isFinite(value)) throw new Error(`${labels[key]} needs a finite number`);
    return value;
  };
  const count = num('count');
  if (!Number.isInteger(count)) throw new Error('Body count needs a whole number');
  if (count < 2) throw new Error(`${KIND_NOUN[kind]} needs at least 2 bodies`);
  if (count > GROUP_DROP_MAX) throw new Error(`A single drop is limited to ${GROUP_DROP_MAX} bodies`);
  merged.count = count;

  if (kind === 'cloud') {
    merged.radius = positive(num('radius'), labels.radius);
    merged.dispersion = nonnegative(num('dispersion'), labels.dispersion);
    merged.spin = num('spin');
    merged.minMass = positive(num('minMass'), labels.minMass);
    merged.maxMass = positive(num('maxMass'), labels.maxMass);
    if (merged.minMass > merged.maxMass) throw new Error('Minimum mass cannot be above maximum mass');
  } else if (kind === 'disk') {
    merged.centralMass = positive(num('centralMass'), labels.centralMass);
    merged.inner = positive(num('inner'), labels.inner);
    merged.outer = positive(num('outer'), labels.outer);
    if (merged.inner > merged.outer) throw new Error('Inner radius cannot be above the outer radius');
    merged.thickness = nonnegative(num('thickness'), labels.thickness);
    merged.dispersion = nonnegative(num('dispersion'), labels.dispersion);
    merged.particleMass = positive(num('particleMass'), labels.particleMass);
    merged.spin = num('spin');
  } else if (kind === 'solar') {
    merged.centralMass = positive(num('centralMass'), labels.centralMass);
    merged.inner = positive(num('inner'), labels.inner);
    merged.outer = positive(num('outer'), labels.outer);
    if (merged.inner > merged.outer) throw new Error('Inner radius cannot be above the outer radius');
    merged.particleMass = positive(num('particleMass'), labels.particleMass);
    merged.inclination = nonnegative(num('inclination'), labels.inclination);
  } else {
    merged.mass1 = positive(num('mass1'), labels.mass1);
    merged.mass2 = positive(num('mass2'), labels.mass2);
    merged.separation = positive(num('separation'), labels.separation);
    merged.particleMass = positive(num('particleMass'), labels.particleMass);
  }
  return merged;
}

function cloudBodies(rng, params, color) {
  const bodies = [];
  for (let i = 0; i < params.count; i++) {
    const mass = params.minMass + (params.maxMass - params.minMass) * rng();
    const position = sampleBall(rng, params.radius);
    const velocity = [
      -position[2] * params.spin + rng.gauss() * params.dispersion,
      rng.gauss() * params.dispersion * 0.45,
      position[0] * params.spin + rng.gauss() * params.dispersion,
    ];
    bodies.push(makeBody(position, velocity, mass, particleRadius(mass), particleColor(color, i)));
  }
  return bodies;
}

function diskBodies(rng, params, color, G, epsilon) {
  const sign = params.spin >= 0 ? 1 : -1;
  const bodies = [makeBody([0, 0, 0], [0, 0, 0], params.centralMass, centerRadius(params.centralMass), shade(color, 1.15))];
  const span = params.outer * params.outer - params.inner * params.inner;
  for (let i = 1; i < params.count; i++) {
    const radius = Math.sqrt(params.inner * params.inner + rng() * span);
    const phi = rng() * Math.PI * 2;
    const position = [Math.cos(phi) * radius, (rng() * 2 - 1) * params.thickness, Math.sin(phi) * radius];
    const speed = circularSpeed(G, params.centralMass, Math.hypot(position[0], position[1], position[2]), epsilon);
    const jitter = params.dispersion * speed;
    const velocity = [
      -Math.sin(phi) * speed * sign + rng.gauss() * jitter,
      rng.gauss() * jitter * 0.35,
      Math.cos(phi) * speed * sign + rng.gauss() * jitter,
    ];
    bodies.push(makeBody(position, velocity, params.particleMass, particleRadius(params.particleMass), particleColor(color, i)));
  }
  return bodies;
}

function solarBodies(rng, params, color, G, epsilon) {
  const bodies = [makeBody([0, 0, 0], [0, 0, 0], params.centralMass, centerRadius(params.centralMass), shade(color, 1.15))];
  const n = params.count - 1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const radius = params.inner + (params.outer - params.inner) * Math.sqrt(t);
    const phi = i * 2.399963229728653;
    const incl = (rng() - 0.5) * params.inclination;
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    const position = [
      radius * Math.cos(phi),
      radius * Math.sin(phi) * sinI,
      radius * Math.sin(phi) * cosI,
    ];
    const distance = Math.hypot(position[0], position[1], position[2]);
    const speed = circularSpeed(G, params.centralMass, distance, epsilon);
    const planar = Math.hypot(position[0], position[2]) || 1;
    const velocity = [
      -position[2] / planar * speed,
      rng.gauss() * speed * 0.002,
      position[0] / planar * speed,
    ];
    bodies.push(makeBody(position, velocity, params.particleMass, particleRadius(params.particleMass), particleColor(color, i)));
  }
  return bodies;
}

function binaryBodies(rng, params, color, G, epsilon) {
  const pair = barycentricCircular(G, params.mass1, params.mass2, params.separation, epsilon);
  const starColor = shade(color, 1.15);
  const other = companionColor(color);
  const bodies = [
    makeBody(pair.bodies[0].position, pair.bodies[0].velocity, params.mass1, centerRadius(params.mass1), starColor),
    makeBody(pair.bodies[1].position, pair.bodies[1].velocity, params.mass2, centerRadius(params.mass2), other),
  ];
  const extras = params.count - 2;
  for (let i = 0; i < extras; i++) {
    const aroundBary = i % 5 === 0;
    if (aroundBary) {
      const radius = params.separation * (1.8 + rng() * 1.2);
      const phi = rng() * Math.PI * 2;
      const position = [Math.cos(phi) * radius, (rng() - 0.5) * params.separation * 0.04, Math.sin(phi) * radius];
      const speed = circularSpeed(G, params.mass1 + params.mass2, radius, epsilon);
      const velocity = [-Math.sin(phi) * speed, 0, Math.cos(phi) * speed];
      bodies.push(makeBody(position, velocity, params.particleMass, particleRadius(params.particleMass), particleColor(color, i)));
    } else {
      const star = i % 2 === 0 ? bodies[0] : bodies[1];
      const radius = params.separation * (0.18 + rng() * 0.16);
      const phi = rng() * Math.PI * 2;
      const position = [
        star.position[0] + Math.cos(phi) * radius,
        star.position[1] + (rng() - 0.5) * radius * 0.2,
        star.position[2] + Math.sin(phi) * radius,
      ];
      const speed = circularSpeed(G, star.mass, radius, epsilon);
      const velocity = [
        star.velocity[0] - Math.sin(phi) * speed,
        star.velocity[1],
        star.velocity[2] + Math.cos(phi) * speed,
      ];
      bodies.push(makeBody(position, velocity, params.particleMass, particleRadius(params.particleMass), shade(star.color, 0.75)));
    }
  }
  return bodies;
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

function groupExtent(bodies) {
  let extent = 0;
  for (const item of bodies) {
    extent = Math.max(extent, Math.hypot(item.position[0], item.position[1], item.position[2]));
  }
  return extent > 0 ? extent : 0.5;
}

function particleRadius(mass) {
  return Math.max(0.04, 0.11 * Math.cbrt(mass));
}

function centerRadius(mass) {
  return Math.max(0.18, 0.16 * Math.cbrt(mass));
}

function makeBody(position, velocity, mass, radius, color) {
  return {
    position: position.slice(),
    velocity: velocity.slice(),
    mass,
    radius,
    color: color.slice(),
    cluster: 0,
  };
}

function normalizeColor(color) {
  if (!Array.isArray(color) || color.length !== 3) return [0.49, 0.71, 1];
  return [
    clamp01(Number(color[0])),
    clamp01(Number(color[1])),
    clamp01(Number(color[2])),
  ];
}

function shade(color, gain) {
  return [clamp01(color[0] * gain), clamp01(color[1] * gain), clamp01(color[2] * gain)];
}

function particleColor(color, index) {
  return shade(color, 0.55 + (index % 5) * 0.08);
}

function companionColor(color) {
  return [
    clamp01(0.25 * color[0] + 0.75 * color[2]),
    clamp01(0.2 * color[1] + 0.15),
    clamp01(0.75 * color[0] + 0.2 * color[2]),
  ];
}

function positive(value, label) {
  if (!(value > 0)) throw new Error(`${label} must be positive`);
  return value;
}

function nonnegative(value, label) {
  if (!(value >= 0)) throw new Error(`${label} must be zero or positive`);
  return value;
}

function clamp01(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
