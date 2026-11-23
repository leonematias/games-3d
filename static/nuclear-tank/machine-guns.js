import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.4 });
const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.75, roughness: 0.28 });
const magazineMaterial = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.45, roughness: 0.42 });
const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });

export function createMachineGunMesh() {
  const gun = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.42), bodyMaterial);
  body.position.set(0, 0.22, 0.02);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.64, 12), barrelMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.26, 0.5);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.24), bodyMaterial);
  stock.position.set(0, 0.2, -0.28);

  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.12), magazineMaterial);
  magazine.position.set(0, 0.1, 0.04);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.08), gripMaterial);
  grip.position.set(0, 0.12, -0.1);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.12), barrelMaterial);
  sight.position.set(0, 0.34, 0.12);

  gun.add(body, barrel, stock, magazine, grip, sight);
  gun.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return gun;
}

function tileKey(x, z) {
  return `${x},${z}`;
}

export function createMachineGunController(level, tileSize, heightStep) {
  const items = Array.isArray(level.machineGuns) ? level.machineGuns : [];
  const group = new THREE.Group();
  const guns = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createMachineGunMesh();
    const baseY = Math.max(0, tile.floor || 0) * heightStep + 0.08;
    mesh.position.set(item.x * tileSize + tileSize / 2, baseY, item.z * tileSize + tileSize / 2);
    mesh.userData.baseY = baseY;
    group.add(mesh);
    guns.set(tileKey(item.x, item.z), { x: item.x, z: item.z, mesh });
  }

  function update(delta) {
    elapsed += delta;
    for (const gun of guns.values()) {
      gun.mesh.position.y = gun.mesh.userData.baseY + Math.sin(elapsed * 3 + gun.x + gun.z) * 0.08;
      gun.mesh.rotation.y = elapsed * 0.8;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const gun = guns.get(tileKey(x, z));
    if (!gun) return false;
    group.remove(gun.mesh);
    gun.mesh.traverse((obj) => {
      if (obj.isMesh) obj.geometry?.dispose();
    });
    guns.delete(tileKey(x, z));
    level.machineGuns = (level.machineGuns || []).filter((item) => !(item.x === x && item.z === z));
    return true;
  }

  return { group, update, collectAtPosition };
}
