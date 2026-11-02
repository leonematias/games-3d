import * as THREE from 'three';
import { MAT } from './models.js';

// Every shot in the air: bullets (instanced tracers), cannon shells, rockets,
// homing missiles, mortar bombs and the nuke, plus the laser beams. Targets
// are objects with { pos, radius, alive, takeDamage(amount, at, how) }.
// Walls block everything; the player's shots damage them.

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lead = new THREE.Vector3();
const _hit = { solid: null, point: new THREE.Vector3() };

const SIZES = { bullet: 0, shell: 3.2, rocket: 3.6, missile: 4.4, mortar: 6, nuke: 32 };

function shellBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 8), MAT.dark);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.z = -0.3;
  g.add(glow);
  return g;
}
function rocketBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), MAT.metal);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xc03030 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.7;
  g.add(nose);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.2, 8, 1, true), MAT.flame);
  flame.rotation.x = Math.PI / 2;
  flame.position.z = -1.1;
  g.add(flame);
  const light = new THREE.PointLight(0xffa050, 6, 14, 2);
  light.position.z = -0.6;
  g.add(light);
  return g;
}
function missileBody(enemy) {
  const g = new THREE.Group();
  const mat = enemy ? new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.5, metalness: 0.4 }) : new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 10), mat);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 10), mat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.1;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 10), new THREE.MeshBasicMaterial({ color: enemy ? 0xff3020 : 0xffd040 }));
  band.rotation.x = Math.PI / 2;
  band.position.z = 0.5;
  g.add(body, nose, band);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.4), MAT.dark);
    fin.position.set(Math.cos((i * Math.PI) / 2) * 0.22, Math.sin((i * Math.PI) / 2) * 0.22, -0.7);
    fin.rotation.z = (i * Math.PI) / 2;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.6, 8, 1, true), MAT.flame);
  flame.rotation.x = Math.PI / 2;
  flame.position.z = -1.6;
  g.add(flame);
  const light = new THREE.PointLight(enemy ? 0xff5030 : 0xffb060, 8, 20, 2);
  light.position.z = -1;
  g.add(light);
  return g;
}
function mortarBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), MAT.dark);
  g.add(body);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), MAT.metal);
  fin.rotation.x = -Math.PI / 2;
  fin.position.z = -0.4;
  g.add(fin);
  return g;
}
function nukeBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0x3a5a3a, emissive: 0x30ff60, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.5 }));
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 20), MAT.yellow);
  g.add(ring);
  const light = new THREE.PointLight(0x60ff80, 20, 30, 2);
  g.add(light);
  return g;
}

const BODIES = { shell: shellBody, rocket: rocketBody, missile: () => missileBody(false), missileEnemy: () => missileBody(true), mortar: mortarBody, nuke: nukeBody };

export function createProjectiles({ scene, fx, terrain, fort, sounds, onImpact }) {
  const TRACERS = 400;
  function tracerMesh(color) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 3.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), TRACERS);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }
  const playerTracers = tracerMesh(0xffc050);
  const enemyTracers = tracerMesh(0xff5030);

  const shots = [];
  const pools = {};
  function getBody(key) {
    const pool = pools[key] || (pools[key] = []);
    const m = pool.pop() || BODIES[key]();
    m.visible = true;
    scene.add(m);
    return m;
  }
  function releaseBody(key, m) {
    m.visible = false;
    scene.remove(m);
    pools[key].push(m);
  }

  // Beam pool for the lasers.
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.rotation.x = Math.PI / 2;
    glow.rotation.x = Math.PI / 2;
    core.position.z = 0.5;
    glow.position.z = 0.5;
    g.add(core, glow);
    g.visible = false;
    scene.add(g);
    beams.push({ group: g, core, glow, used: false });
  }

  let bridges = null;
  function setBridges(b) { bridges = b; }

  function fire({ type, origin, dir, owner, speed, gravity = 0, damage, splash = 0, life = 8, target = null, spread = 0, turn = 0, ownerVel = null, wallBonus = 1 }) {
    const d = dir.clone().normalize();
    if (spread) {
      d.x += (Math.random() - 0.5) * spread;
      d.y += (Math.random() - 0.5) * spread;
      d.z += (Math.random() - 0.5) * spread;
      d.normalize();
    }
    const vel = d.clone().multiplyScalar(speed);
    if (ownerVel) vel.addScaledVector(ownerVel, 0.6);
    const key = type === 'missile' && owner !== 'player' ? 'missileEnemy' : type;
    const mesh = type === 'bullet' ? null : getBody(key);
    if (mesh) mesh.position.copy(origin);
    const shot = { type, key, pos: origin.clone(), prev: origin.clone(), vel, dir: d, speed, gravity, damage, splash, life, age: 0, owner, target, turn, mesh, trailAcc: 0, wallBonus, dead: false };
    shots.push(shot);
    return shot;
  }

  function orient(mesh, dir) {
    _m.lookAt(_p.set(0, 0, 0), _d.copy(dir).negate(), _up);
    mesh.quaternion.setFromRotationMatrix(_m);
  }

  // Where a shot fired now would land: terrain or a solid. Used for the HUD reticle.
  const _pp = new THREE.Vector3(), _pv = new THREE.Vector3(), _pq = new THREE.Vector3();
  function predict(origin, dir, speed, gravity, maxSeconds = 6, out = new THREE.Vector3()) {
    _pp.copy(origin);
    _pv.copy(dir).normalize().multiplyScalar(speed);
    const dt = 0.05;
    for (let t = 0; t < maxSeconds; t += dt) {
      _pq.copy(_pp);
      _pv.y -= gravity * dt;
      _pp.addScaledVector(_pv, dt);
      if (_pp.y <= terrain.heightAt(_pp.x, _pp.z)) { out.copy(_pp); out.y = terrain.heightAt(_pp.x, _pp.z); return out; }
      if (fort.hitSegment(_pq, _pp, _hit)) { out.copy(_hit.point); return out; }
      if (Math.abs(_pp.x) > terrain.half || Math.abs(_pp.z) > terrain.half) break;
    }
    return out.copy(_pp);
  }

  function splashAll(pos, radius, damage, victims, exclude = null) {
    for (const v of victims) {
      if (!v.alive || v === exclude) continue;
      const dist = pos.distanceTo(v.pos) - v.radius;
      if (dist > radius) continue;
      const k = dist <= 0 ? 1 : 1 - dist / radius;
      v.takeDamage(damage * (0.35 + 0.65 * k), pos, 'splash');
    }
  }

  function impact(shot, point, victim, solid, victims, player) {
    const size = SIZES[shot.type];
    const ground = !victim && !solid;
    const playerShot = shot.owner === 'player';
    if (victim) {
      victim.takeDamage(shot.damage, point, shot.type);
      if (shot.type === 'bullet') {
        _s.copy(shot.vel).normalize();
        fx.hitSparks(point, _s, victim === player ? 5 : 8);
        if (playerShot) sounds?.hit();
        onImpact?.({ shot, victim, point });
        return;
      }
    }
    if (shot.type === 'bullet') {
      if (solid) {
        fx.hitSparks(point, null, 3);
        if (playerShot && solid.takeDamage) solid.takeDamage(shot.damage * 0.5, point, 'bullet');
      } else {
        _p.copy(point);
        _p.y += 0.3;
        fx.dust(_p, 1);
      }
      return;
    }
    // Explosive: direct hit on a solid, splash on everything around. The
    // cannon breaches walls (wallBonus > 1); missiles and the laser barely scratch them.
    if (solid && solid.takeDamage && playerShot) solid.takeDamage(shot.damage * shot.wallBonus, point, shot.type);
    if (shot.splash > 0) {
      const list = shot.type === 'nuke' ? [...victims, player] : victims;
      splashAll(point, shot.splash, shot.damage, list, victim);
      if (playerShot || shot.type === 'nuke') fort.splash(point, shot.splash, shot.damage * (shot.type === 'nuke' ? 1 : 0.8) * shot.wallBonus);
      bridges?.splash(point, shot.splash, shot.damage * 0.8);
    }
    if (ground && bridges) { const b = bridges.at(point.x, point.z, 1); if (b) b.takeDamage(shot.damage); }
    _p.copy(point);
    if (ground) _p.y += 0.3;
    fx.explosion(_p, { size, ground: ground || !!solid });
    if (shot.type === 'nuke') {
      fx.burn(_p, { size: 10, duration: 40 });
      fx.ring(_p, 90, { life: 1.6, color: 0xffe0a0, flat: true });
      fx.flash(_p, { intensity: 6000, life: 1.4, color: 0xfff0c0, distance: 400 });
      fx.addShake(1.5);
      sounds?.nuke();
    } else {
      sounds?.explosion(shot.type === 'mortar' ? 0.8 : shot.type === 'shell' ? 0.7 : 0.6);
    }
    if (playerShot && (shot.type === 'shell' || shot.type === 'rocket' || shot.type === 'missile') && ground) fx.burn(_p, { size: 1.2, duration: 3 });
    onImpact?.({ shot, victim, point, solid });
  }

  const _enemyMissiles = [];
  function update(dt, { player, enemyTargets }) {
    let pc = 0, ec = 0;
    _enemyMissiles.length = 0;
    for (const s of shots) if (s.type === 'missile' && s.owner !== 'player') _enemyMissiles.push(s);
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.dead) { if (s.mesh) releaseBody(s.key, s.mesh); shots.splice(i, 1); continue; }
      s.age += dt;
      s.prev.copy(s.pos);
      // Homing.
      if (s.target && (!s.target.alive)) s.target = null;
      if (s.target && s.age > 0.2) {
        _lead.copy(s.target.pos);
        if (s.target.vel) _lead.addScaledVector(s.target.vel, Math.min(1.5, s.pos.distanceTo(s.target.pos) / s.speed) * 0.8);
        _d.copy(_lead).sub(s.pos).normalize();
        const angle = s.dir.angleTo(_d);
        if (angle > 1e-4) s.dir.lerp(_d, Math.min(1, (s.turn * dt) / angle)).normalize();
        s.vel.copy(s.dir).multiplyScalar(s.speed * Math.min(1, 0.5 + s.age * 1.5));
      } else if (s.type === 'missile') {
        s.vel.copy(s.dir).multiplyScalar(s.speed * Math.min(1, 0.5 + s.age * 1.5));
      }
      s.vel.y -= s.gravity * dt;
      s.pos.addScaledVector(s.vel, dt);
      let dead = s.age >= s.life;
      let victim = null, solid = null;
      const point = _p;
      point.copy(s.pos);
      // Targets of the other side (swept sphere).
      const victims = s.owner === 'player' ? enemyTargets : [player];
      _d.copy(s.pos).sub(s.prev);
      const len = _d.length();
      // Machine-gun bullets knock incoming missiles out of the air.
      if (s.type === 'bullet' && s.owner === 'player' && _enemyMissiles.length) {
        for (const m of _enemyMissiles) {
          if (m.dead) continue;
          _s.copy(m.pos).sub(s.prev);
          const k = len > 0 ? THREE.MathUtils.clamp(_s.dot(_d) / (len * len), 0, 1) : 0;
          _s.copy(s.prev).addScaledVector(_d, k);
          if (_s.distanceToSquared(m.pos) <= 1.6 * 1.6) {
            m.dead = true;
            fx.explosion(m.pos, { size: 3, ground: false });
            sounds?.explosion(0.5);
            onImpact?.({ shot: s, missileKill: m, point: m.pos });
            dead = true;
            break;
          }
        }
        if (dead) { shots.splice(i, 1); continue; }
      }
      for (const v of victims) {
        if (!v.alive) continue;
        _s.copy(v.pos).sub(s.prev);
        const k = len > 0 ? THREE.MathUtils.clamp(_s.dot(_d) / (len * len), 0, 1) : 0;
        _s.copy(s.prev).addScaledVector(_d, k);
        if (_s.distanceToSquared(v.pos) <= (v.radius + 0.4) ** 2) { victim = v; point.copy(_s); break; }
      }
      // Walls, towers and huts.
      if (!victim && fort.hitSegment(s.prev, s.pos, _hit)) { solid = _hit.solid; point.copy(_hit.point); }
      // Ground.
      let ground = false;
      if (!victim && !solid) {
        const g = terrain.heightAt(s.pos.x, s.pos.z);
        if (s.pos.y <= g) { ground = true; point.copy(s.pos); point.y = g; }
      }
      if (victim || solid || ground) {
        impact(s, point, victim, solid, victims, player);
        dead = true;
      } else if (Math.abs(s.pos.x) > terrain.half + 50 || Math.abs(s.pos.z) > terrain.half + 50) dead = true;
      if (dead) {
        if (s.mesh) releaseBody(s.key, s.mesh);
        shots.splice(i, 1);
        continue;
      }
      if (s.mesh) {
        s.mesh.position.copy(s.pos);
        orient(s.mesh, s.vel.lengthSq() > 0.01 ? s.vel : s.dir);
        s.trailAcc += dt;
        const every = s.type === 'missile' || s.type === 'rocket' ? 0.02 : 0.06;
        while (s.trailAcc > every) {
          s.trailAcc -= every;
          _s.copy(s.pos).addScaledVector(s.dir, -0.8);
          if (s.type === 'missile' || s.type === 'rocket') { fx.trail(_s, s.vel, { size: 0.7, life: 1.0 + Math.random() * 0.4 }); fx.exhaustFire(_s, 0.8); }
          else if (s.type === 'nuke') fx.trail(_s, s.vel, { size: 1.2, life: 1.6, color: new THREE.Color(0x80ff90) });
          else fx.trail(_s, s.vel, { size: 0.35, life: 0.5 });
        }
      } else {
        const mesh = s.owner === 'player' ? playerTracers : enemyTracers;
        const idx = s.owner === 'player' ? pc++ : ec++;
        if (idx < TRACERS) {
          _m.lookAt(_s.set(0, 0, 0), _d.copy(s.vel), _up);
          _q.setFromRotationMatrix(_m);
          mesh.setMatrixAt(idx, _m.compose(s.pos, _q, _s.set(1, 1, 1)));
        }
      }
    }
    playerTracers.count = pc;
    enemyTracers.count = ec;
    playerTracers.instanceMatrix.needsUpdate = true;
    enemyTracers.instanceMatrix.needsUpdate = true;
    // Hide beams nobody refreshed this frame.
    for (const b of beams) { if (!b.used) b.group.visible = false; b.used = false; }
  }

  // A laser beam for one frame. Steps along the ray against solids, the
  // terrain and the victims; applies `dps * dt` to what it touches.
  const _lp = new THREE.Vector3(), _lq = new THREE.Vector3();
  function laser({ origin, dir, range, owner, dps, dt, victims, player, color = 0xff4030, wallBonus = 1 }) {
    const d = _d.copy(dir).normalize();
    let hitLen = range;
    let victim = null;
    let solidHit = null;
    const step = 1.0;
    _lq.copy(origin);
    for (let t = step; t <= range; t += step) {
      _lp.copy(origin).addScaledVector(d, t);
      for (const v of victims) {
        if (!v.alive) continue;
        if (_lp.distanceToSquared(v.pos) <= (v.radius + 0.3) ** 2) { victim = v; break; }
      }
      if (victim) { hitLen = t; break; }
      const solid = fort.solidAt(_lp.x, _lp.y, _lp.z, 0.1);
      if (solid) { solidHit = solid; hitLen = t; break; }
      if (_lp.y <= terrain.heightAt(_lp.x, _lp.z)) { hitLen = t; break; }
      _lq.copy(_lp);
    }
    const end = _lp.copy(origin).addScaledVector(d, hitLen);
    if (victim) { victim.takeDamage(dps * dt, end, 'laser'); if (Math.random() < dt * 20) fx.hitSparks(end, null, 2); }
    else if (solidHit && owner === 'player' && solidHit.takeDamage) { solidHit.takeDamage(dps * dt * wallBonus, end, 'laser'); if (Math.random() < dt * 15) fx.hitSparks(end, null, 2); }
    else if (Math.random() < dt * 10) fx.hitSparks(end, null, 1);
    const b = beams.find((x) => !x.used);
    if (b) {
      b.used = true;
      b.group.visible = true;
      b.group.position.copy(origin);
      _m.lookAt(_s.set(0, 0, 0), _lq.set(0, 0, 0).sub(d), _up);
      b.group.quaternion.setFromRotationMatrix(_m);
      b.group.scale.set(1, 1, hitLen);
      b.glow.material.color.setHex(color);
      b.glow.material.opacity = 0.25 + Math.random() * 0.2;
    }
    return { end, victim, solid: solidHit, length: hitLen };
  }

  function clear() {
    for (const s of shots) if (s.mesh) releaseBody(s.key, s.mesh);
    shots.length = 0;
  }

  function incoming(player) {
    return shots.filter((s) => s.owner !== 'player' && s.target === player);
  }

  return { fire, update, laser, predict, clear, shots, incoming, splashAll, setBridges };
}
