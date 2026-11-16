export const BOSS_SPAN = 2;

export function bossCells(x, z) {
  return [
    { x, z },
    { x: x + 1, z },
    { x, z: z + 1 },
    { x: x + 1, z: z + 1 }
  ];
}

export function bossCovers(originX, originZ, tileX, tileZ) {
  return tileX >= originX && tileX < originX + BOSS_SPAN && tileZ >= originZ && tileZ < originZ + BOSS_SPAN;
}

export function bossIsEnraged(hp, maxHp) {
  return hp > 0 && hp * 2 <= maxHp;
}

export function bossCenter(x, z, tileSize) {
  return {
    x: (x + BOSS_SPAN / 2) * tileSize,
    z: (z + BOSS_SPAN / 2) * tileSize
  };
}

export function wrapAngle(angle) {
  const tau = Math.PI * 2;
  return ((angle + Math.PI) % tau + tau) % tau - Math.PI;
}

export function inBossRange(originX, originZ, playerX, playerZ, range) {
  return Math.hypot(playerX - originX, playerZ - originZ) <= range;
}

// Shortest-angle step toward targetYaw. targetYaw null holds the current heading.
export function stepBossYaw(yaw, targetYaw, turnSpeed, delta) {
  if (targetYaw == null) return yaw;
  const deltaYaw = wrapAngle(targetYaw - yaw);
  const maxStep = turnSpeed * delta;
  if (Math.abs(deltaYaw) <= maxStep) return targetYaw;
  return yaw + Math.sign(deltaYaw) * maxStep;
}

// Even fan from -halfAngle to +halfAngle. Five shots keep the machine-gun triangle and fill it.
export function bossSpreadAngles(count, halfAngle) {
  const angles = [];
  const shots = Math.max(1, count);
  for (let i = 0; i < shots; i++) {
    const t = shots === 1 ? 0 : (i / (shots - 1)) * 2 - 1;
    angles.push(t * halfAngle);
  }
  return angles;
}
