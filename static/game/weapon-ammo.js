export const AMMO_WEAPONS = ['machinegun', 'nuke', 'grenade', 'shield', 'emp'];

export function resetWeaponState(player) {
  player.weapon = 'cannon';
  player.unlocked = { cannon: true };
  player.ammo = {};
  for (const weapon of AMMO_WEAPONS) {
    player.unlocked[weapon] = false;
    player.ammo[weapon] = 0;
  }
  player.previousWeapon = null;
}

export function ammoLabel(player, weapon) {
  if (weapon === 'cannon') return '∞';
  return String(player.ammo?.[weapon] || 0);
}

export function weaponUsable(player, weapon) {
  if (!weapon || !player.unlocked?.[weapon]) return false;
  if (weapon === 'cannon') return true;
  return (player.ammo?.[weapon] || 0) > 0;
}

export function chooseWeapon(player, weapon) {
  if (!weaponUsable(player, weapon) || player.weapon === weapon) return false;
  if (weapon === 'nuke') player.previousWeapon = player.weapon;
  player.weapon = weapon;
  return true;
}

// Nuke replaces its single charge. Machine gun and grenade add another pickup's worth.
export function grantPickup(player, weapon, amount) {
  if (weapon === 'nuke') player.ammo.nuke = amount;
  else if (weapon !== 'cannon') player.ammo[weapon] = (player.ammo[weapon] || 0) + amount;
  const newly = !player.unlocked[weapon];
  player.unlocked[weapon] = true;
  if (weapon === 'nuke') {
    if (player.weapon !== 'nuke') player.previousWeapon = player.weapon;
    player.weapon = 'nuke';
    return true;
  }
  if (weapon !== 'nuke' && player.weapon === 'nuke') {
    player.previousWeapon = weapon;
    return false;
  }
  if (newly) {
    player.weapon = weapon;
    return true;
  }
  return false;
}

export function machineGunShotCount(player) {
  return Math.min(3, player.ammo?.machinegun || 0);
}

export function spendAmmo(player, weapon, amount) {
  if (weapon !== 'cannon') {
    player.ammo[weapon] = Math.max(0, (player.ammo[weapon] || 0) - amount);
  }
  if (weapon === 'cannon' || (player.ammo[weapon] || 0) > 0) return;
  if (weapon === 'nuke') {
    player.unlocked.nuke = false;
    const fallback = player.previousWeapon;
    player.weapon = weaponUsable(player, fallback) ? fallback : 'cannon';
    player.previousWeapon = null;
    return;
  }
  if (player.weapon === weapon) {
    const fallback = player.previousWeapon;
    player.weapon = weaponUsable(player, fallback) && fallback !== weapon ? fallback : 'cannon';
  }
}
