import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { SHIELD_MAX_HP, SHIELD_RADIUS_CELLS } from './config.js';
import { makeHealthBar, paintHealth } from './turrets.js';

const pylonMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 });
const orbMaterial = new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x0ea5e9, emissiveIntensity: 1.2, roughness: 0.2 });
const domeMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });

export function createShieldMesh() {
  const root = new THREE.Group();
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.7, 10), pylonMaterial);
  pylon.position.y = 0.35;
  pylon.castShadow = true;
  pylon.userData.shared = true;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), orbMaterial);
  orb.position.y = 0.86;
  orb.userData.shared = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 24), pylonMaterial);
  ring.position.y = 0.86;
  ring.rotation.x = Math.PI / 2;
  ring.userData.shared = true;
  root.add(pylon, orb, ring);
  const health = makeHealthBar();
  health.group.position.y = 1.25;
  root.add(health.group);
  root.userData.orb = orb;
  root.userData.ring = ring;
  root.userData.fill = health.fill;
  root.userData.bar = health.group;
  paintHealth(health.fill, SHIELD_MAX_HP, SHIELD_MAX_HP);
  return root;
}

// While a generator stands, every turret, mortar and boss within its radius ignores cannon,
// machine-gun and grenade hits. Nukes punch through. The generator itself is always vulnerable.
export function createShieldController(scene, level, hooks = {}) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const items = Array.isArray(level.shields) ? level.shields : [];
  const group = new THREE.Group();
  const shields = [];
  const domes = new Map();
  const barAnchor = new THREE.Vector3();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createShieldMesh();
    mesh.position.set(item.x * tileSize + tileSize / 2, Math.max(0, tile.floor || 0) * heightStep, item.z * tileSize + tileSize / 2);
    group.add(mesh);
    shields.push({ x: item.x, z: item.z, hp: SHIELD_MAX_HP, mesh, pulse: 0 });
  }
  scene.add(group);

  function living() {
    return shields.filter((shield) => shield.hp > 0);
  }

  function getTargets() {
    return living().map((shield) => ({ kind: 'shield', x: shield.x, z: shield.z }));
  }

  function protects(tileX, tileZ) {
    const radius = SHIELD_RADIUS_CELLS;
    return living().some((shield) => Math.hypot(shield.x - tileX, shield.z - tileZ) <= radius + 1e-6);
  }

  // Called when a protected enemy shrugs off a hit: the nearest generator flares.
  function deflect(tileX, tileZ) {
    let best = null;
    for (const shield of living()) {
      const dist = Math.hypot(shield.x - tileX, shield.z - tileZ);
      if (dist <= SHIELD_RADIUS_CELLS && (!best || dist < best.dist)) best = { shield, dist };
    }
    if (best) best.shield.pulse = 0.35;
    const key = `${tileX},${tileZ}`;
    const dome = domes.get(key);
    if (dome) dome.userData.flash = 0.3;
  }

  function applyHit(target, damage = 1) {
    const shield = living().find((entry) => entry.x === target.x && entry.z === target.z);
    if (!shield) return false;
    shield.hp = Math.max(0, shield.hp - damage);
    paintHealth(shield.mesh.userData.fill, shield.hp, SHIELD_MAX_HP);
    hooks.onHit?.(shield);
    if (shield.hp > 0) return false;
    group.remove(shield.mesh);
    shield.mesh.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose();
    });
    hooks.onDeath?.(shield);
    return true;
  }

  // Domes are drawn over whichever protected cells the game reports each frame.
  function syncDomes(protectedCells) {
    const wanted = new Map();
    for (const cell of protectedCells) wanted.set(`${cell.x},${cell.z}`, cell);
    for (const [key, dome] of domes) {
      if (wanted.has(key)) continue;
      group.remove(dome);
      dome.geometry.dispose();
      domes.delete(key);
    }
    for (const [key, cell] of wanted) {
      if (domes.has(key)) continue;
      const span = cell.span || 1;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62 * span, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMaterial.clone());
      dome.position.set((cell.x + span / 2) * tileSize, 0.02, (cell.z + span / 2) * tileSize);
      dome.userData.flash = 0;
      group.add(dome);
      domes.set(key, dome);
    }
  }

  function update(delta, context) {
    elapsed += delta;
    for (const shield of living()) {
      shield.pulse = Math.max(0, shield.pulse - delta);
      const orb = shield.mesh.userData.orb;
      orb.scale.setScalar(1 + Math.sin(elapsed * 4 + shield.x) * 0.08 + shield.pulse * 1.4);
      shield.mesh.userData.ring.rotation.z = elapsed * 1.6;
      shield.mesh.userData.bar.getWorldPosition(barAnchor);
      shield.mesh.userData.bar.rotation.y = Math.atan2(context.camera.position.x - barAnchor.x, context.camera.position.z - barAnchor.z);
    }
    syncDomes(living().length ? context.protectedCells || [] : []);
    for (const dome of domes.values()) {
      dome.userData.flash = Math.max(0, dome.userData.flash - delta);
      dome.material.opacity = 0.14 + Math.sin(elapsed * 3) * 0.04 + dome.userData.flash * 1.6;
    }
  }

  return { group, update, applyHit, getTargets, living, protects, deflect };
}
