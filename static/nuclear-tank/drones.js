import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { DRONE_MAX_HP, DRONE_RADIUS, DRONE_SPEED } from './config.js';
import { circleHitsCell, droneStep, nextDroneCell } from './drone-logic.js';
import { makeHealthBar, paintHealth } from './turrets.js';

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.55, metalness: 0.25 });
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.7, metalness: 0.2 });
const lampMaterial = new THREE.MeshStandardMaterial({
  color: 0xfecaca,
  emissive: 0xef4444,
  emissiveIntensity: 0.8,
  roughness: 0.35
});

export function createDroneMesh() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.62), bodyMaterial);
  body.position.y = 0.24;
  body.castShadow = true;
  body.userData.shared = true;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), lampMaterial);
  lamp.position.set(0, 0.32, 0.28);
  lamp.userData.shared = true;
  root.add(body, lamp);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.26, 0.12, 0);
    wheel.castShadow = true;
    wheel.userData.shared = true;
    root.add(wheel);
  }
  const health = makeHealthBar(0.56, 0.12);
  root.add(health.group);
  paintHealth(health.fill, DRONE_MAX_HP, DRONE_MAX_HP);
  root.userData.fill = health.fill;
  root.userData.bar = health.group;
  return root;
}

function disposeDrone(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    if (obj.material && !obj.userData.shared && !obj.material.map) obj.material.dispose();
  });
}

export function createDroneController(scene, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const items = Array.isArray(level.drones) ? level.drones : [];
  const group = new THREE.Group();
  const drones = [];
  let nextId = 1;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createDroneMesh();
    const x = item.x * tileSize + tileSize / 2;
    const z = item.z * tileSize + tileSize / 2;
    const floorY = Math.max(0, tile.floor || 0) * heightStep;
    mesh.position.set(x, floorY, z);
    group.add(mesh);
    drones.push({
      id: nextId,
      x,
      z,
      yaw: 0,
      hp: DRONE_MAX_HP,
      repath: (nextId % 5) * 0.08,
      goal: null,
      contact: 0,
      mesh
    });
    nextId += 1;
  }
  scene.add(group);

  function living() {
    return drones.filter((drone) => drone.hp > 0);
  }

  function occupies(tileX, tileZ, exceptId = null) {
    return living().some((drone) => drone.id !== exceptId && circleHitsCell(drone.x, drone.z, DRONE_RADIUS, tileX, tileZ, tileSize));
  }

  function pointBlocked(x, z, self, isTileBlocked) {
    const minX = Math.floor((x - DRONE_RADIUS) / tileSize);
    const maxX = Math.floor((x + DRONE_RADIUS) / tileSize);
    const minZ = Math.floor((z - DRONE_RADIUS) / tileSize);
    const maxZ = Math.floor((z + DRONE_RADIUS) / tileSize);
    for (let tileZ = minZ; tileZ <= maxZ; tileZ += 1) {
      for (let tileX = minX; tileX <= maxX; tileX += 1) {
        if (!circleHitsCell(x, z, DRONE_RADIUS, tileX, tileZ, tileSize)) continue;
        if (isTileBlocked(tileX, tileZ, self.id)) return true;
      }
    }
    return false;
  }

  function getTargets() {
    return living().map((drone) => ({
      kind: 'drone',
      id: drone.id,
      x: Math.floor(drone.x / tileSize),
      z: Math.floor(drone.z / tileSize),
      worldX: drone.x,
      worldZ: drone.z
    }));
  }

  function applyHit(target, damage = 1) {
    const drone = living().find((entry) => entry.id === target.id || (entry.x === target.worldX && entry.z === target.worldZ));
    const match = drone || living().find((entry) => Math.floor(entry.x / tileSize) === target.x && Math.floor(entry.z / tileSize) === target.z);
    if (!match) return false;
    match.hp = Math.max(0, match.hp - damage);
    paintHealth(match.mesh.userData.fill, match.hp, DRONE_MAX_HP);
    api.onHit?.(match);
    if (match.hp > 0) return false;
    group.remove(match.mesh);
    disposeDrone(match.mesh);
    return true;
  }

  function update(delta, context) {
    const player = context.playerPosition;
    const blocked = context.isTileBlocked || (() => true);
    for (const drone of living()) {
      drone.contact = Math.max(0, drone.contact - delta);
      drone.mesh.userData.bar.getWorldPosition(barAnchor);
      const camX = context.camera.position.x - barAnchor.x;
      const camZ = context.camera.position.z - barAnchor.z;
      drone.mesh.userData.bar.rotation.y = Math.atan2(camX, camZ) - drone.yaw;
      if (!context.alive || !player) continue;
      if (context.stunned?.(drone.x, drone.z)) {
        drone.mesh.rotation.y = drone.yaw + Math.sin(performance.now() / 35) * 0.08;
        continue;
      }

      drone.repath -= delta;
      const cellX = Math.floor(drone.x / tileSize);
      const cellZ = Math.floor(drone.z / tileSize);
      if (drone.repath <= 0 || !drone.goal) {
        drone.repath = 0.45;
        const goalX = Math.floor(player.x / tileSize);
        const goalZ = Math.floor(player.z / tileSize);
        drone.goal = nextDroneCell(cellX, cellZ, goalX, goalZ, (x, z) => blocked(x, z, drone.id));
      }
      if (!drone.goal) continue;
      const targetX = drone.goal.x * tileSize + tileSize / 2;
      const targetZ = drone.goal.z * tileSize + tileSize / 2;
      const moved = droneStep(drone.x, drone.z, targetX, targetZ, DRONE_SPEED * delta);
      const reach = DRONE_RADIUS + (context.playerRadius || 0.42);
      const nextDist = Math.hypot(moved.x - player.x, moved.z - player.z);
      if (nextDist <= reach) {
        drone.yaw = moved.yaw;
        drone.mesh.rotation.y = drone.yaw;
        if (drone.contact <= 0) {
          drone.contact = context.contactSeconds || 0.75;
          context.onContact?.();
        }
        continue;
      }
      if (pointBlocked(moved.x, moved.z, drone, blocked)) {
        drone.goal = null;
        continue;
      }
      drone.x = moved.x;
      drone.z = moved.z;
      drone.yaw = moved.yaw;
      drone.mesh.position.x = drone.x;
      drone.mesh.position.z = drone.z;
      drone.mesh.rotation.y = drone.yaw;
      if (Math.hypot(drone.x - targetX, drone.z - targetZ) < 0.04) drone.goal = null;
    }
  }

  function spawn(cellX, cellZ) {
    const tile = level.tiles?.[cellZ]?.[cellX];
    if (!tile || (tile.floor || 0) > 0) return false;
    if (occupies(cellX, cellZ)) return false;
    const mesh = createDroneMesh();
    const x = cellX * tileSize + tileSize / 2;
    const z = cellZ * tileSize + tileSize / 2;
    mesh.position.set(x, Math.max(0, tile.floor || 0) * heightStep, z);
    group.add(mesh);
    drones.push({
      id: nextId,
      x,
      z,
      yaw: 0,
      hp: DRONE_MAX_HP,
      repath: 0,
      goal: null,
      contact: 0,
      mesh
    });
    nextId += 1;
    return true;
  }

  const api = { group, update, applyHit, getTargets, occupies, living, spawn, onHit: null };
  return api;
}

const barAnchor = new THREE.Vector3();
