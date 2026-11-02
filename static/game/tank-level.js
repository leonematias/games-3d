import { CANNON_DAMAGE_CAP, COINS_PER_TANK_LEVEL, PLAYER_MAX_HP, TANK_LEVEL_HP_CAP } from './config.js';

export function tankLevelForCoins(collectedValue, perLevel = COINS_PER_TANK_LEVEL) {
  const value = Number.isFinite(collectedValue) ? Math.max(0, collectedValue) : 0;
  return 1 + Math.floor(value / perLevel);
}

// Level 1 keeps the base health. Each later level adds one hit point until level 3.
export function tankMaxHp(level, base = PLAYER_MAX_HP, cap = TANK_LEVEL_HP_CAP) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return base + Math.max(0, Math.min(safeLevel, cap) - 1);
}

// The cannon hits harder with every tank level: one point at level 1, two at level 2, three from level 3.
export function cannonDamage(level, cap = CANNON_DAMAGE_CAP) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return Math.max(1, Math.min(safeLevel, cap));
}
