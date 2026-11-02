import * as THREE from 'three';
import { buildDepot, buildRadar, buildTruck, flashTank, updateTankFlash } from './models.js';
import { TARGETS } from './config.js';

// Off-road targets that give the player a reason to leave the road:
//  - radar dishes: destroying every one jams the enemy (turret range halved,
//    missiles stop homing);
//  - fuel depots: a big blast and a supply drop;
//  - the supply convoy: trucks shuttling between two pads; the last one
//    carries a weapon crate;
//  - the captured convoy: friendly trucks in a camp; killing the guards round
//    them frees it.
// Hostile things here are targets for the turret like enemies are.

const _p = new THREE.Vector3();

export function createTargets({ scene, terrain, fort, fx, sounds, level, pickups, onEvent }) {
  const radars = [];
  const depots = [];
  const trucks = [];      // supply convoy
  const camps = [];
  const group = new THREE.Group();
  scene.add(group);

  for (const t of level.targets || []) {
    const y = terrain.groundAt(t.x, t.z);
    const yaw = THREE.MathUtils.degToRad(t.yawDeg || 0);
    if (t.type === 'radar') {
      const built = buildRadar();
      built.root.position.set(t.x, y, t.z);
      built.root.rotation.y = yaw;
      group.add(built.root);
      const def = TARGETS.radar;
      const r = {
        kind: 'radar', id: t.id, name: def.name, built, root: built.root, pos: new THREE.Vector3(t.x, y + 3.5, t.z), radius: def.radius,
        hp: def.hp, maxHp: def.hp, alive: true, score: def.score, stun: 0,
        takeDamage(amount, at) { if (!r.alive) return; r.hp -= amount; flashTank(built, 1); if (r.hp <= 0) killRadar(r); }
      };
      fort.addObstacle(t.x, t.z, 3.2);
      radars.push(r);
    } else if (t.type === 'depot') {
      const built = buildDepot(t.tanks || 4);
      built.root.position.set(t.x, y, t.z);
      built.root.rotation.y = yaw;
      group.add(built.root);
      const def = TARGETS.depot;
      const d = {
        kind: 'depot', id: t.id, name: def.name, built, root: built.root, pos: new THREE.Vector3(t.x, y + 1.6, t.z), radius: def.radius,
        hp: def.hp, maxHp: def.hp, alive: true, score: def.score, stun: 0,
        takeDamage(amount, at) { if (!d.alive) return; d.hp -= amount; flashTank(built, 1); if (d.hp <= 0) killDepot(d); }
      };
      fort.addObstacle(t.x, t.z, 5.2);
      depots.push(d);
    } else if (t.type === 'camp') {
      const members = [];
      const n = t.trucks || 3;
      for (let i = 0; i < n; i++) {
        const a = yaw + (i / n) * Math.PI * 2;
        const x = t.x + Math.cos(a) * 7, z = t.z + Math.sin(a) * 7;
        const built = buildTruck(0x5a6a4a, 0xa09060);
        built.root.position.set(x, terrain.groundAt(x, z), z);
        built.root.rotation.y = -a + Math.PI / 2;
        group.add(built.root);
        fort.addObstacle(x, z, 2.4);
        members.push({ built, x, z });
      }
      // A white flag on a pole in the middle so the camp reads as "ours".
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f93 }));
      pole.position.set(t.x, y + 2.5, t.z);
      group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, side: THREE.DoubleSide }));
      flag.position.set(t.x + 0.8, y + 4.4, t.z);
      group.add(flag);
      camps.push({ kind: 'camp', id: t.id, name: TARGETS.camp.name, pos: new THREE.Vector3(t.x, y, t.z), members, flag, freed: false, score: TARGETS.camp.score });
    }
  }

  // Supply convoy.
  const supply = level.supply;
  if (supply && supply.route && supply.route.length >= 2) {
    const [a, b] = supply.route;
    const def = TARGETS.truck;
    for (let i = 0; i < (supply.trucks || 3); i++) {
      const built = buildTruck(0x6e6a52, i === (supply.trucks || 3) - 1 ? 0xd060c0 : 0x8a7a4a);
      group.add(built.root);
      const t = {
        kind: 'truck', name: def.name, built, root: built.root, pos: new THREE.Vector3(), radius: def.radius, hp: def.hp, maxHp: def.hp, alive: true, score: def.score, stun: 0,
        from: new THREE.Vector3(a[0], 0, a[1]), to: new THREE.Vector3(b[0], 0, b[1]), prog: 0.15 + i * 0.12, dir: 1, heading: 0, vel: new THREE.Vector3(),
        last: i === (supply.trucks || 3) - 1,
        takeDamage(amount, at) { if (!t.alive) return; t.hp -= amount; flashTank(built, 1); if (t.hp <= 0) killTruck(t); }
      };
      trucks.push(t);
      placeTruck(t, 0);
    }
  }

  function placeTruck(t, dt) {
    const len = t.from.distanceTo(t.to);
    const speed = TARGETS.truck.speed;
    t.prog += (t.dir * speed * dt) / Math.max(1, len);
    if (t.prog >= 1) { t.prog = 1; t.dir = -1; }
    if (t.prog <= 0) { t.prog = 0; t.dir = 1; }
    const before = _p.copy(t.pos);
    t.pos.lerpVectors(t.from, t.to, t.prog);
    t.pos.y = terrain.heightAt(t.pos.x, t.pos.z);
    const target = Math.atan2((t.to.x - t.from.x) * t.dir, (t.to.z - t.from.z) * t.dir);
    t.heading += Math.atan2(Math.sin(target - t.heading), Math.cos(target - t.heading)) * Math.min(1, dt * 3);
    t.vel.copy(t.pos).sub(before).divideScalar(Math.max(dt, 1e-4));
    t.root.position.copy(t.pos);
    t.root.rotation.set(0, t.heading, 0);
  }

  function killRadar(r) {
    r.alive = false;
    r.hp = 0;
    fx.explosion(r.pos, { size: 7, ground: false });
    fx.burn(_p.copy(r.pos).setY(r.root.position.y + 1), { size: 2.5, duration: 40 });
    fx.debrisBurst(r.pos, 12, 14, 0.4);
    sounds?.explosion(1.0);
    r.root.traverse((n) => { if (n.isMesh) n.material = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1 }); });
    r.built.dish.rotation.x = 1.2;
    r.built.beacon.intensity = 0;
    onEvent?.({ type: 'radar', target: r, score: r.score, allDown: radars.every((x) => !x.alive) });
  }
  function killDepot(d) {
    d.alive = false;
    d.hp = 0;
    const def = TARGETS.depot;
    fx.explosion(d.pos, { size: def.blast, ground: true });
    fx.burn(_p.copy(d.pos).setY(d.root.position.y + 0.5), { size: 5, duration: 60 });
    fx.debrisBurst(d.pos, 20, 18, 0.5);
    fx.flash(d.pos, { intensity: 1500, life: 0.8, distance: 120 });
    sounds?.explosion(1.4);
    d.root.traverse((n) => { if (n.isMesh) n.material = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1 }); });
    d.root.scale.y *= 0.6;
    onEvent?.({ type: 'depot', target: d, score: d.score, blast: { pos: d.pos.clone(), radius: def.blast, damage: def.blastDamage }, allDown: depots.every((x) => !x.alive) });
    pickups?.drop(d.pos, 'repair');
    pickups?.drop(d.pos, 'ammo');
  }
  function killTruck(t) {
    t.alive = false;
    t.hp = 0;
    fx.explosion(t.pos, { size: 5, ground: false });
    fx.burn(_p.copy(t.pos).setY(t.pos.y + 0.8), { size: 2, duration: 25 });
    fx.debrisBurst(t.pos, 8, 12, 0.4);
    sounds?.explosion(0.8);
    t.root.traverse((n) => { if (n.isMesh) n.material = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1 }); });
    t.root.scale.y *= 0.75;
    fort.addObstacle(t.pos.x, t.pos.z, 2.0);
    const left = trucks.filter((x) => x.alive).length;
    onEvent?.({ type: 'truck', target: t, score: t.score, left });
    if (left === 0 && supply?.weapon) {
      pickups?.drop(t.pos, 'weapon', supply.weapon);
      onEvent?.({ type: 'convoyDone', target: t, score: TARGETS.convoyBonus, weapon: supply.weapon });
    }
  }

  // The captured convoy is freed when no guard is left alive within the camp radius.
  function checkCamps(enemies) {
    for (const c of camps) {
      if (c.freed) continue;
      const guards = enemies.tanks.filter((e) => e.spec?.camp === c.id);
      const turretGuards = enemies.turrets.filter((s) => s.spec?.guard === c.id);
      const alive = guards.some((e) => e.alive) || turretGuards.some((s) => s.alive);
      if (!alive && (guards.length || turretGuards.length)) {
        c.freed = true;
        c.flag.material.color.setHex(0x9bff8a);
        fx.ring(_p.copy(c.pos).setY(c.pos.y + 0.5), 40, { life: 1.5, color: 0x9bff8a, flat: true });
        onEvent?.({ type: 'camp', target: c, score: c.score, allFreed: camps.every((x) => x.freed) });
      }
    }
  }

  let t = 0;
  function update(dt, player, enemies) {
    t += dt;
    for (const r of radars) {
      updateTankFlash(r.built, dt);
      if (!r.alive) continue;
      r.built.dish.rotation.y += dt * 0.8;
      r.built.beacon.intensity = (Math.sin(t * 4) > 0.6) ? 40 : 0;
    }
    for (const d of depots) updateTankFlash(d.built, dt);
    for (const tr of trucks) {
      updateTankFlash(tr.built, dt);
      if (!tr.alive) continue;
      placeTruck(tr, dt);
      if (Math.random() < dt * 2) fx.dust(_p.copy(tr.pos).addScaledVector(tr.vel, -0.3), 1);
    }
    for (const c of camps) {
      c.flag.rotation.y = Math.sin(t * 2) * 0.2;
      for (const m of c.members) updateTankFlash(m.built, dt);
    }
    if (enemies) checkCamps(enemies);
  }

  // Hostile targets for the turret and the projectiles.
  function targets() {
    const list = [];
    for (const r of radars) if (r.alive) list.push(r);
    for (const d of depots) if (d.alive) list.push(d);
    for (const tr of trucks) if (tr.alive) list.push(tr);
    return list;
  }

  const status = () => ({
    radars: radars.length, radarsLeft: radars.filter((r) => r.alive).length,
    depots: depots.length, depotsLeft: depots.filter((d) => d.alive).length,
    trucks: trucks.length, trucksLeft: trucks.filter((x) => x.alive).length,
    camps: camps.length, campsFreed: camps.filter((c) => c.freed).length
  });
  const jammed = () => radars.length > 0 && radars.every((r) => !r.alive);

  return { radars, depots, trucks, camps, update, targets, status, jammed, group };
}
