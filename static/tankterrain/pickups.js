import * as THREE from 'three';
import { buildPickup } from './models.js';
import { PICKUPS, PICKUP_RADIUS, WEAPONS } from './config.js';

// Crates on the ground: ammo, batteries, repair kits and weapons. The tank
// collects one by driving over it. Enemies can drop them when destroyed.

const _p = new THREE.Vector3();

export function createPickups({ scene, terrain, fx, sounds, level }) {
  const items = [];
  const group = new THREE.Group();
  scene.add(group);

  function add({ type, weapon = null, x, z }) {
    const def = PICKUPS[type] || PICKUPS.ammo;
    const color = type === 'weapon' ? def.color : def.color;
    const built = buildPickup(color);
    const y = terrain.heightAt(x, z);
    built.root.position.set(x, y, z);
    built.spin.rotation.y = Math.random() * Math.PI * 2;
    group.add(built.root);
    const item = { type, weapon, def, pos: new THREE.Vector3(x, y + 1, z), built, alive: true, phase: Math.random() * Math.PI * 2, label: type === 'weapon' ? WEAPONS[weapon]?.name || 'WEAPON' : def.name };
    items.push(item);
    return item;
  }

  for (const spec of level.pickups || []) add(spec);

  function drop(pos, type, weapon = null) {
    const a = Math.random() * Math.PI * 2;
    const item = add({ type, weapon, x: pos.x + Math.cos(a) * 2.5, z: pos.z + Math.sin(a) * 2.5 });
    fx.ring(item.pos, 4, { life: 0.8, color: 0xffffff, flat: true });
    return item;
  }

  function collect(item) {
    item.alive = false;
    group.remove(item.built.root);
    fx.ring(_p.copy(item.pos).setY(item.pos.y - 0.6), 6, { life: 0.7, color: item.def.color, flat: true });
    fx.flash(item.pos, { intensity: 120, life: 0.4, color: item.def.color, distance: 20 });
    for (let i = 0; i < 14; i++) {
      fx.pools.sparks.emit({ x: item.pos.x, y: item.pos.y, z: item.pos.z, vx: (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 8, life: 0.8, size: 0.6, sizeEnd: 0.1, color: new THREE.Color(item.def.color), colorEnd: new THREE.Color(0xffffff), gravity: 10 });
    }
    if (item.type === 'weapon') sounds?.weaponPickup(); else sounds?.pickup();
  }

  // Animates the crates and returns the items the player drove over.
  function update(dt, t, playerPos, playerAlive) {
    const got = [];
    for (const item of items) {
      if (!item.alive) continue;
      const b = item.built;
      b.spin.rotation.y += dt * 1.4;
      b.spin.position.y = Math.sin(t * 2.2 + item.phase) * 0.18;
      b.ring.rotation.z += dt * 0.6;
      b.ring.material.opacity = 0.4 + Math.sin(t * 4 + item.phase) * 0.2;
      if (playerAlive && Math.hypot(item.pos.x - playerPos.x, item.pos.z - playerPos.z) < PICKUP_RADIUS) {
        collect(item);
        got.push(item);
      }
    }
    return got;
  }

  const alive = () => items.filter((i) => i.alive);
  return { items, add, drop, update, alive };
}
