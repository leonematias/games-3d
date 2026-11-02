import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { GRENADE_RANGE_CELLS } from './config.js';
import { grenadeArcHeight, grenadeArcPoint, grenadeFlightSeconds, grenadeLandingPoint } from './grenade-flight.js';

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6212, metalness: 0.35, roughness: 0.48 });
const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x14532d, metalness: 0.4, roughness: 0.42 });
const roundMaterial = new THREE.MeshStandardMaterial({ color: 0x365314, metalness: 0.25, roughness: 0.5 });
const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, roughness: 0.4 });

export function createGrenadePickupMesh() {
  const gun = new THREE.Group();
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), bodyMaterial);
  stock.position.set(0, 0.2, -0.12);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.62, 14), barrelMaterial);
  tube.rotation.x = Math.PI / 2 - 0.35;
  tube.position.set(0, 0.32, 0.22);
  const round = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), roundMaterial);
  round.position.set(0, 0.46, 0.48);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 16), bandMaterial);
  band.rotation.y = Math.PI / 2;
  band.position.set(0, 0.46, 0.48);
  gun.add(stock, tube, round, band);
  gun.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return gun;
}

function createGrenadeRound() {
  const round = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), roundMaterial);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 18), bandMaterial);
  band.rotation.y = Math.PI / 2;
  round.add(shell, band);
  round.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return round;
}

function tileKey(x, z) {
  return `${x},${z}`;
}

function disposeGeometry(mesh) {
  mesh.traverse((obj) => {
    if (obj.isMesh) obj.geometry?.dispose();
  });
}

export function createGrenadeController(level, tileSize, heightStep) {
  const items = Array.isArray(level.grenades) ? level.grenades : [];
  const group = new THREE.Group();
  const guns = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createGrenadePickupMesh();
    const baseY = Math.max(0, tile.floor || 0) * heightStep + 0.02;
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
    disposeGeometry(gun.mesh);
    guns.delete(tileKey(x, z));
    level.grenades = (level.grenades || []).filter((item) => !(item.x === x && item.z === z));
    return true;
  }

  return { group, update, collectAtPosition };
}

export function createGrenadeFlight(scene, level, tileSize, heightStep) {
  const shots = [];
  const aim = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.42, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  aim.rotation.x = -Math.PI / 2;
  aim.visible = false;
  scene.add(aim);

  function showAim(playerX, playerY, playerZ, yaw, rangeCells) {
    const landing = grenadeLandingPoint(playerX, playerY, playerZ, yaw, level, tileSize, heightStep, rangeCells);
    aim.position.set(landing.x, Math.max(0.08, landing.y - 0.32), landing.z);
    aim.visible = true;
  }

  function hideAim() {
    aim.visible = false;
  }

  function launch(start, playerX, playerY, playerZ, yaw, rangeCells = GRENADE_RANGE_CELLS) {
    hideAim();
    const landing = grenadeLandingPoint(playerX, playerY, playerZ, yaw, level, tileSize, heightStep, rangeCells);
    const mesh = createGrenadeRound();
    mesh.position.set(start.x, start.y, start.z);
    scene.add(mesh);
    shots.push({
      mesh,
      age: 0,
      duration: grenadeFlightSeconds(rangeCells),
      arc: grenadeArcHeight(rangeCells),
      start: { x: start.x, y: start.y, z: start.z },
      landing
    });
  }

  function update(delta, onLand) {
    for (let index = shots.length - 1; index >= 0; index--) {
      const shot = shots[index];
      shot.age += delta;
      const u = Math.min(1, shot.age / shot.duration);
      const point = grenadeArcPoint(shot.start, shot.landing, u, shot.arc);
      shot.mesh.position.set(point.x, point.y, point.z);
      shot.mesh.rotation.x += delta * 7;
      shot.mesh.rotation.z += delta * 5;
      if (u < 1) continue;
      scene.remove(shot.mesh);
      disposeGeometry(shot.mesh);
      shots.splice(index, 1);
      onLand?.(shot.landing);
    }
  }

  return { launch, update, showAim, hideAim, active: () => shots.length };
}
