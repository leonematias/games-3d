import {
  GRENADE_ARC_HEIGHT,
  GRENADE_CHARGE_SECONDS,
  GRENADE_FLIGHT_SECONDS,
  GRENADE_MIN_RANGE_CELLS,
  GRENADE_RANGE_CELLS
} from './config.js';
import { planarForward } from './facing.js';

// A tap stays near the minimum. Holding through the charge time reaches the full lob.
export function grenadeRangeCells(
  heldSeconds,
  chargeSeconds = GRENADE_CHARGE_SECONDS,
  minCells = GRENADE_MIN_RANGE_CELLS,
  maxCells = GRENADE_RANGE_CELLS
) {
  const span = Math.max(0, maxCells - minCells);
  if (chargeSeconds <= 0) return maxCells;
  const t = Math.min(1, Math.max(0, heldSeconds / chargeSeconds));
  return minCells + span * t;
}

export function grenadeFlightSeconds(rangeCells, maxCells = GRENADE_RANGE_CELLS, fullSeconds = GRENADE_FLIGHT_SECONDS) {
  const t = maxCells <= 0 ? 1 : Math.min(1, Math.max(0, rangeCells / maxCells));
  return Math.max(0.32, fullSeconds * (0.45 + 0.55 * t));
}

export function grenadeArcHeight(rangeCells, maxCells = GRENADE_RANGE_CELLS, fullHeight = GRENADE_ARC_HEIGHT) {
  const t = maxCells <= 0 ? 1 : Math.min(1, Math.max(0, rangeCells / maxCells));
  return fullHeight * (0.4 + 0.6 * t);
}

export function grenadeLandingXZ(playerX, playerZ, yaw, tileSize, rangeCells = GRENADE_RANGE_CELLS) {
  const forward = planarForward(yaw);
  return {
    x: playerX + forward.x * rangeCells * tileSize,
    z: playerZ + forward.z * rangeCells * tileSize
  };
}

export function grenadeLandingPoint(playerX, playerY, playerZ, yaw, level, tileSize, heightStep, rangeCells = GRENADE_RANGE_CELLS) {
  const flat = grenadeLandingXZ(playerX, playerZ, yaw, tileSize, rangeCells);
  const tileX = Math.floor(flat.x / tileSize);
  const tileZ = Math.floor(flat.z / tileSize);
  const tile = level?.tiles?.[tileZ]?.[tileX];
  if (!tile) return { x: flat.x, y: playerY + 0.35, z: flat.z };
  return {
    x: flat.x,
    y: Math.max(0, tile.floor || 0) * heightStep + 0.45,
    z: flat.z
  };
}

// Horizontal lerp plus 4*u*(1-u)*arcHeight. The path does not stop for walls or boxes.
export function grenadeArcPoint(start, landing, u, arcHeight = GRENADE_ARC_HEIGHT) {
  const t = Math.min(1, Math.max(0, u));
  return {
    x: start.x + (landing.x - start.x) * t,
    y: start.y + (landing.y - start.y) * t + 4 * t * (1 - t) * arcHeight,
    z: start.z + (landing.z - start.z) * t
  };
}
