import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { LASER_BEAM_RADIUS, LASER_OFF_SECONDS, LASER_ON_SECONDS } from './config.js';
import { planarForward } from './facing.js';
import { bossCovers } from './boss-logic.js';
import { beamSegment, laserHousingHit, laserPhase, laserWindow, laserYaw, traceLaserCells, circleHitsSegment } from './laser-logic.js';

const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.7, roughness: 0.35 });

const WALL_GAP = 0.1;
const HOUSING_DEPTH = 0.16;
const BEAM_START = 0.3;

function applySpan(visual, length) {
  const span = Math.max(length - BEAM_START, 0.001);
  visual.glow.scale.z = span;
  visual.core.scale.z = span;
  visual.glow.position.z = BEAM_START + span / 2;
  visual.core.position.z = BEAM_START + span / 2;
}

export function createLaserVisual() {
  const group = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, HOUSING_DEPTH), housingMaterial);
  housing.position.set(0, 0, WALL_GAP + HOUSING_DEPTH / 2);
  housing.castShadow = true;
  housing.userData.shared = true;
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.08, 14),
    new THREE.MeshStandardMaterial({ color: 0xfecaca, emissive: 0xef4444, emissiveIntensity: 0.35, roughness: 0.3 })
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, WALL_GAP + HOUSING_DEPTH + 0.03);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xfff1f2,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  glow.scale.set(0.36, 0.36, 1);
  core.scale.set(0.1, 0.1, 1);
  group.add(housing, lens, glow, core);
  return { group, lens, glow, core };
}

function cellOpen(level, x, z, isBlocked) {
  const tiles = level.tiles;
  if (!tiles || z < 0 || x < 0 || z >= tiles.length || x >= tiles[0].length) return false;
  if ((tiles[z][x].floor || 0) > 0) return false;
  if (isBlocked && isBlocked(x, z)) return false;
  if ((level.breakableItems || []).some((item) => item.x === x && item.z === z)) return false;
  if ((level.gates || []).some((item) => item.x === x && item.z === z)) return false;
  return !(level.bosses || []).some((item) => bossCovers(item.x, item.z, x, z));
}

export function createLaserMarker(item, level) {
  if (!Number.isInteger(item?.dir) || item.dir < 0 || item.dir > 3) return null;
  const tile = level.tiles?.[item.z]?.[item.x];
  if (!tile) return null;
  const tileSize = level.tileSize || 1;
  const visual = createLaserVisual();
  const yaw = laserYaw(item.dir);
  const fwd = planarForward(yaw);
  visual.group.rotation.y = yaw;
  visual.group.position.set(
    (item.x + 0.5) * tileSize + fwd.x * tileSize * 0.5,
    0.46,
    (item.z + 0.5) * tileSize + fwd.z * tileSize * 0.5
  );
  const cells = traceLaserCells(item.dir, item.x, item.z, (x, z) => cellOpen(level, x, z));
  applySpan(visual, cells.length * tileSize);
  visual.glow.visible = cells.length > 0;
  visual.core.visible = cells.length > 0;
  visual.lens.material.emissiveIntensity = 1.6;
  return visual.group;
}

export function createLaserController(level, tileSize, options = {}) {
  const items = Array.isArray(level.lasers) ? level.lasers : [];
  const group = new THREE.Group();
  const lasers = [];
  const cycle = LASER_ON_SECONDS + LASER_OFF_SECONDS;
  const disabledGroups = new Set();
  const isBlocked = options.isBlocked || null;
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    if (!Number.isInteger(item?.dir) || item.dir < 0 || item.dir > 3) continue;
    const tile = level.tiles[item.z]?.[item.x];
    if (!tile || (tile.floor || 0) <= 0) continue;
    const visual = createLaserVisual();
    const yaw = laserYaw(item.dir);
    const fwd = planarForward(yaw);
    visual.group.rotation.y = yaw;
    visual.group.position.set(
      (item.x + 0.5) * tileSize + fwd.x * tileSize * 0.5,
      0.46,
      (item.z + 0.5) * tileSize + fwd.z * tileSize * 0.5
    );
    group.add(visual.group);
    lasers.push({
      x: item.x,
      z: item.z,
      dir: item.dir,
      visual,
      switchId: typeof item.switch === 'string' && item.switch.trim() ? item.switch.trim().toLowerCase() : null,
      phase: laserPhase(item.x, item.z, cycle)
    });
  }

  // Lasers tied to a switch group go dark while that group is toggled on.
  function setGroupEnabled(id, enabled) {
    const key = String(id).toLowerCase();
    if (enabled) disabledGroups.delete(key);
    else disabledGroups.add(key);
  }

  function getTargets() {
    return lasers.map((laser) => ({
      kind: 'laser',
      x: laser.x,
      z: laser.z,
      dir: laser.dir,
      ...laserHousingHit(laser.x, laser.z, laser.dir, tileSize)
    }));
  }

  function destroy(x, z, dir) {
    const index = lasers.findIndex((laser) => laser.x === x && laser.z === z && laser.dir === dir);
    if (index < 0) return false;
    const [laser] = lasers.splice(index, 1);
    group.remove(laser.visual.group);
    laser.visual.group.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      if (obj.material && !obj.userData.shared) obj.material.dispose();
    });
    level.lasers = (level.lasers || []).filter((item) => !(item.x === x && item.z === z && item.dir === dir));
    return true;
  }

  function update(delta, playerPosition, playerRadius) {
    elapsed += delta;
    let touching = false;
    for (const laser of lasers) {
      const cells = traceLaserCells(laser.dir, laser.x, laser.z, (x, z) => cellOpen(level, x, z, isBlocked));
      const segment = beamSegment(laser.dir, laser.x, laser.z, cells.length, tileSize);
      const disabled = (laser.switchId != null && disabledGroups.has(laser.switchId))
        || Boolean(options.isSuppressed?.(laser.visual.group.position.x, laser.visual.group.position.z));
      const state = disabled ? { firing: false, warning: false } : laserWindow(elapsed, laser.phase, LASER_ON_SECONDS, LASER_OFF_SECONDS);
      const showBeam = state.firing && segment.length > 0;
      applySpan(laser.visual, showBeam ? segment.length : 0.001);
      laser.visual.glow.visible = showBeam;
      laser.visual.core.visible = showBeam;
      if (showBeam) {
        const pulse = 0.34 + Math.sin(elapsed * 22) * 0.08;
        laser.visual.glow.material.opacity = pulse;
        laser.visual.lens.material.emissiveIntensity = 2.4;
      } else if (state.warning) {
        laser.visual.lens.material.emissiveIntensity = 0.2 + (Math.sin(elapsed * 28) + 1) * 1.3;
      } else {
        laser.visual.lens.material.emissiveIntensity = disabled ? 0.05 : 0.25;
      }
      if (!showBeam || !playerPosition) continue;
      if (circleHitsSegment(
        playerPosition.x,
        playerPosition.z,
        playerRadius,
        segment.startX,
        segment.startZ,
        segment.endX,
        segment.endZ,
        LASER_BEAM_RADIUS
      )) touching = true;
    }
    return touching;
  }

  return { group, update, getTargets, destroy, setGroupEnabled };
}
