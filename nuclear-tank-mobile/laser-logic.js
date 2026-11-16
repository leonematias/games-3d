import { planarForward } from './facing.js';

// dir 0, 1, 2, 3 are quarter-turns of a +Z front. planarForward is the only step.
export function laserYaw(dir) {
  return dir * (Math.PI / 2);
}

export function laserStep(dir) {
  const fwd = planarForward(laserYaw(dir));
  return { x: Math.round(fwd.x), z: Math.round(fwd.z) };
}

export function traceLaserCells(dir, originX, originZ, isOpen) {
  const step = laserStep(dir);
  const cells = [];
  let x = originX + step.x;
  let z = originZ + step.z;
  while (isOpen(x, z) && cells.length < 80) {
    cells.push({ x, z });
    x += step.x;
    z += step.z;
  }
  return cells;
}

// The housing sits just past the wall face, in the open cell the barrel faces.
export function laserHousingHit(x, z, dir, tileSize = 1) {
  const fwd = planarForward(laserYaw(dir));
  const reach = tileSize * 0.5 + 0.18;
  return {
    hitX: (x + 0.5) * tileSize + fwd.x * reach,
    hitY: 0.68,
    hitZ: (z + 0.5) * tileSize + fwd.z * reach,
    hitRadius: 0.46
  };
}

export function beamSegment(dir, originX, originZ, cellCount, tileSize) {
  const yaw = laserYaw(dir);
  const fwd = planarForward(yaw);
  const startX = (originX + 0.5) * tileSize + fwd.x * tileSize * 0.5;
  const startZ = (originZ + 0.5) * tileSize + fwd.z * tileSize * 0.5;
  const length = cellCount * tileSize;
  return {
    yaw,
    startX,
    startZ,
    endX: startX + fwd.x * length,
    endZ: startZ + fwd.z * length,
    length
  };
}

export function laserPhase(x, z, cycle) {
  const raw = (x * 1.3 + z * 0.7) % cycle;
  return raw < 0 ? raw + cycle : raw;
}

export function laserWindow(elapsed, phase, onSeconds, offSeconds) {
  const cycle = onSeconds + offSeconds;
  const t = ((elapsed + phase) % cycle + cycle) % cycle;
  const firing = t < onSeconds;
  const timeUntilOn = firing ? 0 : cycle - t;
  return { firing, timeUntilOn, warning: !firing && timeUntilOn < 0.45 };
}

export function circleHitsSegment(px, pz, radius, startX, startZ, endX, endZ, beamRadius) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const len2 = dx * dx + dz * dz;
  let closestX = startX;
  let closestZ = startZ;
  if (len2 > 1e-8) {
    const t = Math.max(0, Math.min(1, ((px - startX) * dx + (pz - startZ) * dz) / len2));
    closestX = startX + dx * t;
    closestZ = startZ + dz * t;
  }
  return Math.hypot(px - closestX, pz - closestZ) <= radius + beamRadius;
}
