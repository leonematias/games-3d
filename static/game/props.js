import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { isWaterTexture } from './themes.js';

// Decorative props, ground clutter and floor decals placed per theme at load time. Everything is
// merged into a handful of meshes (solid props, glowing bits, foliage, one mesh per decal type).
// Props never collide: tall ones sit on wall tops, floor ones are small and hug the walls.

// ---------- seeded random ----------

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- geometry merging ----------

class Merger {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  add(geometry, matrix, color) {
    const source = geometry.index ? geometry : geometry;
    const pos = source.attributes.position;
    const nor = source.attributes.normal;
    const uv = source.attributes.uv;
    const base = this.positions.length / 3;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    const c = new THREE.Color(color);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        this.normals.push(v.x, v.y, v.z);
      } else this.normals.push(0, 1, 0);
      if (uv) this.uvs.push(uv.getX(i), uv.getY(i));
      else this.uvs.push(0, 0);
      this.colors.push(c.r, c.g, c.b);
    }
    if (source.index) {
      for (let i = 0; i < source.index.count; i++) this.indices.push(base + source.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.indices.push(base + i);
    }
  }

  get empty() {
    return this.indices.length === 0;
  }

  build(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    return new THREE.Mesh(geometry, material);
  }
}

// Reused primitive geometries (merged, so sharing is safe).
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 9),
  sphere: new THREE.SphereGeometry(1, 10, 7),
  rock: new THREE.IcosahedronGeometry(1, 1),
  rockLow: new THREE.IcosahedronGeometry(1, 0),
  capsule: new THREE.CapsuleGeometry(1, 2, 3, 8),
  plane: new THREE.PlaneGeometry(1, 1)
};

function part(geometry, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale)
  );
  return { geometry, color, matrix: m };
}

function shade(color, factor) {
  const c = new THREE.Color(color);
  c.r = Math.min(1, c.r * factor);
  c.g = Math.min(1, c.g * factor);
  c.b = Math.min(1, c.b * factor);
  return c.getHex();
}

const DEFAULT_PALETTE = {
  rock: 0x6f6a62,
  rubble: 0x7a7268,
  metal: 0x55606c,
  rust: 0x7a4a2a,
  wood: 0x7a5a32,
  bone: 0xe8e0cc,
  marble: 0xd8d0c0,
  clay: 0x9a6a3a,
  sand: 0x8a7a55,
  brick: 0x7a3a2a,
  bark: 0x6b4a2b,
  leaf: 0x3f8a2e,
  tuft: 0x6aa84a,
  flame: 0xffa030,
  bulb: 0xfff1c0,
  mushroom: 0xc84a3a
};

export function paletteFor(look) {
  return { ...DEFAULT_PALETTE, ...(look.foliage || {}), ...(look.palette || {}) };
}

// Each builder returns { solid: parts[], glow: parts[], emitters: [{x,y,z,color,intensity,distance,flicker}] }
// in prop-local space (origin at the ground point, +y up). `rng` gives the per-instance variation.
const BUILDERS = {
  barrel(p, rng) {
    const wood = rng() < 0.5;
    const body = wood ? p.wood : p.rust;
    const band = wood ? shade(p.wood, 0.55) : p.metal;
    return {
      solid: [
        part(GEO.cyl, body, { pos: [0, 0.25, 0], scale: [0.17, 0.5, 0.17] }),
        part(GEO.cyl, band, { pos: [0, 0.12, 0], scale: [0.18, 0.04, 0.18] }),
        part(GEO.cyl, band, { pos: [0, 0.38, 0], scale: [0.18, 0.04, 0.18] }),
        part(GEO.cyl, shade(body, 0.8), { pos: [0, 0.5, 0], scale: [0.15, 0.02, 0.15] })
      ]
    };
  },
  crate(p) {
    return {
      solid: [
        part(GEO.box, p.wood, { pos: [0, 0.17, 0], scale: [0.34, 0.34, 0.34] }),
        part(GEO.box, shade(p.wood, 0.6), { pos: [0, 0.17, 0], scale: [0.36, 0.05, 0.36] })
      ]
    };
  },
  lamp(p, rng, look) {
    const color = look.light?.color || 0xffd27a;
    return {
      solid: [
        part(GEO.cyl, 0x2a2a2e, { pos: [0, 0.6, 0], scale: [0.03, 1.2, 0.03] }),
        part(GEO.cyl, 0x2a2a2e, { pos: [0, 0.03, 0], scale: [0.09, 0.06, 0.09] }),
        part(GEO.box, 0x2a2a2e, { pos: [0, 1.26, 0], scale: [0.18, 0.05, 0.18] }),
        part(GEO.box, 0x2a2a2e, { pos: [0, 1.1, 0], scale: [0.14, 0.03, 0.14] })
      ],
      glow: [part(GEO.sphere, color, { pos: [0, 1.17, 0], scale: [0.06, 0.06, 0.06] })],
      emitters: [{ x: 0, y: 1.12, z: 0, color, intensity: 6, distance: 6.5, flicker: false }]
    };
  },
  torch(p, rng, look) {
    const color = look.light?.color || 0xff9a3a;
    return {
      solid: [
        part(GEO.cyl, 0x3a2a1a, { pos: [0, 0.28, 0], rot: [0.25, 0, 0], scale: [0.025, 0.5, 0.025] }),
        part(GEO.cyl, 0x2a2a2e, { pos: [0, 0.52, -0.06], scale: [0.05, 0.08, 0.05] })
      ],
      glow: [
        part(GEO.cone, p.flame, { pos: [0, 0.66, -0.06], scale: [0.07, 0.2, 0.07] }),
        part(GEO.sphere, 0xfff1a0, { pos: [0, 0.6, -0.06], scale: [0.045, 0.045, 0.045] })
      ],
      emitters: [{ x: 0, y: 0.75, z: -0.06, color, intensity: 6.5, distance: 6.5, flicker: true }]
    };
  },
  tree(p, rng) {
    const s = 0.8 + rng() * 0.45;
    return {
      solid: [
        part(GEO.cyl, p.bark, { pos: [0, 0.3 * s, 0], scale: [0.07 * s, 0.6 * s, 0.07 * s] }),
        part(GEO.rock, p.leaf, { pos: [0, 0.72 * s, 0], rot: [0, rng() * 3, 0], scale: [0.34 * s, 0.3 * s, 0.34 * s] }),
        part(GEO.rock, shade(p.leaf, 1.15), { pos: [0.1 * s, 0.9 * s, 0.05 * s], rot: [0, rng() * 3, 0], scale: [0.22 * s, 0.2 * s, 0.22 * s] })
      ]
    };
  },
  pine(p, rng) {
    const s = 0.8 + rng() * 0.5;
    const leaf = shade(p.leaf, 0.85);
    return {
      solid: [
        part(GEO.cyl, p.bark, { pos: [0, 0.2 * s, 0], scale: [0.06 * s, 0.4 * s, 0.06 * s] }),
        part(GEO.cone, leaf, { pos: [0, 0.55 * s, 0], scale: [0.32 * s, 0.45 * s, 0.32 * s] }),
        part(GEO.cone, shade(leaf, 1.1), { pos: [0, 0.85 * s, 0], scale: [0.25 * s, 0.42 * s, 0.25 * s] }),
        part(GEO.cone, shade(leaf, 1.2), { pos: [0, 1.12 * s, 0], scale: [0.17 * s, 0.38 * s, 0.17 * s] })
      ]
    };
  },
  deadTree(p, rng) {
    const s = 0.8 + rng() * 0.4;
    return {
      solid: [
        part(GEO.cyl, p.bark, { pos: [0, 0.4 * s, 0], rot: [0.05, 0, 0.08], scale: [0.06 * s, 0.8 * s, 0.05 * s] }),
        part(GEO.cyl, p.bark, { pos: [0.12 * s, 0.6 * s, 0], rot: [0, 0, -0.9], scale: [0.03 * s, 0.35 * s, 0.03 * s] }),
        part(GEO.cyl, p.bark, { pos: [-0.1 * s, 0.72 * s, 0.03], rot: [0.3, 0, 0.8], scale: [0.025 * s, 0.3 * s, 0.025 * s] })
      ]
    };
  },
  bush(p, rng) {
    const s = 0.7 + rng() * 0.5;
    return {
      solid: [
        part(GEO.rock, p.leaf, { pos: [0, 0.14 * s, 0], rot: [0, rng() * 3, 0], scale: [0.2 * s, 0.16 * s, 0.2 * s] }),
        part(GEO.rock, shade(p.leaf, 1.15), { pos: [0.12 * s, 0.12 * s, 0.06 * s], rot: [0, rng() * 3, 0], scale: [0.14 * s, 0.12 * s, 0.14 * s] }),
        part(GEO.rock, shade(p.leaf, 0.9), { pos: [-0.1 * s, 0.1 * s, -0.08 * s], rot: [0, rng() * 3, 0], scale: [0.13 * s, 0.11 * s, 0.13 * s] })
      ]
    };
  },
  boulder(p, rng) {
    const s = 0.7 + rng() * 0.6;
    return {
      solid: [
        part(GEO.rock, p.rock, { pos: [0, 0.2 * s, 0], rot: [rng(), rng() * 3, rng() * 0.5], scale: [0.34 * s, 0.26 * s, 0.28 * s] }),
        part(GEO.rockLow, shade(p.rock, 0.85), { pos: [0.2 * s, 0.1 * s, 0.1 * s], rot: [rng(), rng() * 3, 0], scale: [0.14 * s, 0.11 * s, 0.13 * s] })
      ]
    };
  },
  rocks(p, rng) {
    const solid = [];
    for (let i = 0; i < 3; i++) {
      const s = 0.06 + rng() * 0.09;
      solid.push(part(GEO.rockLow, shade(p.rock, 0.8 + rng() * 0.4), { pos: [(rng() - 0.5) * 0.3, s * 0.7, (rng() - 0.5) * 0.3], rot: [rng() * 3, rng() * 3, 0], scale: [s * 1.3, s, s] }));
    }
    return { solid };
  },
  spike(p, rng) {
    const s = 0.8 + rng() * 0.5;
    return {
      solid: [
        part(GEO.cone, shade(p.rock, 0.7), { pos: [0, 0.36 * s, 0], rot: [(rng() - 0.5) * 0.3, rng() * 3, (rng() - 0.5) * 0.3], scale: [0.14 * s, 0.72 * s, 0.14 * s] }),
        part(GEO.cone, shade(p.rock, 0.8), { pos: [0.14 * s, 0.17 * s, 0.06 * s], rot: [0.2, 0, -0.3], scale: [0.08 * s, 0.34 * s, 0.08 * s] })
      ]
    };
  },
  bones(p, rng) {
    const a = rng() * Math.PI;
    return {
      solid: [
        part(GEO.sphere, p.bone, { pos: [0.08, 0.08, 0.05], scale: [0.09, 0.08, 0.1] }),
        part(GEO.cyl, p.bone, { pos: [-0.08, 0.025, -0.04], rot: [Math.PI / 2, 0, a], scale: [0.02, 0.32, 0.02] }),
        part(GEO.cyl, p.bone, { pos: [-0.02, 0.025, 0.12], rot: [Math.PI / 2, 0, a + 1.1], scale: [0.018, 0.26, 0.018] }),
        part(GEO.sphere, p.bone, { pos: [-0.08, 0.03, -0.04], scale: [0.035, 0.03, 0.035] })
      ]
    };
  },
  sandbags(p, rng) {
    const solid = [];
    const rows = [[-0.1, 0.07, 0], [0.1, 0.07, 0], [0, 0.2, 0]];
    for (const [x, y, z] of rows) {
      solid.push(part(GEO.capsule, shade(p.sand, 0.9 + rng() * 0.2), { pos: [x, y, z], rot: [0, 0, Math.PI / 2], scale: [0.07, 0.06, 0.07] }));
    }
    return { solid };
  },
  pipe(p, rng) {
    const a = rng() < 0.5 ? 0 : Math.PI / 2;
    return {
      solid: [
        part(GEO.cyl, p.metal, { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, a], scale: [0.09, 0.9, 0.09] }),
        part(GEO.cyl, shade(p.metal, 0.7), { pos: [a ? 0.3 : 0, 0.1, a ? 0 : 0.3], rot: [Math.PI / 2, 0, a], scale: [0.12, 0.05, 0.12] }),
        part(GEO.cyl, shade(p.metal, 0.7), { pos: [a ? -0.3 : 0, 0.1, a ? 0 : -0.3], rot: [Math.PI / 2, 0, a], scale: [0.12, 0.05, 0.12] })
      ]
    };
  },
  vent(p) {
    return {
      solid: [
        part(GEO.box, p.metal, { pos: [0, 0.13, 0], scale: [0.32, 0.26, 0.32] }),
        part(GEO.cyl, shade(p.metal, 0.75), { pos: [0, 0.3, 0], scale: [0.11, 0.08, 0.11] }),
        part(GEO.box, shade(p.metal, 0.5), { pos: [0, 0.13, 0.165], scale: [0.26, 0.18, 0.01] })
      ]
    };
  },
  column(p, rng) {
    const broken = rng() < 0.4;
    const h = broken ? 0.35 + rng() * 0.4 : 1.15;
    const solid = [
      part(GEO.box, p.marble, { pos: [0, 0.04, 0], scale: [0.36, 0.08, 0.36] }),
      part(GEO.cyl, shade(p.marble, 0.95), { pos: [0, 0.08 + h / 2, 0], scale: [0.13, h, 0.13] })
    ];
    if (!broken) solid.push(part(GEO.box, p.marble, { pos: [0, 0.08 + h + 0.04, 0], scale: [0.34, 0.08, 0.34] }));
    return { solid };
  },
  urn(p) {
    return {
      solid: [
        part(GEO.sphere, p.clay, { pos: [0, 0.17, 0], scale: [0.14, 0.17, 0.14] }),
        part(GEO.cyl, shade(p.clay, 0.85), { pos: [0, 0.36, 0], scale: [0.07, 0.1, 0.07] }),
        part(GEO.cyl, shade(p.clay, 0.8), { pos: [0, 0.02, 0], scale: [0.08, 0.04, 0.08] })
      ]
    };
  },
  mushroom(p, rng) {
    const s = 0.7 + rng() * 0.7;
    const cap = rng() < 0.5 ? p.mushroom : 0xd8c8a0;
    return {
      solid: [
        part(GEO.cyl, 0xe8dcc8, { pos: [0, 0.06 * s, 0], scale: [0.025 * s, 0.12 * s, 0.025 * s] }),
        part(GEO.sphere, cap, { pos: [0, 0.12 * s, 0], scale: [0.08 * s, 0.05 * s, 0.08 * s] }),
        part(GEO.cyl, 0xe8dcc8, { pos: [0.1, 0.04 * s, 0.06], scale: [0.02 * s, 0.08 * s, 0.02 * s] }),
        part(GEO.sphere, cap, { pos: [0.1, 0.08 * s, 0.06], scale: [0.05 * s, 0.035 * s, 0.05 * s] })
      ]
    };
  },
  log(p, rng) {
    const a = rng() * Math.PI;
    return {
      solid: [
        part(GEO.cyl, p.bark, { pos: [0, 0.09, 0], rot: [Math.PI / 2, 0, a], scale: [0.09, 0.7, 0.09] }),
        part(GEO.cyl, shade(p.wood, 1.2), { pos: [Math.sin(a) * 0.35, 0.09, Math.cos(a) * 0.35], rot: [Math.PI / 2, 0, a], scale: [0.075, 0.02, 0.075] })
      ]
    };
  },
  cactus(p, rng) {
    const s = 0.8 + rng() * 0.5;
    const green = 0x3f8a3a;
    return {
      solid: [
        part(GEO.cyl, green, { pos: [0, 0.32 * s, 0], scale: [0.08 * s, 0.64 * s, 0.08 * s] }),
        part(GEO.cyl, green, { pos: [0.12 * s, 0.3 * s, 0], rot: [0, 0, Math.PI / 2], scale: [0.05 * s, 0.18 * s, 0.05 * s] }),
        part(GEO.cyl, green, { pos: [0.19 * s, 0.42 * s, 0], scale: [0.05 * s, 0.26 * s, 0.05 * s] }),
        part(GEO.cyl, green, { pos: [-0.1 * s, 0.4 * s, 0], rot: [0, 0, Math.PI / 2], scale: [0.045 * s, 0.14 * s, 0.045 * s] }),
        part(GEO.cyl, green, { pos: [-0.15 * s, 0.5 * s, 0], scale: [0.045 * s, 0.2 * s, 0.045 * s] })
      ]
    };
  },
  chimney(p) {
    return {
      solid: [
        part(GEO.box, p.brick, { pos: [0, 0.25, 0], scale: [0.2, 0.5, 0.2] }),
        part(GEO.box, shade(p.brick, 0.7), { pos: [0, 0.52, 0], scale: [0.24, 0.05, 0.24] })
      ]
    };
  },
  pebbles(p, rng) {
    const solid = [];
    for (let i = 0; i < 4; i++) {
      const s = 0.025 + rng() * 0.03;
      solid.push(part(GEO.rockLow, shade(p.rock, 0.8 + rng() * 0.5), { pos: [(rng() - 0.5) * 0.4, s * 0.6, (rng() - 0.5) * 0.4], rot: [rng() * 3, rng() * 3, 0], scale: [s * 1.4, s, s] }));
    }
    return { solid };
  },
  rubble(p, rng) {
    const solid = [];
    for (let i = 0; i < 5; i++) {
      const s = 0.04 + rng() * 0.07;
      solid.push(part(GEO.box, shade(p.rubble, 0.75 + rng() * 0.5), { pos: [(rng() - 0.5) * 0.4, s * 0.5, (rng() - 0.5) * 0.4], rot: [rng() * 0.6, rng() * 3, rng() * 0.6], scale: [s * 1.6, s, s * 1.2] }));
    }
    return { solid };
  },
  grass(p, rng) {
    // Two crossed alpha-tested planes; colour comes from the palette tuft colour.
    const s = 0.22 + rng() * 0.16;
    const a = rng() * Math.PI;
    const color = shade(p.tuft, 0.85 + rng() * 0.3);
    return {
      foliage: [
        part(GEO.plane, color, { pos: [0, s * 0.45, 0], rot: [0, a, 0], scale: [s * 1.2, s * 0.9, 1] }),
        part(GEO.plane, color, { pos: [0, s * 0.45, 0], rot: [0, a + Math.PI / 2, 0], scale: [s * 1.2, s * 0.9, 1] })
      ]
    };
  }
};

// ---------- canvas textures: grass blades and decals ----------

const textureCache = new Map();

function canvasTexture(key, size, draw) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size, mulberry32(hashString(key)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

function grassTexture() {
  return canvasTexture('grass-tuft', 64, (ctx, size, rng) => {
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const x0 = size * (0.3 + rng() * 0.4);
      const lean = (rng() - 0.5) * size * 0.9;
      const h = size * (0.45 + rng() * 0.5);
      ctx.strokeStyle = `rgba(255,255,255,${0.75 + rng() * 0.25})`;
      ctx.lineWidth = 2 + rng() * 2;
      ctx.beginPath();
      ctx.moveTo(x0, size);
      ctx.quadraticCurveTo(x0 + lean * 0.3, size - h * 0.6, x0 + lean, size - h);
      ctx.stroke();
    }
  });
}

function blob(ctx, cx, cy, r, rng, fill, lumps = 5) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < lumps; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.5 + rng() * 0.5);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.35 + rng() * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
}

const DECAL_DRAWERS = {
  cracks(ctx, size, rng) {
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineCap = 'round';
    const cx = size / 2;
    const cy = size / 2;
    const arms = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < arms; i++) {
      let x = cx;
      let y = cy;
      let a = (i / arms) * Math.PI * 2 + rng() * 0.6;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const steps = 5 + Math.floor(rng() * 4);
      for (let s = 0; s < steps; s++) {
        a += (rng() - 0.5) * 1.1;
        const len = size * (0.05 + rng() * 0.08);
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        ctx.lineTo(x, y);
        ctx.lineWidth = Math.max(0.6, 2.2 - s * 0.3);
      }
      ctx.stroke();
    }
  },
  puddle(ctx, size, rng) {
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.42);
    grad.addColorStop(0, 'rgba(120,150,180,0.72)');
    grad.addColorStop(0.7, 'rgba(100,130,160,0.5)');
    grad.addColorStop(1, 'rgba(90,120,150,0)');
    blob(ctx, size / 2, size / 2, size * 0.3, rng, grad, 6);
  },
  oil(ctx, size, rng) {
    ctx.clearRect(0, 0, size, size);
    blob(ctx, size / 2, size / 2, size * 0.26, rng, 'rgba(12,10,16,0.78)', 6);
    blob(ctx, size * 0.45, size * 0.48, size * 0.1, rng, 'rgba(70,40,90,0.25)', 3);
  },
  skid(ctx, size, rng) {
    ctx.clearRect(0, 0, size, size);
    for (const x of [size * 0.36, size * 0.64]) {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, 'rgba(20,20,20,0)');
      grad.addColorStop(0.25, 'rgba(20,20,20,0.55)');
      grad.addColorStop(0.75, 'rgba(20,20,20,0.55)');
      grad.addColorStop(1, 'rgba(20,20,20,0)');
      ctx.fillStyle = grad;
      const bend = (rng() - 0.5) * size * 0.1;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.05, 0);
      ctx.quadraticCurveTo(x + bend, size / 2, x - size * 0.05, size);
      ctx.lineTo(x + size * 0.05, size);
      ctx.quadraticCurveTo(x + bend + size * 0.1, size / 2, x + size * 0.05, 0);
      ctx.closePath();
      ctx.fill();
    }
  },
  scorch(ctx, size, rng) {
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.48);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.45, 'rgba(10,8,6,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    blob(ctx, size / 2, size / 2, size * 0.36, rng, grad, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(a) * size * 0.12, size / 2 + Math.sin(a) * size * 0.12);
      ctx.lineTo(size / 2 + Math.cos(a) * size * (0.3 + rng() * 0.18), size / 2 + Math.sin(a) * size * (0.3 + rng() * 0.18));
      ctx.stroke();
    }
  }
};

export function decalTexture(kind) {
  return canvasTexture(`decal-${kind}`, 128, DECAL_DRAWERS[kind]);
}

const decalMaterials = new Map();

export function decalMaterial(kind) {
  if (decalMaterials.has(kind)) return decalMaterials.get(kind);
  const map = decalTexture(kind);
  const material = kind === 'puddle'
    ? new THREE.MeshStandardMaterial({ map, color: 0xbcd4e8, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    : new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  decalMaterials.set(kind, material);
  return material;
}

// ---------- placement ----------

function occupiedCells(level) {
  const cells = new Set();
  const key = (x, z) => `${x},${z}`;
  const lists = ['breakableItems', 'coins', 'bigCoins', 'turrets', 'drones', 'lasers', 'keys', 'gates', 'machineGuns', 'nukes', 'grenades', 'lives', 'patrols', 'mortars', 'shields', 'switches', 'toggleWalls', 'oneWays', 'conveyors', 'crackedWalls', 'shieldProjectors', 'emps', 'floorPieces'];
  for (const name of lists) {
    for (const item of Array.isArray(level[name]) ? level[name] : []) {
      if (Number.isFinite(item.x) && Number.isFinite(item.z)) cells.add(key(item.x, item.z));
      for (const stop of Array.isArray(item.path) ? item.path : []) {
        if (Number.isFinite(stop.x) && Number.isFinite(stop.z)) cells.add(key(stop.x, stop.z));
      }
    }
  }
  for (const boss of Array.isArray(level.bosses) ? level.bosses : []) {
    for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) cells.add(key(boss.x + dx, boss.z + dz));
  }
  const spawn = level.playerSpawn;
  if (spawn) {
    const sx = Math.floor((spawn.x || 0) / (level.tileSize || 1));
    const sz = Math.floor((spawn.z || 0) / (level.tileSize || 1));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cells.add(key(sx + dx, sz + dz));
  }
  return cells;
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function buildProps(level, look, { levelId = 'level', density = 1 } = {}) {
  const rng = mulberry32(hashString(`${levelId}|${level.theme || 'classic'}`));
  const palette = paletteFor(look);
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const width = level.size.width;
  const depth = level.size.depth;
  const occupied = occupiedCells(level);
  const solid = new Merger();
  const glow = new Merger();
  const foliage = new Merger();
  const decals = new Map();
  const emitters = [];
  const counts = { wallTop: 0, floor: 0, clutter: 0, decal: 0 };
  const kinds = look.props || { wallTop: [], floor: [], clutter: [] };
  const decalKinds = look.decals || [];

  const floorOf = (x, z) => (x < 0 || z < 0 || x >= width || z >= depth ? 1 : (level.tiles[z][x].floor || 0));
  const isWall = (x, z) => floorOf(x, z) > 0;
  const isWater = (tile) => (tile.floor || 0) < 0 || isWaterTexture(tile.floorTex, look);

  function place(kind, x, y, z, yaw, scale = 1) {
    const builder = BUILDERS[kind];
    if (!builder) return;
    const built = builder(palette, rng, look);
    const world = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(scale, scale, scale));
    for (const piece of built.solid || []) solid.add(piece.geometry, world.clone().multiply(piece.matrix), piece.color);
    for (const piece of built.glow || []) glow.add(piece.geometry, world.clone().multiply(piece.matrix), piece.color);
    for (const piece of built.foliage || []) foliage.add(piece.geometry, world.clone().multiply(piece.matrix), piece.color);
    for (const emitter of built.emitters || []) {
      const p = new THREE.Vector3(emitter.x, emitter.y, emitter.z).applyMatrix4(world);
      emitters.push({ ...emitter, x: p.x, y: p.y, z: p.z, phase: rng() * 10 });
    }
  }

  function placeDecal(kind, x, y, z, size, yaw) {
    if (!decals.has(kind)) decals.set(kind, new Merger());
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw)), new THREE.Vector3(size, size, 1));
    decals.get(kind).add(GEO.plane, m, 0xffffff);
    counts.decal += 1;
  }

  const wallTopRate = 0.09 * density;
  const floorRate = 0.07 * density;
  const clutterRate = 0.09 * density;
  const decalRate = 0.05 * density;
  const caps = { wallTop: 240, floor: 180, clutter: 320, decal: 140 };

  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const tile = level.tiles[z][x];
      const floor = tile.floor || 0;
      const cx = (x + 0.5) * tileSize;
      const cz = (z + 0.5) * tileSize;
      if (floor > 0) {
        const headroom = typeof tile.ceiling === 'number' && tile.ceiling > 0 ? (tile.ceiling - floor) * heightStep : Infinity;
        if (headroom < 1.4 || !kinds.wallTop.length || counts.wallTop >= caps.wallTop) continue;
        if (rng() >= wallTopRate) continue;
        const kind = pick(kinds.wallTop, rng);
        place(kind, cx + (rng() - 0.5) * 0.4 * tileSize, floor * heightStep, cz + (rng() - 0.5) * 0.4 * tileSize, rng() * Math.PI * 2);
        counts.wallTop += 1;
        continue;
      }
      if (occupied.has(`${x},${z}`) || isWater(tile)) continue;
      const y = 0;
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => isWall(x + dx, z + dz));
      if (neighbours.length && kinds.floor.length && counts.floor < caps.floor && rng() < floorRate) {
        const [dx, dz] = pick(neighbours, rng);
        const along = (rng() - 0.5) * 0.5 * tileSize;
        place(pick(kinds.floor, rng), cx + dx * 0.32 * tileSize + dz * along, y, cz + dz * 0.32 * tileSize + dx * along, rng() * Math.PI * 2, 0.85);
        counts.floor += 1;
        continue;
      }
      if (kinds.clutter?.length && counts.clutter < caps.clutter && rng() < clutterRate) {
        place(pick(kinds.clutter, rng), cx + (rng() - 0.5) * 0.7 * tileSize, y, cz + (rng() - 0.5) * 0.7 * tileSize, rng() * Math.PI * 2);
        counts.clutter += 1;
      }
      if (decalKinds.length && counts.decal < caps.decal && rng() < decalRate) {
        placeDecal(pick(decalKinds, rng), cx, y + 0.008 + rng() * 0.004, cz, (0.55 + rng() * 0.4) * tileSize, rng() * Math.PI * 2);
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'props';
  if (!solid.empty) {
    const mesh = solid.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (!glow.empty) {
    group.add(glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }
  if (!foliage.empty) {
    const mesh = foliage.build(new THREE.MeshStandardMaterial({ map: grassTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [kind, merger] of decals) {
    const mesh = merger.build(decalMaterial(kind));
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return { group, emitters, counts };
}

export function disposeProps(props) {
  if (!props) return;
  props.group.traverse((obj) => {
    if (obj.isMesh) obj.geometry?.dispose();
  });
}

// Exposed for frontend/meshviewer/bake-sources.js, which bakes these into library models.
export { BUILDERS as PROP_BUILDERS, DEFAULT_PALETTE as PROP_PALETTE };
