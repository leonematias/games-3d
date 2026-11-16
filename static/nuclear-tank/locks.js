import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { isColorKey, LOCK_SWATCH, lockColor } from './lock-colors.js';

const COLOR_SPEC = {
  red: { color: 0xef4444, emissive: 0x7f1d1d },
  blue: { color: 0x38bdf8, emissive: 0x0c4a6e },
  yellow: { color: 0xfacc15, emissive: 0x854d0e }
};
const lockMaterials = new Map();
const badgeMaterials = new Map();

function materialFor(id) {
  const name = lockColor(id);
  if (lockMaterials.has(name)) return lockMaterials.get(name);
  const spec = COLOR_SPEC[name];
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.emissive,
    emissiveIntensity: 0.42,
    metalness: 0.62,
    roughness: 0.32
  });
  material.userData.shared = true;
  lockMaterials.set(name, material);
  return material;
}

function badgeFor(id) {
  const label = String(id).slice(0, 3);
  if (badgeMaterials.has(label)) return badgeMaterials.get(label);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = LOCK_SWATCH[lockColor(id)];
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 70);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
  material.userData.shared = true;
  badgeMaterials.set(label, material);
  return material;
}

function addLegacyBadge(group, id, y) {
  if (isColorKey(id)) return;
  const badge = new THREE.Sprite(badgeFor(id));
  badge.position.y = y;
  badge.scale.set(0.42, 0.42, 1);
  badge.userData.shared = true;
  group.add(badge);
}

export function gateId(item) {
  const text = typeof item?.id === 'string' ? item.id.trim() : '';
  if (!text) return '1';
  const lower = text.toLowerCase();
  if (lower === 'red' || lower === 'blue' || lower === 'yellow') return lower;
  return text;
}

export function createKeyMesh(id = 'red') {
  const material = materialFor(id);
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.32;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), material);
  shaft.position.set(0, 0.32, 0.2);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), material);
  tooth.position.set(0.04, 0.32, 0.3);
  group.add(ring, shaft, tooth);
  addLegacyBadge(group, gateId({ id }), 0.72);
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.userData.shared = true;
    }
  });
  return group;
}

// A crossed cage: three bars along x and three along z share the centre post, with a crossed
// top rail, so the gate looks right whether the wall it plugs runs along x or along z.
export function createGateMesh(id = 'red') {
  const material = materialFor(id);
  const group = new THREE.Group();
  const spots = [[-0.28, 0], [0.28, 0], [0, -0.28], [0, 0.28], [0, 0]];
  for (const [x, z] of spots) {
    const centre = x === 0 && z === 0;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(centre ? 0.1 : 0.07, centre ? 1.32 : 1.25, centre ? 0.1 : 0.07), material);
    bar.position.set(x, centre ? 0.66 : 0.62, z);
    bar.castShadow = true;
    bar.userData.shared = true;
    group.add(bar);
  }
  for (const alongX of [true, false]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.72 : 0.08, 0.08, alongX ? 0.08 : 0.72), material);
    rail.position.y = 1.22;
    rail.castShadow = true;
    rail.userData.shared = true;
    group.add(rail);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 16), material);
  base.position.y = 0.04;
  base.castShadow = true;
  base.userData.shared = true;
  group.add(base);
  addLegacyBadge(group, gateId({ id }), 1.55);
  return group;
}

function tileKey(x, z) {
  return `${x},${z}`;
}

function placeOnFloor(mesh, item, level, tileSize, heightStep, lift) {
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile || (tile.floor || 0) > 0) return false;
  const floorY = Math.max(0, tile.floor || 0) * heightStep;
  mesh.position.set(item.x * tileSize + tileSize / 2, floorY + lift, item.z * tileSize + tileSize / 2);
  return true;
}

export function createKeyController(level, tileSize, heightStep) {
  const items = Array.isArray(level.keys) ? level.keys : [];
  const group = new THREE.Group();
  const keys = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const mesh = createKeyMesh(gateId(item));
    if (!placeOnFloor(mesh, item, level, tileSize, heightStep, 0)) continue;
    mesh.userData.baseY = mesh.position.y;
    group.add(mesh);
    keys.set(tileKey(item.x, item.z), { ...item, id: gateId(item), mesh });
  }

  function update(delta) {
    elapsed += delta;
    for (const key of keys.values()) {
      key.mesh.position.y = key.mesh.userData.baseY + Math.sin(elapsed * 3 + key.x) * 0.06;
      key.mesh.rotation.y = elapsed * 0.8;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const id = tileKey(x, z);
    const key = keys.get(id);
    if (!key) return null;
    group.remove(key.mesh);
    keys.delete(id);
    level.keys = (level.keys || []).filter((item) => item.x !== x || item.z !== z);
    return { id: key.id, x, z };
  }

  return { group, update, collectAtPosition };
}

export function createGateController(level, tileSize, heightStep) {
  const items = Array.isArray(level.gates) ? level.gates : [];
  const group = new THREE.Group();
  const gates = [];

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const mesh = createGateMesh(gateId(item));
    if (!placeOnFloor(mesh, item, level, tileSize, heightStep, 0)) continue;
    group.add(mesh);
    gates.push({ x: item.x, z: item.z, id: gateId(item), mesh });
  }

  function blocks(tileX, tileZ) {
    return gates.some((gate) => gate.x === tileX && gate.z === tileZ);
  }

  function open(id) {
    const matching = gates.filter((gate) => gate.id === id);
    if (!matching.length) return false;
    for (const gate of matching) {
      group.remove(gate.mesh);
      gate.mesh.traverse((obj) => {
        if (obj.isMesh) obj.geometry?.dispose();
      });
    }
    const openIds = new Set(matching.map((gate) => tileKey(gate.x, gate.z)));
    for (let i = gates.length - 1; i >= 0; i -= 1) {
      if (openIds.has(tileKey(gates[i].x, gates[i].z))) gates.splice(i, 1);
    }
    level.gates = (level.gates || []).filter((item) => !openIds.has(tileKey(item.x, item.z)));
    return true;
  }

  return { group, blocks, open, gates };
}