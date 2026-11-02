import { planarForward } from './facing.js';

export function circleIntersectsSector(originX, originZ, yaw, targetX, targetZ, radius, range, halfAngle) {
  const dx = targetX - originX;
  const dz = targetZ - originZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range + radius) return false;
  if (dist <= radius) return true;
  const forward = planarForward(yaw);
  const dot = (forward.x * dx + forward.z * dz) / dist;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  const allowance = Math.asin(Math.min(1, radius / dist));
  return angle <= halfAngle + allowance;
}

export function tilesAlongSegment(x0, z0, x1, z1, tileSize) {
  const tiles = [];
  let tileX = Math.floor(x0 / tileSize);
  let tileZ = Math.floor(z0 / tileSize);
  const endX = Math.floor(x1 / tileSize);
  const endZ = Math.floor(z1 / tileSize);
  tiles.push({ x: tileX, z: tileZ });
  if (tileX === endX && tileZ === endZ) return tiles;

  const dx = x1 - x0;
  const dz = z1 - z0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(tileSize / dx);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(tileSize / dz);
  let tMaxX = Infinity;
  let tMaxZ = Infinity;
  if (stepX > 0) tMaxX = ((tileX + 1) * tileSize - x0) / dx;
  else if (stepX < 0) tMaxX = (tileX * tileSize - x0) / dx;
  if (stepZ > 0) tMaxZ = ((tileZ + 1) * tileSize - z0) / dz;
  else if (stepZ < 0) tMaxZ = (tileZ * tileSize - z0) / dz;

  const limit = 256;
  for (let n = 0; n < limit && (tileX !== endX || tileZ !== endZ); n++) {
    if (tMaxX < tMaxZ) {
      tileX += stepX;
      tMaxX += tDeltaX;
    } else {
      tileZ += stepZ;
      tMaxZ += tDeltaZ;
    }
    tiles.push({ x: tileX, z: tileZ });
  }
  return tiles;
}

// While lockRemaining > 0 the turret holds its yaw and keeps firing.
// When the lock ends, rearm stays set until the player leaves the cone,
// so the turret rotates clear instead of snapping back onto the same sighting.
export function stepTurretEngagement(turret, delta, { turnSpeed, lockSeconds, spottedYaw }) {
  if (turret.lockRemaining > 0) {
    turret.lockRemaining = Math.max(0, turret.lockRemaining - delta);
    if (turret.lockRemaining === 0) turret.rearm = true;
    return true;
  }

  turret.yaw += turnSpeed * delta;
  if (turret.rearm) {
    if (spottedYaw == null) turret.rearm = false;
    return false;
  }
  if (spottedYaw == null) return false;

  turret.yaw = spottedYaw;
  turret.lockRemaining = lockSeconds;
  return true;
}

export function lineOfSightClear(originX, originZ, targetX, targetZ, tileSize, isOccluder) {
  const tiles = tilesAlongSegment(originX, originZ, targetX, targetZ, tileSize);
  for (let i = 1; i < tiles.length - 1; i++) {
    if (isOccluder(tiles[i].x, tiles[i].z)) return false;
  }
  return true;
}
