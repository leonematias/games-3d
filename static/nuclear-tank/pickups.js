import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Generic floor pickup: a list of {x, z} cells, a bobbing mesh per cell, collected by driving over it.
export function createPickupController(level, listName, tileSize, heightStep, makeMesh, lift = 0.04) {
  const items = Array.isArray(level[listName]) ? level[listName] : [];
  const group = new THREE.Group();
  const entries = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = makeMesh();
    const baseY = Math.max(0, tile.floor || 0) * heightStep + lift;
    mesh.position.set(item.x * tileSize + tileSize / 2, baseY, item.z * tileSize + tileSize / 2);
    mesh.userData.baseY = baseY;
    group.add(mesh);
    entries.set(`${item.x},${item.z}`, { x: item.x, z: item.z, mesh });
  }

  function update(delta) {
    elapsed += delta;
    for (const entry of entries.values()) {
      entry.mesh.position.y = entry.mesh.userData.baseY + Math.sin(elapsed * 3 + entry.x + entry.z) * 0.08;
      entry.mesh.rotation.y = elapsed * 0.8;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const entry = entries.get(`${x},${z}`);
    if (!entry) return false;
    group.remove(entry.mesh);
    entry.mesh.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose();
    });
    entries.delete(`${x},${z}`);
    level[listName] = (level[listName] || []).filter((item) => !(item.x === x && item.z === z));
    return true;
  }

  return { group, update, collectAtPosition, remaining: () => [...entries.values()].map(({ x, z }) => ({ x, z })) };
}

const projectorBase = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.6 });
const projectorDish = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x0ea5e9, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
const empCoil = new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0x7c3aed, emissiveIntensity: 1, roughness: 0.3, metalness: 0.5 });
const empCore = new THREE.MeshStandardMaterial({ color: 0x312e81, roughness: 0.4, metalness: 0.6 });

export function createShieldProjectorMesh() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 10), projectorBase);
  post.position.y = 0.15;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.12, 0.1, 20), projectorDish);
  dish.position.y = 0.36;
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, depthWrite: false })
  );
  bubble.position.y = 0.5;
  group.add(post, dish, bubble);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}

export function createEmpMesh() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), empCore);
  core.position.y = 0.3;
  group.add(core);
  for (let index = 0; index < 4; index++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 18), empCoil);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14 + index * 0.1;
    group.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), empCoil);
  tip.position.y = 0.56;
  group.add(tip);
  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return group;
}
