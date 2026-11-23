import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { CONVEYOR_SPEED, SWITCH_COOLDOWN_SECONDS } from './config.js';
import { planarForward } from './facing.js';
import { laserYaw } from './laser-logic.js';
import { LOCK_SWATCH, lockColor } from './lock-colors.js';

export const DIR_STEPS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

function tileKey(x, z) {
  return `${x},${z}`;
}

export function groupId(item) {
  const text = typeof item?.id === 'string' ? item.id.trim() : '';
  if (!text) return '1';
  const lower = text.toLowerCase();
  if (lower === 'red' || lower === 'blue' || lower === 'yellow') return lower;
  return text;
}

function colorHexFor(id) {
  return parseInt(LOCK_SWATCH[lockColor(id)].slice(1), 16);
}

function floorY(level, x, z, heightStep) {
  const tile = level.tiles[z]?.[x];
  return Math.max(0, tile?.floor || 0) * heightStep;
}

function makeCanvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ---------------------------------------------------------------- switches and toggle walls
export function createSwitchMesh(id) {
  const color = colorHexFor(id);
  const group = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.07, 0.78),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.6 })
  );
  plate.position.y = 0.035;
  plate.receiveShadow = true;
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.08, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 })
  );
  lamp.position.y = 0.1;
  group.add(plate, lamp);
  group.userData.lamp = lamp;
  return group;
}

export function createToggleWallMesh(id, wallTex, getMaterial) {
  const color = colorHexFor(id);
  const group = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }));
  block.position.y = 0.5;
  block.castShadow = true;
  block.receiveShadow = true;
  if (getMaterial) {
    getMaterial(wallTex, 'wall').then((material) => {
      block.material = material;
    });
  }
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.12, 1.02),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 })
  );
  band.position.y = 0.88;
  group.add(block, band);
  return group;
}

export function createSwitchController(level, tileSize, heightStep, options = {}) {
  const group = new THREE.Group();
  const switches = [];
  const walls = [];
  const state = new Map();
  let elapsed = 0;

  for (const item of Array.isArray(level.switches) ? level.switches : []) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const id = groupId(item);
    const mesh = createSwitchMesh(id);
    mesh.position.set(item.x * tileSize + tileSize / 2, floorY(level, item.x, item.z, heightStep), item.z * tileSize + tileSize / 2);
    group.add(mesh);
    switches.push({ x: item.x, z: item.z, id, mesh, cooldown: 0, occupied: false });
    if (!state.has(id)) state.set(id, false);
  }
  for (const item of Array.isArray(level.toggleWalls) ? level.toggleWalls : []) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const id = groupId(item);
    const mesh = createToggleWallMesh(id, tile.wallTex, options.getMaterial);
    const baseY = floorY(level, item.x, item.z, heightStep);
    mesh.position.set(item.x * tileSize + tileSize / 2, baseY, item.z * tileSize + tileSize / 2);
    group.add(mesh);
    walls.push({ x: item.x, z: item.z, id, mesh, baseY, startsOpen: Boolean(item.open), progress: item.open ? 1 : 0 });
    if (!state.has(id)) state.set(id, false);
  }

  function isOn(id) {
    return Boolean(state.get(id));
  }

  function wallOpen(wall) {
    if (options.isForcedOpen?.(wall.x, wall.z)) return true;
    return wall.startsOpen !== isOn(wall.id);
  }

  function blocks(tileX, tileZ) {
    return walls.some((wall) => wall.x === tileX && wall.z === tileZ && !wallOpen(wall));
  }

  function toggle(id) {
    state.set(id, !isOn(id));
    options.onToggle?.(id, isOn(id));
  }

  function update(delta, playerPosition) {
    elapsed += delta;
    const px = Math.floor(playerPosition.x / tileSize);
    const pz = Math.floor(playerPosition.z / tileSize);
    for (const sw of switches) {
      sw.cooldown = Math.max(0, sw.cooldown - delta);
      const here = sw.x === px && sw.z === pz;
      if (here && !sw.occupied && sw.cooldown <= 0) {
        toggle(sw.id);
        sw.cooldown = SWITCH_COOLDOWN_SECONDS;
        options.onPress?.(sw);
      }
      sw.occupied = here;
      const lamp = sw.mesh.userData.lamp;
      lamp.material.emissiveIntensity = isOn(sw.id) ? 1.6 + Math.sin(elapsed * 8) * 0.3 : 0.35;
      lamp.position.y = isOn(sw.id) ? 0.06 : 0.1;
    }
    for (const wall of walls) {
      const target = wallOpen(wall) ? 1 : 0;
      wall.progress += Math.sign(target - wall.progress) * Math.min(Math.abs(target - wall.progress), delta * 2.2);
      wall.mesh.position.y = wall.baseY - wall.progress * 1.02;
      wall.mesh.visible = wall.progress < 0.995;
    }
  }

  return {
    group,
    update,
    blocks,
    isOn,
    toggle,
    blockingCells: () => walls.filter((wall) => !wallOpen(wall)).map((wall) => ({ x: wall.x, z: wall.z })),
    switches: () => switches.map((sw) => ({ x: sw.x, z: sw.z, id: sw.id, on: isOn(sw.id) })),
    walls: () => walls.map((wall) => ({ x: wall.x, z: wall.z, id: wall.id, open: wallOpen(wall) }))
  };
}

// ---------------------------------------------------------------- one-way doors and conveyors
function arrowTexture(color, stripes) {
  return makeCanvasTexture((ctx) => {
    ctx.fillStyle = stripes ? '#0f172a' : 'rgba(15, 23, 42, 0.0)';
    ctx.fillRect(0, 0, 128, 128);
    if (stripes) {
      ctx.fillStyle = '#1e293b';
      for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 128, 16);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(64, 10);
    ctx.lineTo(112, 64);
    ctx.lineTo(80, 64);
    ctx.lineTo(80, 118);
    ctx.lineTo(48, 118);
    ctx.lineTo(48, 64);
    ctx.lineTo(16, 64);
    ctx.closePath();
    ctx.fill();
  });
}

let oneWayTexture = null;
let conveyorTexture = null;

export function createOneWayMesh(dir, tileSize = 1) {
  if (!oneWayTexture) oneWayTexture = arrowTexture('#fbbf24', false);
  const group = new THREE.Group();
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(tileSize * 0.9, tileSize * 0.9),
    new THREE.MeshBasicMaterial({ map: oneWayTexture, transparent: true, depthWrite: false })
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.02;
  // The canvas arrow points up the texture (toward -z after the plane rotation); turn it to dir.
  decal.rotation.z = laserYaw(dir) + Math.PI;
  group.add(decal);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x92400e, emissiveIntensity: 0.4, roughness: 0.5 });
  const forward = planarForward(laserYaw(dir));
  const side = { x: forward.z, z: -forward.x };
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), postMaterial);
    post.position.set(side.x * sign * 0.42, 0.25, side.z * sign * 0.42);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

export function createConveyorMesh(dir, tileSize = 1) {
  if (!conveyorTexture) conveyorTexture = arrowTexture('#22d3ee', true);
  const belt = new THREE.Mesh(
    new THREE.PlaneGeometry(tileSize * 0.96, tileSize * 0.96),
    new THREE.MeshBasicMaterial({ map: conveyorTexture.clone(), transparent: true })
  );
  belt.material.map.needsUpdate = true;
  belt.rotation.x = -Math.PI / 2;
  belt.position.y = 0.015;
  belt.rotation.z = laserYaw(dir) + Math.PI;
  return belt;
}

export function createFloorPieceController(level, tileSize, heightStep) {
  const group = new THREE.Group();
  const oneWays = new Map();
  const conveyors = new Map();
  let elapsed = 0;

  for (const item of Array.isArray(level.oneWays) ? level.oneWays : []) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z) || !Number.isInteger(item?.dir)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createOneWayMesh(item.dir, tileSize);
    mesh.position.set(item.x * tileSize + tileSize / 2, floorY(level, item.x, item.z, heightStep), item.z * tileSize + tileSize / 2);
    group.add(mesh);
    oneWays.set(tileKey(item.x, item.z), { x: item.x, z: item.z, dir: item.dir });
  }
  for (const item of Array.isArray(level.conveyors) ? level.conveyors : []) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z) || !Number.isInteger(item?.dir)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createConveyorMesh(item.dir, tileSize);
    mesh.position.set(item.x * tileSize + tileSize / 2, floorY(level, item.x, item.z, heightStep), item.z * tileSize + tileSize / 2);
    group.add(mesh);
    conveyors.set(tileKey(item.x, item.z), { x: item.x, z: item.z, dir: item.dir, mesh });
  }

  // Moving from cell (fromX,fromZ) into (toX,toZ) is refused when either is a one-way facing against the step.
  function stepBlocked(fromX, fromZ, toX, toZ) {
    if (fromX === toX && fromZ === toZ) return false;
    const stepX = Math.sign(toX - fromX);
    const stepZ = Math.sign(toZ - fromZ);
    for (const cell of [oneWays.get(tileKey(toX, toZ)), oneWays.get(tileKey(fromX, fromZ))]) {
      if (!cell) continue;
      const [dx, dz] = DIR_STEPS[cell.dir];
      if (dx * stepX + dz * stepZ < 0) return true;
    }
    return false;
  }

  function conveyorPush(x, z) {
    const cell = conveyors.get(tileKey(Math.floor(x / tileSize), Math.floor(z / tileSize)));
    if (!cell) return null;
    const [dx, dz] = DIR_STEPS[cell.dir];
    return { x: dx * CONVEYOR_SPEED, z: dz * CONVEYOR_SPEED };
  }

  function update(delta) {
    elapsed += delta;
    for (const cell of conveyors.values()) {
      cell.mesh.material.map.offset.y = -(elapsed * 1.2) % 1;
    }
  }

  return { group, update, stepBlocked, conveyorPush, oneWays: () => [...oneWays.values()], conveyors: () => [...conveyors.values()].map(({ x, z, dir }) => ({ x, z, dir })) };
}

// ---------------------------------------------------------------- cracked walls
let crackedTexture = null;

function crackedWallTexture() {
  if (crackedTexture) return crackedTexture;
  crackedTexture = makeCanvasTexture((ctx) => {
    ctx.fillStyle = '#57534e';
    ctx.fillRect(0, 0, 128, 128);
    for (let index = 0; index < 180; index++) {
      ctx.fillStyle = index % 2 ? 'rgba(120, 113, 108, 0.6)' : 'rgba(41, 37, 36, 0.5)';
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 6, 3 + Math.random() * 6);
    }
    ctx.strokeStyle = '#0c0a09';
    ctx.lineWidth = 3;
    const cracks = [[[10, 20], [40, 50], [36, 80], [60, 118]], [[118, 10], [84, 46], [96, 70], [70, 90]], [[40, 50], [70, 44], [92, 70]]];
    for (const crack of cracks) {
      ctx.beginPath();
      ctx.moveTo(crack[0][0], crack[0][1]);
      for (const [x, y] of crack.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, 124, 124);
  });
  return crackedTexture;
}

export function createCrackedWallMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ map: crackedWallTexture(), roughness: 0.9 })
  );
  mesh.position.y = 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCrackedWallController(level, tileSize, heightStep) {
  const group = new THREE.Group();
  const walls = new Map();
  for (const item of Array.isArray(level.crackedWalls) ? level.crackedWalls : []) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createCrackedWallMesh();
    mesh.position.set(item.x * tileSize + tileSize / 2, floorY(level, item.x, item.z, heightStep) + 0.5, item.z * tileSize + tileSize / 2);
    group.add(mesh);
    walls.set(tileKey(item.x, item.z), { x: item.x, z: item.z, mesh });
  }

  function blocks(tileX, tileZ) {
    return walls.has(tileKey(tileX, tileZ));
  }

  function destroy(tileX, tileZ) {
    const wall = walls.get(tileKey(tileX, tileZ));
    if (!wall) return false;
    group.remove(wall.mesh);
    wall.mesh.geometry.dispose();
    walls.delete(tileKey(tileX, tileZ));
    level.crackedWalls = (level.crackedWalls || []).filter((item) => !(item.x === tileX && item.z === tileZ));
    return true;
  }

  return { group, blocks, destroy, cells: () => [...walls.values()].map(({ x, z }) => ({ x, z })) };
}
