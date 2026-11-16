import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AMMO, WEAPON_COUNT, AIRCRAFT, PAINTS, CAMERA, PLANE as PLANE_DEFAULTS, SCORE, WEAPONS } from './config.js';
import { createEnemies } from './enemies.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { buildF16, MATERIALS, setAfterburner } from './jet.js';
import { createMission } from './missions.js';
import { createPilot } from './pilot.js';
import { createRecovery } from './recovery.js';
import { formatTime, loadProgress, recordClear, saveProgress, starTotal } from './progress.js';
import { createProjectiles } from './projectiles.js';
import { createSky } from './sky.js';
import { createTouchControls } from './touch-controls.js';
import { createSounds } from './sounds.js';
import { createGameMusic } from '../music/music-player.js';
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
  const PLANE = { ...PLANE_DEFAULTS };
  const progress = loadProgress();
  let briefing = true, paused = false, mission = null, finishTime = null;
  let gunStreak = 0;
  const skillStats = { bombing: 0, evasion: 0, streak: 0, points: 0 };
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
    waterColor: level.sky === 'storm' ? 0x243f51 : level.sky === 'sunset' ? 0x3a4a6a : spec.style === 'canyon' ? 0x2f8a8c : 0x2a6f8c
  });
  scene.add(terrain.group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.45, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sounds = createSounds();
  const music = createGameMusic({ track: 'fighter/afterburner' });
  music.startOnInput();
  const fx = createFx(scene);
  fx.setGround((x, z) => terrain.heightAt(x, z));
  let hitMarker = 0;
  const projectiles = createProjectiles({ scene, fx, terrain, sounds,
    onPlayerHit: () => { hitMarker = 0.25; },
    onSkill: skillReward,
    onGunResult(hit) {
      gunStreak = hit ? gunStreak + 1 : 0;
      if (gunStreak > 0 && gunStreak % 12 === 0) skillReward('streak', 100);
    }
  });
  const hud = createHud($('hud'), $('radar'));

  // ---------------------------------------------------------------- player
  const jet = buildF16();
  jet.root.traverse(n => { if (n.material === MATERIALS.skin) { n.material = n.material.clone(); n.userData.paintable = true; } });
  scene.add(jet.root);
  const pilot = createPilot({ scene, fx, terrain, sounds });
  let wreck = null;       // the abandoned jet falling after an ejection
  let recovery = null;
  const abandonedJets = [];
  let criticalToastAt = -99;
  const player = {
    kind: 'player', name: 'Viper', pos: new THREE.Vector3(level.player.x, level.player.y, level.player.z), vel: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
    yaw: THREE.MathUtils.degToRad(180 - level.player.headingDeg), pitch: 0, roll: 0, heading: 0, speed: PLANE.cruise, radius: 7.5,
    armor: PLANE.armor, alive: true, stun: 0, lastHit: 99, boost: 1, boosting: false, invert: false, weapon: 0,
    missiles: WEAPONS.missile.max, bombs: WEAPONS.bomb.max, emp: WEAPONS.emp.max, rockets: WEAPONS.rocket.max, clusters: WEAPONS.cluster.max, rails: WEAPONS.rail.max, recharge: Object.fromEntries(AMMO.map(([k]) => [k, 0])),
    deaths: 0, score: 0, god: false, groundHitCooldown: 0, braking: false, reversal: 0, reversalCooldown: 0, reversalSign: 1,
    takeDamage(amount, at, how) {
      if (!player.alive || player.god) return;
      player.armor -= amount;
      gunStreak = 0;
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
  function togglePause() {
    if (briefing || won) return;
    paused = !paused; $('pause').hidden = !paused;
    keys.clear(); input.mouseFire = false; input.firePressed = false; input.nextTarget = false;
    touch.clear(); sounds.setEngine(0, 0); sounds.alert(false);
    document.activeElement?.blur();
  }
  const touch = createTouchControls({
    onPause: togglePause, onReverse: () => reverse(),
    onEject: () => { if (!recovery?.active) eject(); },
    onTarget: () => { input.nextTarget = true; }, onInput: () => sounds.unlock()
  });
  function onKey(e, down) {
    const k = e.key;
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(k)) e.preventDefault();
    if (k === 'Escape' && down && !e.repeat && !briefing && !won) {
      togglePause();
      return;
    }
    if (briefing || paused || won) return;
    if (down && !e.repeat) {
      sounds.unlock();
      if (k === ' ') input.firePressed = true;
      if (k === 'Tab') input.nextTarget = true;
      if (/^[1-7]$/.test(k)) setWeapon(Number(k) - 1);
      if (k === 'q' || k === 'Q') setWeapon((player.weapon + 1) % WEAPON_COUNT);
      if (k === 'i' || k === 'I') { player.invert = !player.invert; toast(player.invert ? 'PITCH INVERTED' : 'PITCH NORMAL'); }
      if (k === 'm' || k === 'M') { const m = sounds.toggleMute(); music.setMuted(m); toast(m ? 'MUTED' : 'SOUND ON'); }
      if (k === 'h' || k === 'H') $('help').classList.toggle('fade');
      if ((k === 'e' || k === 'E') && !recovery?.active) eject();
      if (k === 'r' || k === 'R') reverse();
    }
    if (down) keys.add(k); else keys.delete(k);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { keys.clear(); input.mouseFire = false; input.firePressed = false; });
  renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; if (briefing || paused || won) return; sounds.unlock(); input.firePressed = true; input.mouseFire = true; });
  window.addEventListener('mouseup', () => { input.mouseFire = false; });
  window.addEventListener('wheel', (e) => { if (!briefing && !paused && !won) setWeapon((player.weapon + (e.deltaY > 0 ? 1 : WEAPON_COUNT - 1)) % WEAPON_COUNT); });
  function readKeys() {
    const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
    const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
    const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
    const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
    let pitch = (up ? 1 : 0) - (down ? 1 : 0);
    input.walk = pitch;
    input.interact = keys.has('e') || keys.has('E');
    input.rescue = keys.has('f') || keys.has('F');
    if (player.invert) pitch = -pitch;
    input.pitch = pitch;
    input.roll = (right ? 1 : 0) - (left ? 1 : 0);
    input.fire = keys.has(' ') || !!input.mouseFire;
    input.boost = keys.has('Shift');
    input.brake = keys.has('b') || keys.has('B');
    touch.sample(input, player.invert);
  }

  const weaponEls = [...document.querySelectorAll('.weapon')];
  for (const el of weaponEls) el.addEventListener('click', () => setWeapon(Number(el.dataset.w)));
  function setWeapon(i) {
    if (!Number.isInteger(i) || i < 0 || i >= WEAPON_COUNT) return;
    player.weapon = i;
    for (const el of weaponEls) el.classList.toggle('active', Number(el.dataset.w) === i);
  }
  setWeapon(0);

  // ----------------------------------------------------------------- state
  let elapsed = 0;
  let waveIndex = -1;
  let waveTimer = level.waves.length && level.waves[0].delay != null ? level.waves[0].delay : 2.5;
  let waveCleared = true;
  let wavesDone = level.waves.length === 0;
  const toastQueue = [];
  let won = false;
  let gunAcc = 0;
  const weaponCooldown = { rocket: 0, cluster: 0, rail: 0 };
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
      if (ev.type === 'plane') { addScore(ev.target.score); toast(`${ev.target.name.toUpperCase()} DOWN`); popups.push({ pos: ev.target.pos.clone(), text: `+${ev.target.score}`, age: 0, life: 1.5, color: '#ffd24a' }); }
      else if (ev.type === 'structure') { addScore(ev.target.score); popups.push({ pos: ev.target.pos.clone(), text: `+${ev.target.score}`, age: 0, life: 1.4, color: '#ffd24a' }); }
      else if (ev.type === 'base') { addScore(SCORE.baseBonus); toast(`${ev.base.name.toUpperCase()} DESTROYED`); sounds.stinger(); }
      else if (ev.type === 'tactic') toast(ev.message, 3);
    }
  });
  recovery = await createRecovery({ scene, terrain, pilot, jet, enemies, announce: toast,
    onRecovered({ position, direction, rescued }) {
      respawn(position, direction);
      toast(rescued ? 'PILOT RECOVERED — MISSION RESUMED' : 'BACK IN THE AIR — MISSION RESUMED', 3);
      sounds.stinger();
    }
  });
  loadingText.textContent = 'Taking off…';

  function addScore(n) { player.score += n; }
  function skillReward(kind, points) {
    if (won || briefing || !player.alive) return;
    skillStats[kind]++; skillStats.points += points;
    addScore(points);
    const text = { bombing: 'PRECISION BOMBING', evasion: 'MISSILE EVADED', streak: '12-HIT STREAK' }[kind];
    $('skillNotice').textContent = `${text} +${points}`;
    $('skillNotice').classList.add('show');
    clearTimeout(skillReward.timer);
    skillReward.timer = setTimeout(() => $('skillNotice').classList.remove('show'), 2300);
  }
  function reverse() {
    if (!player.alive || briefing || paused || won || player.reversalCooldown > 0) return;
    player.reversal = PLANE.reversalSeconds;
    player.reversalCooldown = PLANE.reversalCooldown;
    player.reversalSign = input.roll < 0 ? -1 : 1;
    toast('QUICK TURN — REACQUIRE YOUR TARGET', 1.5);
  }
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
  // steers the parachute down. Landing begins the recovery sortie.
  function eject() {
    if (!player.alive || won || briefing || paused || recovery.active) return;
    player.alive = false;
    player.boosting = false;
    sounds.alert(false);
    pilot.eject(player.pos, player.vel, jet.root.quaternion, jet.parts.canopy);
    recovery.begin();
    input.firePressed = false; input.mouseFire = false;
    toastQueue.length = 0;
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
      if (!terrain.isWater(player.pos.x, player.pos.z)) fx.burn(_v, { size: 6, duration: 180 });
      sounds.explosion(1.1);
      jet.root.visible = false;
      if (!terrain.isWater(player.pos.x, player.pos.z)) {
        const remains = jet.root.clone(true);
        remains.visible = true; remains.position.y = ground + 1.5;
        remains.rotation.set(0.1, wreck.yaw, 0.3);
        const charred = new THREE.MeshStandardMaterial({ color: 0x272c30, roughness: 0.95 });
        remains.traverse(n => { if (n.isMesh) n.material = charred; if (n.isLight) n.intensity = 0; });
        scene.add(remains); abandonedJets.push({ root: remains, material: charred });
        if (abandonedJets.length > 3) { const oldest = abandonedJets.shift(); scene.remove(oldest.root); oldest.material.dispose(); }
      }
      wreck = null;
    }
  }
  function respawn(position = null, direction = null) {
    player.alive = true;
    recovery?.reset();
    pilot.reset();
    wreck = null;
    jet.parts.canopy.visible = true;
    for (const part of jet.parts.pilot) part.visible = true;
    $('downKicker').textContent = 'You were shot down';
    player.armor = PLANE.armor;
    if (position) player.pos.copy(position); else player.pos.set(level.player.x, level.player.y, level.player.z);
    player.yaw = direction ? Math.atan2(-direction.x, -direction.z) : -THREE.MathUtils.degToRad(level.player.headingDeg);
    player.pitch = 0;
    player.roll = 0;
    player.speed = PLANE.cruise;
    player.boost = 1;
    player.reversal = 0;
    player.lastHit = 0;
    player.missiles = Math.max(player.missiles, 4);
    player.bombs = Math.max(player.bombs, 3);
    jet.root.visible = true;
    projectiles.clear();
    keys.clear(); input.firePressed = false; input.mouseFire = false;
    $('down').hidden = true;
    updatePlayer(0);
    camPos.copy(player.pos).addScaledVector(player.forward, -CAMERA.back).addScaledVector(WORLD_UP, CAMERA.up);
    camLook.copy(player.pos).addScaledVector(player.forward, CAMERA.lookAhead);
  }

  function updatePlayer(dt) {
    if (!player.alive) {
      if (wreck) updateWreck(dt);
      if (recovery?.active) {
        if (pilot.active) pilot.update(dt, recovery.phase === 'rescue' ? { roll: 0, pitch: 0, walk: 0 } : input);
        recovery.update(dt, input);
        return;
      }
      respawnTimer -= dt;
      $('downCount').textContent = String(Math.max(1, Math.ceil(respawnTimer)));
      if (respawnTimer <= 0) respawn();
      return;
    }
    // Bank and turn. Holding left or right rolls the jet up to maxBank and
    // the bank turns the nose; releasing levels the wings.
    player.reversalCooldown = Math.max(0, player.reversalCooldown - dt);
    player.braking = input.brake && player.reversal <= 0;
    const reversing = player.reversal > 0;
    const wantRoll = reversing ? player.reversalSign * PLANE.maxBank : input.roll * PLANE.maxBank;
    const rollStep = (input.roll !== 0 ? PLANE.rollRate : PLANE.autoLevel * Math.max(0.6, Math.abs(player.roll))) * dt;
    player.roll += THREE.MathUtils.clamp(wantRoll - player.roll, -rollStep, rollStep);
    const turn = Math.sin(player.roll) * PLANE.turnRate * (0.75 + 0.25 * Math.max(0, input.pitch));
    if (reversing) {
      const step = Math.min(dt, player.reversal);
      player.yaw -= player.reversalSign * Math.PI * step / PLANE.reversalSeconds;
      player.reversal = Math.max(0, player.reversal - dt);
    } else player.yaw -= turn * dt * (player.braking ? PLANE.brakeTurn : 1);
    player.pitch += input.pitch * PLANE.pitchRate * dt;
    if (input.pitch === 0) player.pitch -= player.pitch * Math.min(1, PLANE.pitchReturn * dt);
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.1, 1.1);

    // Speed.
    player.boosting = input.boost && !player.braking && !reversing && player.boost > 0.02;
    if (player.boosting) player.boost = Math.max(0, player.boost - dt / PLANE.boostSeconds);
    else player.boost = Math.min(1, player.boost + dt / PLANE.boostRecharge);
    if (player.boosting && !player.wasBoosting) sounds.boost(true);
    player.wasBoosting = player.boosting;
    let wanted = (player.boosting ? PLANE.boostSpeed : player.braking || reversing ? PLANE.brakeSpeed : PLANE.cruise) - Math.sin(player.pitch) * 60;
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
    for (const [key, field] of AMMO) {
      const cfg = WEAPONS[key];
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
    for (const key of Object.keys(weaponCooldown)) weaponCooldown[key] = Math.max(0, weaponCooldown[key] - dt);
    const list = candidates(targets, WEAPONS.missile.lockDeg, WEAPONS.missile.lockRange);
    const objectiveTarget = mission?.view().target;
    // Bandits in the air come first, then whatever is nearest the reticle.
    list.sort((a, b) => (b.t === objectiveTarget) - (a.t === objectiveTarget) || (b.t.kind === 'plane') - (a.t.kind === 'plane') || b.dot - a.dot);
    if (input.nextTarget && list.length) {
      input.nextTarget = false;
      cycleIndex = (cycleIndex + 1) % list.length;
      lockTarget = list[cycleIndex].t;
      lockProgress = 0;
      lockedSoundPlayed = false;
      manualLockUntil = Infinity; // Explicit target selection lasts until the target leaves the cone.
    }
    input.nextTarget = false;
    const current = lockTarget && lockTarget.alive ? list.find((c) => c.t === lockTarget) : null;
    if (!current) manualLockUntil = 0;
    let pick = current ? lockTarget : null;
    if (list.length && elapsed > manualLockUntil) {
      const best = list[0];
      // Steal the lock when a bandit shows up or something sits clearly closer to the centre.
      if (!current || best.t === objectiveTarget || (current.t !== objectiveTarget && ((best.t.kind === 'plane' && current.t.kind !== 'plane') || (best.t.kind === current.t.kind && best.dot > current.dot + 0.025)))) pick = best.t;
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
    if (player.weapon >= 4) {
      const key = ['rocket', 'cluster', 'rail'][player.weapon - 4];
      const field = ['rockets', 'clusters', 'rails'][player.weapon - 4];
      if ((key === 'rocket' ? input.fire : input.firePressed) && weaponCooldown[key] <= 0) {
        if (player[field] > 0) {
          player[field]--; weaponCooldown[key] = WEAPONS[key].interval;
          _v.copy(player.pos).addScaledVector(player.up, -1.5).addScaledVector(player.forward, 3);
          if (key === 'rocket') projectiles.fireRockets({ origin: _v, dir: player.forward, right: player.right, ownerVel: player.vel });
          if (key === 'cluster') projectiles.dropCluster({ origin: _v, vel: player.vel, right: player.right });
          if (key === 'rail') projectiles.fireRail({ origin: _v, dir: player.forward, ownerVel: player.vel, target: candidates(targets, WEAPONS.gun.assistDeg, WEAPONS.rail.range)[0]?.t });
          fx.addShake(key === 'rail' ? .22 : .08);
        } else if (input.firePressed) toast(`${key.toUpperCase()} RECHARGING`, 1.2);
      }
    }
    input.firePressed = false;
    bombPoint = (player.weapon === 2 || player.weapon === 5) ? projectiles.predictBomb(_v.copy(player.pos).addScaledVector(player.up, -1.5), player.vel) : null;
  }

  // Waves launch one at a time: the next one waits until the current bandits
  // are down, until `afterBases` bases have been cleared, and then `delay`
  // seconds (so a base fight and a dogfight do not pile up on the player).
  function updateWaves(dt) {
    if (won) return;
    if (mission) {
      mission.update(dt);
      if (mission.done) completeMission();
      return;
    }
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
      completeMission();
    }
  }

  function completeMission() {
    won = true; finishTime = elapsed;
    projectiles.clear(); sounds.alert(false); sounds.setEngine(0, 0);
    toast('MISSION COMPLETE', 2);
    setTimeout(showWin, 1500);
  }

  function showWin() {
    // The victory stinger replaces the old fanfare, which is the fallback when music cannot play.
    music.win().then((played) => { if (!played) sounds.fanfare(); });
    sounds.alert(false);
    const oldStars = starTotal(progress);
    const result = recordClear(progress, level.id, { time: finishTime, deaths: player.deaths, retries: mission?.retries || 0, parSeconds: level.parSeconds, score: player.score });
    const newStars = starTotal(progress);
    const unlocked = [...Object.values(AIRCRAFT), ...Object.values(PAINTS)].filter(x => x.stars > oldStars && x.stars <= newStars);
    const idx = list.findIndex((l) => l.id === level.id);
    const next = list[idx + 1];
    $('winStats').textContent = `Score ${player.score} · Skill bonus ${skillStats.points}\nTime ${formatTime(finishTime)} (par ${formatTime(level.parSeconds)})\nShot down ${player.deaths} · Mission retries ${mission?.retries || 0}\n${skillStats.bombing} bombing bonuses · ${skillStats.evasion} evasions · ${skillStats.streak} hit streaks\n${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}${unlocked.length ? `\nUnlocked: ${unlocked.map(x => x.name).join(', ')}` : ''}`;
    $('nextBtn').hidden = !next;
    $('nextBtn').onclick = () => { location.href = `/games-3d/fighter-plane?level=${encodeURIComponent(next.id)}`; };
    $('retryBtn').onclick = () => location.reload();
    $('win').hidden = false;
  }

  function updateCamera(dt) {
    if (window.__fighter && window.__fighter.freeCam) return;
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    if (recovery?.active) {
      // Chase the pilot: close in, a little above, looking past them.
      const seat = pilot.phase === 'seat';
      const walking = pilot.landed && recovery.phase !== 'takeoff';
      const focus = recovery.focus, forward = recovery.forward;
      _v.copy(focus).addScaledVector(forward, walking ? -7 : seat ? -22 : -17).addScaledVector(WORLD_UP, walking ? 3.5 : 5);
      // Check the camera sightline as well as its endpoint on steep terrain.
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        _w.copy(focus).lerp(_v, t);
        const floor = terrain.heightAt(_w.x, _w.z) + 1;
        if (_w.y < floor) _v.y += (floor - _w.y) / t;
      }
      camPos.lerp(_v, 1 - Math.exp(-(seat ? 2.5 : 3.5) * dt));
      const g = terrain.heightAt(camPos.x, camPos.z) + 2.5;
      if (camPos.y < g) camPos.y = g;
      _v.copy(focus).addScaledVector(forward, walking ? 3 : 6).addScaledVector(WORLD_UP, walking ? 0.8 : 2.5);
      if (recovery.phase === 'rescue') {
        const pickup = recovery.view().target;
        if (pickup) _v.lerp(pickup.pos, 0.4);
      }
      camLook.lerp(_v, k);
      camera.position.copy(camPos);
      camera.up.copy(WORLD_UP);
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
    const focus = recovery?.active ? recovery.focus : player.pos;
    speedEl.textContent = recovery?.phase === 'takeoff' ? 'AUTO' : String(Math.round((pilot.active ? pilot.vel.length() : player.speed) * 3.6));
    altEl.textContent = String(Math.round(Math.max(0, focus.y - terrain.heightAt(focus.x, focus.z))));
    scoreEl.textContent = String(player.score);
    $('timeValue').textContent = formatTime(finishTime ?? elapsed);
    waveEl.textContent = level.waves.length ? `${Math.min(level.waves.length, Math.max(0, waveIndex + 1))} / ${level.waves.length}` : '—';
    banditEl.textContent = String(enemies.aliveBandits());
    baseEl.textContent = `${enemies.bases.filter((b) => b.cleared).length} / ${enemies.bases.length}`;
    missileAmmoEl.textContent = String(player.missiles);
    bombAmmoEl.textContent = String(player.bombs);
    empAmmoEl.textContent = String(player.emp);
    weaponEls[1].classList.toggle('empty', player.missiles === 0);
    weaponEls[2].classList.toggle('empty', player.bombs === 0);
    weaponEls[3].classList.toggle('empty', player.emp === 0);
    for (const [i, field] of ['rockets', 'clusters', 'rails'].entries()) { $(['rocketAmmo','clusterAmmo','railAmmo'][i]).textContent = player[field]; weaponEls[i + 4].classList.toggle('empty', player[field] === 0); }
    boostFill.style.width = `${player.boost * 100}%`;
    armorFill.style.width = `${Math.max(0, player.armor / PLANE.armor) * 100}%`;
    armorFill.parentElement.parentElement.classList.toggle('low', player.armor < 35);
    $('maneuverValue').textContent = player.reversal > 0 ? 'TURNING' : player.reversalCooldown > 0 ? `R · ${Math.ceil(player.reversalCooldown)}s` : 'R · READY';
    $('brakeValue').textContent = player.braking ? 'AIRBRAKE' : player.boosting ? 'BOOST' : 'CRUISE';
    const objective = recovery?.active ? recovery.view() : mission?.view();
    $('panel').hidden = recovery?.active;
    $('recoveryActions').hidden = !recovery?.active;
    if (recovery?.active) {
      $('recoveryFill').style.width = `${Math.min(1, objective.progress) * 100}%`;
      $('recoveryStatus').textContent = objective.hint;
    }
    $('missionPanel').hidden = !objective;
    $('objective').hidden = !!objective;
    if (objective) {
      $('missionStep').textContent = recovery?.active ? 'PILOT RECOVERY' : `OBJECTIVE ${objective.step} / ${objective.total}`;
      $('missionTitle').textContent = objective.title;
      $('missionHint').textContent = objective.hint;
      $('missionDetail').textContent = `${objective.detail || ''}${objective.target && !recovery?.active ? ` · ${Math.round(player.pos.distanceTo(objective.target.pos))}m` : ''}`;
      $('bossHealth').hidden = !objective.boss;
      if (objective.boss) { $('bossName').textContent = `${objective.boss.name} · ${objective.boss.evasion > 0 ? 'EVADING' : 'ATTACKING'}`; $('bossFill').style.width = `${Math.max(0, objective.boss.hp / objective.boss.maxHp) * 100}%`; }
    }
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

  updatePlayer(0);
  camPos.copy(player.pos).addScaledVector(player.forward, -CAMERA.back).addScaledVector(WORLD_UP, CAMERA.up);
  camLook.copy(player.pos);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.updateMatrixWorld();
  renderer.setRenderTarget(composer.renderTarget1);
  await renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  for (const program of renderer.info.programs) program.getUniforms();
  composer.render();
  loadingEl.hidden = true;
  $('levelName').textContent = level.name;
  $('briefingTitle').textContent = level.name;
  $('briefingDescription').textContent = level.description;
  $('briefingPar').textContent = formatTime(level.parSeconds);
  $('briefingSteps').replaceChildren(...(level.mission?.stages || []).map(s => { const li = document.createElement('li'); li.textContent = s.title; return li; }));
  const stars = starTotal(progress);
  for (const [id, catalog, saved] of [['aircraftSelect', AIRCRAFT, progress.aircraft], ['paintSelect', PAINTS, progress.paint]]) {
    const select = $(id);
    for (const [key, item] of Object.entries(catalog)) {
      const option = document.createElement('option'); option.value = key;
      option.disabled = stars < item.stars;
      option.textContent = `${item.name}${item.description ? ` · ${item.description}` : ''}${option.disabled ? ` · ${item.stars} stars to unlock` : ''}`;
      select.appendChild(option);
    }
    if (catalog[saved] && stars >= catalog[saved].stars) select.value = saved;
  }
  $('hangarStars').textContent = `${stars} career stars · paints at 1 and 5 · Kestrel at 3`;
  function applyPaint() { jet.root.traverse(n => { if (n.userData.paintable) n.material.color.setHex(PAINTS[$('paintSelect').value].color); }); }
  $('paintSelect').onchange = applyPaint;
  applyPaint();
  $('briefing').hidden = false;
  $('launchBtn').onclick = () => {
    const aircraft = $('aircraftSelect').value;
    Object.assign(PLANE, PLANE_DEFAULTS, AIRCRAFT[aircraft].tuning);
    player.armor = PLANE.armor; player.name = AIRCRAFT[aircraft].name;
    progress.aircraft = aircraft; progress.paint = $('paintSelect').value; saveProgress(progress);
    applyPaint(); briefing = false;
    $('briefing').hidden = true;
    document.activeElement?.blur();
    sounds.unlock();
    mission = createMission({ level, scene, terrain, enemies, player, announce: toast, recover: respawn,
      award(points, label) { addScore(points); toast(`${label} +${points}`, 1.5); sounds.stinger(); } });
    updateDom();
    if (level.briefing?.length) queueToasts(level.briefing);
    setTimeout(() => $('help').classList.add('fade'), 22000);
  };
  $('resumeBtn').onclick = togglePause;

  const clock = new THREE.Clock();
  let frames = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    touch.update({ blocked: briefing || paused || won || (!player.alive && !recovery.active), recovery: recovery.active, phase: recovery.phase, weapon: player.weapon });
    if (briefing || paused || won) {
      composer.render();
      if (won) updateDom();
      return;
    }
    if (!recovery.active) elapsed += dt;
    frames++;
    readKeys();
    updatePlayer(dt);
    const targets = enemies.targets();
    updateWeapons(dt, targets);
    if (!recovery.active) enemies.update(dt, player, elapsed);
    projectiles.update(dt, { player, targets });
    if (!recovery.active) updateWaves(dt);
    fx.update(dt, camera);
    terrain.update(dt);
    updateCamera(dt);
    sky.update(recovery.active ? recovery.focus : player.pos, dt);
    sounds.setEngine(player.alive ? 0.4 + Math.max(0, input.pitch) * 0.3 : 0, player.boosting ? 1 : 0);

    // The combat layer plays while bandits are in the air.
    music.intensity(!recovery.active && enemies.aliveBandits() > 0 ? 1 : 0, 2);
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
    if (recovery.active) hud.drawRecovery({ camera, pos: recovery.focus, objective: recovery.view() });
    else hud.draw({ camera, player, targets, locked: lockTarget, lockProgress, incoming, bombPoint, weapon: player.weapon, time: elapsed, nearestBase: mission ? null : nearestBase(), gunTarget, hitMarker, popups, objective: mission?.view() });
    domAcc += dt;
    if (domAcc > 0.08) {
      domAcc = 0;
      updateDom();
      const radarPlayer = recovery.active ? { pos: recovery.focus, heading: pilot.heading } : player;
      hud.drawRadar({ player: radarPlayer, targets: recovery.active ? [] : targets, incoming: recovery.active ? [] : incoming, bases: enemies.bases, range: recovery.active && pilot.landed ? 400 : 3200, dt: 0.08, objective: recovery.active ? recovery.view() : mission?.view() });
    }
  }
  frame();

  window.__fighter = {
    player, enemies, projectiles, fx, level, camera, scene, input, touch, terrain, sky, jet, sounds, music, pilot, recovery, abandonedJets, eject,
    reverse, skillStats, get mission() { return mission; }, get won() { return won; }, get paused() { return paused; }, get briefing() { return briefing; },
    get wreck() { return wreck; },
    get elapsed() { return elapsed; }, get waveIndex() { return waveIndex; }, get frames() { return frames; },
    setWeapon, spawnWave: (i) => enemies.spawnWave(i, player), toast,
    killAll() { for (const t of enemies.targets()) t.takeDamage(1e6, t.pos, 'cheat'); },
    win() { if (!briefing && !won) completeMission(); },
    get wavesDone() { return wavesDone; }, get waveTimer() { return waveTimer; }
  };
}

boot();
