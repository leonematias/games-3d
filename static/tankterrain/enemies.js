import * as THREE from 'three';
import { buildCommandTruck, buildHelicopter, buildSoldier, buildTank, buildTurret, charTank, driveTracks, flashTank, updateTankFlash } from './models.js';
import { aimGroups, ballisticPitch, forwardOf, groundPose, slopeAhead, wrapAngle } from './drive.js';
import { COMMAND, ENEMY, HELI, TANK, TROOPER, TURRETS } from './config.js';

// Enemy tanks (scout, heavy, rocket, the boss), static turrets (gun, cannon,
// missile, laser), rocket troopers on foot, attack helicopters and the
// command truck that keeps calling reinforcements. Tanks patrol round their
// home until they see the player, then close to a stand-off distance and
// shoot. Turrets track and fire when the player is inside their range with a
// clear line of sight. Troopers run for cover and fire unguided rockets.
// Helicopters orbit the player and strafe. The boss only takes full damage
// from behind and smashes through walls that are in its way.

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _o = new THREE.Vector3();
const _f = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _q = new THREE.Quaternion();
const MAX_SLOPE = THREE.MathUtils.degToRad(TANK.maxSlopeDeg);
const HELI_SMOKE = new THREE.Color(0x333333);

export function createEnemies({ scene, fx, projectiles, terrain, fort, level, sounds, onEvent }) {
  const tanks = [];
  const turrets = [];
  const troops = [];
  const helis = [];
  const commands = [];
  let boss = null;

  let flankCounter = 0;
  function spawnTank(spec, { awake = false } = {}) {
    if (spec.type === 'trooper') return spawnTrooper(spec, { awake });
    const def = ENEMY[spec.type] || ENEMY.scout;
    const built = buildTank(spec.type, {});
    scene.add(built.root);
    const heading = THREE.MathUtils.degToRad(spec.headingDeg || 0);
    const t = {
      kind: 'tank', type: spec.type, name: def.name, def, built, root: built.root, spec,
      pos: new THREE.Vector3(spec.x, terrain.heightAt(spec.x, spec.z), spec.z), vel: new THREE.Vector3(),
      heading, speed: 0, pitch: 0, roll: 0, radius: def.radius, hp: def.hp, maxHp: def.hp, alive: true, stun: 0,
      home: new THREE.Vector3(spec.x, 0, spec.z), patrolRadius: spec.patrolRadius || 15, goal: new THREE.Vector3(spec.x, 0, spec.z),
      goalTimer: 1 + Math.random() * 3, state: 'patrol', seen: awake ? 30 : 0, cooldown: 2 + Math.random() * 3, burst: 0, burstAcc: 0,
      turretYaw: 0, gunPitch: 0, blocked: 0, blockDir: 1, score: def.score, los: false, losAcc: Math.random(),
      behaviour: def.behaviour || 'chase', flankSide: (flankCounter++ % 2) ? 1 : -1, retreat: 0, awake, missileCooldown: 4, barrelSide: 1, armourAcc: 0,
      takeDamage(amount, at, how) {
        if (!t.alive) return;
        if (t.type === 'boss') {
          // Armour: hits from the front and sides glance off; only the rear takes full damage.
          let k = 0.4;
          if (at) {
            forwardOf(t.heading, _f);
            _d.copy(at).sub(t.pos);
            _d.y = 0;
            const len = _d.length();
            k = len > 0.5 && (_d.dot(_f) / len) < def.rearArc ? 1 : def.frontArmor;
          }
          if (k < 1 && at) {
            fx.hitSparks(at, null, 6);
            t.armourAcc += amount;
            if (t.armourAcc > 40) { t.armourAcc = 0; onEvent?.({ type: 'armour', target: t, at: at.clone() }); }
          }
          amount *= k;
          t.seen = 30;
          t.awake = true;
        }
        t.hp -= amount;
        flashTank(built, 1);
        t.seen = Math.max(t.seen, 6); // being shot at wakes the tank up
        if (t.hp <= 0) killTank(t);
      }
    };
    t.pos.y = terrain.heightAt(t.pos.x, t.pos.z);
    tanks.push(t);
    if (spec.type === 'boss') boss = t;
    return t;
  }

  // Reinforcements roll out awake and hunting.
  function spawnReinforcements(specs) {
    const out = [];
    for (const spec of specs || []) {
      const t = spawnTank(spec, { awake: true });
      t.behaviour = 'chase';
      t.patrolRadius = 60;
      fx.dust(t.pos, 4);
      out.push(t);
    }
    return out;
  }

  function killTank(t) {
    t.alive = false;
    t.hp = 0;
    _p.copy(t.pos);
    _p.y += 1.2;
    const big = t.type === 'boss';
    fx.explosion(_p, { size: (big ? 14 : 5.5) + t.radius * 0.6, ground: false });
    fx.burn(_p, { size: 2.5 + t.radius * 0.5, duration: big ? 90 : 40 });
    fx.debrisBurst(_p, big ? 30 : 10, big ? 20 : 14, big ? 0.8 : 0.5);
    if (big) { fx.ring(_p, 40, { life: 1.4, color: 0xff8040, flat: true }); fx.shakeAt(_p, 1.2, 200); sounds?.nuke?.(); }
    sounds?.explosion(big ? 1.6 : 1.0);
    charTank(t.built);
    fort.addObstacle(t.pos.x, t.pos.z, t.radius * 0.7);
    onEvent?.({ type: big ? 'boss' : 'tank', target: t, score: t.score });
  }

  function spawnTurret(spec, baseY, onTower) {
    const def = TURRETS[spec.type] || TURRETS.gun;
    const built = buildTurret(spec.type, def.color);
    built.root.position.set(spec.x, baseY, spec.z);
    built.root.rotation.y = Math.random() * Math.PI * 2;
    if (onTower) built.root.scale.setScalar(0.85);
    scene.add(built.root);
    const s = {
      kind: 'turret', type: spec.type, name: def.name, def, built, root: built.root, spec,
      pos: new THREE.Vector3(spec.x, baseY + built.height * (onTower ? 0.85 : 1), spec.z), radius: def.radius, hp: def.hp, maxHp: def.hp, alive: true, stun: 0,
      yaw: built.root.rotation.y, pitch: 0, cooldown: 1 + Math.random() * 2, burst: 0, burstAcc: 0, beam: 0, score: def.score, onTower, los: false, losAcc: Math.random(),
      takeDamage(amount, at, how) {
        if (!s.alive) return;
        s.hp -= amount;
        flashTank(built, 1);
        if (s.hp <= 0) killTurret(s);
      }
    };
    turrets.push(s);
    return s;
  }

  function killTurret(s) {
    s.alive = false;
    s.hp = 0;
    fx.explosion(s.pos, { size: 6, ground: false });
    fx.burn(_p.copy(s.pos).setY(s.root.position.y + 0.8), { size: 2.2, duration: 35 });
    fx.debrisBurst(s.pos, 8, 12, 0.4);
    sounds?.explosion(0.9);
    s.root.traverse((n) => { if (n.isMesh) n.material = s.charMat || (s.charMat = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1 })); });
    s.built.pitch.rotation.x = 0.6;
    s.root.scale.y *= 0.7;
    onEvent?.({ type: 'turret', target: s, score: s.score });
  }

  // ------------------------------------------------------------ troopers
  function spawnTrooper(spec, { awake = false } = {}) {
    const built = buildSoldier();
    scene.add(built.root);
    const t = {
      kind: 'trooper', type: 'trooper', name: TROOPER.name, def: TROOPER, built, root: built.root, spec,
      pos: new THREE.Vector3(spec.x, terrain.heightAt(spec.x, spec.z), spec.z), vel: new THREE.Vector3(),
      heading: THREE.MathUtils.degToRad(spec.headingDeg || 0), radius: TROOPER.radius, hp: TROOPER.hp, maxHp: TROOPER.hp, alive: true, stun: 0,
      home: new THREE.Vector3(spec.x, 0, spec.z), patrolRadius: spec.patrolRadius || 6, goal: new THREE.Vector3(spec.x, 0, spec.z), goalTimer: 2 + Math.random() * 4,
      state: 'patrol', seen: awake ? 20 : 0, cooldown: 2 + Math.random() * 3, score: TROOPER.score, los: false, losAcc: Math.random(),
      cover: null, coverAcc: 3, crouch: 0, walk: 0, moving: false,
      takeDamage(amount, at, how) {
        if (!t.alive) return;
        t.hp -= amount;
        flashTank(built, 1);
        t.seen = Math.max(t.seen, 8);
        if (t.hp <= 0) killTrooper(t);
      }
    };
    troops.push(t);
    return t;
  }

  function killTrooper(t) {
    t.alive = false;
    t.hp = 0;
    _p.copy(t.pos);
    _p.y += 0.8;
    fx.hitSparks(_p, null, 6);
    fx.debrisBurst(_p, 4, 6, 0.25);
    fx.dust(t.pos, 2);
    sounds?.hit();
    // The figure drops flat.
    t.root.rotation.x = -Math.PI / 2;
    t.root.position.y = terrain.heightAt(t.pos.x, t.pos.z) + 0.3;
    t.root.traverse((n) => { if (n.isMesh) n.material = charMat(); });
    onEvent?.({ type: 'trooper', target: t, score: t.score });
  }
  let _charMat = null;
  function charMat() { return _charMat || (_charMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 })); }

  // Cover: the nearest wall, tower or obstacle within reach; stand on its far side from the player.
  function findCover(t, player) {
    let best = null, bd = TROOPER.coverRadius;
    const consider = (x, z, r) => {
      const d = Math.hypot(x - t.pos.x, z - t.pos.z);
      if (d < bd) { bd = d; best = { x, z, r }; }
    };
    for (const w of fort.walls) if (w.alive) consider(w.x, w.z, Math.max(w.len, w.thick) * 0.5);
    for (const tw of fort.towers) consider(tw.x, tw.z, tw.r);
    for (const o of fort.obstacles) if (o.r > 1.0) consider(o.x, o.z, o.r);
    if (!best) return null;
    const dx = best.x - player.pos.x, dz = best.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const off = best.r + 1.3;
    return new THREE.Vector3(best.x + (dx / d) * off, 0, best.z + (dz / d) * off);
  }

  function updateTrooper(t, dt, player) {
    updateTankFlash(t.built, dt);
    if (!t.alive) return;
    t.cooldown -= dt;
    if (t.stun > 0) { t.stun -= dt; return; }
    const dist = Math.hypot(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
    t.losAcc += dt;
    if (t.losAcc > 0.3) {
      t.losAcc = 0;
      _o.copy(t.pos).setY(t.pos.y + 1.6 - t.crouch * 0.6);
      _p.copy(player.pos).setY(player.pos.y + 1.6);
      t.los = player.alive && !env.smoked && dist < TROOPER.sight * env.sight && fort.lineClear(_o, _p, 4);
    }
    if (t.los) t.seen = Math.max(t.seen, 6);
    else t.seen = Math.max(0, t.seen - dt);
    const engaged = (t.seen > 0 || env.alarm) && player.alive;
    t.state = engaged ? 'engage' : 'patrol';

    // Crushed under the tank.
    if (player.alive && dist < player.radius + 0.4 && Math.abs(player.speed) > 1.5) { killTrooper(t); return; }

    let goal = null;
    if (engaged) {
      t.coverAcc += dt;
      if (t.coverAcc > 3) { t.coverAcc = 0; t.cover = findCover(t, player); }
      if (t.cover) goal = t.cover;
      else if (dist < 28) { // no cover: back off from the tank
        goal = _o.set(t.pos.x + (t.pos.x - player.pos.x) / dist * 20, 0, t.pos.z + (t.pos.z - player.pos.z) / dist * 20);
      }
    } else {
      t.goalTimer -= dt;
      if (t.goalTimer <= 0) {
        t.goalTimer = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * t.patrolRadius;
        t.goal.set(t.home.x + Math.sin(a) * r, 0, t.home.z + Math.cos(a) * r);
      }
      goal = t.goal;
    }
    const before = _f.copy(t.pos);
    t.moving = false;
    if (goal) {
      const gx = goal.x - t.pos.x, gz = goal.z - t.pos.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 1.2) {
        const step = Math.min(gd, TROOPER.speed * (engaged ? 1 : 0.45) * dt);
        t.pos.x += (gx / gd) * step;
        t.pos.z += (gz / gd) * step;
        t.heading = Math.atan2(gx, gz);
        t.moving = true;
        if (terrain.isWater(t.pos.x, t.pos.z) || slopeAhead(terrain, t.pos.x, t.pos.z, t.heading, 1.5, 1) > MAX_SLOPE) { t.pos.copy(before); t.moving = false; t.cover = null; }
        fort.resolveCircle(t.pos, 0.5);
      }
    }
    const atCover = engaged && !t.moving;
    t.crouch += ((atCover ? 1 : 0) - t.crouch) * Math.min(1, dt * 5);
    // Face the player when engaged and standing still.
    if (engaged && !t.moving) t.heading = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
    t.pos.y = terrain.heightAt(t.pos.x, t.pos.z);
    t.root.position.copy(t.pos);
    t.root.rotation.set(0, t.heading, 0);
    t.walk += (t.moving ? TROOPER.speed * 2.2 : 0) * dt;
    const swing = t.moving ? Math.sin(t.walk) * 0.6 : 0;
    t.built.legs[0].rotation.x = swing;
    t.built.legs[1].rotation.x = -swing;
    t.built.torso.position.y = -t.crouch * 0.55;
    t.built.torso.rotation.x = t.crouch * 0.25;
    for (const leg of t.built.legs) { leg.rotation.x += t.crouch * 1.1; leg.scale.y = 1 - t.crouch * 0.35; }
    t.root.rotation.x = t.crouch * 0.05;
    // Fire an unguided rocket when the player is in range and in sight.
    if (engaged && t.los && dist < TROOPER.range && t.cooldown <= 0 && !t.moving) {
      t.cooldown = TROOPER.fireEvery * (0.8 + Math.random() * 0.5);
      _o.copy(t.built.muzzle).applyMatrix4(t.root.matrixWorld);
      const flight = dist / 55;
      _aim.copy(player.pos).setY(player.pos.y + 0.8).addScaledVector(player.vel, flight * 0.8);
      _d.copy(_aim).sub(_o);
      const flat = Math.hypot(_d.x, _d.z);
      const pitch = ballisticPitch(flat, _d.y, 55, 3);
      _d.set(Math.sin(Math.atan2(_d.x, _d.z)) * Math.cos(pitch), Math.sin(pitch), Math.cos(Math.atan2(_d.x, _d.z)) * Math.cos(pitch));
      projectiles.fire({ type: 'rocket', origin: _o, dir: _d, owner: 'enemy', speed: 55, gravity: 3, damage: TROOPER.damage, splash: 3, life: 4, spread: 0.03 });
      fx.exhaustFire(_o, 1.2);
      fx.dust(_p.copy(t.pos), 1);
      sounds?.rocket();
    }
  }

  // ----------------------------------------------------------- helicopters
  function spawnHeli(spec) {
    const built = buildHelicopter();
    scene.add(built.root);
    const ground = terrain.groundAt(spec.x, spec.z);
    const parked = spec.role === 'alarm';
    const h = {
      kind: 'heli', type: 'heli', name: HELI.name, def: HELI, built, root: built.root, spec, role: spec.role,
      pos: new THREE.Vector3(spec.x, parked ? ground + 1.4 : ground + HELI.altitude, spec.z), vel: new THREE.Vector3(),
      heading: Math.random() * Math.PI * 2, speed: 0, radius: HELI.radius, hp: HELI.hp, maxHp: HELI.hp, alive: true, stun: 0,
      home: new THREE.Vector3(spec.x, 0, spec.z), patrolRadius: spec.patrolRadius || 100, state: parked ? 'parked' : 'patrol', seen: 0, los: false, losAcc: Math.random(),
      gunCooldown: 3, burst: 0, burstAcc: 0, rocketCooldown: 5, orbitA: Math.random() * Math.PI * 2, orbitDir: Math.random() < 0.5 ? -1 : 1, patrolA: 0,
      rotor: parked ? 0 : 1, launchTimer: 0, roll: 0, pitch: 0, score: HELI.score, falling: false, spin: 0, smokeAcc: 0, gunYaw: 0, gunPitch: 0,
      takeDamage(amount, at, how) {
        if (!h.alive) return;
        h.hp -= amount;
        flashTank(built, 1);
        h.seen = Math.max(h.seen, 8);
        if (h.state === 'parked') launchHeli(h);
        if (h.hp <= 0) killHeli(h);
      }
    };
    built.root.position.copy(h.pos);
    built.root.rotation.y = h.heading;
    helis.push(h);
    if (parked) fort.addObstacle(spec.x, spec.z, 4.5);
    return h;
  }

  function launchHeli(h) {
    if (h.state !== 'parked' || !h.alive) return;
    h.state = 'launch';
    h.launchTimer = HELI.launchSeconds;
    // The helipad stops being an obstacle once the helicopter is up.
    const i = fort.obstacles.findIndex((o) => o.x === h.spec.x && o.z === h.spec.z);
    if (i >= 0) fort.obstacles.splice(i, 1);
    onEvent?.({ type: 'heliLaunch', target: h });
  }

  function killHeli(h) {
    h.alive = false;
    h.hp = 0;
    h.falling = true;
    h.spin = 4 + Math.random() * 3;
    h.vel.set(Math.sin(h.heading) * h.speed * 0.5, 2, Math.cos(h.heading) * h.speed * 0.5);
    fx.explosion(h.pos, { size: 7, ground: false });
    sounds?.explosion(1.1);
    charTank(h.built);
    onEvent?.({ type: 'heli', target: h, score: h.score });
  }

  function updateHeli(h, dt, player, t) {
    updateTankFlash(h.built, dt);
    const built = h.built;
    if (h.falling) {
      // Spinning down to the ground, then a fireball.
      h.vel.y -= 14 * dt;
      h.pos.addScaledVector(h.vel, dt);
      h.heading += h.spin * dt;
      h.roll += dt * 1.5;
      h.smokeAcc += dt;
      if (h.smokeAcc > 0.05) { h.smokeAcc = 0; fx.pools.smoke.emit({ x: h.pos.x, y: h.pos.y, z: h.pos.z, vx: 0, vy: 1, vz: 0, life: 2.5, size: 1.5, sizeEnd: 6, color: HELI_SMOKE, colorEnd: HELI_SMOKE, alpha: 0.7 }); fx.pools.fire.emit({ x: h.pos.x, y: h.pos.y, z: h.pos.z, vx: 0, vy: 1, vz: 0, life: 0.4, size: 2, sizeEnd: 0.4, color: new THREE.Color(0xff8030), colorEnd: new THREE.Color(0x802000), alpha: 0.9 }); }
      const g = terrain.groundAt(h.pos.x, h.pos.z);
      if (h.pos.y <= g + 1) {
        h.falling = false;
        h.pos.y = g + 0.8;
        fx.explosion(h.pos, { size: 12, ground: true });
        fx.burn(_p.copy(h.pos).setY(g), { size: 4, duration: 60 });
        fx.debrisBurst(h.pos, 18, 16, 0.6);
        fx.shakeAt(h.pos, 0.8, 150);
        sounds?.explosion(1.4);
        fort.addObstacle(h.pos.x, h.pos.z, 4);
        built.rotor.rotation.z = 0.4;
        h.rotor = 0;
      }
      built.root.position.copy(h.pos);
      built.root.rotation.set(0, h.heading, 0);
      built.body.rotation.set(0.3, 0, Math.sin(h.roll) * 0.5, 'YXZ');
      built.rotor.rotation.y += h.rotor * 25 * dt;
      return;
    }
    if (!h.alive) return;
    built.rotor.rotation.y += h.rotor * 28 * dt;
    built.tailRotor.rotation.x += h.rotor * 40 * dt;
    built.lamp.material.emissiveIntensity = h.rotor > 0.5 && Math.sin(t * 6) > 0.6 ? 4 : 0.3;
    if (h.state === 'parked') {
      built.root.position.copy(h.pos);
      built.root.rotation.set(0, h.heading, 0);
      if (env.alarm) launchHeli(h);
      return;
    }
    if (h.stun > 0) { h.stun -= dt; }
    h.gunCooldown -= dt;
    h.rocketCooldown -= dt;
    const ground = terrain.groundAt(h.pos.x, h.pos.z);
    if (h.state === 'launch') {
      h.rotor = Math.min(1, h.rotor + dt / 2.5);
      h.launchTimer -= dt;
      if (Math.random() < dt * 12) fx.dust(_p.set(h.pos.x + (Math.random() - 0.5) * 8, ground, h.pos.z + (Math.random() - 0.5) * 8), 1);
      if (h.launchTimer <= 0) {
        h.pos.y += HELI.climb * dt;
        if (h.pos.y > ground + HELI.altitude * 0.6) { h.state = 'patrol'; h.seen = 20; }
      }
      built.root.position.copy(h.pos);
      built.root.rotation.set(0, h.heading, 0);
      return;
    }
    // Sight.
    const dist = h.pos.distanceTo(player.pos);
    h.losAcc += dt;
    if (h.losAcc > 0.3) {
      h.losAcc = 0;
      _p.copy(player.pos).setY(player.pos.y + 1.6);
      h.los = player.alive && !env.smoked && dist < HELI.sight * Math.max(env.sight, 0.7) && fort.lineClear(h.pos, _p, 6);
    }
    if (h.los) h.seen = Math.max(h.seen, 10);
    else h.seen = Math.max(0, h.seen - dt);
    const engaged = h.seen > 0 && player.alive && h.stun <= 0;
    h.state = engaged ? 'engage' : 'patrol';
    // Where to fly: an orbit round the player, or a circuit round home.
    let tx, tz;
    if (engaged) {
      h.orbitA += h.orbitDir * dt * (HELI.speed * 0.8) / HELI.orbit;
      tx = player.pos.x + Math.cos(h.orbitA) * HELI.orbit;
      tz = player.pos.z + Math.sin(h.orbitA) * HELI.orbit;
      if (Math.random() < dt * 0.08) h.orbitDir *= -1;
    } else {
      h.patrolA += dt * (HELI.speed * 0.6) / h.patrolRadius;
      tx = h.home.x + Math.cos(h.patrolA) * h.patrolRadius;
      tz = h.home.z + Math.sin(h.patrolA) * h.patrolRadius;
    }
    const desired = Math.atan2(tx - h.pos.x, tz - h.pos.z);
    const diff = wrapAngle(desired - h.heading);
    const turned = THREE.MathUtils.clamp(diff, -HELI.turn * dt, HELI.turn * dt);
    h.heading += turned;
    const want = Math.hypot(tx - h.pos.x, tz - h.pos.z) > 12 ? HELI.speed * (engaged ? 1 : 0.6) * Math.max(0.35, Math.cos(diff)) : 0;
    h.speed += THREE.MathUtils.clamp(want - h.speed, -12 * dt, 12 * dt);
    forwardOf(h.heading, _f);
    const before = _o.copy(h.pos);
    h.pos.addScaledVector(_f, h.speed * dt);
    const limit = terrain.half - 20;
    h.pos.x = THREE.MathUtils.clamp(h.pos.x, -limit, limit);
    h.pos.z = THREE.MathUtils.clamp(h.pos.z, -limit, limit);
    // Altitude: clear the ground here and ahead, plus the fort's towers.
    const ahead = terrain.groundAt(h.pos.x + _f.x * 40, h.pos.z + _f.z * 40);
    const wantY = Math.max(ground, ahead) + HELI.altitude;
    h.pos.y += THREE.MathUtils.clamp(wantY - h.pos.y, -HELI.climb * dt, HELI.climb * 1.5 * dt);
    h.vel.copy(h.pos).sub(before).divideScalar(Math.max(dt, 1e-4));
    h.roll += ((-turned / Math.max(dt, 1e-3)) * 0.35 - h.roll) * Math.min(1, dt * 3);
    h.pitch += ((h.speed / HELI.speed) * 0.22 - h.pitch) * Math.min(1, dt * 3);
    built.root.position.copy(h.pos);
    built.root.rotation.set(0, h.heading, 0);
    built.body.rotation.set(h.pitch, 0, THREE.MathUtils.clamp(h.roll, -0.6, 0.6), 'YXZ');
    if (h.pos.y - ground < 14 && Math.random() < dt * 8) fx.dust(_p.set(h.pos.x + (Math.random() - 0.5) * 10, ground, h.pos.z + (Math.random() - 0.5) * 10), 1);
    if (h.hp < h.maxHp * 0.4 && Math.random() < dt * 10) fx.damageSmoke(_p.copy(h.pos).setY(h.pos.y + 0.5), h.vel);

    // Chin gun tracks the player; rockets go straight ahead when the nose is on.
    let gy = 0, gp = -0.3;
    if (engaged) {
      _o.copy(built.muzzle).applyMatrix4(built.gun.matrixWorld);
      const aim = aimAt(h, _o, player, 'mg', 170, 0, 0.5);
      gy = wrapAngle(aim.yawWorld - h.heading);
      gp = -aim.pitch;
    }
    h.gunYaw += THREE.MathUtils.clamp(wrapAngle(gy - h.gunYaw), -2.5 * dt, 2.5 * dt);
    h.gunPitch += THREE.MathUtils.clamp(gp - h.gunPitch, -2 * dt, 2 * dt);
    built.gunYaw.rotation.y = THREE.MathUtils.clamp(h.gunYaw, -1.3, 1.3);
    built.gun.rotation.x = THREE.MathUtils.clamp(h.gunPitch, -0.2, 1.2);
    if (!engaged || !h.los) { h.burst = 0; return; }
    if (h.burst > 0) {
      h.burstAcc += dt;
      while (h.burstAcc > 0.08 && h.burst > 0) {
        h.burstAcc -= 0.08;
        h.burst--;
        built.gun.updateWorldMatrix(true, false);
        _o.copy(built.muzzle).applyMatrix4(built.gun.matrixWorld);
        _d.set(0, 0, 1).applyQuaternion(built.gun.getWorldQuaternion(_q)).normalize();
        projectiles.fire({ type: 'bullet', origin: _o, dir: _d, owner: 'enemy', speed: 170, damage: HELI.gunDamage, spread: 0.04, life: 1.6 });
        fx.exhaustFire(_o, 0.8);
        if (Math.random() < 0.4) sounds?.enemyGun();
      }
    } else if (h.gunCooldown <= 0 && Math.abs(h.gunYaw) < 1.2 && dist < 200) {
      h.gunCooldown = HELI.gunEvery * (0.8 + Math.random() * 0.4);
      h.burst = HELI.burst;
      h.burstAcc = 0;
    }
    const bearing = Math.atan2(player.pos.x - h.pos.x, player.pos.z - h.pos.z);
    if (h.rocketCooldown <= 0 && dist < 190 && Math.abs(wrapAngle(bearing - h.heading)) < 0.3) {
      h.rocketCooldown = HELI.rocketEvery * (0.8 + Math.random() * 0.4);
      built.body.updateWorldMatrix(true, false);
      for (const pod of built.pods) {
        _o.copy(pod).applyMatrix4(built.body.matrixWorld);
        const flight = dist / 75;
        _aim.copy(player.pos).setY(player.pos.y + 0.8).addScaledVector(player.vel, flight * 0.9);
        _d.copy(_aim).sub(_o).normalize();
        projectiles.fire({ type: 'rocket', origin: _o, dir: _d, owner: 'enemy', speed: 75, gravity: 2, damage: HELI.rocketDamage, splash: 5, life: 4, spread: 0.02 });
        fx.exhaustFire(_o, 1.6);
      }
      sounds?.rocket();
    }
  }

  // ---------------------------------------------------------- command truck
  function spawnCommand(spec) {
    const built = buildCommandTruck();
    const y = terrain.groundAt(spec.x, spec.z);
    built.root.position.set(spec.x, y, spec.z);
    built.root.rotation.y = THREE.MathUtils.degToRad(spec.yawDeg || 0);
    scene.add(built.root);
    const c = {
      kind: 'command', type: 'command', name: COMMAND.name, def: COMMAND, built, root: built.root, spec,
      pos: new THREE.Vector3(spec.x, y + 1.6, spec.z), radius: COMMAND.radius, hp: COMMAND.hp, maxHp: COMMAND.hp, alive: true, stun: 0, score: COMMAND.score,
      calls: spec.calls || ['scout'], every: spec.every || 40, max: spec.max || 4, called: 0, timer: 12, alerted: false, callIndex: 0, los: false, losAcc: Math.random(),
      state: 'patrol',
      takeDamage(amount, at, how) {
        if (!c.alive) return;
        c.hp -= amount;
        flashTank(built, 1);
        if (c.hp <= 0) killCommand(c);
      }
    };
    fort.addObstacle(spec.x, spec.z, 3.0);
    commands.push(c);
    return c;
  }

  function killCommand(c) {
    c.alive = false;
    c.hp = 0;
    fx.explosion(c.pos, { size: 8, ground: false });
    fx.burn(_p.copy(c.pos).setY(c.pos.y - 1), { size: 3, duration: 50 });
    fx.debrisBurst(c.pos, 12, 14, 0.5);
    sounds?.explosion(1.1);
    charTank(c.built);
    c.built.beacon.material.emissiveIntensity = 0;
    c.root.rotation.z = 0.12;
    onEvent?.({ type: 'command', target: c, score: c.score, called: c.called });
  }

  function updateCommand(c, dt, player, t) {
    updateTankFlash(c.built, dt);
    if (!c.alive) return;
    c.built.beacon.material.emissiveIntensity = Math.sin(t * (c.alerted ? 12 : 4)) > 0.3 ? 3 : 0.2;
    if (!c.alerted) {
      c.losAcc += dt;
      if (c.losAcc > 0.4) {
        c.losAcc = 0;
        const dist = c.pos.distanceTo(player.pos);
        _p.copy(player.pos).setY(player.pos.y + 1.6);
        c.los = player.alive && dist < COMMAND.alertRange && fort.lineClear(c.pos, _p, 5);
      }
      if (env.alarm || c.los) {
        c.alerted = true;
        c.state = 'engage';
        onEvent?.({ type: 'commandAlert', target: c });
      }
      return;
    }
    if (c.called >= c.max) return;
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = c.every;
      const slots = level.fort.reinforcements || [];
      const slot = slots.length ? slots[c.called % slots.length] : { x: c.pos.x + 8, z: c.pos.z + 8, headingDeg: 0 };
      const type = c.calls[c.callIndex++ % c.calls.length];
      const spawned = spawnReinforcements([{ ...slot, type }]);
      c.called += spawned.length;
      onEvent?.({ type: 'call', target: c, spawned, left: c.max - c.called });
    }
  }

  // ------------------------------------------------------------- spawning
  for (const spec of level.enemies || []) spawnTank(spec);
  for (const spec of level.turrets || []) spawnTurret(spec, terrain.groundAt(spec.x, spec.z), false);
  for (const spec of level.fort.turrets || []) spawnTurret(spec, terrain.groundAt(spec.x, spec.z), false);
  for (const tower of fort.towers) {
    if (!tower.turret) continue;
    spawnTurret({ x: tower.x, z: tower.z, type: tower.turret }, tower.top, true);
  }
  for (const spec of level.fort.helis || []) spawnHeli(spec);
  if (level.fort.command) spawnCommand(level.fort.command);
  if (level.boss?.tank) spawnTank(level.boss.tank);
  // Turrets on the ground are solid for driving.
  for (const s of turrets) if (!s.onTower) fort.addObstacle(s.pos.x, s.pos.z, 2.4);

  // ------------------------------------------------------------- firing
  function muzzleWorld(built, local, out) {
    built.gun.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(built.gun.matrixWorld);
  }
  function gunDir(built, out) {
    return out.set(0, 0, 1).applyQuaternion(built.gun.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  function fireAt(e, player, kind, muzzle, dir, dt) {
    const def = e.def;
    if (kind === 'mg') {
      if (e.burst > 0) {
        e.burstAcc += dt;
        while (e.burstAcc > 0.09 && e.burst > 0) {
          e.burstAcc -= 0.09;
          e.burst--;
          projectiles.fire({ type: 'bullet', origin: muzzle, dir, owner: 'enemy', speed: 170, damage: def.damage, spread: 0.035, life: 1.4 });
          fx.exhaustFire(muzzle, 0.8);
          if (Math.random() < 0.4) sounds?.enemyGun();
        }
        return;
      }
      if (e.cooldown <= 0) { e.cooldown = def.fireEvery * (0.8 + Math.random() * 0.4); e.burst = def.burst; e.burstAcc = 0; }
    } else if (kind === 'cannon') {
      if (e.cooldown <= 0) {
        e.cooldown = def.fireEvery * (0.8 + Math.random() * 0.4);
        projectiles.fire({ type: 'shell', origin: muzzle, dir, owner: 'enemy', speed: 90, gravity: 16, damage: def.damage, splash: 4, life: 6 });
        fx.exhaustFire(muzzle, e.type === 'boss' ? 3.5 : 2.2);
        fx.flash(muzzle, { intensity: 300, life: 0.15, distance: 40 });
        sounds?.cannon();
      }
    } else if (kind === 'missile') {
      if (e.cooldown <= 0) {
        e.cooldown = def.fireEvery * (0.8 + Math.random() * 0.4);
        _d.copy(dir).y += env.jammed ? 0.05 : 0.35;
        // With the radar gone the missiles fly straight (no homing).
        projectiles.fire({ type: 'missile', origin: muzzle, dir: _d.normalize(), owner: 'enemy', speed: 46, damage: def.damage, splash: 5, life: 8, target: env.jammed ? null : player, turn: 1.7 });
        sounds?.missile(true);
      }
    } else if (kind === 'laser') {
      if (e.beam > 0) {
        e.beam -= dt;
        projectiles.laser({ origin: muzzle, dir, range: def.range + 20, owner: 'enemy', dps: def.damage, dt, victims: [player], player, color: 0xff3020 });
        if (e.built.lens) e.built.lens.material.emissiveIntensity = 4;
        return;
      }
      if (e.built.lens) e.built.lens.material.emissiveIntensity = 1.8;
      if (e.cooldown <= 0) { e.cooldown = def.fireEvery; e.beam = def.beamSeconds; sounds?.laserTurret?.(); }
    }
  }

  // Aim yaw/pitch (model space) from a muzzle towards the target, with lead and ballistics.
  function aimAt(e, origin, target, kind, speed, gravity, leadFactor = 1) {
    _aim.copy(target.pos);
    _aim.y += 0.6;
    const flight = origin.distanceTo(_aim) / speed;
    if (target.vel) _aim.addScaledVector(target.vel, flight * leadFactor);
    const dx = _aim.x - origin.x, dz = _aim.z - origin.z;
    const dist = Math.hypot(dx, dz);
    const yawWorld = Math.atan2(dx, dz);
    const pitch = gravity > 0 ? ballisticPitch(dist, _aim.y - origin.y, speed, gravity) : Math.atan2(_aim.y - origin.y, dist);
    return { yawWorld, pitch, dist };
  }

  function updateTank(e, dt, player, t) {
    const built = e.built;
    updateTankFlash(built, dt);
    if (!e.alive) return;
    e.cooldown -= dt;
    e.missileCooldown -= dt;
    if (e.stun > 0) { e.stun -= dt * (e.type === 'boss' ? 2 : 1); return; }
    const def = e.def;
    const toPlayer = _d.copy(player.pos).sub(e.pos);
    const dist = toPlayer.length();
    // Line of sight is checked a few times a second. Weather, night and the
    // player's smoke shorten or kill it.
    e.losAcc += dt;
    if (e.losAcc > 0.25) {
      e.losAcc = 0;
      _o.copy(e.pos).setY(e.pos.y + 2.2 * e.built.scale);
      _p.copy(player.pos).setY(player.pos.y + 1.6);
      e.los = player.alive && !env.smoked && dist < def.sight * env.sight && fort.lineClear(_o, _p, 4);
    }
    if (e.los) e.seen = Math.max(e.seen, 5);
    else e.seen = Math.max(0, e.seen - dt);
    if (e.type === 'boss') {
      // The boss sleeps until the alarm or a hit, then never loses the scent.
      if (env.alarm) e.awake = true;
      if (e.awake) e.seen = 30;
    }
    const engaged = e.seen > 0 && player.alive;
    e.state = engaged ? 'engage' : 'patrol';

    // Where to drive.
    let want = 0;      // -1 reverse, 0 stop, 1 forward
    let goalX, goalZ;
    if (engaged) {
      goalX = player.pos.x; goalZ = player.pos.z;
      if (e.behaviour === 'flank') {
        // Scouts take a side: aim for a point beside the player, not at them.
        const bearing = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        const side = bearing + e.flankSide * Math.PI / 2;
        goalX = player.pos.x + Math.sin(side) * def.standoff * 0.9;
        goalZ = player.pos.z + Math.cos(side) * def.standoff * 0.9;
        const dg = Math.hypot(goalX - e.pos.x, goalZ - e.pos.z);
        if (dg > 8) want = 1;
        else if (dist < def.standoff * 0.5) want = -1;
      } else if (e.behaviour === 'hold') {
        // Heavies hold their post: they only move within the hold radius and never chase.
        const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
        if (fromHome > (def.holdRadius || 40)) { goalX = e.home.x; goalZ = e.home.z; want = 1; }
        else if (dist > def.standoff * 1.15 && fromHome < (def.holdRadius || 40) * 0.6) want = 1;
        else if (dist < def.standoff * 0.5) want = -1;
      } else if (e.behaviour === 'kite') {
        // Rocket tanks keep their distance and fall back towards home (cover) when pressed.
        if (dist < def.standoff * 0.7) { e.retreat = 3; }
        if (e.retreat > 0) {
          e.retreat -= dt;
          const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
          if (fromHome > 6 && dist < def.standoff * 1.1) { goalX = e.home.x; goalZ = e.home.z; want = 1; }
          else { want = dist < def.standoff * 0.7 ? -1 : 0; }
        } else if (dist > def.standoff * 1.3) want = 1;
      } else {
        // Chase (and the boss): close to the stand-off distance; the boss keeps its nose on the player.
        if (dist > def.standoff * 1.15) want = 1;
        else if (dist < def.standoff * 0.55 && e.type !== 'boss') want = -1;
      }
    } else if (e.type === 'boss') {
      goalX = e.pos.x; goalZ = e.pos.z;   // asleep in the yard
    } else {
      e.goalTimer -= dt;
      if (e.goalTimer <= 0 || Math.hypot(e.goal.x - e.pos.x, e.goal.z - e.pos.z) < 4) {
        e.goalTimer = 5 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * e.patrolRadius;
        e.goal.set(e.home.x + Math.sin(a) * r, 0, e.home.z + Math.cos(a) * r);
      }
      goalX = e.goal.x; goalZ = e.goal.z;
      if (Math.hypot(goalX - e.pos.x, goalZ - e.pos.z) > 4 && e.goalTimer < 4 + Math.random()) want = 1;
    }
    // Steer the hull.
    let desired = Math.atan2(goalX - e.pos.x, goalZ - e.pos.z);
    if (want < 0) desired += Math.PI;
    if (e.blocked > 0) { e.blocked -= dt; desired = e.heading + e.blockDir * 1.3; want = 1; }
    let diff = wrapAngle(desired - e.heading);
    const turnStep = def.turn * dt;
    const turned = THREE.MathUtils.clamp(diff, -turnStep, turnStep);
    e.heading += turned;
    const maxSpeed = def.speed * (engaged ? 1 : 0.55);
    let target = 0;
    if (want !== 0 && Math.abs(diff) < 1.1) target = want * maxSpeed * Math.max(0.3, Math.cos(diff));
    e.speed += THREE.MathUtils.clamp(target - e.speed, -8 * dt, 8 * dt);
    // Slopes and obstacles.
    if (Math.abs(e.speed) > 0.1) {
      const dir = Math.sign(e.speed);
      const slope = slopeAhead(terrain, e.pos.x, e.pos.z, e.heading, def.length, dir);
      if (slope > MAX_SLOPE) { e.speed = 0; e.blocked = 1.6; e.blockDir = Math.random() < 0.5 ? -1 : 1; }
    }
    forwardOf(e.heading, _f);
    const before = _o.copy(e.pos);
    e.pos.addScaledVector(_f, e.speed * dt);
    const limit = terrain.half - 8;
    e.pos.x = THREE.MathUtils.clamp(e.pos.x, -limit, limit);
    e.pos.z = THREE.MathUtils.clamp(e.pos.z, -limit, limit);
    if (terrain.isWater(e.pos.x, e.pos.z)) { e.pos.copy(before); e.speed = 0; e.blocked = 1.5; e.blockDir = Math.random() < 0.5 ? -1 : 1; }
    if (fort.resolveCircle(e.pos, e.radius)) {
      if (e.type === 'boss' && engaged) {
        // The Mammoth smashes through whatever wall is in its way (steel excepted).
        _p.copy(e.pos).addScaledVector(_f, e.radius + 0.8);
        const w = fort.solidAt(_p.x, null, _p.z, 0.6);
        if (w && w.takeDamage && w.hp !== Infinity) { w.takeDamage(90 * dt, _p, 'ram'); if (Math.random() < dt * 6) fx.dust(_p, 2); }
        else if (e.blocked <= 0 && Math.random() < dt * 0.8) { e.blocked = 2; e.blockDir = Math.random() < 0.5 ? -1 : 1; }
      } else if (e.blocked <= 0 && Math.random() < dt * 2) { e.blocked = 1.2; e.blockDir = Math.random() < 0.5 ? -1 : 1; }
    }
    // Other tanks and the player.
    for (const other of tanks) {
      if (other === e || !other.alive) continue;
      separate(e, other);
    }
    if (player.alive) separate(e, player, true);
    e.vel.copy(e.pos).sub(before).divideScalar(Math.max(dt, 1e-4));
    const pose = groundPose(terrain, e.pos.x, e.pos.z, e.heading, def.length * 0.75, 3 * e.built.scale);
    e.pos.y = pose.y;
    e.pitch += (pose.pitch - e.pitch) * Math.min(1, dt * 8);
    e.roll += (pose.roll - e.roll) * Math.min(1, dt * 8);
    built.root.position.copy(e.pos);
    built.root.rotation.set(0, e.heading, 0);
    built.body.rotation.set(-e.pitch, 0, e.roll, 'YXZ');
    if (dist < 260) driveTracks(built, e.speed * dt, turned * 1.5);
    if (Math.abs(e.speed) > 3 && Math.random() < dt * 2.5) {
      fx.dust(_p.copy(e.pos).addScaledVector(_f, -e.def.length * 0.4), 1);
    }
    if (e.type === 'boss' && Math.abs(e.speed) > 2 && Math.random() < dt * 4) fx.shakeAt(e.pos, 0.15, 60);

    // Turret: track the player when engaged, otherwise look forward.
    let yawT = 0, pitchT = 0;
    if (engaged) {
      const weapon = def.weapon;
      const speed = weapon === 'cannon' ? 90 : weapon === 'missile' ? 46 : 170;
      const gravity = weapon === 'cannon' ? 16 : 0;
      muzzleWorld(built, built.parts.muzzle, _o);
      const aim = aimAt(e, _o, player, weapon, speed, gravity, weapon === 'mg' ? 0.5 : 1);
      yawT = wrapAngle(aim.yawWorld - e.heading);
      pitchT = THREE.MathUtils.clamp(aim.pitch - e.pitch, -0.15, 0.7);
    }
    const turretRate = e.type === 'boss' ? 1.4 : 2.2;
    e.turretYaw += THREE.MathUtils.clamp(wrapAngle(yawT - e.turretYaw), -turretRate * dt, turretRate * dt);
    e.gunPitch += THREE.MathUtils.clamp(pitchT - e.gunPitch, -1.5 * dt, 1.5 * dt);
    aimGroups(built.turret, built.gun, e.turretYaw, e.gunPitch);
    if (engaged && e.los && Math.abs(wrapAngle(yawT - e.turretYaw)) < 0.08) {
      if (e.type === 'boss') {
        // Twin cannons alternate barrels; a missile pair every few seconds.
        _p.copy(built.parts.muzzle);
        _p.x = 0.42 * e.barrelSide;
        if (e.cooldown <= 0) e.barrelSide *= -1;
        muzzleWorld(built, _p, _o);
        gunDir(built, _p);
        fireAt(e, player, 'cannon', _o, _p, dt);
        if (e.missileCooldown <= 0 && dist > 30) {
          e.missileCooldown = def.missileEvery;
          built.turret.updateWorldMatrix(true, false);
          _o.copy(built.parts.podMuzzle).applyMatrix4(built.turret.matrixWorld);
          _d.copy(_p).setY(_p.y + 0.3).normalize();
          projectiles.fire({ type: 'missile', origin: _o, dir: _d, owner: 'enemy', speed: 50, damage: def.missileDamage, splash: 5, life: 8, target: env.jammed ? null : player, turn: 1.8 });
          sounds?.missile(true);
        }
      } else {
        muzzleWorld(built, built.parts.muzzle, _o);
        gunDir(built, _p);
        fireAt(e, player, def.weapon, _o, _p, dt);
      }
    }
    if (e.hp < e.maxHp * 0.4 && Math.random() < dt * 8) fx.damageSmoke(_p.copy(e.pos).setY(e.pos.y + 2), e.vel);
  }

  function separate(a, b, pushOnlyA = false) {
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    const min = a.radius + b.radius;
    if (d >= min || d < 1e-4) return;
    const push = (min - d);
    const nx = dx / d, nz = dz / d;
    if (pushOnlyA) { a.pos.x += nx * push; a.pos.z += nz * push; a.speed *= 0.5; }
    else { a.pos.x += nx * push * 0.5; a.pos.z += nz * push * 0.5; b.pos.x -= nx * push * 0.5; b.pos.z -= nz * push * 0.5; }
  }

  function updateTurret(s, dt, player, t) {
    updateTankFlash(s.built, dt);
    if (!s.alive) return;
    s.cooldown -= dt;
    if (s.stun > 0) { s.stun -= dt; return; }
    const def = s.def;
    const dist = s.pos.distanceTo(player.pos);
    s.losAcc += dt;
    if (s.losAcc > 0.25) {
      s.losAcc = 0;
      _o.copy(s.pos);
      _p.copy(player.pos).setY(player.pos.y + 1.6);
      const range = def.range * env.sight * (env.jammed ? 0.5 : 1);
      s.los = player.alive && !env.smoked && dist < range && fort.lineClear(_o, _p, 4);
    }
    if (!s.los && !(s.beam > 0)) {
      // Idle sweep.
      s.built.yaw.rotation.y += Math.sin(t * 0.4 + s.pos.x) * 0.3 * dt;
      s.beam = 0;
      return;
    }
    const kind = s.type === 'gun' ? 'mg' : s.type;
    const speed = kind === 'cannon' ? 95 : kind === 'missile' ? 46 : kind === 'laser' ? 1e6 : 170;
    const gravity = kind === 'cannon' ? 16 : 0;
    muzzleWorld({ gun: s.built.pitch }, s.built.muzzles[0], _o);
    const aim = aimAt(s, _o, player, kind, speed, gravity, kind === 'mg' ? 0.5 : kind === 'laser' ? 0 : 1);
    const yawT = wrapAngle(aim.yawWorld - s.root.rotation.y);
    const pitchT = THREE.MathUtils.clamp(aim.pitch, -0.3, 0.8);
    const cur = s.built.yaw.rotation.y;
    s.built.yaw.rotation.y = cur + THREE.MathUtils.clamp(wrapAngle(yawT - cur), -2.4 * dt, 2.4 * dt);
    s.built.pitch.rotation.x += THREE.MathUtils.clamp(-pitchT - s.built.pitch.rotation.x, -1.6 * dt, 1.6 * dt);
    if (Math.abs(wrapAngle(yawT - s.built.yaw.rotation.y)) < 0.1 || s.beam > 0) {
      muzzleWorld({ gun: s.built.pitch }, s.built.muzzles[s.type === 'gun' ? Math.floor(t * 10) % 2 : 0], _o);
      gunDir({ gun: s.built.pitch }, _p);
      fireAt(s, player, kind, _o, _p, dt);
    }
  }

  // Environment the AI sees: a sight multiplier (weather, night, lights),
  // whether the player is hidden in smoke, whether the radar is gone and
  // whether the fort alarm has been raised.
  const env = { sight: 1, smoked: false, jammed: false, alarm: false };
  function update(dt, player, t, environment = null) {
    if (environment) { env.sight = environment.sight ?? 1; env.smoked = !!environment.smoked; env.jammed = !!environment.jammed; env.alarm = env.alarm || !!environment.alarm; }
    for (const e of tanks) updateTank(e, dt, player, t);
    for (const s of turrets) updateTurret(s, dt, player, t);
    for (const s of troops) updateTrooper(s, dt, player);
    for (const h of helis) updateHeli(h, dt, player, t);
    for (const c of commands) updateCommand(c, dt, player, t);
  }

  // The fort alarm: wakes the boss, launches the parked helicopters, alerts the command truck.
  function alarm() {
    env.alarm = true;
    if (boss && boss.alive) boss.awake = true;
    for (const h of helis) launchHeli(h);
  }

  function targets() {
    const list = [];
    for (const e of tanks) if (e.alive) list.push(e);
    for (const s of turrets) if (s.alive) list.push(s);
    for (const s of troops) if (s.alive) list.push(s);
    for (const h of helis) if (h.alive) list.push(h);
    for (const c of commands) if (c.alive) list.push(c);
    for (const b of fort.barrels) if (b.alive) list.push(b);
    return list;
  }
  const aliveCount = () => tanks.filter((e) => e.alive).length + turrets.filter((s) => s.alive).length + troops.filter((s) => s.alive).length + helis.filter((h) => h.alive).length + commands.filter((c) => c.alive).length;
  // Everyone whose home is `home` (an outpost, the generator, a camp) is dead.
  function homeCleared(home) {
    for (const e of [...tanks, ...troops]) if (e.alive && e.spec?.home === home) return false;
    for (const s of turrets) if (s.alive && (s.spec?.home === home || s.spec?.guard === home)) return false;
    return true;
  }
  // Nearest flying helicopter (for the rotor sound).
  function nearestHeli(pos) {
    let best = 1e9;
    for (const h of helis) if ((h.alive || h.falling) && h.state !== 'parked') best = Math.min(best, h.pos.distanceTo(pos));
    return best;
  }

  // EMP-like stun for every enemy in range (used by the nuke's shockwave).
  function stun(center, radius, seconds) {
    for (const e of [...tanks, ...turrets, ...troops, ...helis]) if (e.alive && e.pos.distanceTo(center) < radius) e.stun = Math.max(e.stun, seconds);
  }

  const aliveTurrets = () => turrets.filter((s) => s.alive).length;
  return { tanks, turrets, troops, helis, commands, update, targets, aliveCount, aliveTurrets, stun, spawnTank, spawnReinforcements, env, alarm, homeCleared, nearestHeli, get boss() { return boss; } };
}
