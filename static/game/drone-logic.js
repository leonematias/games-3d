import { yawToward } from './facing.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function nextDroneCell(fromX, fromZ, goalX, goalZ, isBlocked) {
  if (fromX === goalX && fromZ === goalZ) return null;
  const key = (x, z) => `${x},${z}`;
  const start = key(fromX, fromZ);
  const queue = [[fromX, fromZ]];
  const prev = new Map([[start, null]]);
  let found = false;
  for (let guard = 0; queue.length && guard < 8000; guard += 1) {
    const [x, z] = queue.shift();
    if (x === goalX && z === goalZ) {
      found = true;
      break;
    }
    for (const [dx, dz] of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      const id = key(nx, nz);
      if (prev.has(id)) continue;
      if (!(nx === goalX && nz === goalZ) && isBlocked(nx, nz)) continue;
      prev.set(id, key(x, z));
      queue.push([nx, nz]);
    }
  }
  if (!found) return null;
  let cursor = key(goalX, goalZ);
  let previous = prev.get(cursor);
  while (previous && previous !== start) {
    cursor = previous;
    previous = prev.get(cursor);
  }
  const [x, z] = cursor.split(',').map(Number);
  return { x, z };
}

// Move toward a world point. yaw matches planarForward: +Z is yaw 0.
export function droneStep(x, z, targetX, targetZ, distance) {
  const dx = targetX - x;
  const dz = targetZ - z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-8 || distance <= 0) return { x, z, yaw: yawToward(dx, dz), moved: false };
  const step = Math.min(distance, len);
  return {
    x: x + (dx / len) * step,
    z: z + (dz / len) * step,
    yaw: yawToward(dx, dz),
    moved: true
  };
}

export function circleHitsCell(x, z, radius, tileX, tileZ, tileSize = 1) {
  const minX = tileX * tileSize;
  const maxX = minX + tileSize;
  const minZ = tileZ * tileSize;
  const maxZ = minZ + tileSize;
  const closestX = Math.max(minX, Math.min(x, maxX));
  const closestZ = Math.max(minZ, Math.min(z, maxZ));
  const dx = x - closestX;
  const dz = z - closestZ;
  return (dx * dx) + (dz * dz) < radius * radius;
}