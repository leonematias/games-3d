import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { PATROL_MAX_HP, PATROL_RANGE_CELLS, PATROL_REFIRE_SECONDS, PATROL_SPEED } from './config.js';
import { planarForward, yawToward } from './facing.js';
import { circleHitsCell, droneStep } from './drone-logic.js';
import { lineOfSightClear } from './turret-logic.js';
import { makeHealthBar, paintHealth } from './turrets.js';

const PATROL_RADIUS = 0.4;
const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.6, metalness: 0.3 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.5, metalness: 0.35 });
const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85, metalness: 0.2 });
const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.7 });
const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.9 });

export function createPatrolMesh() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.86), trackMaterial);
    track.position.set(side * 0.33, 0.11, 0);
    track.castShadow = true;
    track.userData.shared = true;
    body.add(track);
  }
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.8), hullMaterial);
  hull.position.y = 0.26;
  hull.castShadow = true;
  hull.userData.shared = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.4), headMaterial);
  head.position.set(0, 0.46, -0.02);
  head.castShadow = true;
  head.userData.shared = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.6, 10), barrelMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.46, 0.42);
  barrel.castShadow = true;
  barrel.userData.shared = true;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMaterial);
  lamp.position.set(0, 0.6, 0.1);
  lamp.userData.shared = true;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.46, 0.76);
  body.add(hull, head, barrel, lamp, muzzle);
  root.add(body);
  const health = makeHealthBar(0.7, 0.13);
  health.group.position.y = 0.92;
  root.add(health.group);
  root.userData.body = body;
  root.userData.muzzle = muzzle;
  root.userData.fill = health.fill;
  root.userData.bar = health.group;
  paintHealth(health.fill, PATROL_MAX_HP, PATROL_MAX_HP);
  return root;
}

function disposePatrol(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    if (obj.material && !obj.userData.shared && !obj.material.map) obj.material.dispose();
  });
}

// A patrol drives its waypoint loop back and forth, blocks the tank like a drone, and fires a
// slow shell whenever it has line of sight. Waypoints are cells; the origin is the first stop.
export function createPatrolController(scene, level, hooks = {}) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const items = Array.isArray(level.patrols) ? level.patrols : [];
  const group = new THREE.Group();
  const patrols = [];
  const barAnchor = new THREE.Vector3();
  const muzzlePoint = new THREE.Vector3();
  let nextId = 1;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const stops = [{ x: item.x, z: item.z }];
    for (const stop of Array.isArray(item.path) ? item.path : []) {
      if (Number.isInteger(stop?.x) && Number.isInteger(stop?.z)) stops.push({ x: stop.x, z: stop.z });
    }
    const mesh = createPatrolMesh();
    const x = item.x * tileSize + tileSize / 2;
    const z = item.z * tileSize + tileSize / 2;
    mesh.position.set(x, Math.max(0, tile.floor || 0) * heightStep, z);
    group.add(mesh);
    patrols.push({
      id: nextId,
      origin: { x: item.x, z: item.z },
      x,
      z,
      yaw: 0,
      hp: PATROL_MAX_HP,
      stops,
      stopIndex: stops.length > 1 ? 1 : 0,
      forward: true,
      cooldown: 0.8 + (nextId % 3) * 0.3,
      waiting: 0,
      mesh
    });
    nextId += 1;
  }
  scene.add(group);

  function living() {
    return patrols.filter((patrol) => patrol.hp > 0);
  }

  function occupies(tileX, tileZ) {
    return living().some((patrol) => circleHitsCell(patrol.x, patrol.z, PATROL_RADIUS, tileX, tileZ, tileSize));
  }

  function getTargets() {
    return living().map((patrol) => ({
      kind: 'patrol',
      id: patrol.id,
      x: Math.floor(patrol.x / tileSize),
      z: Math.floor(patrol.z / tileSize),
      worldX: patrol.x,
      worldZ: patrol.z
    }));
  }

  function applyHit(target, damage = 1) {
    const patrol = living().find((entry) => entry.id === target.id)
      || living().find((entry) => Math.floor(entry.x / tileSize) === target.x && Math.floor(entry.z / tileSize) === target.z);
    if (!patrol) return false;
    patrol.hp = Math.max(0, patrol.hp - damage);
    paintHealth(patrol.mesh.userData.fill, patrol.hp, PATROL_MAX_HP);
    hooks.onHit?.(patrol);
    if (patrol.hp > 0) return false;
    group.remove(patrol.mesh);
    disposePatrol(patrol.mesh);
    hooks.onDeath?.({ x: Math.floor(patrol.x / tileSize), z: Math.floor(patrol.z / tileSize), drop: patrol.drop });
    return true;
  }

  function advance(patrol) {
    if (patrol.stops.length < 2) return;
    if (patrol.forward) {
      if (patrol.stopIndex >= patrol.stops.length - 1) {
        patrol.forward = false;
        patrol.stopIndex = Math.max(0, patrol.stops.length - 2);
      } else patrol.stopIndex += 1;
    } else if (patrol.stopIndex <= 0) {
      patrol.forward = true;
      patrol.stopIndex = Math.min(1, patrol.stops.length - 1);
    } else patrol.stopIndex -= 1;
  }

  function update(delta, context) {
    const player = context.playerPosition;
    const range = PATROL_RANGE_CELLS * tileSize;
    for (const patrol of living()) {
      patrol.cooldown = Math.max(0, patrol.cooldown - delta);
      patrol.mesh.userData.bar.getWorldPosition(barAnchor);
      const camX = context.camera.position.x - barAnchor.x;
      const camZ = context.camera.position.z - barAnchor.z;
      patrol.mesh.userData.bar.rotation.y = Math.atan2(camX, camZ);
      if (context.stunned?.(patrol.x, patrol.z)) {
        patrol.mesh.userData.body.rotation.y = patrol.yaw + Math.sin(performance.now() / 35) * 0.06;
        continue;
      }

      let aimed = false;
      if (context.alive && player) {
        const dx = player.x - patrol.x;
        const dz = player.z - patrol.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= range && lineOfSightClear(patrol.x, patrol.z, player.x, player.z, tileSize, context.isOccluder)) {
          aimed = true;
          patrol.yaw = yawToward(dx, dz);
          if (patrol.cooldown <= 0 && context.tryFire) {
            patrol.mesh.userData.body.rotation.y = patrol.yaw;
            patrol.mesh.userData.muzzle.updateWorldMatrix(true, false);
            patrol.mesh.userData.muzzle.getWorldPosition(muzzlePoint);
            const forward = planarForward(patrol.yaw);
            if (context.tryFire(`patrol:${patrol.id}`, muzzlePoint, new THREE.Vector3(forward.x, 0, forward.z))) {
              patrol.cooldown = PATROL_REFIRE_SECONDS;
            }
          }
        }
      }

      if (!aimed && patrol.stops.length > 1) {
        const stop = patrol.stops[patrol.stopIndex];
        const targetX = stop.x * tileSize + tileSize / 2;
        const targetZ = stop.z * tileSize + tileSize / 2;
        const moved = droneStep(patrol.x, patrol.z, targetX, targetZ, PATROL_SPEED * delta);
        const blockedByPlayer = player && Math.hypot(moved.x - player.x, moved.z - player.z) < PATROL_RADIUS + (context.playerRadius || 0.42);
        const blockedByCell = context.isTileBlocked && (() => {
          const minX = Math.floor((moved.x - PATROL_RADIUS) / tileSize);
          const maxX = Math.floor((moved.x + PATROL_RADIUS) / tileSize);
          const minZ = Math.floor((moved.z - PATROL_RADIUS) / tileSize);
          const maxZ = Math.floor((moved.z + PATROL_RADIUS) / tileSize);
          for (let tz = minZ; tz <= maxZ; tz++) {
            for (let tx = minX; tx <= maxX; tx++) {
              if (circleHitsCell(moved.x, moved.z, PATROL_RADIUS, tx, tz, tileSize) && context.isTileBlocked(tx, tz, patrol.id)) return true;
            }
          }
          return false;
        })();
        if (!blockedByPlayer && !blockedByCell) {
          patrol.x = moved.x;
          patrol.z = moved.z;
          patrol.yaw = moved.yaw;
          patrol.mesh.position.x = patrol.x;
          patrol.mesh.position.z = patrol.z;
          if (Math.hypot(patrol.x - targetX, patrol.z - targetZ) < 0.03) advance(patrol);
        }
      }
      patrol.mesh.userData.body.rotation.y = patrol.yaw;
    }
  }

  return { group, update, applyHit, getTargets, occupies, living };
}
