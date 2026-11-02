import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAMERA, ENEMY, PLANE, SCORE, WEAPONS } from './config.js';
import { createEnemies } from './enemies.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { buildF16, setAfterburner } from './jet.js';
import { createPilot } from './pilot.js';
import { formatTime, loadProgress, recordClear } from './progress.js';
import { createProjectiles } from './projectiles.js';
import { createSky } from './sky.js';
import { createSounds } from './sounds.js';
import { createTerrain, loadHeightmap } from './terrain.js';

const $ = (id) => document.getElementById(id);
const loadingEl = $('loading');
const loadingText = $('loadingText');
const levelSelect = $('levelSelect');
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

function boot() {
  const params = new URLSearchParams(location.search);
  loadGame(params.get('level')).catch((err) => {
    console.error(err);
    loadingText.textContent = err.message || 'The theatre failed to load';
  });
}

async function loadGame(wanted) {
  const list = await fetch('/games-3d/fighter-plane/api/levels').then((res) => {
    if (!res.ok) throw new Error('Could not list theatres');
    return res.json();
  });
  if (!list.length) throw new Error('No theatres were generated');
  const chosen = list.find((level) => level.id === wanted) || list[0];
  for (const level of list) {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = `${level.order}. ${level.name}`;
    levelSelect.appendChild(option);
  }
  levelSelect.value = chosen.id;
  levelSelect.addEventListener('change', () => {
    location.href = `/games-3d/fighter-plane?level=${encodeURIComponent(levelSelect.value)}`;
  });
  // ?terrain=<export-id> plays this theatre's setup on a terrain from the terrain editor.
  const terrainId = new URLSearchParams(location.search).get('terrain');
  const levelUrl = `/games-3d/fighter-plane/api/level/${encodeURIComponent(chosen.id)}${terrainId ? `?terrain=${encodeURIComponent(terrainId)}` : ''}`;
  const level = await fetch(levelUrl).then((res) => {
    if (!res.ok) throw new Error('That theatre is missing');
    return res.json();
  });
  loadingText.textContent = 'Reading the terrain…';
  const heightmap = await loadHeightmap(level.terrain.heightmap);
  await startLevel(level, list, heightmap);
}

async function startLevel(level, list, heightmap) {
  const spec = level.terrain;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.5, 14000);
  const sky = createSky(scene, renderer, { preset: level.sky, worldSize: spec.size, cloudBase: spec.maxHeight + 350 });
  const terrain = createTerrain({
    heightmap, size: spec.size, maxHeight: spec.maxHeight, colorTexture: spec.colorTexture, waterLevel: spec.waterLevel,
    waterColor: level.sky === 'sunset' ? 0x3a4a6a : spec.style === 'canyon' ? 0x2f8a8c : 0x2a6f8c
  });
  scene.add(terrain.group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.45, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sounds = createSounds();
  const fx = createFx(scene);
  fx.setGround((x, z) => terrain.heightAt(x, z));
  let hitMarker = 0;
  const projectiles = createProjectiles({ scene, fx, terrain, sounds, onPlayerHit: () => { hitMarker = 0.25; } });
  const hud = createHud($('hud'), $('radar'));

  // ---------------------------------------------------------------- player
  const jet = buildF16();
  scene.add(jet.root);
  const pilot = createPilot({ scene, fx, terrain, sounds });
  let wreck = null;       // the abandoned jet falling after an ejection
  let criticalToastAt = -99;
  const player = {
    kind: 'player', name: 'Viper', pos: new THREE.Vector3(level.player.x, level.player.y, level.player.z), vel: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
    yaw: THREE.MathUtils.degToRad(180 - level.player.headingDeg), pitch: 0, roll: 0, heading: 0, speed: PLANE.cruise, radius: 7.5,
    armor: PLANE.armor, alive: true, stun: 0, lastHit: 99, boost: 1, boosting: false, invert: false, weapon: 0,
    missiles: WEAPONS.missile.max, bombs: WEAPONS.bomb.max, emp: WEAPONS.emp.max, recharge: { missile: 0, bomb: 0, emp: 0 },
    deaths: 0, score: 0, god: false, groundHitCooldown: 0,
    takeDamage(amount, at, how) {
      if (!player.alive || player.god) return;
      player.armor -= amount;
      player.lastHit = 0;
      flashDamage(Math.min(1, 0.35 + amount / 40));
      fx.addShake(how === 'gun' ? 0.12 : 0.5);
      sounds.damage();
      if (player.armor <= 0) shotDown();
      else if (player.armor < 30 && elapsed - criticalToastAt > 8) { criticalToastAt = elapsed; toast('ARMOUR CRITICAL — PRESS E TO EJECT', 2.5); }
    }
  };
  // yaw convention: forward = (-sin yaw, 0, -cos yaw) at pitch 0; headingDeg 0 faces north (-Z), 90 faces east (+X).
  player.yaw = -THREE.MathUtils.degToRad(level.player.headingDeg);

  const input = { pitch: 0, roll: 0, fire: false, boost: false, firePressed: false, nextTarget: false };
  const keys = new Set();
  function onKey(e, down) {
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(k)) e.preventDefault();
    if (down && !e.repeat) {
      sounds.unlock();
      if (k === ' ') input.firePressed = true;
      if (k === 'Tab') input.nextTarget = true;
      if (k === '1' || k === '2' || k === '3' || k === '4') setWeapon(Number(k) - 1);
      if (k === 'q' || k === 'Q') setWeapon((player.weapon + 1) % 4);
      if (k === 'i' || k === 'I') { player.invert = !player.invert; toast(player.invert ? 'PITCH INVERTED' : 'PITCH NORMAL'); }
      if (k === 'm' || k === 'M') { const m = sounds.toggleMute(); toast(m ? 'MUTED' : 'SOUND ON'); }
      if (k === 'h' || k === 'H') $('help').classList.toggle('fade');
      if (k === 'e' || k === 'E') eject();
    }
    if (down) keys.add(k); else keys.delete(k);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('mousedown', () => { sounds.unlock(); input.firePressed = true; input.mouseFire = true; });
  window.addEventListener('mouseup', () => { input.mouseFire = false; });
  window.addEventListener('wheel', (e) => setWeapon((player.weapon + (e.deltaY > 0 ? 1 : 3)) % 4));
  function readKeys() {
    const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
    const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
    const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
    const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
    let pitch = (up ? 1 : 0) - (down ? 1 : 0);
    if (player.invert) pitch = -pitch;
    input.pitch = pitch;
    input.roll = (right ? 1 : 0) - (left ? 1 : 0);
    input.fire = keys.has(' ') || !!input.mouseFire;
    input.boost = keys.has('Shift');
  }

  const weaponEls = [...document.querySelectorAll('.weapon')];
  for (const el of weaponEls) el.addEventListener('click', () => setWeapon(Number(el.dataset.w)));
  function setWeapon(i) {
    player.weapon = i;
    for (const el of weaponEls) el.classList.toggle('active', Number(el.dataset.w) === i);
  }
  setWeapon(0);

  // ----------------------------------------------------------------- state
  const progress = loadProgress();
  let elapsed = 0;
  let waveIndex = -1;
  let waveTimer = level.waves.length && level.waves[0].delay != null ? level.waves[0].delay : 2.5;
  let waveCleared = true;
  let wavesDone = level.waves.length === 0;
  const toastQueue = [];
  let won = false;
  let gunAcc = 0;
  let muzzle = 0;
  let lockTarget = null;
  let lockProgress = 0;
  let lockTickAcc = 0;
  let lockedSoundPlayed = false;
  let cycleIndex = 0;
  let manualLockUntil = 0;
  let toastTimer = null;
  let domAcc = 0;
  let respawnTimer = 0;
  let bombPoint = null;
  let gunTarget = null;
  const popups = [];
  let contrailAcc = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const enemies = await createEnemies({
    scene, fx, projectiles, terrain, level, sounds,
    onEvent: (ev) => {
      if (ev.type === 'plane') { addScore(ev.target.score); toast('BANDIT DOWN'); popups.push({ pos: ev.target.pos.clone(), text: `+${ev.target.score}`, age: 0, life: 1.5, color: '#ffd24a' }); }
      else if (ev.type === 'structure') { addScore(ev.target.score); popups.push({ pos: ev.target.pos.clone(), text: `+${ev.target.score}`, age: 0, life: 1.4, color: '#ffd24a' }); }
      else if (ev.type === 'base') { addScore(SCORE.baseBonus); toast(`${ev.base.name.toUpperCase()} DESTROYED`); sounds.stinger(); }
    }
  });
  loadingText.textContent = 'Taking off…';

  function addScore(n) { player.score += n; }
  function toast(text, seconds = 2.2) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); nextQueuedToast(); }, seconds * 1000);
  }
  // Briefing lines shown one after another (and resumed after any event toast).
  function queueToasts(lines, seconds = 3.4) {
    for (const line of lines) toastQueue.push({ text: line, seconds });
    if (!$('toast').classList.contains('show')) nextQueuedToast();
  }
  function nextQueuedToast() {
    const next = toastQueue.shift();
    if (next) setTimeout(() => toast(next.text, next.seconds), 500);
  }
  function clockOf(bearing) {
    // Bearing of the squadron relative to the nose, as a clock position.
    const rel = bearing - player.heading;
    const hour = ((Math.round(rel / (Math.PI / 6)) % 12) + 12) % 12;
    return `${hour === 0 ? 12 : hour} O'CLOCK`;
  }
  function flashDamage(strength) {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = String(strength);
    requestAnimationFrame(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = '0'; });
  }
  function empFlash() {
    const el = $('empFlash');
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => { el.style.transition = 'opacity 0.9s'; el.style.opacity = '0'; });
  }

  function shotDown() {
    player.alive = false;
    player.deaths++;
    fx.explosion(player.pos, { size: 18, velocity: player.vel });
    sounds.explosion(1.3);
    sounds.down();
    sounds.alert(false);
    jet.root.visible = false;
    respawnTimer = PLANE.respawnSeconds;
    $('down').hidden = false;
    $('downCount').textContent = String(PLANE.respawnSeconds);
  }
  // Punch out: the seat fires, the jet falls away as a wreck and the pilot
  // steers the parachute down. Landing brings a new jet at the start.
  function eject() {
    if (!player.alive || won) return;
    player.alive = false;
    player.boosting = false;
    sounds.alert(false);
    pilot.eject(player.pos, player.vel, jet.root.quaternion, jet.parts.canopy);
    jet.parts.canopy.visible = false;
    for (const part of jet.parts.pilot) part.visible = false;
    wreck = { vel: player.vel.clone(), yaw: player.yaw, pitch: player.pitch, roll: player.roll, spin: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random()), smokeAcc: 0 };
    setAfterburner(jet.parts, 0, elapsed);
    toast('EJECT! EJECT! — ← → STEER THE CHUTE', 3);
    respawnTimer = 0;
  }
  function updateWreck(dt) {
    wreck.vel.y -= 11 * dt;
    wreck.vel.multiplyScalar(Math.max(0, 1 - 0.12 * dt));
    player.pos.addScaledVector(wreck.vel, dt);
    player.vel.copy(wreck.vel);
    wreck.roll += wreck.spin * dt;
    wreck.pitch += (-1.1 - wreck.pitch) * Math.min(1, dt * 0.5);
    _e.set(wreck.pitch, wreck.yaw, -wreck.roll, 'YXZ');
    jet.root.quaternion.setFromEuler(_e);
    jet.root.position.copy(player.pos);
    wreck.smokeAcc += dt;
    while (wreck.smokeAcc > 0.03) { wreck.smokeAcc -= 0.03; fx.damageSmoke(player.pos, wreck.vel); }
    const ground = terrain.heightAt(player.pos.x, player.pos.z);
    if (player.pos.y <= ground + 3) {
      _v.set(player.pos.x, ground, player.pos.z);
      fx.explosion(_v, { size: 18, ground: true });
      if (!terrain.isWater(player.pos.x, player.pos.z)) fx.burn(_v, { size: 6, duration: 40 });
      sounds.explosion(1.1);
      jet.root.visible = false;
      wreck = null;
    }
  }
  function respawn() {
    player.alive = true;
    pilot.reset();
    wreck = null;
    jet.parts.canopy.visible = true;
    for (const part of jet.parts.pilot) part.visible = true;
    $('downKicker').textContent = 'You were shot down';
    player.armor = PLANE.armor;
    player.pos.set(level.player.x, level.player.y, level.player.z);
    player.yaw = -THREE.MathUtils.degToRad(level.player.headingDeg);
    player.pitch = 0;
    player.roll = 0;
    player.speed = PLANE.cruise;
    player.boost = 1;
    player.missiles = Math.max(player.missiles, 4);
    player.bombs = Math.max(player.bombs, 3);
    jet.root.visible = true;
    projectiles.clear();
    $('down').hidden = true;
    camPos.copy(player.pos).add(new THREE.Vector3(0, CAMERA.up, CAMERA.back));
  }

  function updatePlayer(dt) {
    if (!player.alive) {
      if (wreck) updateWreck(dt);
      if (pilot.active) {
        pilot.update(dt, input);
        if (!pilot.landed) return;
        if (respawnTimer <= 0 && $('down').hidden) {
          respawnTimer = PLANE.respawnSeconds + 2;
          $('downKicker').textContent = pilot.water ? 'Splashdown — pilot recovered' : 'Safe landing — pilot recovered';
          $('down').hidden = false;
          sounds.stinger();
        }
      }
      respawnTimer -= dt;
      $('downCount').textContent = String(Math.max(1, Math.ceil(respawnTimer)));
      if (respawnTimer <= 0) respawn();
      return;
    }
    // Bank and turn. Holding left or right rolls the jet up to maxBank and
    // the bank turns the nose; releasing levels the wings.
    const wantRoll = input.roll * PLANE.maxBank;
    const rollStep = (input.roll !== 0 ? PLANE.rollRate : PLANE.autoLevel * Math.max(0.6, Math.abs(player.roll))) * dt;
    player.roll += THREE.MathUtils.clamp(wantRoll - player.roll, -rollStep, rollStep);
    const turn = Math.sin(player.roll) * PLANE.turnRate * (0.75 + 0.25 * Math.max(0, input.pitch));
    player.yaw -= turn * dt;
    player.pitch += input.pitch * PLANE.pitchRate * dt;
    if (input.pitch === 0) player.pitch -= player.pitch * Math.min(1, PLANE.pitchReturn * dt);
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.1, 1.1);

    // Speed.
    player.boosting = input.boost && player.boost > 0.02;
    if (player.boosting) player.boost = Math.max(0, player.boost - dt / PLANE.boostSeconds);
    else player.boost = Math.min(1, player.boost + dt / PLANE.boostRecharge);
    if (player.boosting && !player.wasBoosting) sounds.boost(true);
    player.wasBoosting = player.boosting;
    let wanted = (player.boosting ? PLANE.boostSpeed : PLANE.cruise) - Math.sin(player.pitch) * 60;
    wanted = Math.max(PLANE.minSpeed, wanted);
    player.speed += THREE.MathUtils.clamp(wanted - player.speed, -PLANE.accel * dt, PLANE.accel * dt);

    // Terrain assist and limits.
    const ground = terrain.heightAt(player.pos.x, player.pos.z);
    const ahead = terrain.heightAt(player.pos.x + player.forward.x * 220, player.pos.z + player.forward.z * 220);
    const floor = Math.max(ground, ahead) + PLANE.floor;
    if (player.pos.y < floor && player.pitch < 0.45) {
      player.pitch += (0.45 - player.pitch) * Math.min(1, dt * 5);
    }
    if (player.pos.y > PLANE.ceiling && player.pitch > -0.2) player.pitch += (-0.25 - player.pitch) * Math.min(1, dt * 3);
    player.groundHitCooldown -= dt;
    if (player.pos.y < ground + 5) {
      player.pos.y = ground + 5;
      if (player.groundHitCooldown <= 0) {
        player.groundHitCooldown = 0.6;
        player.takeDamage(8, player.pos, 'ground');
        fx.hitSparks(player.pos, null, 14);
        fx.dust(_v.set(player.pos.x, ground, player.pos.z), 6);
      }
    }
    // Keep inside the theatre.
    const limit = terrain.half * 0.97;
    if (Math.abs(player.pos.x) > limit || Math.abs(player.pos.z) > limit) {
      const toCentre = Math.atan2(-player.pos.x, -player.pos.z);
      let diff = toCentre - player.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.yaw += THREE.MathUtils.clamp(diff, -1, 1) * dt * 1.2;
      player.pos.x = THREE.MathUtils.clamp(player.pos.x, -limit - 40, limit + 40);
      player.pos.z = THREE.MathUtils.clamp(player.pos.z, -limit - 40, limit + 40);
      if (Math.random() < dt * 0.7) toast('RETURN TO THE COMBAT AREA', 1.5);
    }

    _e.set(player.pitch, player.yaw, -player.roll, 'YXZ');
    jet.root.quaternion.setFromEuler(_e);
    player.forward.set(0, 0, -1).applyQuaternion(jet.root.quaternion);
    player.up.set(0, 1, 0).applyQuaternion(jet.root.quaternion);
    player.right.set(1, 0, 0).applyQuaternion(jet.root.quaternion);
    player.vel.copy(player.forward).multiplyScalar(player.speed);
    player.pos.addScaledVector(player.vel, dt);
    jet.root.position.copy(player.pos);
    player.heading = Math.atan2(-player.forward.x, -player.forward.z);
    jet.parts.stabs[0].rotation.x = -input.pitch * 0.25;
    jet.parts.stabs[1].rotation.x = -input.pitch * 0.25;
    setAfterburner(jet.parts, player.boosting ? 1 : 0.35 + Math.max(0, input.pitch) * 0.2, elapsed);

    // Armour regen.
    player.lastHit += dt;
    if (player.lastHit > PLANE.regenDelay && player.armor < PLANE.armor) player.armor = Math.min(PLANE.armor, player.armor + PLANE.regenRate * dt);

    // Ammo recharge.
    for (const [key, cfg, field] of [['missile', WEAPONS.missile, 'missiles'], ['bomb', WEAPONS.bomb, 'bombs'], ['emp', WEAPONS.emp, 'emp']]) {
      if (player[field] >= cfg.max) { player.recharge[key] = 0; continue; }
      player.recharge[key] += dt;
      if (player.recharge[key] >= cfg.rechargeSeconds) { player.recharge[key] = 0; player[field]++; }
    }
    for (let i = 0; i < jet.parts.missiles.length; i++) jet.parts.missiles[i].visible = player.missiles > i * 2;
    for (let i = 0; i < jet.parts.bombs.length; i++) jet.parts.bombs[i].visible = player.bombs > i * 3;

    // Vapour from the wingtips in hard turns and dust under a low pass.
    const hard = Math.abs(player.roll) > 0.6 || Math.abs(input.pitch) > 0 || player.boosting;
    contrailAcc += dt;
    if (hard && contrailAcc > 0.016) {
      contrailAcc = 0;
      for (const tip of jet.parts.wingtips) {
        _v.copy(tip).applyQuaternion(jet.root.quaternion).add(player.pos);
        fx.pools.smoke.emit({ x: _v.x, y: _v.y, z: _v.z, life: 0.9, size: 0.7, sizeEnd: 2.6, color: new THREE.Color(0xffffff), colorEnd: new THREE.Color(0xffffff), alpha: 0.42, fadeIn: 0.05, spin: 0 });
      }
    }
    if (player.boosting && Math.random() < dt * 40) {
      _v.copy(jet.parts.tail).applyQuaternion(jet.root.quaternion).add(player.pos);
      fx.exhaustFire(_v, 2.2);
    }
    if (player.pos.y - ground < 45 && !terrain.isWater(player.pos.x, player.pos.z) && Math.random() < dt * 12) {
      fx.dust(_v.set(player.pos.x - player.forward.x * 10, ground, player.pos.z - player.forward.z * 10), 2);
    }
  }

  // Targets in the lock cone, nearest to the centre first.
  function candidates(list, cone, range) {
    const cos = Math.cos(THREE.MathUtils.degToRad(cone));
    const out = [];
    for (const t of list) {
      _v.copy(t.pos).sub(player.pos);
      const d = _v.length();
      if (d > range) continue;
      _v.divideScalar(d);
      const dot = _v.dot(player.forward);
      if (dot < cos) continue;
      out.push({ t, dot, d });
    }
    out.sort((a, b) => b.dot - a.dot);
    return out;
  }

  function updateWeapons(dt, targets) {
    if (!player.alive) { input.firePressed = false; input.nextTarget = false; return; }
    const list = candidates(targets, WEAPONS.missile.lockDeg, WEAPONS.missile.lockRange);
    // Bandits in the air come first, then whatever is nearest the reticle.
    list.sort((a, b) => (b.t.kind === 'plane') - (a.t.kind === 'plane') || b.dot - a.dot);
    if (input.nextTarget && list.length) {
      input.nextTarget = false;
      cycleIndex = (cycleIndex + 1) % list.length;
      lockTarget = list[cycleIndex].t;
      lockProgress = 0;
      lockedSoundPlayed = false;
      manualLockUntil = elapsed + 4;
    }
    input.nextTarget = false;
    const current = lockTarget && lockTarget.alive ? list.find((c) => c.t === lockTarget) : null;
    let pick = current ? lockTarget : null;
    if (list.length && elapsed > manualLockUntil) {
      const best = list[0];
      // Steal the lock when a bandit shows up or something sits clearly closer to the centre.
      if (!current || (best.t.kind === 'plane' && current.t.kind !== 'plane') || (best.t.kind === current.t.kind && best.dot > current.dot + 0.025)) pick = best.t;
    } else if (!current && list.length) pick = list[0].t;
    if (pick !== lockTarget) {
      lockTarget = pick;
      lockProgress = 0;
      lockedSoundPlayed = false;
      cycleIndex = 0;
    }
    if (lockTarget) {
      lockProgress = Math.min(1, lockProgress + dt / WEAPONS.missile.lockSeconds);
      lockTickAcc += dt;
      if (lockProgress < 1 && lockTickAcc > 0.14) { lockTickAcc = 0; sounds.lockTick(); }
      if (lockProgress >= 1 && !lockedSoundPlayed) { lockedSoundPlayed = true; sounds.locked(); }
    }
    const gunList = candidates(targets, WEAPONS.gun.assistDeg, WEAPONS.gun.range);
    gunTarget = gunList.length ? gunList[0].t : null;

    if (player.weapon === 0) {
      if (input.fire) {
        gunAcc += dt;
        const every = 1 / WEAPONS.gun.rate;
        while (gunAcc > every) {
          gunAcc -= every;
          muzzle = 1 - muzzle;
          _v.copy(jet.parts.gun[muzzle]).applyQuaternion(jet.root.quaternion).add(player.pos);
          projectiles.fireGun({ origin: _v, dir: player.forward, ownerVel: player.vel, owner: 'player', target: gunTarget });
          fx.exhaustFire(_v, 1.4);
          if (muzzle === 0) sounds.gun();
        }
      } else gunAcc = 0;
    } else if (player.weapon === 1 && input.firePressed) {
      if (player.missiles > 0) {
        player.missiles--;
        const slot = jet.parts.missiles[Math.min(3, Math.floor(player.missiles / 2))];
        _v.copy(slot.position).applyQuaternion(jet.root.quaternion).add(player.pos);
        projectiles.fireMissile({ origin: _v, dir: player.forward, ownerVel: player.vel, owner: 'player', target: lockProgress >= 1 ? lockTarget : null });
        fx.addShake(0.08);
      } else toast('NO MISSILES — RELOADING', 1.2);
    } else if (player.weapon === 2 && input.firePressed) {
      if (player.bombs > 0) {
        player.bombs--;
        _v.copy(player.pos).addScaledVector(player.up, -1.5);
        projectiles.dropBomb({ origin: _v, vel: player.vel });
      } else toast('NO BOMBS — RELOADING', 1.2);
    } else if (player.weapon === 3 && input.firePressed) {
      if (player.emp > 0) {
        player.emp--;
        fx.emp(player.pos, WEAPONS.emp.radius);
        const m = projectiles.empBurst(player.pos, WEAPONS.emp.radius);
        const n = enemies.emp(player.pos, WEAPONS.emp.radius, WEAPONS.emp.damage, WEAPONS.emp.stunSeconds);
        sounds.emp();
        empFlash();
        toast(n || m ? `EMP — ${n} TARGETS STUNNED${m ? `, ${m} MISSILES DOWN` : ''}` : 'EMP', 2);
      } else toast('EMP CHARGING', 1.2);
    }
    input.firePressed = false;
    bombPoint = player.weapon === 2 ? projectiles.predictBomb(player.pos, player.vel) : null;
  }

  // Waves launch one at a time: the next one waits until the current bandits
  // are down, until `afterBases` bases have been cleared, and then `delay`
  // seconds (so a base fight and a dogfight do not pile up on the player).
  function updateWaves(dt) {
    if (won) return;
    const clearedCount = enemies.bases.filter((b) => b.cleared).length;
    if (!wavesDone && enemies.aliveBandits() === 0) {
      if (waveIndex >= 0 && !waveCleared) {
        waveCleared = true;
        addScore(SCORE.waveBonus);
        if (waveIndex >= level.waves.length - 1) { wavesDone = true; toast('ALL SQUADRONS DOWN'); sounds.stinger(); }
        else { toast('SQUADRON DOWN'); sounds.stinger(); }
        const next = level.waves[waveIndex + 1];
        waveTimer = next && next.delay != null ? next.delay : 6;
      }
      const next = level.waves[waveIndex + 1];
      if (!wavesDone && next && clearedCount >= (next.afterBases || 0)) {
        waveTimer -= dt;
        if (waveTimer <= 0) {
          waveIndex++;
          waveCleared = false;
          const spawned = enemies.spawnWave(waveIndex, player);
          const last = waveIndex === level.waves.length - 1 && level.waves.length > 1;
          toast(`${last ? 'FINAL SQUADRON' : `BANDITS`} INBOUND — ${clockOf(spawned.bearing)}`, 3);
          sounds.stinger();
        }
      }
    }
    const basesCleared = enemies.bases.every((b) => b.cleared);
    if (wavesDone && basesCleared && !won) {
      won = true;
      setTimeout(showWin, 2500);
    }
  }

  function showWin() {
    sounds.fanfare();
    sounds.alert(false);
    const result = recordClear(progress, level.id, { time: elapsed, deaths: player.deaths, parSeconds: level.parSeconds, score: player.score });
    const idx = list.findIndex((l) => l.id === level.id);
    const next = list[idx + 1];
    $('winStats').textContent = `Score ${player.score}\nTime ${formatTime(elapsed)} (par ${formatTime(level.parSeconds)})\nShot down ${player.deaths} time${player.deaths === 1 ? '' : 's'}\n${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`;
    $('nextBtn').hidden = !next;
    $('nextBtn').onclick = () => { location.href = `/games-3d/fighter-plane?level=${encodeURIComponent(next.id)}`; };
    $('retryBtn').onclick = () => location.reload();
    $('win').hidden = false;
  }

  function updateCamera(dt) {
    if (window.__fighter && window.__fighter.freeCam) return;
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    if (pilot.active) {
      // Chase the pilot: close in, a little above, looking past them.
      const seat = pilot.phase === 'seat';
      _v.copy(pilot.pos).addScaledVector(pilot.forward, seat ? -22 : -17).addScaledVector(WORLD_UP, seat ? 5 : 4.5);
      camPos.lerp(_v, 1 - Math.exp(-(seat ? 2.5 : 3.5) * dt));
      const g = terrain.heightAt(camPos.x, camPos.z) + 2.5;
      if (camPos.y < g) camPos.y = g;
      _v.copy(pilot.pos).addScaledVector(pilot.forward, 6).addScaledVector(WORLD_UP, 2.5);
      camLook.lerp(_v, k);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      camera.fov += (CAMERA.fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
      return;
    }
    _v.copy(player.pos).addScaledVector(player.forward, -CAMERA.back);
    _w.copy(WORLD_UP).lerp(player.up, CAMERA.rollFollow).normalize();
    _v.addScaledVector(_w, CAMERA.up);
    if (player.boosting) _v.addScaledVector(player.forward, -6);
    camPos.lerp(_v, player.alive ? k : k * 0.3);
    // Never put the camera under the ground.
    const g = terrain.heightAt(camPos.x, camPos.z) + 3;
    if (camPos.y < g) camPos.y = g;
    _v.copy(player.pos).addScaledVector(player.forward, CAMERA.lookAhead);
    camLook.lerp(_v, k);
    const shake = fx.shake;
    camera.position.copy(camPos);
    if (shake > 0) camera.position.add(_w.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake).multiplyScalar(1.6));
    camera.up.copy(WORLD_UP).lerp(player.up, CAMERA.rollFollow).normalize();
    camera.lookAt(camLook);
    const fov = player.boosting ? CAMERA.boostFov : CAMERA.fov;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }

  const speedEl = $('speedValue'), altEl = $('altValue'), scoreEl = $('scoreValue'), waveEl = $('waveValue'), banditEl = $('banditValue'), baseEl = $('baseValue');
  const missileAmmoEl = $('missileAmmo'), bombAmmoEl = $('bombAmmo'), empAmmoEl = $('empAmmo'), boostFill = $('boostFill'), armorFill = $('armorFill');
  const alertEl = $('alert'), alertDist = $('alertDist');
  function updateDom() {
    speedEl.textContent = String(Math.round((pilot.active ? pilot.vel.length() : player.speed) * 3.6));
    altEl.textContent = String(Math.round(pilot.active ? Math.max(0, pilot.altitude) : player.pos.y - terrain.heightAt(player.pos.x, player.pos.z)));
    scoreEl.textContent = String(player.score);
    waveEl.textContent = level.waves.length ? `${Math.min(level.waves.length, Math.max(0, waveIndex + 1))} / ${level.waves.length}` : '—';
    banditEl.textContent = String(enemies.aliveBandits());
    baseEl.textContent = `${enemies.bases.filter((b) => b.cleared).length} / ${enemies.bases.length}`;
    missileAmmoEl.textContent = String(player.missiles);
    bombAmmoEl.textContent = String(player.bombs);
    empAmmoEl.textContent = String(player.emp);
    weaponEls[1].classList.toggle('empty', player.missiles === 0);
    weaponEls[2].classList.toggle('empty', player.bombs === 0);
    weaponEls[3].classList.toggle('empty', player.emp === 0);
    boostFill.style.width = `${player.boost * 100}%`;
    armorFill.style.width = `${Math.max(0, player.armor / PLANE.armor) * 100}%`;
    armorFill.parentElement.parentElement.classList.toggle('low', player.armor < 35);
  }

  function nearestBase() {
    let best = null, bd = Infinity;
    for (const b of enemies.bases) {
      if (b.cleared) continue;
      const d = b.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    hud.resize();
  });

  camPos.copy(player.pos).add(new THREE.Vector3(0, CAMERA.up, CAMERA.back));
  camLook.copy(player.pos);
  loadingEl.hidden = true;
  setTimeout(() => $('help').classList.add('fade'), 14000);
  $('levelName').textContent = level.name;
  toast(level.name.toUpperCase(), 3);
  if (level.briefing?.length) queueToasts(level.briefing);

  const clock = new THREE.Clock();
  let frames = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;
    frames++;
    readKeys();
    updatePlayer(dt);
    const targets = enemies.targets();
    updateWeapons(dt, targets);
    enemies.update(dt, player, elapsed);
    projectiles.update(dt, { player, targets });
    updateWaves(dt);
    fx.update(dt, camera);
    terrain.update(dt);
    updateCamera(dt);
    sky.update(player.pos, dt);
    sounds.setEngine(player.alive ? 0.4 + Math.max(0, input.pitch) * 0.3 : 0, player.boosting ? 1 : 0);

    const incoming = projectiles.incomingMissiles(player);
    if (incoming.length && player.alive) {
      let nearest = Infinity;
      for (const m of incoming) nearest = Math.min(nearest, m.pos.distanceTo(player.pos));
      alertEl.hidden = false;
      alertDist.textContent = String(Math.round(nearest));
      sounds.alert(true);
    } else { alertEl.hidden = true; sounds.alert(false); }

    composer.render();
    hitMarker = Math.max(0, hitMarker - dt);
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].age += dt; popups[i].pos.y += dt * 6; if (popups[i].age >= popups[i].life) popups.splice(i, 1); }
    if (pilot.active) hud.clear();
    else hud.draw({ camera, player, targets, locked: lockTarget, lockProgress, incoming, bombPoint, weapon: player.weapon, time: elapsed, nearestBase: nearestBase(), gunTarget, hitMarker, popups });
    domAcc += dt;
    if (domAcc > 0.08) {
      domAcc = 0;
      updateDom();
      hud.drawRadar({ player, targets, incoming, bases: enemies.bases, dt: 0.08 });
    }
  }
  frame();

  window.__fighter = {
    player, enemies, projectiles, fx, level, camera, scene, input, terrain, sky, jet, sounds, pilot, eject,
    get wreck() { return wreck; },
    get elapsed() { return elapsed; }, get waveIndex() { return waveIndex; }, get frames() { return frames; },
    setWeapon, spawnWave: (i) => enemies.spawnWave(i, player), toast,
    killAll() { for (const t of enemies.targets()) t.takeDamage(1e6, t.pos, 'cheat'); },
    win() { for (const t of enemies.targets()) t.takeDamage(1e6, t.pos, 'cheat'); wavesDone = true; waveIndex = level.waves.length - 1; },
    get wavesDone() { return wavesDone; }, get waveTimer() { return waveTimer; }
  };
}

boot();
