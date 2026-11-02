import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TgcLoader } from '../meshviewer/tgc-loader.js';

// Code-built vehicles and props for Tank Terrain. Every tank has a hull that
// tilts with the ground, a turret that yaws, a gun that pitches, and two
// tracks whose treads are instanced boxes that run round the wheels. Nose is
// along local +Z, up is +Y, right is +X. Lengths in metres.

const MODEL_ROOT = '/games-3d/meshes/files/Meshes/';
const tgc = new TgcLoader({ fileRoot: MODEL_ROOT, anisotropy: 4 });
const modelCache = new Map();

export const MAT = {
  dark: new THREE.MeshStandardMaterial({ color: 0x2a2d28, roughness: 0.75, metalness: 0.35 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8f93, roughness: 0.4, metalness: 0.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95, metalness: 0.05 }),
  tread: new THREE.MeshStandardMaterial({ color: 0x3a3c3a, roughness: 0.85, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.15, metalness: 0.6, emissive: 0x0a2030, emissiveIntensity: 0.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0c0, emissiveIntensity: 2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1.4 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x5b5852, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb83030, roughness: 0.6 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xe0b030, roughness: 0.6 }),
  charred: new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1, metalness: 0.1 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  laserLens: new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1.8, roughness: 0.2 })
};

function sh(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

// Collect geometries with transforms, then merge them into one mesh per material.
class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
    const g = geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, o) { return this.add(new THREE.BoxGeometry(w, h, d), mat, o); }
  cyl(rt, rb, h, mat, o, seg = 14) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, o); }
  build(group) {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = sh(new THREE.Mesh(merged, mat));
      group.add(mesh);
    }
    return group;
  }
}

function bodyMaterials(color, accent) {
  return {
    body: new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8, metalness: 0.3 }),
    dark: MAT.dark.clone(),
    metal: MAT.metal.clone()
  };
}

// Track: a stadium-shaped loop of instanced treads around road wheels.
function buildTrack(length, wheelR, width, mats, { wheels = 6 } = {}) {
  const g = new THREE.Group();
  const b = new Builder();
  const span = length - wheelR * 2;
  // Road wheels, sprocket and idler.
  for (let i = 0; i < wheels; i++) {
    const z = -span / 2 + (span / (wheels - 1)) * i;
    b.cyl(wheelR * 0.82, wheelR * 0.82, width * 0.7, mats.metal, { z, y: wheelR, rz: Math.PI / 2 }, 16);
    b.cyl(wheelR * 0.86, wheelR * 0.86, width * 0.4, MAT.rubber, { z, y: wheelR, rz: Math.PI / 2 }, 16);
    b.cyl(wheelR * 0.3, wheelR * 0.3, width * 0.76, mats.dark, { z, y: wheelR, rz: Math.PI / 2 }, 8);
  }
  for (let i = 0; i < 3; i++) {
    const z = -span / 2 + (span / 3) * (i + 0.5);
    b.cyl(wheelR * 0.3, wheelR * 0.3, width * 0.5, mats.metal, { z, y: wheelR * 1.95, rz: Math.PI / 2 }, 8);
  }
  b.cyl(wheelR * 0.9, wheelR * 0.9, width * 0.5, mats.dark, { z: span / 2 + wheelR * 0.1, y: wheelR * 1.3, rz: Math.PI / 2 }, 10);
  b.cyl(wheelR * 0.85, wheelR * 0.85, width * 0.5, mats.dark, { z: -span / 2 - wheelR * 0.1, y: wheelR * 1.3, rz: Math.PI / 2 }, 10);
  b.build(g);

  // Treads follow a stadium path: bottom straight, round the front, top straight, round the back.
  const belt = { r: wheelR * 1.3, zf: span / 2 + wheelR * 0.1, zb: -span / 2 - wheelR * 0.1, cy: wheelR * 1.3 };
  const straight = belt.zf - belt.zb;
  const perimeter = 2 * straight + 2 * Math.PI * belt.r;
  const pitch = 0.26;
  const count = Math.max(8, Math.floor(perimeter / pitch));
  const treads = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.09, pitch * 0.9), MAT.tread, count);
  treads.castShadow = true;
  treads.receiveShadow = true;
  g.add(treads);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  function place(offset) {
    for (let i = 0; i < count; i++) {
      let d = ((i / count) * perimeter + offset) % perimeter;
      if (d < 0) d += perimeter;
      let x = 0, y, z, rot;
      if (d < straight) { // bottom, running backwards
        z = belt.zf - d; y = belt.cy - belt.r; rot = 0;
      } else if (d < straight + Math.PI * belt.r) { // round the back
        const a = (d - straight) / belt.r;
        z = belt.zb - Math.sin(a) * belt.r; y = belt.cy - Math.cos(a) * belt.r; rot = a;
      } else if (d < 2 * straight + Math.PI * belt.r) { // top, running forwards
        z = belt.zb + (d - straight - Math.PI * belt.r); y = belt.cy + belt.r; rot = Math.PI;
      } else { // round the front
        const a = (d - 2 * straight - Math.PI * belt.r) / belt.r;
        z = belt.zf + Math.sin(a) * belt.r; y = belt.cy + Math.cos(a) * belt.r; rot = Math.PI + a;
      }
      _p.set(x, y, z);
      _e.set(rot, 0, 0);
      _q.setFromEuler(_e);
      treads.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    treads.instanceMatrix.needsUpdate = true;
  }
  place(0);
  return { group: g, place, offset: 0, height: belt.cy + belt.r };
}

// A chamfered turret from a top-view outline. Points are (x, z) with +z forward.
function turretShell(points, height, mat, bevel = 0.12) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const mesh = sh(new THREE.Mesh(geo, mat));
  return mesh;
}

export const TANK_VARIANTS = {
  player: { color: 0x6b7a45, accent: 0x3a4030, scale: 1, barrel: 4.3, wheels: 6, turret: 'cannon' },
  scout: { color: 0x7a8a62, accent: 0x3f4a35, scale: 0.78, barrel: 2.4, wheels: 5, turret: 'mg' },
  heavy: { color: 0x55524a, accent: 0x2d2b26, scale: 1.18, barrel: 5.2, wheels: 7, turret: 'cannon' },
  rocket: { color: 0x6a5a4a, accent: 0x3a2e22, scale: 0.95, barrel: 0, wheels: 6, turret: 'rockets' },
  boss: { color: 0x4a3a3a, accent: 0x2a1e1e, scale: 1.65, barrel: 5.6, wheels: 8, turret: 'cannon', twin: true }
};

export function buildTank(variant = 'player', overrides = {}) {
  const v = { ...TANK_VARIANTS[variant], ...overrides };
  const mats = bodyMaterials(v.color, v.accent);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Builder();
  const W = 2.3;   // hull width between the tracks
  const L = 6.6;   // hull length
  // Hull.
  b.box(W, 0.9, L, mats.body, { y: 0.95 });
  b.box(W + 0.6, 0.55, L - 1.4, mats.body, { y: 1.62, z: -0.4 });
  b.box(W, 0.7, 1.7, mats.body, { y: 1.3, z: 2.95, rx: -0.62 });
  b.box(W + 0.6, 0.5, 0.5, mats.accent, { y: 1.45, z: -3.3 });
  for (const s of [-1, 1]) {
    b.box(0.8, 0.07, L + 0.3, mats.accent, { x: s * 1.5, y: 1.42 });                    // fenders
    b.box(0.08, 0.62, L - 0.9, mats.body, { x: s * 1.85, y: 1.1, z: -0.1 });            // side skirts
    b.box(0.5, 0.14, 0.08, MAT.lamp, { x: s * 0.75, y: 1.5, z: 3.55 });                   // headlights
    b.box(0.3, 0.1, 0.06, MAT.tail, { x: s * 1.0, y: 1.4, z: -3.57 });                   // tail lights
    b.cyl(0.09, 0.09, 0.7, mats.dark, { x: s * 0.9, y: 1.9, z: -3.3, rx: 0.5 }, 8);      // exhausts
    b.box(0.45, 0.3, 1.6, mats.accent, { x: s * 1.2, y: 1.98, z: -1.4 });                // stowage
  }
  b.box(0.9, 0.25, 0.9, mats.accent, { y: 2.0, z: 2.0 });                                // driver hatch
  b.box(1.2, 0.08, 0.6, mats.dark, { y: 1.93, z: -3.0 });                                // engine grille
  b.build(body);

  // Tracks.
  const trackL = buildTrack(v.scale >= 1 ? 7.0 : 6.6, 0.44, 0.62, mats, { wheels: v.wheels });
  const trackR = buildTrack(v.scale >= 1 ? 7.0 : 6.6, 0.44, 0.62, mats, { wheels: v.wheels });
  trackL.group.position.x = -1.5;
  trackR.group.position.x = 1.5;
  body.add(trackL.group, trackR.group);

  // Turret.
  const turret = new THREE.Group();
  turret.position.set(0, 1.9, -0.2);
  body.add(turret);
  const gun = new THREE.Group();
  const parts = {};
  if (v.turret === 'rockets') {
    const tb = new Builder();
    tb.box(2.0, 0.5, 2.2, mats.body, { y: 0.25 });
    tb.build(turret);
    gun.position.set(0, 0.7, 0.2);
    const rack = new Builder();
    rack.box(2.2, 1.1, 1.8, mats.accent, { y: 0.1 });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      rack.cyl(0.2, 0.2, 2.0, mats.dark, { x: -0.7 + i * 0.7, y: -0.3 + j * 0.55, z: 0.1, rx: Math.PI / 2 }, 10);
      rack.cyl(0.12, 0.12, 0.3, MAT.red, { x: -0.7 + i * 0.7, y: -0.3 + j * 0.55, z: 1.0, rx: Math.PI / 2 }, 8);
    }
    rack.build(gun);
    parts.muzzle = new THREE.Vector3(0, 0, 1.2);
  } else {
    const shell = turretShell([[-1.1, -1.3], [1.1, -1.3], [1.35, -0.2], [0.95, 1.25], [-0.95, 1.25], [-1.35, -0.2]], 0.72, mats.body);
    turret.add(shell);
    const tb = new Builder();
    tb.box(1.0, 0.62, 0.7, mats.accent, { y: 0.38, z: 1.35 });                            // mantlet
    tb.cyl(0.4, 0.4, 0.26, mats.accent, { x: -0.55, y: 0.95, z: -0.4 }, 12);               // cupola
    tb.cyl(0.42, 0.42, 0.06, mats.dark, { x: -0.55, y: 1.1, z: -0.4 }, 12);
    tb.box(0.5, 0.1, 0.5, mats.accent, { x: 0.6, y: 0.9, z: -0.3 });                      // loader hatch
    for (let i = 0; i < 4; i++) tb.box(0.12, 0.12, 0.1, MAT.glass, { x: -0.55 + Math.cos(i * 1.57) * 0.3, y: 1.0, z: -0.4 + Math.sin(i * 1.57) * 0.3 });
    tb.box(1.9, 0.42, 0.55, mats.accent, { y: 0.4, z: -1.5 });                            // bustle rack
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) tb.cyl(0.06, 0.06, 0.3, mats.dark, { x: s * (1.0 + i * 0.1), y: 0.5, z: 0.5 - i * 0.2, rx: -0.9, rz: s * 0.4 }, 6);
    tb.cyl(0.02, 0.02, 1.6, mats.dark, { x: 0.9, y: 1.4, z: -1.1 }, 5);                   // antenna
    tb.build(turret);
    gun.position.set(0, 0.42, 1.0);
    const gb = new Builder();
    const len = v.barrel;
    for (const bx of v.twin ? [-0.42, 0.42] : [0]) {
      gb.cyl(0.11, 0.12, len, mats.metal, { x: bx, z: len / 2, rx: Math.PI / 2 }, 12);
      gb.cyl(0.15, 0.15, len * 0.4, mats.dark, { x: bx, z: len * 0.42, rx: Math.PI / 2 }, 12);      // thermal sleeve
      gb.cyl(0.17, 0.17, 0.5, mats.dark, { x: bx, z: len - 0.15, rx: Math.PI / 2 }, 12);           // muzzle brake
    }
    gb.cyl(0.04, 0.04, 1.1, mats.dark, { x: 0.5, y: 0.1, z: 0.9, rx: Math.PI / 2 }, 6);   // coax mg
    gb.build(gun);
    parts.muzzle = new THREE.Vector3(0, 0, len + 0.2);
    if (v.twin) {
      // Boss: bolted-on frontal plates, a second cupola and a heavy engine deck. The rear is bare.
      const ab = new Builder();
      ab.box(W + 1.0, 1.1, 0.35, mats.accent, { y: 1.25, z: 3.4, rx: -0.5 });
      for (const sx of [-1, 1]) ab.box(0.25, 0.9, L - 1.0, mats.accent, { x: sx * 1.95, y: 1.15, z: 0.3 });
      ab.box(1.6, 0.35, 1.8, mats.accent, { y: 2.05, z: -2.2 });
      for (let i = 0; i < 6; i++) ab.box(0.12, 0.08, 0.12, mats.dark, { x: -1.0 + i * 0.4, y: 1.8, z: 3.35 });
      ab.build(body);
      const tb2 = new Builder();
      tb2.cyl(0.42, 0.42, 0.3, mats.accent, { x: 0.6, y: 0.95, z: -0.6 }, 12);
      tb2.box(0.6, 0.3, 0.3, MAT.red, { x: 0, y: 1.0, z: -1.4 });
      tb2.build(turret);
    }
    parts.mgMuzzle = new THREE.Vector3(0.5, 0.1, 1.5);
    // Missile pod on the right of the turret and a laser lens under the gun.
    const pod = new THREE.Group();
    const pb = new Builder();
    pb.box(0.55, 0.55, 1.5, mats.accent, { y: 0 });
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) pb.cyl(0.1, 0.1, 1.6, mats.dark, { x: -0.14 + i * 0.28, y: -0.14 + j * 0.28, rx: Math.PI / 2 }, 8);
    pb.build(pod);
    pod.position.set(1.55, 0.75, -0.2);
    turret.add(pod);
    parts.pod = pod;
    parts.podMuzzle = new THREE.Vector3(1.55, 0.75, 0.7);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), MAT.laserLens.clone());
    lens.position.set(-0.5, 0.05, 0.9);
    gun.add(lens);
    parts.lens = lens;
    parts.laserMuzzle = new THREE.Vector3(-0.5, 0.05, 1.1);
    parts.mortarMuzzle = new THREE.Vector3(0, 0.6, -0.4);
  }
  turret.add(gun);

  root.scale.setScalar(v.scale);
  const spotGlow = new THREE.PointLight(0xffe0b0, 0, 14, 2);
  spotGlow.position.set(0, 1.5, 4.2);
  body.add(spotGlow);

  const materials = [mats.body, mats.accent, mats.dark, mats.metal];
  return {
    root, body, turret, gun, tracks: [trackL, trackR], parts, materials, scale: v.scale,
    exhaust: [new THREE.Vector3(-0.9, 2.2, -3.5), new THREE.Vector3(0.9, 2.2, -3.5)],
    length: L * v.scale, width: 3.7 * v.scale, height: 3.1 * v.scale,
    flash: 0
  };
}

// Advance the treads by the distance driven (positive forward). `turn` adds
// opposite motion to the two tracks for a pivot turn.
export function driveTracks(tank, dist, turn = 0) {
  const [l, r] = tank.tracks;
  l.offset += (dist - turn) / tank.scale;
  r.offset += (dist + turn) / tank.scale;
  l.place(l.offset);
  r.place(r.offset);
}

// Hit flash on every body material.
export function flashTank(tank, strength = 1) {
  tank.flash = Math.max(tank.flash, strength);
}
export function updateTankFlash(tank, dt) {
  if (tank.flash <= 0) return;
  tank.flash = Math.max(0, tank.flash - dt * 4);
  for (const m of tank.materials) {
    m.emissive.setRGB(tank.flash, tank.flash * 0.5, tank.flash * 0.2);
    m.emissiveIntensity = tank.flash;
  }
}

export function charTank(tank) {
  tank.root.traverse((n) => { if (n.isMesh) n.material = MAT.charred; });
  tank.root.scale.y *= 0.8;
  tank.root.rotation.z += (Math.random() - 0.5) * 0.3;
}

// Static turrets: a pad, a pedestal, a yawing housing and a pitching weapon.
export function buildTurret(type, color) {
  const g = new THREE.Group();
  const mats = bodyMaterials(color, 0x33352f);
  const b = new Builder();
  b.cyl(2.3, 2.5, 0.6, MAT.concrete, { y: 0.3 }, 8);
  b.cyl(0.9, 1.1, 1.3, mats.dark, { y: 1.25 }, 12);
  b.build(g);
  const yaw = new THREE.Group();
  yaw.position.y = 1.9;
  g.add(yaw);
  const hb = new Builder();
  hb.box(1.7, 0.9, 1.9, mats.body, { y: 0.45 });
  hb.box(1.9, 0.12, 2.1, mats.accent, { y: 0.95 });
  hb.box(0.4, 0.3, 0.3, MAT.glass, { y: 0.6, z: 1.0 });
  hb.build(yaw);
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.6, 0.9);
  yaw.add(pitch);
  const pb = new Builder();
  const muzzles = [];
  let lens = null;
  if (type === 'gun') {
    for (const x of [-0.28, 0.28]) {
      pb.cyl(0.07, 0.08, 2.2, mats.metal, { x, z: 1.1, rx: Math.PI / 2 }, 8);
      muzzles.push(new THREE.Vector3(x, 0, 2.2));
    }
    pb.box(0.9, 0.5, 0.8, mats.accent, { z: 0.2 });
  } else if (type === 'cannon') {
    pb.cyl(0.13, 0.15, 3.4, mats.metal, { z: 1.7, rx: Math.PI / 2 }, 12);
    pb.cyl(0.2, 0.2, 0.5, mats.dark, { z: 3.3, rx: Math.PI / 2 }, 12);
    pb.box(0.8, 0.7, 0.8, mats.accent, { z: 0.2 });
    muzzles.push(new THREE.Vector3(0, 0, 3.6));
  } else if (type === 'missile') {
    pb.box(1.4, 0.8, 1.8, mats.accent, { z: 0.3 });
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      pb.cyl(0.17, 0.17, 2.0, mats.dark, { x: -0.35 + i * 0.7, y: -0.2 + j * 0.4, z: 0.4, rx: Math.PI / 2 }, 10);
      pb.cyl(0.1, 0.1, 0.2, MAT.red, { x: -0.35 + i * 0.7, y: -0.2 + j * 0.4, z: 1.35, rx: Math.PI / 2 }, 8);
    }
    muzzles.push(new THREE.Vector3(0, 0.1, 1.4));
  } else { // laser
    pb.cyl(0.25, 0.3, 1.6, mats.metal, { z: 0.8, rx: Math.PI / 2 }, 12);
    for (let i = 0; i < 3; i++) pb.add(new THREE.TorusGeometry(0.38, 0.06, 6, 16), mats.dark, { z: 0.3 + i * 0.45 });
    pb.box(0.9, 0.6, 0.8, mats.accent, { z: -0.1 });
    lens = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), MAT.laserLens.clone());
    lens.position.set(0, 0, 1.65);
    pitch.add(lens);
    muzzles.push(new THREE.Vector3(0, 0, 1.7));
  }
  pb.build(pitch);
  return { root: g, yaw, pitch, muzzles, lens, materials: [mats.body, mats.accent, mats.dark, mats.metal], flash: 0, height: 2.6 };
}

// Pickup crates: a box with a glowing band and a ground ring.
const pickupGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const bandGeo = new THREE.BoxGeometry(1.56, 0.4, 1.56);
const ringGeo = new THREE.RingGeometry(1.8, 2.3, 32);
const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4f44, roughness: 0.7, metalness: 0.4 });
export function buildPickup(color) {
  const g = new THREE.Group();
  const crate = sh(new THREE.Mesh(pickupGeo, crateMat));
  crate.position.y = 1.2;
  const band = new THREE.Mesh(bandGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 }));
  band.position.y = 1.2;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const spin = new THREE.Group();
  spin.add(crate, band);
  g.add(spin, ring);
  return { root: g, spin, ring, band };
}

// The flag: a pole, a waving cloth and a beam of light so it shows from afar.
export function buildFlag() {
  const g = new THREE.Group();
  const pole = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 10), MAT.metal));
  pole.position.y = 4.5;
  g.add(pole);
  const base = sh(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.5, 12), MAT.concrete));
  base.position.y = 0.25;
  g.add(base);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), MAT.yellow);
  knob.position.y = 9.1;
  g.add(knob);
  const clothGeo = new THREE.PlaneGeometry(3.0, 1.8, 16, 6);
  clothGeo.translate(1.5, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffd020';
  ctx.fillRect(0, 0, 128, 80);
  ctx.fillStyle = '#c02020';
  ctx.fillRect(0, 30, 128, 20);
  ctx.fillStyle = '#202020';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 8 : 18;
    ctx.lineTo(40 + Math.cos(a) * r, 40 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.y = 8.0;
  cloth.castShadow = true;
  g.add(cloth);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 80, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 40;
  g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.4, 40), new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  g.add(ring);
  const basePos = clothGeo.attributes.position.array.slice();
  function update(t) {
    const pos = clothGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = basePos[i * 3];
      const y = basePos[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 2.2 - t * 6) * 0.12 * x + Math.sin(y * 3 + t * 4) * 0.04 * x);
    }
    pos.needsUpdate = true;
    clothGeo.computeVertexNormals();
    ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    beam.material.opacity = 0.12 + Math.sin(t * 2) * 0.04;
  }
  return { root: g, update, cloth };
}

export function buildBarrel() {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(0.55, 0.55, 1.3, MAT.red, { y: 0.65 }, 14);
  b.cyl(0.57, 0.57, 0.12, MAT.yellow, { y: 0.4 }, 14);
  b.cyl(0.57, 0.57, 0.12, MAT.yellow, { y: 0.95 }, 14);
  b.cyl(0.5, 0.5, 0.05, MAT.dark, { y: 1.31 }, 14);
  b.build(g);
  return g;
}

// A supply truck: cab, flatbed with a canvas load, six wheels. Nose along +Z.
export function buildTruck(color = 0x6e6a52, canvas = 0x8a7a4a) {
  const g = new THREE.Group();
  const mats = bodyMaterials(color, 0x3a3830);
  const b = new Builder();
  b.box(2.3, 0.5, 6.2, mats.dark, { y: 0.9 });                                  // chassis
  b.box(2.3, 1.5, 1.9, mats.body, { y: 1.9, z: 2.0 });                          // cab
  b.box(2.1, 0.6, 0.9, mats.body, { y: 1.1, z: 3.2 });                          // bonnet
  b.box(2.2, 0.9, 0.08, MAT.glass, { y: 2.1, z: 2.95 });                         // windscreen
  b.box(2.4, 0.3, 3.9, mats.body, { y: 1.3, z: -1.1 });                         // bed
  b.box(2.3, 1.4, 3.7, new THREE.MeshStandardMaterial({ color: canvas, roughness: 1 }), { y: 2.15, z: -1.1 }); // canvas load
  for (const s of [-1, 1]) {
    b.box(0.4, 0.12, 0.08, MAT.lamp, { x: s * 0.75, y: 1.3, z: 3.66 });
    for (const z of [2.3, -0.4, -2.4]) {
      b.cyl(0.55, 0.55, 0.4, MAT.rubber, { x: s * 1.2, y: 0.55, z, rz: Math.PI / 2 }, 12);
      b.cyl(0.3, 0.3, 0.42, mats.metal, { x: s * 1.2, y: 0.55, z, rz: Math.PI / 2 }, 8);
    }
  }
  b.build(g);
  const materials = [mats.body, mats.accent, mats.dark, mats.metal];
  return { root: g, materials, flash: 0, height: 2.9 };
}

// A radar dish on a pedestal; `dish` yaws so it can keep turning.
export function buildRadar() {
  const g = new THREE.Group();
  const mats = bodyMaterials(0x7a7f78, 0x3a3c38);
  const b = new Builder();
  b.cyl(3.4, 3.8, 0.5, MAT.concrete, { y: 0.25 }, 10);
  b.box(2.6, 1.6, 2.6, mats.accent, { y: 1.3 });                                // equipment hut
  b.box(0.6, 0.6, 0.1, MAT.glass, { y: 1.4, z: 1.31 });
  b.cyl(0.35, 0.45, 3.2, mats.metal, { y: 3.6 }, 10);                           // mast
  b.build(g);
  const dish = new THREE.Group();
  dish.position.y = 5.2;
  const d = new Builder();
  d.add(new THREE.SphereGeometry(2.4, 18, 8, 0, Math.PI * 2, 0, 0.6), mats.body, { rx: -Math.PI / 2 + 0.5, y: 0.2 });
  d.cyl(0.08, 0.08, 2.4, mats.metal, { z: 1.0, rx: -Math.PI / 2 + 0.5 }, 6);
  d.box(0.3, 0.3, 0.3, MAT.red, { z: 2.0, y: 1.1 });
  d.build(dish);
  g.add(dish);
  const beacon = new THREE.PointLight(0xff3030, 0, 30, 2);
  beacon.position.y = 7.2;
  g.add(beacon);
  return { root: g, dish, beacon, materials: [mats.body, mats.accent, mats.dark, mats.metal], flash: 0, height: 7 };
}

// A fuel depot: a few tanks on a pad, pipes, a pump house.
export function buildDepot(tanks = 4) {
  const g = new THREE.Group();
  const mats = bodyMaterials(0x9a9484, 0x4a4640);
  const b = new Builder();
  b.cyl(5.5, 5.9, 0.4, MAT.concrete, { y: 0.2 }, 12);
  for (let i = 0; i < tanks; i++) {
    const a = (i / tanks) * Math.PI * 2;
    const x = Math.cos(a) * 3.0, z = Math.sin(a) * 3.0;
    b.cyl(1.3, 1.3, 2.6, i % 2 ? MAT.red : mats.body, { x, y: 1.7, z }, 14);
    b.cyl(1.35, 1.35, 0.15, mats.dark, { x, y: 1.2, z }, 14);
    b.cyl(1.35, 1.35, 0.15, mats.dark, { x, y: 2.4, z }, 14);
    b.cyl(0.12, 0.12, 3.0, mats.metal, { x: x * 0.5, y: 0.7, z: z * 0.5, rz: Math.PI / 2, ry: -a }, 6);
  }
  b.box(2.2, 1.8, 1.6, mats.accent, { y: 1.3, x: 0, z: 0 });
  b.cyl(0.1, 0.1, 1.5, mats.metal, { y: 2.8 }, 6);
  b.build(g);
  return { root: g, materials: [mats.body, mats.accent, mats.dark, mats.metal], flash: 0, height: 3 };
}

// A low-poly deer: body, neck, head, four legs that swing. Nose along +Z.
export function buildDeer(color = 0x8a6a42) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
  const b = new Builder();
  b.box(0.55, 0.65, 1.3, body, { y: 1.05 });
  b.box(0.3, 0.7, 0.3, body, { y: 1.55, z: 0.65, rx: -0.5 });
  b.box(0.26, 0.28, 0.5, body, { y: 1.9, z: 0.95 });
  b.box(0.08, 0.14, 0.08, dark, { x: 0.12, y: 2.08, z: 0.95 });
  b.box(0.08, 0.14, 0.08, dark, { x: -0.12, y: 2.08, z: 0.95 });
  b.box(0.06, 0.3, 0.06, dark, { x: 0.16, y: 2.2, z: 0.85, rz: -0.4 });
  b.box(0.06, 0.3, 0.06, dark, { x: -0.16, y: 2.2, z: 0.85, rz: 0.4 });
  b.box(0.08, 0.25, 0.08, body, { y: 1.2, z: -0.7, rx: 0.7 });
  b.build(g);
  const legs = [];
  for (const [x, z] of [[-0.18, 0.45], [0.18, 0.45], [-0.18, -0.45], [0.18, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.12), body);
    leg.position.set(x, 0.75, z);
    leg.geometry.translate(0, -0.35, 0);
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  return { root: g, legs, height: 2.1 };
}

// A small pennant for the fort towers; `update(t)` waves it.
export function buildPennant(color = 0xc02020) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), MAT.metal);
  pole.position.y = 1.6;
  g.add(pole);
  const geo = new THREE.PlaneGeometry(1.4, 0.7, 8, 3);
  geo.translate(0.7, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.y = 2.85;
  g.add(cloth);
  const base = geo.attributes.position.array.slice();
  const phase = Math.random() * 6;
  function update(t) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 3 - t * 7 + phase) * 0.1 * x);
    }
    pos.needsUpdate = true;
  }
  return { root: g, update };
}

// The energy shield: a translucent sphere round the hull with a soft rim.
export function buildShield(radius = 4.6) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x60d0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  mesh.scale.set(1.15, 0.75, 1.3);
  mesh.position.y = 1.6;
  mesh.visible = false;
  mesh.renderOrder = 19;
  return mesh;
}

// Bird geometry: a flat V of two triangles, instanced per flock.
export function birdGeometry() {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.15, -0.5, 0.05, -0.25, 0, 0, -0.15,
    0, 0, 0.15, 0, 0, -0.15, 0.5, 0.05, -0.25
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

// MeshCreator library models used for the scenery.
export function loadModel(folder, { file = null } = {}) {
  const key = `${folder}/${file ?? ''}`;
  if (modelCache.has(key)) return modelCache.get(key);
  const name = folder.split('/').pop();
  const p = (async () => {
    const res = await fetch(`${MODEL_ROOT}${folder}/${file ?? `${name}-TgcScene.xml`}`);
    if (!res.ok) throw new Error(`model ${name}: ${res.status}`);
    const { object, stats } = await tgc.load(await res.text(), { xmlDir: folder, anisotropy: 4 });
    if (stats.missing.length) console.warn(`model ${name}: missing textures`, stats.missing);
    object.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = true;
      const mats = [].concat(n.material);
      n.material = mats.map((m) => new THREE.MeshStandardMaterial({
        map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, roughness: 0.85, metalness: 0.05,
        transparent: !!m.transparent, alphaTest: m.alphaTest || 0, side: m.side ?? THREE.FrontSide
      }));
      if (n.material.length === 1) n.material = n.material[0];
    });
    const box = new THREE.Box3().setFromObject(object);
    return { object, box, size: box.getSize(new THREE.Vector3()) };
  })();
  modelCache.set(key, p);
  p.catch(() => modelCache.delete(key));
  return p;
}

// Scenery props: library vegetation and rocks scaled to a target height.
// Heights are metres next to a 3.1 m tall, 7 m long tank: a grown tree is
// 15-25 m once the level's per-prop scale (0.85-1.35) is applied.
export const PROP_HEIGHT = { tree: 18, rock: 2.8, bush: 2.0 };
export function propHeight(kind) { return PROP_HEIGHT[kind] ?? PROP_HEIGHT.bush; }

export async function loadProp(kind, model) {
  const folder = `Vegetation/${model}`;
  try {
    const m = await loadModel(folder);
    const target = propHeight(kind);
    const scale = target / Math.max(0.01, m.size.y);
    const lift = -m.box.min.y * scale;
    const radius = Math.max(m.size.x, m.size.z) * scale * 0.5;
    return { make() { const o = m.object.clone(); o.scale.setScalar(scale); o.position.y = lift; return o; }, radius, height: target, lift };
  } catch (err) {
    console.warn('prop', model, err.message);
    return null;
  }
}

export function fallbackProp(kind) {
  const target = propHeight(kind);
  return {
    make() {
      const g = new THREE.Group();
      if (kind === 'tree') {
        const trunk = target * 0.4, crown = target * 0.7;
        g.add(sh(new THREE.Mesh(new THREE.CylinderGeometry(target * 0.028, target * 0.045, trunk, 8), new THREE.MeshStandardMaterial({ color: 0x5a3f28 }))).translateY(trunk / 2));
        g.add(sh(new THREE.Mesh(new THREE.ConeGeometry(target * 0.29, crown, 10), new THREE.MeshStandardMaterial({ color: 0x2f5a2a }))).translateY(target - crown / 2));
      } else {
        g.add(sh(new THREE.Mesh(new THREE.DodecahedronGeometry(target * 0.6, 0), new THREE.MeshStandardMaterial({ color: kind === 'rock' ? 0x77736c : 0x3f6a2e, roughness: 1 }))).translateY(target * 0.45));
      }
      return g;
    },
    radius: kind === 'tree' ? target * 0.09 : target * 0.6, height: target, lift: 0
  };
}


// A rocket trooper on foot: helmet, torso, legs and a launcher tube on the shoulder.
// `legs` swing while walking; `crouch` lowers the figure behind cover.
export function buildSoldier(color = 0x4a5238) {
  const g = new THREE.Group();
  const mats = bodyMaterials(color, 0x2e3324);
  const skin = new THREE.MeshStandardMaterial({ color: 0xb08a6a, roughness: 0.8 });
  const torso = new THREE.Group();
  g.add(torso);
  const b = new Builder();
  b.box(0.62, 0.72, 0.36, mats.body, { y: 1.1 });                      // chest
  b.box(0.7, 0.2, 0.42, mats.accent, { y: 0.78 });                     // belt
  b.cyl(0.14, 0.14, 0.26, skin, { y: 1.6 }, 8);                        // neck/head
  b.add(new THREE.SphereGeometry(0.2, 10, 8), skin, { y: 1.7 });
  b.cyl(0.26, 0.23, 0.18, mats.accent, { y: 1.84 }, 10);               // helmet
  b.cyl(0.07, 0.07, 0.6, skin, { x: -0.42, y: 1.12, z: 0.0, rz: 0.2 }, 6);     // arms
  b.cyl(0.07, 0.07, 0.6, skin, { x: 0.42, y: 1.2, z: 0.25, rx: -1.1 }, 6);
  b.cyl(0.11, 0.11, 1.5, mats.dark, { x: 0.3, y: 1.55, z: 0.1, rx: Math.PI / 2 }, 10);  // launcher tube
  b.cyl(0.14, 0.11, 0.25, MAT.red, { x: 0.3, y: 1.55, z: 0.95, rx: Math.PI / 2 }, 10);
  b.build(torso);
  const legs = [];
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.75, 0);
    const lb = new Builder();
    lb.cyl(0.11, 0.1, 0.75, mats.body, { y: -0.37 }, 8);
    lb.box(0.22, 0.12, 0.34, mats.dark, { y: -0.78, z: 0.06 });
    lb.build(leg);
    g.add(leg);
    legs.push(leg);
  }
  return { root: g, torso, legs, materials: [mats.body, mats.accent, mats.dark, skin], flash: 0, height: 1.95, muzzle: new THREE.Vector3(0.3, 1.55, 1.1) };
}

// Attack helicopter: fuselage, tail boom, stub wings with rocket pods, a chin gun
// (`gun` yaws and pitches), main and tail rotors that spin.
export function buildHelicopter(color = 0x3e4a3a) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mats = bodyMaterials(color, 0x252c22);
  const b = new Builder();
  b.box(1.6, 1.5, 5.2, mats.body, { y: 0 });                                     // fuselage
  b.box(1.3, 1.2, 1.8, mats.body, { y: 0.3, z: 3.0, rx: 0.1 });                  // nose
  b.add(new THREE.SphereGeometry(0.7, 12, 8), MAT.glass, { y: 0.55, z: 1.9 });    // canopy
  b.box(0.5, 0.45, 6.5, mats.body, { y: 0.25, z: -5.4 });                       // tail boom
  b.box(0.12, 1.6, 1.0, mats.accent, { y: 1.0, z: -8.4 });                      // fin
  b.box(2.6, 0.08, 0.7, mats.accent, { y: 0.9, z: -7.4 });                      // stabiliser
  b.box(1.0, 0.5, 1.4, mats.accent, { y: 0.95, z: -0.4 });                       // rotor mast housing
  b.box(0.8, 0.8, 2.4, mats.dark, { y: 0.1, z: -1.4 });                           // engine
  for (const sx of [-1, 1]) {
    b.box(1.9, 0.14, 1.0, mats.accent, { x: sx * 1.6, y: -0.2, z: 0.2 });        // stub wing
    b.cyl(0.32, 0.32, 1.6, mats.dark, { x: sx * 2.3, y: -0.55, z: 0.2, rx: Math.PI / 2 }, 10);  // rocket pod
    for (let i = 0; i < 4; i++) b.cyl(0.07, 0.07, 0.2, MAT.red, { x: sx * 2.3 + Math.cos(i * 1.57) * 0.17, y: -0.55 + Math.sin(i * 1.57) * 0.17, z: 1.05, rx: Math.PI / 2 }, 6);
    b.cyl(0.06, 0.06, 4.4, mats.metal, { x: sx * 0.9, y: -1.3, z: -0.3, rx: Math.PI / 2 }, 6);   // skids
    b.cyl(0.05, 0.05, 0.6, mats.metal, { x: sx * 0.9, y: -1.0, z: 1.2 }, 6);
    b.cyl(0.05, 0.05, 0.6, mats.metal, { x: sx * 0.9, y: -1.0, z: -1.6 }, 6);
  }
  b.build(body);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.35, -0.4);
  const rb = new Builder();
  for (let i = 0; i < 4; i++) rb.box(0.32, 0.06, 6.6, mats.dark, { ry: i * Math.PI / 2, z: 0 });
  rb.cyl(0.25, 0.3, 0.3, mats.metal, { y: 0 }, 10);
  rb.build(rotor);
  // Blade disc: a faint spinning blur so the rotor reads at distance.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6.8, 24), new THREE.MeshBasicMaterial({ color: 0x1a1c18, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.02;
  rotor.add(disc);
  body.add(rotor);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.35, 1.1, -8.3);
  const tb = new Builder();
  tb.box(0.08, 1.5, 0.12, mats.dark, {});
  tb.box(0.08, 0.12, 1.5, mats.dark, {});
  tb.build(tailRotor);
  body.add(tailRotor);
  // Chin gun.
  const gunYaw = new THREE.Group();
  gunYaw.position.set(0, -0.75, 2.6);
  body.add(gunYaw);
  const gun = new THREE.Group();
  gunYaw.add(gun);
  const gb = new Builder();
  gb.box(0.5, 0.4, 0.6, mats.accent, {});
  gb.cyl(0.06, 0.06, 1.2, mats.metal, { z: 0.7, rx: Math.PI / 2 }, 8);
  gb.build(gun);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 3 }));
  lamp.position.set(0, 0.9, -0.4);
  body.add(lamp);
  return {
    root: g, body, rotor, tailRotor, gunYaw, gun, lamp, materials: [mats.body, mats.accent, mats.dark, mats.metal], flash: 0,
    muzzle: new THREE.Vector3(0, 0, 1.3), pods: [new THREE.Vector3(-2.3, -0.55, 1.2), new THREE.Vector3(2.3, -0.55, 1.2)]
  };
}

// Command truck: a truck with a shelter body, a radio mast and a small dish; `beacon` blinks.
export function buildCommandTruck() {
  const truck = buildTruck(0x50584a, 0x4a5444);
  const g = truck.root;
  const mats = bodyMaterials(0x50584a, 0x33382f);
  const b = new Builder();
  b.box(2.4, 1.6, 3.9, mats.accent, { y: 2.25, z: -1.1 });                      // shelter over the canvas
  b.cyl(0.05, 0.06, 5.0, MAT.metal, { x: 0.8, y: 5.2, z: -2.4 }, 6);            // mast
  for (let i = 0; i < 3; i++) b.box(0.9, 0.04, 0.04, MAT.metal, { x: 0.8, y: 4.0 + i * 1.1, z: -2.4 });
  b.cyl(0.03, 0.03, 2.6, MAT.metal, { x: -0.9, y: 4.0, z: 0.2 }, 5);            // whip antenna
  b.add(new THREE.CylinderGeometry(0.7, 0.1, 0.25, 14), MAT.metal, { x: -0.6, y: 3.3, z: -2.2, rx: -0.9 });  // dish
  b.box(0.6, 0.5, 0.05, MAT.glass, { x: 1.21, y: 2.3, z: -1.0, ry: Math.PI / 2 });
  b.build(g);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0x40ff60, emissive: 0x40ff60, emissiveIntensity: 2 }));
  beacon.position.set(0.8, 7.75, -2.4);
  g.add(beacon);
  return { root: g, beacon, materials: [...truck.materials, mats.accent], flash: 0, height: 3.2 };
}

// The shield generator: a bunker base, a coil column with glowing rings and an orb
// on top that the beam leaves from. `rings` spin and `orb` pulses while it runs.
export function buildGenerator() {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(6.0, 6.5, 1.2, MAT.concrete, { y: 0.6 }, 16);
  b.cyl(2.2, 2.6, 2.4, MAT.concreteDark, { y: 2.4 }, 12);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    b.box(1.2, 2.2, 1.2, MAT.concreteDark, { x: Math.cos(a) * 4.6, y: 2.3, z: Math.sin(a) * 4.6, ry: -a });
    b.cyl(0.08, 0.08, 3.2, MAT.metal, { x: Math.cos(a) * 4.6, y: 4.9, z: Math.sin(a) * 4.6 }, 6);
  }
  b.cyl(0.7, 0.9, 6.0, MAT.metal, { y: 6.6 }, 12);                    // coil column
  b.build(g);
  const glow = new THREE.MeshStandardMaterial({ color: 0x60e0ff, emissive: 0x40c0ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const rings = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.3 + (i % 2) * 0.3, 0.12, 8, 24), glow);
    r.rotation.x = Math.PI / 2;
    r.position.y = 4.6 + i * 1.2;
    rings.add(r);
  }
  g.add(rings);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), glow.clone());
  orb.position.y = 10.4;
  g.add(orb);
  const light = new THREE.PointLight(0x60d0ff, 40, 60, 2);
  light.position.y = 10.4;
  g.add(light);
  return { root: g, rings, orb, light, glow, materials: [MAT.concrete, MAT.concreteDark, MAT.metal], flash: 0, height: 11, top: new THREE.Vector3(0, 10.4, 0) };
}

// A pylon carrying the generator's power line to the fort.
export function buildPylon() {
  const g = new THREE.Group();
  const b = new Builder();
  b.cyl(0.25, 0.4, 9, MAT.metal, { y: 4.5 }, 8);
  b.box(2.4, 0.2, 0.2, MAT.metal, { y: 8.6 });
  b.cyl(0.7, 0.7, 0.3, MAT.concreteDark, { y: 0.15 }, 10);
  b.build(g);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x60e0ff, emissive: 0x40c0ff, emissiveIntensity: 2 }));
  tip.position.y = 9.1;
  g.add(tip);
  return { root: g, tip, top: new THREE.Vector3(0, 9.1, 0) };
}

// The keep's energy dome: a fresnel-lit sphere with drifting bands. `uHit` flashes it.
const DOME_VERT = `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vP = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const DOME_FRAG = `
  uniform float uTime; uniform float uHit; uniform vec3 uColor;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float bands = 0.5 + 0.5 * sin(vP.y * 0.9 - uTime * 2.0);
    float hex = step(0.92, fract(sin(dot(floor(vP.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.2));
    float a = f * 0.55 + bands * 0.06 + hex * 0.08 + uHit * 0.5;
    gl_FragColor = vec4(uColor * (1.0 + uHit * 2.0), clamp(a, 0.0, 0.9));
  }`;
export function buildDome(radius) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uColor: { value: new THREE.Color(0x60d0ff) } },
    vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), mat);
  mesh.renderOrder = 3;
  return { mesh, mat };
}
