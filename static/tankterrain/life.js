import * as THREE from 'three';
import { birdGeometry, buildDeer } from './models.js';

// Ambient life: flocks of birds that burst out of the trees when something
// bangs nearby, and small herds of deer that graze and bolt from the tank.

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

export function createLife({ scene, terrain, fort, level, weather }) {
  // ---------------------------------------------------------------- birds
  const FLOCKS = 8, PER = 14;
  const roosts = (level.props || []).filter((p) => p.kind === 'tree').filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z, y: terrain.groundAt(p.x, p.z) + 12 * (p.scale || 1), cooldown: 0 }));
  const birds = new THREE.InstancedMesh(birdGeometry(), new THREE.MeshBasicMaterial({ color: weather?.night ? 0x202428 : 0x1a1c1e, side: THREE.DoubleSide }), FLOCKS * PER);
  birds.frustumCulled = false;
  birds.count = 0;
  scene.add(birds);
  const flocks = [];
  for (let i = 0; i < FLOCKS; i++) flocks.push({ active: false, age: 0, life: 0, origin: new THREE.Vector3(), phase: Math.random() * 6, dir: Math.random() < 0.5 ? -1 : 1, members: [] });

  function startle(pos, radius = 70) {
    for (const r of roosts) {
      if (r.cooldown > 0) continue;
      const d = Math.hypot(r.x - pos.x, r.z - pos.z);
      if (d > radius) continue;
      const f = flocks.find((x) => !x.active);
      if (!f) return;
      f.active = true;
      f.age = 0;
      f.life = 7 + Math.random() * 5;
      f.origin.set(r.x, r.y, r.z);
      f.dir = Math.random() < 0.5 ? -1 : 1;
      f.members = [];
      for (let i = 0; i < PER; i++) f.members.push({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 6, h: Math.random() * 3, flap: Math.random() * 6, speed: 0.8 + Math.random() * 0.5 });
      r.cooldown = 25;
    }
  }

  // ----------------------------------------------------------------- deer
  const herds = [];
  const deerColor = { meadow: 0x8a6a42, alpine: 0x5a4a3a, coast: 0x9a7a52, marsh: 0x6a5a40 }[level.terrain?.style] || 0x8a6a42;
  for (const h of level.wildlife || []) {
    const herd = { x: h.x, z: h.z, members: [] };
    for (let i = 0; i < (h.count || 4); i++) {
      const built = buildDeer(deerColor);
      scene.add(built.root);
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 10;
      const d = {
        built, pos: new THREE.Vector3(h.x + Math.cos(a) * r, 0, h.z + Math.sin(a) * r), heading: Math.random() * Math.PI * 2,
        speed: 0, state: 'graze', timer: 1 + Math.random() * 4, goal: new THREE.Vector3(), phase: Math.random() * 6, scale: 0.85 + Math.random() * 0.3
      };
      d.pos.y = terrain.heightAt(d.pos.x, d.pos.z);
      built.root.scale.setScalar(d.scale);
      herd.members.push(d);
    }
    herds.push(herd);
  }

  function updateDeer(d, herd, dt, playerPos, t) {
    const toPlayer = Math.hypot(playerPos.x - d.pos.x, playerPos.z - d.pos.z);
    if (toPlayer < 42 && d.state !== 'flee') { d.state = 'flee'; d.timer = 4 + Math.random() * 3; }
    let want = 0;
    if (d.state === 'flee') {
      const away = Math.atan2(d.pos.x - playerPos.x, d.pos.z - playerPos.z);
      d.heading += Math.atan2(Math.sin(away - d.heading), Math.cos(away - d.heading)) * Math.min(1, dt * 4);
      want = 9;
      d.timer -= dt;
      if (d.timer <= 0 && toPlayer > 70) { d.state = 'graze'; d.timer = 2 + Math.random() * 4; }
    } else {
      d.timer -= dt;
      if (d.state === 'walk') {
        const goalA = Math.atan2(d.goal.x - d.pos.x, d.goal.z - d.pos.z);
        d.heading += Math.atan2(Math.sin(goalA - d.heading), Math.cos(goalA - d.heading)) * Math.min(1, dt * 2);
        want = 1.6;
        if (d.timer <= 0 || Math.hypot(d.goal.x - d.pos.x, d.goal.z - d.pos.z) < 2) { d.state = 'graze'; d.timer = 3 + Math.random() * 6; }
      } else if (d.timer <= 0) {
        d.state = 'walk';
        d.timer = 4 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 16;
        d.goal.set(herd.x + Math.cos(a) * r, 0, herd.z + Math.sin(a) * r);
      }
    }
    d.speed += (want - d.speed) * Math.min(1, dt * 3);
    if (d.speed > 0.05) {
      const nx = d.pos.x + Math.sin(d.heading) * d.speed * dt;
      const nz = d.pos.z + Math.cos(d.heading) * d.speed * dt;
      const slope = terrain.slopeDegAt(nx, nz);
      if (slope < 32 && !terrain.isWater(nx, nz) && Math.abs(nx) < terrain.half - 6 && Math.abs(nz) < terrain.half - 6) { d.pos.x = nx; d.pos.z = nz; }
      else d.heading += 1.5 * dt + Math.PI * (Math.random() < dt ? 0.5 : 0);
    }
    fort.resolveCircle(d.pos, 0.6);
    d.pos.y = terrain.heightAt(d.pos.x, d.pos.z);
    d.built.root.position.copy(d.pos);
    d.built.root.rotation.set(0, d.heading, 0);
    const swing = Math.sin(t * (d.state === 'flee' ? 16 : 7) + d.phase) * Math.min(0.7, d.speed * 0.25);
    d.built.legs[0].rotation.x = swing; d.built.legs[3].rotation.x = swing;
    d.built.legs[1].rotation.x = -swing; d.built.legs[2].rotation.x = -swing;
    if (d.state === 'graze') d.built.root.rotation.x = Math.sin(t * 0.8 + d.phase) > 0.6 ? 0.18 : 0;
  }

  let t = 0;
  function update(dt, playerPos) {
    t += dt;
    for (const r of roosts) if (r.cooldown > 0) r.cooldown -= dt;
    let n = 0;
    for (const f of flocks) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.life) { f.active = false; continue; }
      const k = f.age / f.life;
      const rise = Math.min(1, f.age / 2) * 18;                       // climb for two seconds
      const settle = k > 0.75 ? (k - 0.75) / 0.25 : 0;                // glide back down at the end
      for (const b of f.members) {
        b.a += f.dir * dt * b.speed * (1.2 - settle * 0.6);
        const r = b.r + f.age * 2.2 * (1 - settle);
        const y = f.origin.y + rise * (1 - settle) + Math.sin(t * 3 + b.flap) * 0.8 + b.h;
        _p.set(f.origin.x + Math.cos(b.a) * r, y, f.origin.z + Math.sin(b.a) * r);
        const flap = Math.sin(t * 14 + b.flap) * 0.6;
        _e.set(0, -b.a + Math.PI / 2 * f.dir, flap);
        _q.setFromEuler(_e);
        birds.setMatrixAt(n++, _m.compose(_p, _q, _s.set(1.2, 1, 1.2)));
      }
    }
    birds.count = n;
    birds.instanceMatrix.needsUpdate = true;
    for (const herd of herds) {
      // Only animate herds within earshot of the player; distant ones stand still.
      if (Math.hypot(herd.x - playerPos.x, herd.z - playerPos.z) > 420) continue;
      for (const d of herd.members) updateDeer(d, herd, dt, playerPos, t);
    }
  }

  return { update, startle, herds, flocks };
}
