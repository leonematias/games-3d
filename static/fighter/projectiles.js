import * as THREE from 'three';
import { MATERIALS } from './jet.js';
import { WEAPONS, ENEMY } from './config.js';

// Every shot in the air: cannon tracers (instanced), homing missiles, bombs.
// Targets are objects with { pos, radius, alive, hp, takeDamage(), kind,
// vel? }. The player passes itself as a target so enemy fire can hit it.

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _lead = new THREE.Vector3();

function missileBody(enemy) {
  const g = new THREE.Group();
  const mat = enemy ? new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.5, metalness: 0.4 }) : MATERIALS.missile;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3, 10), mat);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.8;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 10), enemy ? new THREE.MeshBasicMaterial({ color: 0xff3020 }) : MATERIALS.stripe);
  band.rotation.x = Math.PI / 2;
  band.position.z = -0.6;
  g.add(body, nose, band);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.6), MATERIALS.dark);
    fin.position.set(Math.cos((i * Math.PI) / 2) * 0.28, Math.sin((i * Math.PI) / 2) * 0.28, 1.2);
    fin.rotation.z = (i * Math.PI) / 2;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8, 1, true), MATERIALS.flame);
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = 1.5 + 1.2;
  g.add(flame);
  const light = new THREE.PointLight(enemy ? 0xff5030 : 0xffb060, 14, 40, 2);
  light.position.z = 2;
  g.add(light);
  return g;
}

function bombBody() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.8, 4, 10), MATERIALS.dark);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.6), MATERIALS.dark);
    fin.position.set(Math.cos((i * Math.PI) / 2) * 0.35, Math.sin((i * Math.PI) / 2) * 0.35, 1.1);
    fin.rotation.z = (i * Math.PI) / 2;
    g.add(fin);
  }
  return g;
}

export function createProjectiles({ scene, fx, terrain, sounds, onPlayerHit = null }) {
  // Tracers.
  const TRACERS = 400;
  const tracerMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.8, 0.8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    TRACERS
  );
  tracerMesh.frustumCulled = false;
  tracerMesh.count = 0;
  scene.add(tracerMesh);
  const enemyTracerMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.8, 0.8, 20),
    new THREE.MeshBasicMaterial({ color: 0xff4a30, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    TRACERS
  );
  enemyTracerMesh.frustumCulled = false;
  enemyTracerMesh.count = 0;
  scene.add(enemyTracerMesh);
  const tracers = [];

  const missiles = [];
  const bombs = [];
  const missilePool = { player: [], enemy: [] };
  const bombPool = [];

  function getMissileMesh(enemy) {
    const pool = enemy ? missilePool.enemy : missilePool.player;
    const m = pool.pop() || missileBody(enemy);
    m.visible = true;
    scene.add(m);
    return m;
  }
  function releaseMissileMesh(m, enemy) {
    m.visible = false;
    scene.remove(m);
    (enemy ? missilePool.enemy : missilePool.player).push(m);
  }

  // A cannon round. With a target inside the assist cone the round is aimed
  // at where the target will be, so a child can score hits without perfect aim.
  function fireGun({ origin, dir, ownerVel, owner, target, speed = WEAPONS.gun.speed, damage = WEAPONS.gun.damage, spread = WEAPONS.gun.spread, range = WEAPONS.gun.range }) {
    const d = dir.clone().normalize();
    if (target && owner === 'player') {
      const dist = origin.distanceTo(target.pos);
      const flight = dist / speed;
      _lead.copy(target.pos);
      if (target.vel) _lead.addScaledVector(target.vel, flight);
      _d.copy(_lead).sub(origin).normalize();
      const assist = Math.cos(THREE.MathUtils.degToRad(WEAPONS.gun.assistDeg));
      if (_d.dot(d) > assist) d.copy(_d);
    }
    d.x += (Math.random() - 0.5) * spread;
    d.y += (Math.random() - 0.5) * spread;
    d.z += (Math.random() - 0.5) * spread;
    d.normalize();
    const vel = d.multiplyScalar(speed);
    if (ownerVel) vel.add(ownerVel);
    tracers.push({ pos: origin.clone(), vel, prev: origin.clone(), life: range / speed, owner, damage });
  }

  function fireMissile({ origin, dir, ownerVel, owner, target, speed, turn, life, damage, splash }) {
    const enemy = owner !== 'player';
    const cfg = enemy ? ENEMY : WEAPONS.missile;
    const mesh = getMissileMesh(enemy);
    mesh.position.copy(origin);
    const d = dir.clone().normalize();
    const m = {
      mesh, pos: origin.clone(), dir: d, speed: speed ?? (enemy ? cfg.missileSpeed : cfg.speed), vel: new THREE.Vector3(),
      turn: turn ?? (enemy ? cfg.missileTurn : cfg.turn), life: life ?? (enemy ? cfg.missileLife : cfg.life),
      damage: damage ?? (enemy ? cfg.missileDamage : cfg.damage), splash: splash ?? (enemy ? 10 : cfg.splash),
      target, owner, enemy, age: 0, trailAcc: 0, boost: ownerVel ? ownerVel.clone() : new THREE.Vector3()
    };
    m.vel.copy(d).multiplyScalar(m.speed * 0.4).add(m.boost);
    missiles.push(m);
    sounds?.missileLaunch(enemy);
    return m;
  }

  function dropBomb({ origin, vel }) {
    const mesh = bombPool.pop() || bombBody();
    mesh.visible = true;
    scene.add(mesh);
    mesh.position.copy(origin);
    const b = { mesh, pos: origin.clone(), vel: vel.clone(), age: 0 };
    bombs.push(b);
    sounds?.bombDrop();
    return b;
  }

  // Where a bomb released now would land (for the HUD).
  function predictBomb(origin, vel, maxSeconds = 12) {
    _p.copy(origin);
    _d.copy(vel);
    const dt = 0.1;
    for (let t = 0; t < maxSeconds; t += dt) {
      _d.y -= WEAPONS.bomb.gravity * dt;
      _p.addScaledVector(_d, dt);
      if (_p.y <= terrain.heightAt(_p.x, _p.z)) return _p.clone();
    }
    return null;
  }

  function orient(mesh, dir) {
    _m.lookAt(_p.set(0, 0, 0), _d.copy(dir), _up);
    mesh.quaternion.setFromRotationMatrix(_m);
  }

  function splashDamage(pos, radius, damage, targets, filterKind) {
    for (const t of targets) {
      if (!t.alive) continue;
      if (filterKind && t.kind !== filterKind) continue;
      const dist = pos.distanceTo(t.pos) - t.radius;
      if (dist > radius) continue;
      const k = dist <= 0 ? 1 : 1 - dist / radius;
      t.takeDamage(damage * (0.4 + 0.6 * k), pos);
    }
  }

  function update(dt, { player, targets }) {
    // Tracers: swept sphere test against the targets of the other side.
    let pc = 0, ec = 0;
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.prev.copy(t.pos);
      t.pos.addScaledVector(t.vel, dt);
      t.life -= dt;
      let dead = t.life <= 0;
      const ground = terrain.heightAt(t.pos.x, t.pos.z);
      if (!dead && t.pos.y <= ground) {
        dead = true;
        _p.set(t.pos.x, ground + 0.5, t.pos.z);
        fx.dust(_p, 2);
        if (Math.random() < 0.5) fx.hitSparks(_p, null, 4);
      }
      if (!dead) {
        const victims = t.owner === 'player' ? targets : [player];
        _d.copy(t.pos).sub(t.prev);
        const len = _d.length();
        for (const v of victims) {
          if (!v.alive) continue;
          // Closest point on the segment to the target centre.
          _p.copy(v.pos).sub(t.prev);
          const s = len > 0 ? THREE.MathUtils.clamp(_p.dot(_d) / (len * len), 0, 1) : 0;
          _p.copy(t.prev).addScaledVector(_d, s);
          if (_p.distanceToSquared(v.pos) <= (v.radius + 0.6) ** 2) {
            v.takeDamage(t.damage, _p, 'gun');
            _s.copy(t.vel).normalize();
            fx.hitSparks(_p, _s, v === player ? 6 : 12);
            dead = true;
            if (t.owner === 'player') { sounds?.hit(); onPlayerHit?.(v); }
            break;
          }
        }
      }
      if (dead) { tracers.splice(i, 1); continue; }
      const mesh = t.owner === 'player' ? tracerMesh : enemyTracerMesh;
      const idx = t.owner === 'player' ? pc++ : ec++;
      if (idx >= TRACERS) continue;
      _m.lookAt(_p.set(0, 0, 0), _d.copy(t.vel), _up);
      _q.setFromRotationMatrix(_m);
      _s.set(1, 1, 1.6);
      mesh.setMatrixAt(idx, _m.compose(t.pos, _q, _s));
    }
    tracerMesh.count = pc;
    enemyTracerMesh.count = ec;
    tracerMesh.instanceMatrix.needsUpdate = true;
    enemyTracerMesh.instanceMatrix.needsUpdate = true;

    // Missiles.
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.age += dt;
      // Motor spool: launch drops away then accelerates.
      const boostFade = Math.max(0, 1 - m.age * 1.5);
      if (m.target && (!m.target.alive || m.target.stun > 0 && m.enemy)) m.target = null;
      if (m.target && m.age > 0.25) {
        _lead.copy(m.target.pos);
        if (m.target.vel) _lead.addScaledVector(m.target.vel, Math.min(2, m.pos.distanceTo(m.target.pos) / m.speed) * 0.9);
        _d.copy(_lead).sub(m.pos).normalize();
        const maxAngle = m.turn * dt;
        const angle = m.dir.angleTo(_d);
        if (angle > 1e-4) {
          const k = Math.min(1, maxAngle / angle);
          m.dir.lerp(_d, k).normalize();
        }
      }
      m.vel.copy(m.dir).multiplyScalar(m.speed * Math.min(1, 0.4 + m.age * 1.2)).addScaledVector(m.boost, boostFade);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      orient(m.mesh, m.vel.lengthSq() > 1 ? m.vel : m.dir);
      m.trailAcc += dt;
      while (m.trailAcc > 0.018) {
        m.trailAcc -= 0.018;
        _p.copy(m.pos).addScaledVector(m.dir, -1.8);
        fx.trail(_p, m.vel, { size: 1.0 + m.age * 0.2, life: 1.4 + Math.random() * 0.6 });
        if (m.age > 0.25) fx.exhaustFire(_p, 1.3);
      }
      let hit = null;
      const victims = m.enemy ? [player] : targets;
      for (const v of victims) {
        if (!v.alive) continue;
        if (m.pos.distanceToSquared(v.pos) <= (v.radius + 2.5) ** 2) { hit = v; break; }
      }
      // Proximity fuse: close enough to the target counts.
      if (!hit && m.target && m.target.alive && m.pos.distanceTo(m.target.pos) < m.target.radius + 6) hit = m.target;
      const ground = terrain.heightAt(m.pos.x, m.pos.z);
      const grounded = m.pos.y <= ground + 0.5;
      if (hit || grounded || m.age >= m.life) {
        if (hit) {
          splashDamage(m.pos, m.splash, m.damage, victims);
          fx.explosion(m.pos, { size: m.enemy ? 7 : 11, velocity: hit.vel });
          sounds?.explosion(m.enemy ? 0.5 : 0.8);
        } else if (grounded) {
          _p.set(m.pos.x, ground, m.pos.z);
          splashDamage(_p, m.splash * 1.5, m.damage, victims, 'ground');
          fx.explosion(_p, { size: 12, ground: true });
          sounds?.explosion(0.7);
        } else {
          fx.explosion(m.pos, { size: 4 });
        }
        releaseMissileMesh(m.mesh, m.enemy);
        missiles.splice(i, 1);
      }
    }

    // Bombs.
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.age += dt;
      b.vel.y -= WEAPONS.bomb.gravity * dt;
      b.vel.multiplyScalar(Math.max(0, 1 - 0.08 * dt));
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      orient(b.mesh, b.vel);
      const ground = terrain.heightAt(b.pos.x, b.pos.z);
      if (b.pos.y <= ground + 0.5 || b.age > 20) {
        _p.set(b.pos.x, ground, b.pos.z);
        splashDamage(_p, WEAPONS.bomb.splash, WEAPONS.bomb.damage, targets, 'ground');
        const water = terrain.isWater(b.pos.x, b.pos.z);
        fx.explosion(_p, { size: water ? 16 : 24, ground: true });
        if (!water) fx.burn(_p, { size: 6, duration: 12 });
        sounds?.explosion(1.2);
        b.mesh.visible = false;
        scene.remove(b.mesh);
        bombPool.push(b.mesh);
        bombs.splice(i, 1);
      }
    }
  }

  // EMP: every enemy missile inside the radius falls out of the sky.
  function empBurst(center, radius) {
    let n = 0;
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      if (!m.enemy || m.pos.distanceTo(center) > radius) continue;
      fx.explosion(m.pos, { size: 5 });
      releaseMissileMesh(m.mesh, true);
      missiles.splice(i, 1);
      n++;
    }
    return n;
  }

  function incomingMissiles(player) {
    return missiles.filter((m) => m.enemy && m.target === player);
  }

  function clear() {
    for (const m of missiles) releaseMissileMesh(m.mesh, m.enemy);
    missiles.length = 0;
    for (const b of bombs) { scene.remove(b.mesh); bombPool.push(b.mesh); }
    bombs.length = 0;
    tracers.length = 0;
  }

  return { fireGun, fireMissile, dropBomb, predictBomb, update, empBurst, incomingMissiles, missiles, bombs, tracers, clear };
}
