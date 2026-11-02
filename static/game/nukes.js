import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { NUKE_EXPAND_SECONDS, NUKE_RADIUS_CELLS } from './config.js';

const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1917, metalness: 0.62, roughness: 0.38 });
const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, roughness: 0.42 });
const finMaterial = new THREE.MeshStandardMaterial({ color: 0x44403c, metalness: 0.4, roughness: 0.55 });
const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0x450a0a, roughness: 0.4 });

export function createNukeMesh() {
  const bomb = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), bodyMaterial);
  body.scale.set(1, 1, 1.35);
  body.position.set(0, 0.22, 0);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 14), noseMaterial);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.22, 0.28);

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 18), bandMaterial);
  band.rotation.y = Math.PI / 2;
  band.position.set(0, 0.22, -0.02);

  const fins = [
    [0.12, 0.22, -0.16],
    [-0.12, 0.22, -0.16],
    [0, 0.34, -0.16],
    [0, 0.1, -0.16]
  ].map(([x, y, z], index) => {
    const wide = index < 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(wide ? 0.16 : 0.03, wide ? 0.03 : 0.16, 0.16), finMaterial);
    fin.position.set(x, y, z);
    return fin;
  });

  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfecaca, emissive: 0xef4444, emissiveIntensity: 1.4 })
  );
  light.position.set(0, 0.22, 0.36);
  bomb.userData.blink = light;

  bomb.add(body, nose, band, light, ...fins);
  bomb.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return bomb;
}

function tileKey(x, z) {
  return `${x},${z}`;
}

export function createNukeController(level, tileSize, heightStep) {
  const items = Array.isArray(level.nukes) ? level.nukes : [];
  const group = new THREE.Group();
  const bombs = new Map();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) > 0) continue;
    const mesh = createNukeMesh();
    const baseY = Math.max(0, tile.floor || 0) * heightStep + 0.04;
    mesh.position.set(item.x * tileSize + tileSize / 2, baseY, item.z * tileSize + tileSize / 2);
    mesh.userData.baseY = baseY;
    group.add(mesh);
    bombs.set(tileKey(item.x, item.z), { x: item.x, z: item.z, mesh });
  }

  function update(delta) {
    elapsed += delta;
    for (const bomb of bombs.values()) {
      bomb.mesh.position.y = bomb.mesh.userData.baseY + Math.sin(elapsed * 3 + bomb.x + bomb.z) * 0.08;
      bomb.mesh.rotation.y = elapsed * 0.8;
      const blink = bomb.mesh.userData.blink;
      if (blink) blink.material.emissiveIntensity = 0.4 + (Math.sin(elapsed * 8) + 1) * 0.9;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const bomb = bombs.get(tileKey(x, z));
    if (!bomb) return false;
    group.remove(bomb.mesh);
    bomb.mesh.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      if (obj === bomb.mesh.userData.blink) obj.material?.dispose();
    });
    bombs.delete(tileKey(x, z));
    level.nukes = (level.nukes || []).filter((item) => !(item.x === x && item.z === z));
    return true;
  }

  return { group, update, collectAtPosition };
}

export function cellDistance(originX, originZ, item, tileSize) {
  const cx = item.x * tileSize + tileSize / 2;
  const cz = item.z * tileSize + tileSize / 2;
  return Math.hypot(cx - originX, cz - originZ);
}

export function createBlastController(scene) {
  const waves = [];

  function disposeWave(wave) {
    scene.remove(wave.group);
    wave.group.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
  }

  function makeRing(color, opacity) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function detonate(origin, targets, onReach, options = {}) {
    const group = new THREE.Group();
    group.position.set(origin.x, origin.y, origin.z);
    const ring = makeRing(0xfde68a, 0.9);
    const outer = makeRing(0xfb923c, 0.45);
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
      })
    );
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0xfff7ed,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      })
    );
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.9, 1, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    group.add(ring, outer, fireball, core, column);
    scene.add(group);
    waves.push({
      group,
      ring,
      outer,
      fireball,
      core,
      column,
      age: 0,
      maxRadius: options.radiusCells ?? NUKE_RADIUS_CELLS,
      expandSeconds: options.expandSeconds ?? NUKE_EXPAND_SECONDS,
      visualScale: options.visualScale ?? 1,
      targets: targets.map((target) => ({ ...target, done: false })),
      onReach
    });
  }

  function update(delta, tileSize = 1) {
    for (let index = waves.length - 1; index >= 0; index--) {
      const wave = waves[index];
      wave.age += delta;
      const span = wave.expandSeconds;
      const grow = Math.min(1, wave.age / span);
      const radius = Math.max(0.15, grow * wave.maxRadius * tileSize);
      wave.ring.scale.set(radius, radius, radius);
      wave.ring.material.opacity = 0.9 * (1 - grow);
      wave.outer.scale.set(radius * 1.08, radius * 1.08, radius * 1.08);
      wave.outer.material.opacity = 0.4 * (1 - grow);
      const ball = 0.35 + radius * 0.28;
      wave.fireball.scale.setScalar(ball);
      wave.fireball.position.y = ball * 0.55;
      wave.fireball.material.opacity = 0.78 * (1 - grow * grow);
      const coreScale = 0.25 + radius * 0.08;
      wave.core.scale.setScalar(coreScale);
      wave.core.position.y = coreScale * 0.7;
      wave.core.material.opacity = Math.max(0, 0.95 - wave.age * 2.4);
      const columnHeight = (1.2 + grow * 7.5) * wave.visualScale;
      const columnWidth = 1 + grow * 2.2 * Math.max(wave.visualScale, 0.35);
      wave.column.scale.set(columnWidth, columnHeight, columnWidth);
      wave.column.position.y = columnHeight / 2;
      wave.column.material.opacity = 0.42 * (1 - grow);

      for (const target of wave.targets) {
        if (target.done || target.dist > radius + 1e-3) continue;
        target.done = true;
        wave.onReach(target);
      }

      if (wave.age < span + 0.45) continue;
      disposeWave(wave);
      waves.splice(index, 1);
    }
  }

  return { detonate, update, active: () => waves.length > 0 };
}
