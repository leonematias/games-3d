import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { MORTAR_FLIGHT_SECONDS, MORTAR_MAX_HP, MORTAR_RADIUS_CELLS, MORTAR_RANGE_CELLS, MORTAR_REFIRE_SECONDS } from './config.js';
import { yawToward } from './facing.js';
import { grenadeArcPoint } from './grenade-flight.js';
import { lineOfSightClear } from './turret-logic.js';
import { makeHealthBar, paintHealth } from './turrets.js';

const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.6, metalness: 0.4 });
const tubeMaterial = new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.45, metalness: 0.4 });
const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xfecaca, emissive: 0x7f1d1d, roughness: 0.3, metalness: 0.6 });

export function createMortarMesh() {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.18, 18), baseMaterial);
  base.position.y = 0.09;
  base.castShadow = true;
  base.userData.shared = true;
  const pivot = new THREE.Group();
  pivot.position.y = 0.2;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.62, 14), tubeMaterial);
  tube.rotation.x = Math.PI / 2 - 1.05;
  tube.position.set(0, 0.24, 0.12);
  tube.castShadow = true;
  tube.userData.shared = true;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.52, 0.26);
  pivot.add(tube, muzzle);
  root.add(base, pivot);
  const health = makeHealthBar();
  health.group.position.y = 0.95;
  root.add(health.group);
  root.userData.pivot = pivot;
  root.userData.muzzle = muzzle;
  root.userData.fill = health.fill;
  root.userData.bar = health.group;
  paintHealth(health.fill, MORTAR_MAX_HP, MORTAR_MAX_HP);
  return root;
}

function makeTargetRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.9, 32),
    new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// Mortars lob shells at the tank's last seen position, over walls. The landing spot is marked
// on the ground for the whole flight so the player can drive out of it.
export function createMortarController(scene, level, hooks = {}) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const items = Array.isArray(level.mortars) ? level.mortars : [];
  const group = new THREE.Group();
  const mortars = [];
  const shells = [];
  const barAnchor = new THREE.Vector3();
  const muzzlePoint = new THREE.Vector3();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createMortarMesh();
    mesh.position.set(item.x * tileSize + tileSize / 2, Math.max(0, tile.floor || 0) * heightStep, item.z * tileSize + tileSize / 2);
    group.add(mesh);
    mortars.push({ x: item.x, z: item.z, hp: MORTAR_MAX_HP, cooldown: 1.2 + ((item.x + item.z) % 4) * 0.4, lastSeen: null, drop: item.drop, mesh });
  }
  scene.add(group);

  function living() {
    return mortars.filter((mortar) => mortar.hp > 0);
  }

  function getTargets() {
    return living().map((mortar) => ({ kind: 'mortar', x: mortar.x, z: mortar.z }));
  }

  function applyHit(target, damage = 1) {
    const mortar = living().find((entry) => entry.x === target.x && entry.z === target.z);
    if (!mortar) return false;
    mortar.hp = Math.max(0, mortar.hp - damage);
    paintHealth(mortar.mesh.userData.fill, mortar.hp, MORTAR_MAX_HP);
    hooks.onHit?.(mortar);
    if (mortar.hp > 0) return false;
    group.remove(mortar.mesh);
    mortar.mesh.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose();
    });
    hooks.onDeath?.(mortar);
    return true;
  }

  function fire(mortar, target) {
    mortar.mesh.userData.muzzle.updateWorldMatrix(true, false);
    mortar.mesh.userData.muzzle.getWorldPosition(muzzlePoint);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), shellMaterial);
    shell.castShadow = true;
    shell.position.copy(muzzlePoint);
    const ring = makeTargetRing();
    ring.position.set(target.x, target.y + 0.04, target.z);
    scene.add(shell, ring);
    shells.push({
      mesh: shell,
      ring,
      age: 0,
      start: { x: muzzlePoint.x, y: muzzlePoint.y, z: muzzlePoint.z },
      landing: { x: target.x, y: target.y + 0.3, z: target.z }
    });
  }

  function update(delta, context) {
    elapsed += delta;
    const player = context.playerPosition;
    const range = MORTAR_RANGE_CELLS * tileSize;
    for (const mortar of living()) {
      mortar.cooldown = Math.max(0, mortar.cooldown - delta);
      mortar.mesh.userData.bar.getWorldPosition(barAnchor);
      mortar.mesh.userData.bar.rotation.y = Math.atan2(context.camera.position.x - barAnchor.x, context.camera.position.z - barAnchor.z);
      if (!context.alive || !player) continue;
      const originX = mortar.x * tileSize + tileSize / 2;
      const originZ = mortar.z * tileSize + tileSize / 2;
      if (context.stunned?.(originX, originZ)) continue;
      const dist = Math.hypot(player.x - originX, player.z - originZ);
      if (dist <= range && lineOfSightClear(originX, originZ, player.x, player.z, tileSize, context.isOccluder)) {
        mortar.lastSeen = { x: player.x, y: player.y, z: player.z, age: 0 };
      } else if (mortar.lastSeen) {
        mortar.lastSeen.age += delta;
        if (mortar.lastSeen.age > 6) mortar.lastSeen = null;
      }
      if (!mortar.lastSeen) continue;
      mortar.mesh.userData.pivot.rotation.y = yawToward(mortar.lastSeen.x - originX, mortar.lastSeen.z - originZ);
      if (mortar.cooldown > 0 || dist < 1.5 * tileSize) continue;
      fire(mortar, mortar.lastSeen);
      mortar.cooldown = MORTAR_REFIRE_SECONDS;
      context.onFire?.();
    }

    for (let index = shells.length - 1; index >= 0; index--) {
      const shell = shells[index];
      shell.age += delta;
      const u = Math.min(1, shell.age / MORTAR_FLIGHT_SECONDS);
      const point = grenadeArcPoint(shell.start, shell.landing, u, 2.4);
      shell.mesh.position.set(point.x, point.y, point.z);
      const pulse = 0.85 + Math.sin(elapsed * 18) * 0.12;
      shell.ring.scale.setScalar(pulse * (0.6 + u * 0.6));
      if (u < 1) continue;
      scene.remove(shell.mesh, shell.ring);
      shell.mesh.geometry.dispose();
      shell.ring.geometry.dispose();
      shell.ring.material.dispose();
      shells.splice(index, 1);
      context.onImpact?.(shell.landing, MORTAR_RADIUS_CELLS * tileSize);
    }
  }

  return { group, update, applyHit, getTargets, living, shellCount: () => shells.length };
}
