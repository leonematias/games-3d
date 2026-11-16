import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { planarForward, yawToward } from './facing.js';
import {
  TURRET_HALF_ANGLE,
  TURRET_LOCK_SECONDS,
  TURRET_MAX_HP,
  TURRET_REFIRE_SECONDS,
  TURRET_TURN_SPEED,
  TURRET_VISION_RANGE
} from './config.js';
import { circleIntersectsSector, lineOfSightClear, stepTurretEngagement } from './turret-logic.js';

const MUZZLE_Y = 0.4;
const MUZZLE_Z = 0.72;

export function makeHealthBar(width = 0.74, height = 0.14) {
  const group = new THREE.Group();
  const fillWidth = width - 0.06;
  const fillHeight = Math.max(0.04, height - 0.06);
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x111827 })
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(fillWidth, fillHeight),
    new THREE.MeshBasicMaterial({ color: 0x22c55e })
  );
  fill.position.z = 0.01;
  group.add(background, fill);
  group.position.y = 1.05;
  return { group, fill };
}

export function paintHealth(fill, hp, maxHp = TURRET_MAX_HP) {
  const ratio = Math.max(0, hp) / maxHp;
  const fullWidth = fill.geometry.parameters.width;
  fill.scale.x = Math.max(0.001, ratio);
  fill.position.x = ((ratio - 1) * fullWidth) / 2;
  const color = ratio > 2 / 3 ? 0x22c55e : ratio > 1 / 3 ? 0xeab308 : 0xef4444;
  fill.material.color.setHex(color);
}

function makeTurretMesh(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  const floorY = Math.max(0, tile?.floor || 0) * heightStep;
  const root = new THREE.Group();
  root.position.set(
    item.x * tileSize + tileSize / 2,
    floorY,
    item.z * tileSize + tileSize / 2
  );

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.32, 0.22, 18),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.62, metalness: 0.4 })
  );
  base.position.y = 0.11;
  base.castShadow = true;
  root.add(base);

  const head = new THREE.Group();
  head.position.y = 0.24;
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.24, 0.38),
    new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.48, metalness: 0.28 })
  );
  housing.position.y = 0.16;
  housing.castShadow = true;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.62, 12),
    new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.32, metalness: 0.7 })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.18, 0.36);
  barrel.castShadow = true;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, MUZZLE_Y - 0.24, MUZZLE_Z);
  head.add(housing, barrel, muzzle);
  root.add(head);

  const health = makeHealthBar();
  root.add(health.group);

  return { root, head, muzzle, fill: health.fill, bar: health.group };
}

export function createTurretController(scene, level, hooks = {}) {
  const items = Array.isArray(level.turrets) ? level.turrets : [];
  const group = new THREE.Group();
  const turrets = [];
  const barAnchor = new THREE.Vector3();

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = makeTurretMesh(item, level);
    const yaw = ((item.x * 0.73 + item.z * 1.17) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    mesh.head.rotation.y = yaw;
    paintHealth(mesh.fill, TURRET_MAX_HP);
    group.add(mesh.root);
    turrets.push({
      x: item.x,
      z: item.z,
      hp: TURRET_MAX_HP,
      yaw,
      lockRemaining: 0,
      rearm: false,
      cooldown: 0.4 + ((item.x * 3 + item.z) % 5) * 0.15,
      drop: item.drop,
      ...mesh
    });
  }
  scene.add(group);

  function living() {
    return turrets.filter((turret) => turret.hp > 0);
  }

  function getTargets() {
    return living().map((turret) => ({ x: turret.x, z: turret.z }));
  }

  function applyHit(target, damage = 1) {
    const turret = turrets.find((entry) => entry.hp > 0 && entry.x === target.x && entry.z === target.z);
    if (!turret) return false;
    turret.hp = Math.max(0, turret.hp - damage);
    paintHealth(turret.fill, turret.hp);
    hooks.onHit?.(turret);
    if (turret.hp > 0) return false;
    group.remove(turret.root);
    turret.root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      if (obj.material && !obj.material.map) obj.material.dispose();
    });
    level.turrets = (level.turrets || []).filter((item) => !(item.x === turret.x && item.z === turret.z));
    hooks.onDeath?.(turret);
    return true;
  }

  function spottedYaw(turret, player, tileSize, playerRadius, isOccluder) {
    if (!player) return null;
    const origin = turret.root.position;
    const seen = circleIntersectsSector(
      origin.x,
      origin.z,
      turret.yaw,
      player.x,
      player.z,
      playerRadius,
      TURRET_VISION_RANGE,
      TURRET_HALF_ANGLE
    );
    if (!seen) return null;
    const clear = lineOfSightClear(
      origin.x,
      origin.z,
      player.x,
      player.z,
      tileSize,
      (tileX, tileZ) => isOccluder(tileX, tileZ, turret)
    );
    if (!clear) return null;
    const dx = player.x - origin.x;
    const dz = player.z - origin.z;
    if (dx === 0 && dz === 0) return turret.yaw;
    return yawToward(dx, dz);
  }

  function update(delta, context) {
    const tileSize = context.tileSize || 1;
    const player = context.playerPosition;
    for (const turret of living()) {
      turret.bar.getWorldPosition(barAnchor);
      turret.bar.rotation.y = Math.atan2(context.camera.position.x - barAnchor.x, context.camera.position.z - barAnchor.z);
      if (context.stunned?.(turret.root.position.x, turret.root.position.z)) {
        turret.head.rotation.y = turret.yaw + Math.sin(performance.now() / 40) * 0.05;
        continue;
      }
      turret.cooldown = Math.max(0, turret.cooldown - delta);
      const bearing = context.alive && player
        ? spottedYaw(turret, player, tileSize, context.playerRadius || 0.42, context.isOccluder)
        : null;
      const firing = stepTurretEngagement(turret, delta, {
        turnSpeed: TURRET_TURN_SPEED,
        lockSeconds: TURRET_LOCK_SECONDS,
        spottedYaw: bearing
      });
      turret.head.rotation.y = turret.yaw;
      turret.bar.getWorldPosition(barAnchor);
      const dx = context.camera.position.x - barAnchor.x;
      const dz = context.camera.position.z - barAnchor.z;
      turret.bar.rotation.y = Math.atan2(dx, dz);

      if (!firing || turret.cooldown > 0) continue;
      turret.muzzle.updateWorldMatrix(true, false);
      const muzzle = new THREE.Vector3();
      turret.muzzle.getWorldPosition(muzzle);
      const forward = planarForward(turret.yaw);
      const fired = context.tryFire(
        `${turret.x},${turret.z}`,
        muzzle,
        new THREE.Vector3(forward.x, 0, forward.z)
      );
      if (fired) turret.cooldown = TURRET_REFIRE_SECONDS;
    }
  }

  return { group, update, applyHit, getTargets };
}

// Exposed for frontend/meshviewer/bake-sources.js, which bakes these into library models.
export { makeTurretMesh };
