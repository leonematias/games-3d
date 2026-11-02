import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

const discMaterial = new THREE.MeshStandardMaterial({ color: 0x052e16, roughness: 0.55, metalness: 0.15 });
const crossMaterial = new THREE.MeshStandardMaterial({
  color: 0x4ade80,
  emissive: 0x166534,
  emissiveIntensity: 0.7,
  roughness: 0.35
});

export function createLifeMesh() {
  const kit = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 22), discMaterial);
  disc.position.y = 0.28;
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.08), crossMaterial);
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08), crossMaterial);
  vertical.position.y = 0.36;
  horizontal.position.y = 0.36;
  kit.add(disc, vertical, horizontal);
  kit.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return kit;
}

function tileKey(x, z) {
  return `${x},${z}`;
}

function disposeMesh(mesh) {
  mesh.traverse((obj) => {
    if (obj.isMesh) obj.geometry?.dispose();
  });
}

export function createLifeController(level, tileSize, heightStep) {
  const items = Array.isArray(level.lives) ? level.lives : [];
  const group = new THREE.Group();
  const kits = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createLifeMesh();
    const baseY = Math.max(0, tile.floor || 0) * heightStep;
    mesh.position.set(item.x * tileSize + tileSize / 2, baseY, item.z * tileSize + tileSize / 2);
    mesh.userData.baseY = baseY;
    group.add(mesh);
    kits.set(tileKey(item.x, item.z), { x: item.x, z: item.z, mesh });
  }

  function update(delta) {
    elapsed += delta;
    for (const kit of kits.values()) {
      kit.mesh.position.y = kit.mesh.userData.baseY + Math.sin(elapsed * 3 + kit.x + kit.z) * 0.08;
      kit.mesh.rotation.y = elapsed * 0.8;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const kit = kits.get(tileKey(x, z));
    if (!kit) return false;
    group.remove(kit.mesh);
    disposeMesh(kit.mesh);
    kits.delete(tileKey(x, z));
    level.lives = (level.lives || []).filter((item) => !(item.x === x && item.z === z));
    return true;
  }

  return { group, update, collectAtPosition };
}
