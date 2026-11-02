import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { GRENADE_BARREL_PITCH } from './config.js';

export const TANK_BODY_HEIGHT = 0.38;
export const TANK_COLLISION_RADIUS = 0.42;
export const TANK_CANNON_Y = 0.4;
export const TANK_BARREL_LENGTH = 0.92;
export const TANK_BARREL_Z = 0.54;
export const TANK_SCALE = 0.86;
const CANNON_Y = TANK_CANNON_Y;
export const TANK_AIM_Y = CANNON_Y * TANK_SCALE;
export const TANK_TRANSFORM_SECONDS = 1.35;

const BARREL_METAL = { roughness: 0.3, metalness: 0.75 };

// Every tier stays inside the level-1 footprint (about 1.14 x 0.6 x 1.08 before scaling).
export const TANK_TIERS = [
  { hull: 0x2f855a, turret: 0x3f9c6b, hatch: 0x1f4d32, trim: 0x166534, glow: 0x000000, parts: [] },
  { hull: 0x1d4ed8, turret: 0x2563eb, hatch: 0x1e3a8a, trim: 0x93c5fd, glow: 0x1e40af, parts: ['skirts', 'exhaust', 'antenna'] },
  { hull: 0xb45309, turret: 0xd97706, hatch: 0x7c2d12, trim: 0xfde68a, glow: 0xf59e0b, parts: ['skirts', 'exhaust', 'antenna', 'sideGuns', 'fin', 'dome'] },
  { hull: 0x7f1d1d, turret: 0xdc2626, hatch: 0x450a0a, trim: 0xfca5a5, glow: 0xef4444, parts: ['skirts', 'exhaust', 'antenna', 'sideGuns', 'fin', 'dome', 'stripes'] }
];

export function tankTier(level) {
  const index = Math.max(1, Math.floor(level || 1)) - 1;
  return TANK_TIERS[Math.min(index, TANK_TIERS.length - 1)];
}

function makeTube(radiusTop, radiusBottom, length, color, metalness = BARREL_METAL.metalness) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 16),
    new THREE.MeshStandardMaterial({ color, roughness: BARREL_METAL.roughness, metalness })
  );
  mesh.castShadow = true;
  return mesh;
}

function buildCannon() {
  return { root: makeTube(0.05, 0.055, TANK_BARREL_LENGTH, 0xcbd5e1), spinner: null };
}

function buildMachineGun() {
  const spinner = new THREE.Group();
  const ring = 0.055;
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const tube = makeTube(0.016, 0.018, TANK_BARREL_LENGTH, 0xe2e8f0, 0.82);
    tube.position.set(Math.cos(angle) * ring, 0, Math.sin(angle) * ring);
    tube.userData.barrel = true;
    spinner.add(tube);
  }
  spinner.add(makeTube(0.02, 0.02, TANK_BARREL_LENGTH, 0x94a3b8, 0.6));
  return { root: spinner, spinner };
}

function buildNuke() {
  const group = new THREE.Group();
  group.add(makeTube(0.105, 0.11, TANK_BARREL_LENGTH, 0x44403c, 0.55));
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.128, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, roughness: 0.4, metalness: 0.35 })
  );
  band.position.y = 0.12;
  band.castShadow = true;
  group.add(band);
  return { root: group, spinner: null };
}

function buildGrenade() {
  const group = new THREE.Group();
  group.add(makeTube(0.07, 0.085, TANK_BARREL_LENGTH, 0x3f6212, 0.45));
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.078, 0.16, 16),
    new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.5, metalness: 0.3 })
  );
  cup.position.y = TANK_BARREL_LENGTH / 2 - 0.02;
  cup.castShadow = true;
  group.add(cup);
  return { root: group, spinner: null };
}

// Shield projector: a short stub ending in a wide emissive dish.
function buildShieldProjector() {
  const group = new THREE.Group();
  group.add(makeTube(0.06, 0.07, TANK_BARREL_LENGTH * 0.55, 0x1e293b, 0.6));
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.12, 0.08, 20),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.4 })
  );
  dish.position.y = TANK_BARREL_LENGTH * 0.275 + 0.02;
  dish.castShadow = true;
  group.add(dish);
  return { root: group, spinner: null };
}

// EMP pulse: a coil of rings around the barrel that spins while selected.
function buildEmp() {
  const group = new THREE.Group();
  group.add(makeTube(0.04, 0.05, TANK_BARREL_LENGTH * 0.8, 0x312e81, 0.5));
  const spinner = new THREE.Group();
  for (let index = 0; index < 4; index++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.09 + index * 0.012, 0.014, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x7c3aed, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.1 + index * 0.13;
    spinner.add(ring);
  }
  group.add(spinner);
  return { root: group, spinner };
}

const WEAPON_BUILDS = {
  cannon: { pitch: 0, build: buildCannon },
  machinegun: { pitch: 0, build: buildMachineGun },
  nuke: { pitch: 0, build: buildNuke },
  grenade: { pitch: GRENADE_BARREL_PITCH, build: buildGrenade },
  shield: { pitch: 0, build: buildShieldProjector },
  emp: { pitch: 0, build: buildEmp }
};

function disposeWeaponObject(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  });
}

// Cylinder local +Y is the barrel. rotation.x = PI/2 - pitch sends +Y to (sin pitch up, cos pitch forward +Z).
export function setTankWeapon(mesh, weapon) {
  const mount = mesh?.userData.weaponMount;
  const tip = mesh?.userData.cannonTip;
  if (!mount || !tip) return;
  for (const child of [...mount.children]) {
    if (child === tip) continue;
    mount.remove(child);
    disposeWeaponObject(child);
  }
  const name = WEAPON_BUILDS[weapon] ? weapon : 'cannon';
  const spec = WEAPON_BUILDS[name];
  mount.rotation.x = Math.PI / 2 - spec.pitch;
  const built = spec.build();
  mount.add(built.root);
  mesh.userData.weaponSpinner = built.spinner;
  mesh.userData.weaponId = name;
}

export function spinTankWeapon(mesh, delta) {
  const spinner = mesh?.userData.weaponSpinner;
  if (!spinner) return;
  spinner.rotation.y += delta * 12;
}

function metal(color, roughness = 0.6, metalness = 0.25, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}

function part(group, mesh, name) {
  mesh.castShadow = true;
  mesh.userData.partName = name;
  group.add(mesh);
  return mesh;
}

// Builds every body piece for a tier. Body parts sit in `body`, turret parts in `turret`.
function buildTierParts(tier, body, turret) {
  const extras = new Set(tier.parts);

  part(body, new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 1.08), metal(tier.hull, 0.72, 0.15)), 'hull').position.y = 0.16;
  const wheelMaterial = metal(0x20242d, 0.92, 0.05);
  for (const xOffset of [-0.46, 0.46]) {
    for (const zOffset of [-0.3, 0, 0.3]) {
      const wheel = part(body, new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), wheelMaterial), 'wheel');
      wheel.position.set(xOffset, 0.11, zOffset);
    }
  }
  if (extras.has('skirts')) {
    const skirtMaterial = metal(tier.trim, 0.5, 0.5);
    for (const xOffset of [-0.53, 0.53]) {
      const skirt = part(body, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.96), skirtMaterial), 'skirt');
      skirt.position.set(xOffset, 0.26, 0);
    }
  }
  if (extras.has('exhaust')) {
    const pipeMaterial = metal(0x374151, 0.4, 0.7);
    for (const xOffset of [-0.26, 0.26]) {
      const pipe = part(body, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 10), pipeMaterial), 'exhaust');
      pipe.rotation.x = Math.PI / 2 - 0.5;
      pipe.position.set(xOffset, 0.3, -0.5);
    }
  }
  if (extras.has('fin')) {
    const fin = part(body, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.14), metal(tier.turret, 0.5, 0.4)), 'fin');
    fin.position.set(0, 0.34, -0.5);
    const strut = part(body, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), metal(tier.trim, 0.5, 0.5)), 'strut');
    strut.position.set(0, 0.29, -0.5);
  }
  if (extras.has('stripes')) {
    const stripeMaterial = metal(tier.glow, 0.3, 0.3, tier.glow, 0.9);
    for (const xOffset of [-0.3, 0.3]) {
      const stripe = part(body, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 1.0), stripeMaterial), 'stripe');
      stripe.position.set(xOffset, 0.285, 0);
    }
  }

  part(turret, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.48), metal(tier.turret, 0.58, 0.18)), 'turretBox').position.set(0, 0, 0.06);
  const hatch = part(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 18), metal(tier.hatch, 0.48, 0.2)), 'hatch');
  hatch.position.set(0, 0.14, 0.02);
  if (extras.has('dome')) {
    const dome = part(turret, new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), metal(tier.glow, 0.25, 0.2, tier.glow, 1.1)), 'dome');
    dome.position.set(0, 0.2, 0.02);
  }
  if (extras.has('antenna')) {
    const mast = part(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), metal(0xd1d5db, 0.3, 0.8)), 'antenna');
    mast.position.set(-0.2, 0.22, -0.16);
    const tip = part(turret, new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), metal(tier.glow, 0.3, 0.3, tier.glow, 1.2)), 'antennaTip');
    tip.position.set(-0.2, 0.38, -0.16);
  }
  if (extras.has('sideGuns')) {
    const gunMaterial = metal(0xe5e7eb, 0.3, 0.75);
    for (const xOffset of [-0.19, 0.19]) {
      const gun = part(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.5, 10), gunMaterial), 'sideGun');
      gun.rotation.x = Math.PI / 2;
      gun.position.set(xOffset, 0.02, 0.4);
    }
  }
}

function tankParts(mesh) {
  const parts = [];
  for (const group of [mesh.userData.body, mesh.userData.turret]) {
    for (const child of group.children) {
      if (child.userData.partName) parts.push(child);
    }
  }
  return parts;
}

function disposeParts(parts) {
  for (const mesh of parts) {
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }
}

function rememberHome(parts) {
  for (const mesh of parts) {
    mesh.userData.home = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone()
    };
    const away = mesh.position.clone();
    away.y -= 0.2;
    if (away.lengthSq() < 1e-4) away.set(0, 1, 0);
    mesh.userData.away = away.normalize();
    mesh.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
  }
}

export function createMainCharacter(level = 1) {
  const tank = new THREE.Group();
  const body = new THREE.Group();
  const turret = new THREE.Group();
  turret.position.y = 0.38;
  tank.add(body, turret);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, CANNON_Y - turret.position.y, TANK_BARREL_Z);
  turret.add(weaponMount);
  const tipMarker = new THREE.Object3D();
  tipMarker.position.set(0, TANK_BARREL_LENGTH / 2, 0);
  weaponMount.add(tipMarker);

  tank.userData.body = body;
  tank.userData.turret = turret;
  tank.userData.weaponMount = weaponMount;
  tank.userData.cannonTip = tipMarker;
  tank.userData.weaponSpinner = null;
  tank.userData.tier = tankTier(level);
  tank.userData.transform = null;
  buildTierParts(tank.userData.tier, body, turret);
  rememberHome(tankParts(tank));
  setTankWeapon(tank, 'cannon');
  tank.scale.setScalar(TANK_SCALE);
  return tank;
}

// Transformer-style upgrade: the old shell spins apart, the new tier snaps together from the outside in.
export function upgradeTank(mesh, level) {
  const tier = tankTier(level);
  if (!mesh || tier === mesh.userData.tier) return false;
  const old = tankParts(mesh);
  const fresh = [];
  const stash = { body: new THREE.Group(), turret: new THREE.Group() };
  buildTierParts(tier, stash.body, stash.turret);
  for (const [key, group] of Object.entries(stash)) {
    for (const child of [...group.children]) {
      mesh.userData[key].add(child);
      child.visible = false;
      fresh.push(child);
    }
  }
  rememberHome(fresh);
  mesh.userData.tier = tier;
  mesh.userData.transform = { age: 0, old, fresh };
  return true;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function updateTankTransform(mesh, delta) {
  const anim = mesh?.userData.transform;
  if (!anim) return false;
  anim.age += delta;
  const t = Math.min(1, anim.age / TANK_TRANSFORM_SECONDS);
  const split = 0.42;
  if (t < split) {
    const u = t / split;
    for (const partMesh of anim.old) {
      const { home, away, spin } = partMesh.userData;
      partMesh.position.copy(home.position).addScaledVector(away, u * 1.6);
      partMesh.rotation.set(home.rotation.x + spin.x * u, home.rotation.y + spin.y * u, home.rotation.z + spin.z * u);
      partMesh.scale.copy(home.scale).multiplyScalar(Math.max(0.001, 1 - u * u));
    }
  } else {
    if (anim.old.length) {
      disposeParts(anim.old);
      anim.old = [];
    }
    const u = (t - split) / (1 - split);
    const eased = easeOutBack(Math.min(1, u));
    for (const partMesh of anim.fresh) {
      const { home, away, spin } = partMesh.userData;
      partMesh.visible = true;
      partMesh.position.copy(home.position).addScaledVector(away, (1 - eased) * 1.4);
      partMesh.rotation.set(home.rotation.x + spin.x * (1 - u), home.rotation.y + spin.y * (1 - u), home.rotation.z + spin.z * (1 - u));
      partMesh.scale.copy(home.scale).multiplyScalar(0.2 + 0.8 * Math.min(1, u * 1.4));
    }
  }
  if (t >= 1) {
    for (const partMesh of anim.fresh) {
      const { home } = partMesh.userData;
      partMesh.position.copy(home.position);
      partMesh.rotation.copy(home.rotation);
      partMesh.scale.copy(home.scale);
    }
    mesh.userData.transform = null;
  }
  return true;
}

export function syncMainCharacterMesh(mesh, position, direction) {
  mesh.position.copy(position);
  mesh.rotation.y = direction;
}

export function getCannonWorldPosition(mesh, target = new THREE.Vector3()) {
  const tip = mesh.userData.cannonTip;
  if (!tip) return mesh.getWorldPosition(target);
  return tip.getWorldPosition(target);
}
