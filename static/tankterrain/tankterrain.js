import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BOSS, CAMERA, CHECKPOINT, PICKUPS, SCORE, SHIELD, SMOKE, TANK, UPGRADES, WEAPONS, WEAPON_ORDER } from './config.js';
import { aimGroups, ballisticPitch, forwardOf, groundPose, slopeAhead, wrapAngle } from './drive.js';
import { createBoss } from './boss.js';
import { createBridges } from './bridges.js';
import { createEnemies } from './enemies.js';
import { createFort } from './fort.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createLife } from './life.js';
import { buildShield, buildTank, driveTracks, flashTank, updateTankFlash } from './models.js';
import { createPickups } from './pickups.js';
import { applyLoadout, buyUpgrade, formatTime, loadProgress, markTip, recordClear, resetTips, saveProgress, snapshotLoadout, tipSeen, todayKey, upgradeCost, upgradeMods } from './progress.js';
import { createProjectiles } from './projectiles.js';
import { createScenery } from './scenery.js';
import { createSky, skyPreset } from './sky.js';
import { createSounds } from './sounds.js';
import { createTargets } from './targets.js';
import { createTerrain, loadHeightmap } from './terrain.js';
import { createTrackMarks } from './tracks.js';
import { createWeather } from './weather.js';

const $ = (id) => document.getElementById(id);
const loadingEl = $('loading');
const loadingText = $('loadingText');
const levelSelect = $('levelSelect');
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();
const MAX_SLOPE = THREE.MathUtils.degToRad(TANK.maxSlopeDeg);
const SMOKE_COLOR = new THREE.Color(0xb0b0b0);
const ENGINE_SMOKE = new THREE.Color(0x2a2a2a);
const FIRE_COLOR = new THREE.Color(0xff7a18);

function boot() {
  const params = new URLSearchParams(location.search);
  loadGame(params.get('level')).catch((err) => {
    console.error(err);
    loadingText.textContent = err.message || 'The level failed to load';
  });
}

async function loadGame(wanted) {
  const list = await fetch('/games-3d/tank-terrain/api/levels').then((res) => {
    if (!res.ok) throw new Error('Could not list levels');
    return res.json();
  });
  if (!list.length) throw new Error('No levels were generated');
  const daily = wanted === 'daily' || (wanted || '').startsWith('daily-');
  const chosen = daily ? null : (list.find((level) => level.id === wanted) || list[0]);
  for (const level of list) {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = `${level.order}. ${level.name}`;
    levelSelect.appendChild(option);
  }
  const dailyOption = document.createElement('option');
  dailyOption.value = 'daily';
  dailyOption.textContent = '★ Daily fort';
  levelSelect.appendChild(dailyOption);
  levelSelect.value = daily ? 'daily' : chosen.id;
  levelSelect.addEventListener('change', () => {
    location.href = `/games-3d/tank-terrain?level=${encodeURIComponent(levelSelect.value)}`;
  });
  if (daily) loadingText.textContent = 'Building today’s fort… (first visit of the day takes a few seconds)';
  const level = await fetch(daily ? '/games-3d/tank-terrain/api/daily' : `/games-3d/tank-terrain/api/level/${encodeURIComponent(chosen.id)}`).then((res) => {
    if (!res.ok) throw new Error('That level is missing');
    return res.json();
  });
  loadingText.textContent = 'Reading the terrain…';
  const heightmap = await loadHeightmap(level.terrain.heightmap, level.terrain.encoding || 'rg16');
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
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.3, 5000);
  const preset = skyPreset(level.sky);
  const sky = createSky(scene, renderer, { preset: level.sky, worldSize: spec.size, cloudBase: spec.maxHeight + 120 });
  const weather = createWeather(scene, { preset: level.weather || 'clear', sky });
  const terrain = createTerrain({
    heightmap, size: spec.size, maxHeight: spec.maxHeight, colorTexture: spec.colorTexture, waterLevel: spec.waterLevel,
    waterColor: preset.water, apronColor: preset.apron
  });
  scene.add(terrain.group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), weather.night ? 0.55 : 0.38, 0.6, weather.night ? 0.7 : 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const sounds = createSounds();
  const fx = createFx(scene);
  fx.setGround((x, z) => terrain.heightAt(x, z));
  const hud = createHud($('hud'), $('minimap'));
  hud.setMap(level);

  // ------------------------------------------------------------- progress
  const progress = loadProgress();
  const mods = upgradeMods(progress);
  const maxBattery = TANK.battery + mods.battery;

  // ---------------------------------------------------------------- player
  const tank = buildTank('player');
  scene.add(tank.root);
  const shield = buildShield();
  tank.body.add(shield);
  const start = level.player;
  const player = {
    kind: 'player', name: 'Tank', pos: new THREE.Vector3(start.x, 0, start.z), vel: new THREE.Vector3(),
    heading: THREE.MathUtils.degToRad(start.headingDeg || 0), speed: 0, pitch: 0, roll: 0, radius: TANK.radius,
    hp: TANK.hp + mods.hp, maxHp: TANK.hp + mods.hp, battery: maxBattery, maxBattery, lives: start.lives ?? TANK.lives, alive: true, stun: 0,
    weapons: new Set(start.weapons || ['cannon', 'mg']), ammo: {}, weapon: 'cannon', timers: {}, turretYaw: 0, gunPitch: 0, manual: 0,
    recoil: 0, hullKick: 0, dip: 0, prevSpeed: 0, deaths: 0, score: 0, god: false, lastHit: 99, firingLaser: false,
    shielding: false, shieldFlash: 0, smokeCharges: SMOKE.charges, smokeTimer: 0, smokeRecharge: 0, nukesFired: 0, missilesShot: 0, shots: 0, pickups: 0, invuln: 0,
    maxSpeed: TANK.maxSpeed * mods.speedMul, acceleration: TANK.acceleration * mods.speedMul, turretTurn: TANK.turretTurn * mods.turretMul, ammoMul: mods.ammoMul,
    takeDamage(amount, at, how) {
      if (!player.alive || player.god || player.invuln > 0) return;
      if (player.shielding) {
        amount *= 1 - SHIELD.absorb;
        player.battery = Math.max(0, player.battery - amount * 0.6);
        player.shieldFlash = 1;
        sounds.shieldHit();
      }
      player.hp -= amount;
      player.lastHit = 0;
      flashTank(tank, Math.min(1, amount / 20));
      flashDamage(Math.min(1, 0.3 + amount / 40));
      if (at) fx.hitSparks(at, null, how === 'bullet' ? 2 : 5);
      fx.addShake(how === 'bullet' ? 0.08 : 0.4);
      sounds.damage();
      if (player.hp <= 0) die();
    }
  };
  for (const name of WEAPON_ORDER) {
    const w = WEAPONS[name];
    player.ammo[name] = w.ammo == null ? Infinity : (player.weapons.has(name) ? Math.round(w.ammo * player.ammoMul) : 0);
  }
  const ammoMax = (name) => Math.round(WEAPONS[name].max * player.ammoMul);
  // Carry-over loadout from the previous campaign level.
  let carried = [];
  if (!level.daily && progress.loadout) carried = applyLoadout(player, progress.loadout, player.ammoMul);
  player.pos.y = terrain.heightAt(player.pos.x, player.pos.z);
  const lights = weather.attachLights(tank);
  if (lights) $('lightsRow').hidden = false;

  let fort, projectiles, enemies, pickups, bridges, targets, life, trackMarks, boss;
  const popups = [];
  let hitMarker = 0;
  let toastTimer = null;
  const events = [];
  let reveal = 0;
  const markers = [];
  let fordMarkerTimer = 0;

  function onEvent(ev) { events.push(ev); }
  fort = createFort({ scene, terrain, fx, sounds, level, onEvent });
  bridges = createBridges({ scene, terrain, fx, sounds, level, onEvent });
  terrain.addOverride(bridges.heightAt);
  boss = createBoss({ scene, terrain, fort, fx, sounds, level, onEvent });
  projectiles = createProjectiles({
    scene, fx, terrain, fort, sounds,
    onImpact: (ev) => {
      if (ev.missileKill) { player.missilesShot++; addScore(SCORE.missileShot); popups.push({ pos: ev.point.clone(), text: `INTERCEPT +${SCORE.missileShot}`, age: 0, life: 1.4, color: '#60d0ff' }); return; }
      if (ev.shot.owner === 'player' && ev.victim && ev.victim !== player) hitMarker = 0.2;
      if (ev.shot.owner === 'player' && ev.shot.type === 'mortar' && fort.inside(ev.point.x, ev.point.z, 6)) {
        if (reveal <= 0) toast('FORT INTERIOR REVEALED ON THE MAP', 2.5);
        reveal = WEAPONS.mortar.revealSeconds;
      }
      if (ev.shot.type !== 'bullet') life?.startle(ev.point, 70);
    }
  });
  projectiles.setBridges(bridges);
  loadingText.textContent = 'Planting the forest…';
  await createScenery({ scene, terrain, fort, level });
  loadingText.textContent = 'Waking the garrison…';
  enemies = createEnemies({ scene, fx, projectiles, terrain, fort, level, sounds, onEvent });
  pickups = createPickups({ scene, terrain, fx, sounds, level });
  targets = createTargets({ scene, terrain, fort, fx, sounds, level, pickups, onEvent });
  life = createLife({ scene, terrain, fort, level, weather });
  trackMarks = createTrackMarks(scene, terrain);

  // ----------------------------------------------------------------- input
  const input = { forward: false, backward: false, left: false, right: false, fire: false, firePressed: false, turretLeft: false, turretRight: false, mouseFire: false, shield: false, smokePressed: false };
  const keys = new Set();
  let paused = false;
  function onKey(e, down) {
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (down && !e.repeat) {
      sounds.unlock();
      if (k === 'Escape' && paused) { closeGarage(); return; }
      if (paused) return;
      if (k === ' ') input.firePressed = true;
      if (k >= '1' && k <= '7') selectWeapon(WEAPON_ORDER[Number(k) - 1]);
      if (k === 'q' || k === 'Q') cycleWeapon(-1);
      if (k === 'e' || k === 'E') cycleWeapon(1);
      if (k === 'm' || k === 'M') { const m = sounds.toggleMute(); toast(m ? 'MUTED' : 'SOUND ON'); }
      if (k === 'h' || k === 'H') $('help').classList.toggle('fade');
      if (k === 'c' || k === 'C') player.manual = 0;
      if (k === 'x' || k === 'X') input.smokePressed = true;
      if (k === 'l' || k === 'L') toggleLights();
      if (k === 'g' || k === 'G') openGarage();
    }
    if (down) keys.add(k); else keys.delete(k);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('mousedown', () => { sounds.unlock(); if (!paused) { input.firePressed = true; input.mouseFire = true; } });
  window.addEventListener('mouseup', () => { input.mouseFire = false; });
  window.addEventListener('wheel', (e) => { if (!paused) cycleWeapon(e.deltaY > 0 ? 1 : -1); });
  function readKeys() {
    input.forward = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
    input.backward = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
    input.left = keys.has('ArrowLeft');
    input.right = keys.has('ArrowRight');
    input.turretLeft = keys.has('a') || keys.has('A');
    input.turretRight = keys.has('d') || keys.has('D');
    input.fire = keys.has(' ') || input.mouseFire;
    input.shield = keys.has('Shift');
  }

  const weaponEls = [...document.querySelectorAll('.weapon')];
  for (const el of weaponEls) el.addEventListener('click', () => selectWeapon(el.dataset.w));
  function selectWeapon(name) {
    if (!player.weapons.has(name)) { toast(`${WEAPONS[name].name} NOT FOUND YET`, 1.2); sounds.empty(); return; }
    player.weapon = name;
    for (const el of weaponEls) el.classList.toggle('active', el.dataset.w === name);
  }
  function cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((n) => player.weapons.has(n));
    const i = owned.indexOf(player.weapon);
    selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }
  selectWeapon('cannon');

  function toggleLights() {
    if (!lights) return;
    weather.setLights(!weather.lightsOn);
    toast(weather.lightsOn ? 'LIGHTS ON — THEY CAN SEE YOU TOO' : 'LIGHTS OFF — RUNNING DARK', 2);
  }

  // ----------------------------------------------------------------- state
  let elapsed = 0;
  let won = false;
  let lost = false;
  let respawnTimer = 0;
  let domAcc = 0;
  let lockTarget = null;
  let lockProgress = 0;
  let lockTickAcc = 0;
  let lockedSoundPlayed = false;
  let losAcc = 0;
  const reticle = new THREE.Vector3();
  let haveReticle = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let frames = 0;
  let exhaustAcc = 0;
  let damageAcc = 0;
  let smokeAcc = 0;
  let trackAcc = 0;
  let alarmRaised = false;
  let objectiveDone = false;
  const objective = level.objective || { type: 'turrets', text: 'Destroy every turret' };

  // ------------------------------------------------------------ checkpoints
  // Clearing an outpost (its squad, troopers and turret) or breaching the
  // fort wall moves the respawn point forward.
  const checkpoint = { x: start.x, z: start.z, headingDeg: start.headingDeg || 0, name: 'start' };
  const clearedOutposts = new Set();
  let checkpointAcc = 0;
  function setCheckpoint(x, z, headingDeg, name, label) {
    checkpoint.x = x; checkpoint.z = z; checkpoint.headingDeg = headingDeg; checkpoint.name = name;
    addScore(SCORE.checkpoint);
    toast(`${label} — CHECKPOINT +${SCORE.checkpoint}`, 3);
    sounds.checkpoint();
    popups.push({ pos: new THREE.Vector3(x, terrain.heightAt(x, z) + 4, z), text: 'CHECKPOINT', age: 0, life: 2, color: '#9bff8a' });
    $('checkpointValue').textContent = name;
    showTip('checkpoint');
  }
  function updateCheckpoints(dt) {
    checkpointAcc += dt;
    if (checkpointAcc < 0.5 || won) return;
    checkpointAcc = 0;
    for (const o of level.outposts || []) {
      if (clearedOutposts.has(o.id)) continue;
      if (enemies.homeCleared(o.id)) {
        clearedOutposts.add(o.id);
        const n = o.id.replace('outpost-', '');
        setCheckpoint(o.x, o.z, o.headingDeg, `outpost ${n}`, `OUTPOST ${n} CLEARED`);
      }
    }
  }
  function breachCheckpoint() {
    const a = THREE.MathUtils.degToRad(level.fort.headingDeg || 0);
    const d = level.fort.hd + CHECKPOINT.breachOffset;
    setCheckpoint(level.fort.x - Math.sin(a) * d, level.fort.z + Math.cos(a) * d, 180 - (level.fort.headingDeg || 0), 'fort gate', 'WALL BREACHED');
  }

  // ------------------------------------------------------------- onboarding
  // Short tips shown once each, ever, when the situation first comes up.
  const TIPS = {
    drive: { text: 'Drive with <kbd>↑</kbd><kbd>↓</kbd> and turn with <kbd>←</kbd><kbd>→</kbd>', done: () => Math.hypot(player.pos.x - start.x, player.pos.z - start.z) > 12 },
    fire: { text: 'Hold <kbd>Space</kbd> to fire the cannon. The reticle shows where the shell lands', done: () => player.shots > 0 },
    pickup: { text: 'Crates on the ground are ammo, batteries and repairs. Drive over them', done: () => player.pickups > 0 },
    lock: { text: 'The turret locks on by itself. <kbd>A</kbd> <kbd>D</kbd> swing it, <kbd>C</kbd> centres it', done: () => tipTimer > 6 },
    mg: { text: 'Press <kbd>2</kbd> for the machine gun: cheap bullets for scouts and troopers', done: () => player.weapon === 'mg' },
    weapon: { text: 'New weapon! Press its number key, or <kbd>Q</kbd> <kbd>E</kbd> to cycle', done: () => tipTimer > 6 },
    shield: { text: 'Taking hits? Hold <kbd>Shift</kbd> to raise the shield. It drains the battery', done: () => player.shielding },
    smoke: { text: 'Press <kbd>X</kbd> for smoke: they lose you and missiles lose their lock', done: () => player.smokeTimer > 0 },
    missile: { text: 'Incoming missile! Select the machine gun <kbd>2</kbd> and shoot it down', done: () => player.weapon === 'mg' || tipTimer > 8 },
    wall: { text: 'The cannon <kbd>1</kbd> breaches walls. The gate is the weakest spot', done: () => fort.breached },
    flag: { text: 'Inside! Drive onto the flag in the keep to take the fort', done: () => won || tipTimer > 10 },
    trooper: { text: 'Rocket troopers hide behind cover. Run them over or use the machine gun', done: () => tipTimer > 7 },
    heli: { text: 'Attack helicopter! Lock on and use missiles <kbd>3</kbd> or the machine gun <kbd>2</kbd>', done: () => tipTimer > 8 },
    command: { text: 'A command truck is calling reinforcements. Kill it to stop them', done: () => tipTimer > 7 },
    checkpoint: { text: 'Checkpoint reached. A destroyed tank now comes back here', done: () => tipTimer > 6 },
    boss: { text: 'The Mammoth only takes full damage from behind. Circle it', done: () => tipTimer > 8 },
    dome: { text: 'The keep is shielded. Follow the pylons to the generator and destroy it', done: () => !boss.domeUp || tipTimer > 10 }
  };
  let currentTip = null, tipTimer = 0, tipDoneTimer = 0;
  const tipQueue = [];
  function showTip(name) {
    if (!TIPS[name] || tipSeen(progress, name) || currentTip === name || tipQueue.includes(name)) return;
    tipQueue.push(name);
  }
  function updateTips(dt) {
    const el = $('tip');
    if (currentTip) {
      tipTimer += dt;
      if (tipDoneTimer > 0) {
        tipDoneTimer -= dt;
        if (tipDoneTimer <= 0) { el.hidden = true; el.classList.remove('done'); markTip(progress, currentTip); currentTip = null; tipTimer = 0; }
      } else if (TIPS[currentTip].done() || tipTimer > 25) {
        tipDoneTimer = 1.2;
        el.classList.add('done');
      }
      return;
    }
    if (tipQueue.length && !paused && player.alive && !won && !lost) {
      currentTip = tipQueue.shift();
      tipTimer = 0;
      $('tipText').innerHTML = TIPS[currentTip].text;
      el.hidden = false;
      sounds.tip();
    }
  }

  function addScore(n) { player.score += n; }
  function toast(text, seconds = 2.2) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
  }
  function flashDamage(strength) {
    const el = $('flash');
    el.style.transition = 'none';
    el.style.opacity = String(strength);
    requestAnimationFrame(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = '0'; });
  }
  function nukeFlash() {
    const el = $('nukeFlash');
    el.style.transition = 'none';
    el.style.opacity = '1';
    requestAnimationFrame(() => { el.style.transition = 'opacity 1.6s'; el.style.opacity = '0'; });
  }

  function die() {
    player.alive = false;
    player.deaths++;
    player.lives--;
    player.shielding = false;
    shield.visible = false;
    _v.copy(player.pos);
    _v.y += 1.5;
    fx.explosion(_v, { size: 8, ground: false });
    fx.burn(_v, { size: 3, duration: TANK.respawnSeconds + 1 });
    fx.rubbleBurst(_v, 6, 0x3a4030, 0.8, 12);
    life.startle(player.pos, 90);
    sounds.explosion(1.3);
    sounds.down();
    sounds.setLaser(false);
    tank.root.visible = false;
    document.body.classList.remove('critical');
    trackMarks.lift(0); trackMarks.lift(1);
    if (player.lives <= 0) { showLose(); return; }
    respawnTimer = TANK.respawnSeconds;
    $('down').hidden = false;
    $('downCount').textContent = String(TANK.respawnSeconds);
    $('downLives').textContent = `${player.lives} ${player.lives === 1 ? 'life' : 'lives'} left`;
    $('downWhere').textContent = checkpoint.name === 'start' ? 'Back to the start' : `Respawning at the ${checkpoint.name} checkpoint`;
  }
  function respawn() {
    player.alive = true;
    player.hp = player.maxHp;
    player.battery = player.maxBattery;
    player.pos.set(checkpoint.x, terrain.heightAt(checkpoint.x, checkpoint.z), checkpoint.z);
    player.heading = THREE.MathUtils.degToRad(checkpoint.headingDeg || 0);
    fort.resolveCircle(player.pos, player.radius + 1);
    player.speed = 0;
    player.smokeTimer = 0;
    player.invuln = 3;
    tank.root.visible = true;
    for (const name of WEAPON_ORDER) {
      const w = WEAPONS[name];
      if (player.weapons.has(name) && w.ammo != null) player.ammo[name] = Math.max(player.ammo[name], Math.min(ammoMax(name), Math.round(w.ammo * player.ammoMul)));
    }
    projectiles.clear();
    $('down').hidden = true;
    camPos.copy(player.pos).addScaledVector(forwardOf(player.heading, _v), -CAMERA.back).addScaledVector(WORLD_UP, CAMERA.up);
  }

  // -------------------------------------------------------------- driving
  function updatePlayer(dt) {
    updateTankFlash(tank, dt);
    if (!player.alive) {
      if (!lost) {
        respawnTimer -= dt;
        $('downCount').textContent = String(Math.max(1, Math.ceil(respawnTimer)));
        if (respawnTimer <= 0) respawn();
      }
      return;
    }
    const speedRatio = Math.min(1, Math.abs(player.speed) / player.maxSpeed);
    const turnRate = THREE.MathUtils.lerp(TANK.turnSpeed, TANK.turnSpeedAtMax, speedRatio);
    let turning = 0;
    if (input.left) turning += 1;
    if (input.right) turning -= 1;
    const reverseFlip = player.speed < -0.2 ? -1 : 1;
    const turned = turning * reverseFlip * turnRate * dt;
    player.heading += turned;

    const dir = input.forward ? 1 : input.backward ? -1 : 0;
    const uphill = slopeAhead(terrain, player.pos.x, player.pos.z, player.heading, TANK.wheelbase, Math.sign(player.speed || dir || 1));
    const slopeFactor = Math.max(0.3, 1 - Math.max(0, uphill) / MAX_SLOPE * 0.65);
    const wading = terrain.waterDepth(player.pos.x, player.pos.z) > 0.05 ? 0.7 : 1;
    if (dir > 0) {
      const cap = player.maxSpeed * slopeFactor * wading;
      if (player.speed < 0) player.speed = Math.min(0, player.speed + TANK.brakeDecel * dt);
      else player.speed = Math.min(cap, player.speed + player.acceleration * slopeFactor * dt);
    } else if (dir < 0) {
      const cap = TANK.reverseMaxSpeed * slopeFactor * wading;
      if (player.speed > 0) player.speed = Math.max(0, player.speed - TANK.brakeDecel * dt);
      else player.speed = Math.max(-cap, player.speed - player.acceleration * 0.8 * slopeFactor * dt);
    } else if (player.speed !== 0) {
      const decel = TANK.coastDecel * dt;
      player.speed = Math.abs(player.speed) <= decel ? 0 : player.speed - Math.sign(player.speed) * decel;
    }
    if (dir === 0 && Math.abs(uphill) > MAX_SLOPE * 0.6) player.speed -= Math.sin(uphill) * 6 * dt;

    const before = _o.copy(player.pos);
    if (player.speed !== 0) {
      forwardOf(player.heading, _v);
      const next = _w.copy(player.pos).addScaledVector(_v, player.speed * dt);
      const limit = terrain.half - TANK.edgeMargin;
      next.x = THREE.MathUtils.clamp(next.x, -limit, limit);
      next.z = THREE.MathUtils.clamp(next.z, -limit, limit);
      const slopeNext = slopeAhead(terrain, next.x, next.z, player.heading, TANK.wheelbase, Math.sign(player.speed));
      if (slopeNext > MAX_SLOPE || terrain.isWater(next.x, next.z)) {
        player.speed = 0;
        if (dir !== 0 && Math.random() < dt * 2) toast(terrain.isWater(next.x, next.z) ? 'TOO DEEP — FIND THE FORD' : 'TOO STEEP', 1);
      } else {
        player.pos.x = next.x;
        player.pos.z = next.z;
      }
    }
    if (fort.resolveCircle(player.pos, player.radius)) {
      if (Math.abs(player.speed) > 6) { sounds.clank(); fx.addShake(0.1); }
      player.speed *= 0.3;
    }
    for (const e of enemies.tanks) {
      if (!e.alive) continue;
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const min = player.radius + e.radius;
      if (d < min && d > 1e-4) { player.pos.x = e.pos.x + (dx / d) * min; player.pos.z = e.pos.z + (dz / d) * min; player.speed *= 0.4; }
    }
    player.vel.copy(player.pos).sub(before).divideScalar(Math.max(dt, 1e-4));

    // Weight: the hull kicks up when the cannon fires and dips under braking.
    const accel = (player.speed - player.prevSpeed) / Math.max(dt, 1e-4);
    player.prevSpeed = player.speed;
    player.dip += (THREE.MathUtils.clamp(-accel * TANK.brakeDip, -0.12, 0.12) - player.dip) * Math.min(1, dt * 6);
    player.hullKick = Math.max(0, player.hullKick - dt * 3.2);
    const kick = Math.sin(player.hullKick * Math.PI) * TANK.recoilKick;

    const pose = groundPose(terrain, player.pos.x, player.pos.z, player.heading, TANK.wheelbase, TANK.track);
    const smoothing = Math.min(1, dt * 9);
    player.pitch = THREE.MathUtils.lerp(player.pitch, pose.pitch, smoothing);
    player.roll = THREE.MathUtils.lerp(player.roll, pose.roll, smoothing);
    player.pos.y = THREE.MathUtils.lerp(player.pos.y || pose.y, pose.y, smoothing);
    tank.root.position.copy(player.pos);
    tank.root.rotation.set(0, player.heading, 0);
    tank.body.rotation.set(-(player.pitch + kick + player.dip), 0, player.roll, 'YXZ');
    tank.body.position.z = -Math.sin(player.hullKick * Math.PI) * 0.35;
    driveTracks(tank, player.speed * dt, turned * 2.2);

    // Track marks and dust trails behind the tracks.
    trackAcc += Math.abs(player.speed) * dt + Math.abs(turned) * 1.2;
    if (trackAcc > 0.7) {
      trackAcc = 0;
      const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);
      if (!terrain.isWater(player.pos.x, player.pos.z) && terrain.waterDepth(player.pos.x, player.pos.z) < 0.05 && !bridges.at(player.pos.x, player.pos.z)) {
        trackMarks.stamp(0, player.pos.x - rx * 1.5, player.pos.z - rz * 1.5, player.heading);
        trackMarks.stamp(1, player.pos.x + rx * 1.5, player.pos.z + rz * 1.5, player.heading);
      } else { trackMarks.lift(0); trackMarks.lift(1); }
    }

    // Exhaust and dust.
    exhaustAcc += dt;
    const load = dir !== 0 ? 1 : 0.3;
    if (exhaustAcc > 0.08 / load) {
      exhaustAcc = 0;
      for (const ex of tank.exhaust) {
        _v.copy(ex).applyMatrix4(tank.body.matrixWorld);
        fx.pools.smoke.emit({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5), vy: 1.5 + load, vz: (Math.random() - 0.5), life: 1.2, size: 0.4, sizeEnd: 2.2 * load, color: ENGINE_SMOKE, colorEnd: new THREE.Color(0x6a6a6a), alpha: 0.35 * load });
      }
    }
    if (Math.abs(player.speed) > 4 && Math.random() < dt * (4 + speedRatio * 6) && !terrain.isWater(player.pos.x, player.pos.z)) {
      forwardOf(player.heading, _v);
      const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);
      const side = Math.random() < 0.5 ? -1.5 : 1.5;
      fx.dust(_w.copy(player.pos).addScaledVector(_v, -3.5).add(_o.set(rx * side, 0, rz * side)), 1);
    }
    if (terrain.waterDepth(player.pos.x, player.pos.z) > 0.05 && Math.abs(player.speed) > 2 && Math.random() < dt * 10) {
      fx.pools.sparks.emit({ x: player.pos.x + (Math.random() - 0.5) * 3, y: player.pos.y + 0.3, z: player.pos.z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.6, size: 0.5, sizeEnd: 0.1, color: new THREE.Color(0xcfe8ff), colorEnd: new THREE.Color(0x80a0c0), gravity: 12 });
    }

    // Damage states: smoke from the engine below half armour, fire below a quarter.
    const hpRatio = player.hp / player.maxHp;
    damageAcc += dt;
    if (hpRatio < 0.5 && damageAcc > (hpRatio < 0.25 ? 0.06 : 0.14)) {
      damageAcc = 0;
      _v.copy(tank.exhaust[Math.random() < 0.5 ? 0 : 1]).applyMatrix4(tank.body.matrixWorld);
      _v.y += 0.4;
      fx.pools.smoke.emit({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 1.5 + player.vel.x * 0.2, vy: 1.8, vz: (Math.random() - 0.5) * 1.5 + player.vel.z * 0.2, life: 2.2, size: 0.8, sizeEnd: 4.5, color: ENGINE_SMOKE, colorEnd: ENGINE_SMOKE, alpha: 0.6 });
      if (hpRatio < 0.25) {
        fx.pools.fire.emit({ x: _v.x, y: _v.y - 0.2, z: _v.z, vx: 0, vy: 1.5, vz: 0, life: 0.35, size: 1.1, sizeEnd: 0.3, color: FIRE_COLOR, colorEnd: new THREE.Color(0x6a1a04), alpha: 0.9 });
        if (Math.random() < 0.3) fx.pools.sparks.emit({ x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 0.5, size: 0.3, sizeEnd: 0.05, color: new THREE.Color(0xffe29a), colorEnd: new THREE.Color(0xff5a1a), gravity: 20 });
      }
    }
    document.body.classList.toggle('critical', hpRatio < 0.25);
    if (hpRatio < 0.6) showTip('shield');
    if (hpRatio < 0.4) showTip('smoke');

    // Shield.
    const wantShield = input.shield && player.battery > SHIELD.minBattery;
    if (wantShield !== player.shielding) { player.shielding = wantShield; sounds.shield(wantShield); if (!wantShield && input.shield) toast('BATTERY TOO LOW FOR THE SHIELD', 1.2); }
    if (player.shielding) player.battery = Math.max(0, player.battery - SHIELD.drain * dt);
    player.shieldFlash = Math.max(0, player.shieldFlash - dt * 4);
    player.invuln = Math.max(0, player.invuln - dt);
    shield.visible = player.shielding || player.invuln > 0;
    shield.material.opacity = player.shielding ? 0.16 + player.shieldFlash * 0.5 + Math.sin(elapsed * 9) * 0.03 : player.invuln > 0 ? 0.1 + Math.sin(elapsed * 14) * 0.04 : 0;
    shield.material.color.setHex(player.shieldFlash > 0.4 ? 0xffffff : 0x60d0ff);

    // Smoke canister.
    if (input.smokePressed) {
      input.smokePressed = false;
      if (player.smokeTimer > 0) toast('SMOKE ALREADY OUT', 1);
      else if (player.smokeCharges <= 0) { toast('NO SMOKE LEFT', 1.2); sounds.empty(); }
      else {
        player.smokeCharges--;
        player.smokeTimer = SMOKE.seconds;
        sounds.smoke();
        toast('SMOKE — THEY LOST YOU', 2);
        for (let i = 0; i < 70; i++) puffSmoke(1.0);
        for (const m of projectiles.incoming(player)) m.target = null;
        lockTarget = null;
      }
    }
    if (player.smokeTimer > 0) {
      player.smokeTimer -= dt;
      smokeAcc += dt;
      while (smokeAcc > 0.08) { smokeAcc -= 0.08; puffSmoke(0.6); }
    }
    if (player.smokeCharges < SMOKE.max) {
      player.smokeRecharge += dt;
      if (player.smokeRecharge >= SMOKE.recharge) { player.smokeRecharge = 0; player.smokeCharges++; toast('SMOKE CANISTER RELOADED', 1.4); }
    }
    $('smokeVeil').style.opacity = player.smokeTimer > 0 ? '1' : '0';

    player.lastHit += dt;
    if (!player.firingLaser && !player.shielding) player.battery = Math.min(player.maxBattery, player.battery + (TANK.batteryRegen + mods.battery * 0.04) * dt);
    sounds.setEngine(speedRatio, dir !== 0 ? 1 : 0, true);
  }
  function puffSmoke(strength) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * SMOKE.radius * 0.6;
    fx.pools.smoke.emit({
      x: player.pos.x + Math.cos(a) * r, y: player.pos.y + 1 + Math.random() * 2, z: player.pos.z + Math.sin(a) * r,
      vx: Math.cos(a) * 2 + (Math.random() - 0.5), vy: 0.6 + Math.random() * 0.8, vz: Math.sin(a) * 2 + (Math.random() - 0.5),
      life: 3 + Math.random() * 3, size: 2.5 * strength, sizeEnd: 9 * strength, color: SMOKE_COLOR, colorEnd: SMOKE_COLOR, alpha: 0.75, drag: 1.2, fadeIn: 0.15
    });
  }

  // --------------------------------------------------------------- aiming
  // Incoming missiles become lock targets while the machine gun is selected
  // (the only weapon that can shoot them down). Wrappers are cached per shot
  // so the lock does not reset every frame.
  const missileWrappers = new WeakMap();
  function missileTargets() {
    const out = [];
    for (const m of projectiles.incoming(player)) {
      let wr = missileWrappers.get(m);
      if (!wr) { wr = { kind: 'missile', name: 'MISSILE', shot: m, pos: m.pos, vel: m.vel, radius: 1, hp: 1, maxHp: 1, get alive() { return !m.dead; } }; missileWrappers.set(m, wr); }
      out.push(wr);
    }
    return out;
  }
  function pickLock(dt, targetsList, missiles) {
    losAcc += dt;
    const refreshLos = losAcc > 0.2;
    if (refreshLos) losAcc = 0;
    const w = WEAPONS[player.weapon];
    const range = Math.max(w.lockRange || 0, w.range || 0, 250) * weather.lock;
    const cands = [];
    const pool = player.weapon === 'mg' && missiles.length ? [...missiles, ...targetsList] : targetsList;
    for (const t of pool) {
      if (t.kind === 'barrel') continue;
      const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const bearing = Math.atan2(dx, dz);
      const rel = Math.abs(wrapAngle(bearing - player.heading - player.manual));
      if (rel > (t.kind === 'missile' ? 1.6 : 1.0)) continue;
      cands.push({ t, score: rel * 60 + d * 0.5 + (t === lockTarget ? -30 : 0) + (t.kind === 'missile' ? -400 : 0), d });
    }
    cands.sort((a, b) => a.score - b.score);
    let pick = null;
    for (const c of cands.slice(0, 3)) {
      if (c.t.kind === 'missile') { pick = c.t; break; }
      if (refreshLos || c.t.playerLos == null) {
        _o.copy(player.pos).setY(player.pos.y + 2.3);
        _w.copy(c.t.pos);
        c.t.playerLos = fort.lineClear(_o, _w, 4);
      }
      if (c.t.playerLos) { pick = c.t; break; }
    }
    if (lockTarget && lockTarget.alive === false) pick = pick && pick.alive !== false ? pick : null;
    if (pick !== lockTarget) {
      lockTarget = pick; lockProgress = 0; lockedSoundPlayed = false;
      if (pick && pick.kind !== 'missile') {
        showTip('lock');
        if (pick.type === 'scout' || pick.kind === 'trooper') showTip('mg');
        if (pick.kind === 'trooper') showTip('trooper');
        if (pick.kind === 'heli') showTip('heli');
        if (pick.type === 'boss') showTip('boss');
      }
    }
    if (lockTarget) {
      lockProgress = Math.min(1, lockProgress + dt / WEAPONS.missile.lockSeconds);
      lockTickAcc += dt;
      if (lockProgress < 1 && lockTickAcc > 0.12) { lockTickAcc = 0; sounds.lockTick(); }
      if (lockProgress >= 1 && !lockedSoundPlayed) { lockedSoundPlayed = true; sounds.locked(); }
    }
  }

  function muzzleWorld(local, out) {
    tank.gun.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(tank.gun.matrixWorld);
  }
  function gunDirection(out) {
    tank.gun.getWorldQuaternion(_q);
    return out.set(0, 0, 1).applyQuaternion(_q).normalize();
  }

  function updateTurret(dt) {
    if (!player.alive) { haveReticle = false; return; }
    if (input.turretLeft) player.manual += TANK.manualTurret * dt;
    if (input.turretRight) player.manual -= TANK.manualTurret * dt;
    player.manual = THREE.MathUtils.clamp(player.manual, -2.6, 2.6);
    const w = WEAPONS[player.weapon];
    const ballistic = w.gravity > 0 && player.weapon !== 'rocket';
    let yawT = player.manual;
    let pitchT = 0.02;
    if (lockTarget) {
      muzzleWorld(tank.parts.muzzle, _o);
      _w.copy(lockTarget.pos);
      _w.y += 0.5;
      const dx = _w.x - _o.x, dz = _w.z - _o.z;
      const dist = Math.hypot(dx, dz);
      yawT = wrapAngle(Math.atan2(dx, dz) - player.heading);
      const dy = _w.y - _o.y;
      pitchT = ballistic ? ballisticPitch(dist, dy, w.speed, w.gravity) : Math.atan2(dy, dist);
      pitchT = THREE.MathUtils.clamp(pitchT - player.pitch, -0.12, 0.6);
    }
    player.turretYaw += THREE.MathUtils.clamp(wrapAngle(yawT - player.turretYaw), -player.turretTurn * dt, player.turretTurn * dt);
    player.gunPitch += THREE.MathUtils.clamp(pitchT - player.gunPitch, -1.6 * mods.turretMul * dt, 1.6 * mods.turretMul * dt);
    aimGroups(tank.turret, tank.gun, player.turretYaw, player.gunPitch);
    player.recoil = Math.max(0, player.recoil - dt * 2.5);
    tank.gun.position.z = 1.0 - player.recoil * 0.5;
    // Reticle.
    muzzleWorld(tank.parts.muzzle, _o);
    gunDirection(_v);
    if (lockTarget && lockProgress >= 1 && (player.weapon === 'missile' || player.weapon === 'mg' || player.weapon === 'laser')) {
      reticle.copy(lockTarget.pos);
      haveReticle = true;
    } else if (player.weapon === 'mortar') {
      haveReticle = !!mortarSolution(_o, reticle);
    } else {
      const gravity = w.gravity || 0;
      const speed = w.speed || 200;
      projectiles.predict(_o, _v, speed, gravity, player.weapon === 'laser' ? (w.range / speed) : 6, reticle);
      haveReticle = true;
    }
    // Weapon visuals.
    if (tank.parts.pod) tank.parts.pod.visible = player.weapons.has('missile');
    if (tank.parts.lens) {
      tank.parts.lens.visible = player.weapons.has('laser');
      tank.parts.lens.material.emissiveIntensity = player.firingLaser ? 5 : 1.5;
    }
  }

  // Mortar: fixed elevation, speed chosen to land on the target (or 80 m ahead).
  function mortarSolution(origin, outPoint) {
    const w = WEAPONS.mortar;
    let tx, tz;
    if (lockTarget) { tx = lockTarget.pos.x; tz = lockTarget.pos.z; }
    else {
      const a = player.heading + player.turretYaw;
      tx = player.pos.x + Math.sin(a) * w.range;
      tz = player.pos.z + Math.cos(a) * w.range;
    }
    const ty = terrain.heightAt(tx, tz);
    const dx = tx - origin.x, dz = tz - origin.z;
    const dist = Math.max(8, Math.hypot(dx, dz));
    const dy = ty - origin.y;
    const th = w.elevation;
    const denom = 2 * Math.cos(th) ** 2 * (dist * Math.tan(th) - dy);
    if (denom <= 0) return null;
    const v = Math.sqrt((w.gravity * dist * dist) / denom);
    if (!isFinite(v)) return null;
    outPoint.set(tx, ty, tz);
    const yaw = Math.atan2(dx, dz);
    return { speed: THREE.MathUtils.clamp(v, 15, 110), dir: new THREE.Vector3(Math.sin(yaw) * Math.cos(th), Math.sin(th), Math.cos(yaw) * Math.cos(th)) };
  }

  // -------------------------------------------------------------- weapons
  function updateWeapons(dt, targetsList) {
    for (const k in player.timers) player.timers[k] = Math.max(0, player.timers[k] - dt);
    if (!player.alive) { input.firePressed = false; player.firingLaser = false; sounds.setLaser(false); return; }
    const name = player.weapon;
    const w = WEAPONS[name];
    const held = input.fire;
    const pressed = input.firePressed;
    input.firePressed = false;
    let wantLaser = false;
    const ready = (player.timers[name] || 0) <= 0;
    const hasAmmo = player.ammo[name] > 0;
    function spend() { if (player.ammo[name] !== Infinity) player.ammo[name]--; player.timers[name] = 1 / (w.rate || 1); player.shots++; }
    gunDirection(_v);
    if (name === 'cannon' && held && ready) {
      spend();
      muzzleWorld(tank.parts.muzzle, _o);
      projectiles.fire({ type: 'shell', origin: _o, dir: _v, owner: 'player', speed: w.speed, gravity: w.gravity, damage: w.damage, splash: w.splash, life: 7, ownerVel: player.vel, wallBonus: w.wallBonus });
      fx.exhaustFire(_o, 3);
      fx.flash(_o, { intensity: 500, life: 0.15, distance: 50 });
      fx.dust(_w.copy(_o).setY(terrain.heightAt(_o.x, _o.z)), 3);
      fx.addShake(0.35);
      player.recoil = 1;
      player.hullKick = 1;
      player.speed -= Math.cos(player.turretYaw) * 1.2;
      life.startle(player.pos, 60);
      sounds.cannon();
    } else if (name === 'mg') {
      if (held && ready) {
        if (!hasAmmo) { if (pressed) { toast('MACHINE GUN EMPTY', 1); sounds.empty(); } }
        else {
          spend();
          muzzleWorld(tank.parts.mgMuzzle, _o);
          projectiles.fire({ type: 'bullet', origin: _o, dir: _v, owner: 'player', speed: w.speed, damage: w.damage, spread: w.spread, life: w.range / w.speed });
          fx.exhaustFire(_o, 1.0);
          sounds.mg();
        }
      }
    } else if (name === 'missile' && pressed) {
      if (!hasAmmo) { toast('NO MISSILES — FIND AMMO', 1.2); sounds.empty(); }
      else if (ready) {
        spend();
        tank.turret.updateWorldMatrix(true, false);
        _o.copy(tank.parts.podMuzzle).applyMatrix4(tank.turret.matrixWorld);
        _w.copy(_v); _w.y += 0.25; _w.normalize();
        projectiles.fire({ type: 'missile', origin: _o, dir: _w, owner: 'player', speed: w.speed, damage: w.damage, splash: w.splash, life: w.life, target: lockProgress >= 1 ? lockTarget : null, turn: w.turn, wallBonus: w.wallBonus });
        fx.exhaustFire(_o, 1.5);
        sounds.missile(false);
      }
    } else if (name === 'laser') {
      if (held && player.battery > 0.5) {
        wantLaser = true;
        player.battery = Math.max(0, player.battery - w.battery * dt);
        muzzleWorld(tank.parts.laserMuzzle, _o);
        projectiles.laser({ origin: _o, dir: _v, range: w.range, owner: 'player', dps: w.damage, dt, victims: targetsList, player, color: w.light, wallBonus: w.wallBonus });
        if (Math.random() < dt * 3) hitMarker = Math.max(hitMarker, 0.05);
      } else if (held && pressed) { toast('BATTERY EMPTY', 1); sounds.empty(); }
    } else if (name === 'rocket') {
      if (held && ready) {
        if (!hasAmmo) { if (pressed) { toast('NO ROCKETS — FIND AMMO', 1.2); sounds.empty(); } }
        else {
          spend();
          muzzleWorld(tank.parts.muzzle, _o);
          _o.x += (player.ammo[name] % 2 ? 0.4 : -0.4) * Math.cos(player.heading + player.turretYaw);
          _o.z -= (player.ammo[name] % 2 ? 0.4 : -0.4) * Math.sin(player.heading + player.turretYaw);
          projectiles.fire({ type: 'rocket', origin: _o, dir: _v, owner: 'player', speed: w.speed, gravity: w.gravity, damage: w.damage, splash: w.splash, life: 5, spread: w.spread, wallBonus: w.wallBonus });
          fx.exhaustFire(_o, 1.6);
          fx.addShake(0.08);
          sounds.rocket();
        }
      }
    } else if (name === 'mortar' && pressed) {
      if (!hasAmmo) { toast('NO MORTAR ROUNDS', 1.2); sounds.empty(); }
      else if (ready) {
        muzzleWorld(tank.parts.mortarMuzzle, _o);
        const sol = mortarSolution(_o, _w);
        if (!sol) { toast('OUT OF RANGE', 1); sounds.empty(); }
        else {
          spend();
          projectiles.fire({ type: 'mortar', origin: _o, dir: sol.dir, owner: 'player', speed: sol.speed, gravity: w.gravity, damage: w.damage, splash: w.splash, life: 12, wallBonus: w.wallBonus });
          fx.exhaustFire(_o, 2);
          fx.addShake(0.2);
          player.hullKick = 0.5;
          sounds.mortar();
        }
      }
    } else if (name === 'nuke' && pressed) {
      if (!hasAmmo) { toast('NO NUKE', 1.2); sounds.empty(); }
      else if (ready) {
        spend();
        player.nukesFired++;
        muzzleWorld(tank.parts.muzzle, _o);
        projectiles.fire({ type: 'nuke', origin: _o, dir: _v, owner: 'player', speed: w.speed, gravity: w.gravity, damage: w.damage, splash: w.splash, life: 9, wallBonus: w.wallBonus });
        fx.exhaustFire(_o, 4);
        fx.addShake(0.6);
        player.recoil = 1;
        player.hullKick = 1;
        player.speed -= 2;
        sounds.cannon();
        toast(objective.type === 'noNuke' ? 'NUKE AWAY — OBJECTIVE FORFEIT' : 'NUKE AWAY — GET CLEAR!', 2);
      }
    }
    if (wantLaser !== player.firingLaser) { player.firingLaser = wantLaser; sounds.setLaser(wantLaser); }
  }

  // --------------------------------------------------------------- events
  function handleEvents() {
    while (events.length) {
      const ev = events.shift();
      if (ev.type === 'tank' || ev.type === 'turret') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.5, color: '#ffd24a' });
        toast(ev.type === 'tank' ? `${ev.target.name.toUpperCase()} DESTROYED` : `${ev.target.name.toUpperCase()} DOWN`, 1.6);
        if (ev.type === 'tank' && Math.random() < 0.6) pickups.drop(ev.target.pos, ['ammo', 'battery', 'repair'][Math.floor(Math.random() * 3)]);
        if (ev.type === 'tank' && ev.target.type === 'heavy' && ev.target.spec?.home === 'generator') pickups.drop(ev.target.pos, 'repair');
        life.startle(ev.target.pos, 90);
        if (enemies.aliveCount() === 0) { toast('ALL ENEMIES DOWN — TAKE THE FLAG', 3); sounds.stinger(); }
      } else if (ev.type === 'wall') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.2, color: '#d8d8d8' });
        fx.shakeAt(ev.target.pos, 0.5, 90);
      } else if (ev.type === 'breach') {
        if (!alarmRaised) {
          alarmRaised = true;
          sounds.siren(5);
          fort.setAlarm(14);
          const spawned = enemies.spawnReinforcements(level.fort.reinforcements || []);
          enemies.alarm();
          toast(spawned.length ? `FORT ALARM — ${spawned.length} TANKS ROLLING OUT OF THE KEEP` : 'FORT ALARM', 3.5);
          life.startle(fort.flagPos, 160);
          setTimeout(() => { if (!won && !lost) breachCheckpoint(); }, 3200);
          showTip('flag');
          if (enemies.boss?.alive) setTimeout(() => { if (!won && !lost) { toast('THE MAMMOTH IS AWAKE', 3); sounds.bossRoar(); fx.shakeAt(enemies.boss.pos, 1, 300); showTip('boss'); } }, 6500);
        }
      } else if (ev.type === 'trooper') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone().setY(ev.target.pos.y + 2), text: `+${ev.score}`, age: 0, life: 1.2, color: '#ffd24a' });
      } else if (ev.type === 'heli') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.8, color: '#ffd24a' });
        toast('HELICOPTER DOWN', 2);
        life.startle(ev.target.pos, 120);
      } else if (ev.type === 'heliLaunch') {
        toast('HELICOPTER LIFTING OFF FROM THE FORT', 2.5);
        sounds.beep();
      } else if (ev.type === 'commandAlert') {
        toast('COMMAND TRUCK ON THE RADIO — REINFORCEMENTS INBOUND', 3);
        sounds.radio();
        showTip('command');
      } else if (ev.type === 'call') {
        toast(`REINFORCEMENTS CALLED: ${ev.spawned.map((t) => t.name.toUpperCase()).join(', ')}${ev.left > 0 ? '' : ' — LAST CALL'}`, 2.5);
        sounds.radio();
      } else if (ev.type === 'command') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.8, color: '#40ff60' });
        toast('COMMAND TRUCK DESTROYED — NO MORE REINFORCEMENTS', 3);
        sounds.stinger();
      } else if (ev.type === 'armour') {
        popups.push({ pos: ev.at, text: 'ARMOUR', age: 0, life: 0.9, color: '#c0c0c0' });
        sounds.armour();
      } else if (ev.type === 'boss') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone().setY(ev.target.pos.y + 6), text: `MAMMOTH +${ev.score}`, age: 0, life: 2.5, color: '#ff6040' });
        toast('MAMMOTH DESTROYED', 3.5);
        sounds.stinger();
        life.startle(ev.target.pos, 200);
      } else if (ev.type === 'generator') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 2, color: '#80e0ff' });
        toast('GENERATOR DESTROYED — THE KEEP SHIELD IS FAILING', 3);
        nukeFlash();
        life.startle(ev.target.pos, 150);
      } else if (ev.type === 'domeDown') {
        toast('KEEP SHIELD DOWN — TAKE THE FLAG', 3.5);
        sounds.stinger();
      } else if (ev.type === 'barrel') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.2, color: '#ffa040' });
      } else if (ev.type === 'blast') {
        projectiles.splashAll(ev.pos, ev.radius, ev.damage, [...enemies.targets(), ...targets.targets(), player]);
        fort.splash(ev.pos, ev.radius, ev.damage);
      } else if (ev.type === 'radar') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.6, color: '#ff9ad8' });
        if (ev.allDown) { toast('RADAR DOWN — TURRET RANGE HALVED, MISSILES BLIND', 3.5); sounds.jam(); }
        else toast('RADAR DISH DESTROYED', 1.8);
        life.startle(ev.target.pos, 90);
      } else if (ev.type === 'depot') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.6, color: '#ffa040' });
        toast(ev.allDown ? 'EVERY DEPOT BURNING' : 'FUEL DEPOT DESTROYED — SUPPLIES DROPPED', 2.2);
        projectiles.splashAll(ev.blast.pos, ev.blast.radius, ev.blast.damage, [...enemies.targets(), player]);
        nukeFlash();
        life.startle(ev.target.pos, 120);
      } else if (ev.type === 'truck') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `+${ev.score}`, age: 0, life: 1.4, color: '#d8c080' });
        if (ev.left > 0) toast(`SUPPLY TRUCK DOWN — ${ev.left} LEFT`, 1.6);
      } else if (ev.type === 'convoyDone') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone(), text: `CONVOY +${ev.score}`, age: 0, life: 1.8, color: '#ff60d0' });
        toast(`CONVOY DESTROYED — ${WEAPONS[ev.weapon]?.name || 'WEAPON'} CRATE DROPPED`, 3);
        sounds.stinger();
      } else if (ev.type === 'camp') {
        addScore(ev.score);
        popups.push({ pos: ev.target.pos.clone().setY(ev.target.pos.y + 6), text: `FREED +${ev.score}`, age: 0, life: 2, color: '#9bff8a' });
        toast('CONVOY FREED', 2.5);
        sounds.stinger();
      } else if (ev.type === 'bridgeWarning') {
        toast('BRIDGE WIRED — CHARGES ARMED!', 2.2);
        sounds.beep();
      } else if (ev.type === 'bridge') {
        toast(ev.blown ? 'BRIDGE BLOWN — FIND THE FORD' : 'BRIDGE DOWN — FIND THE FORD', 3.5);
        fordMarkerTimer = 90;
        life.startle(ev.target.pos, 150);
      }
    }
  }

  function applyPickup(item) {
    const t = item.type;
    if (t === 'repair') {
      player.hp = Math.min(player.maxHp, player.hp + PICKUPS.repair.amount);
      toast('REPAIRED +40', 1.4);
    } else if (t === 'battery') {
      player.battery = Math.min(player.maxBattery, player.battery + PICKUPS.battery.amount);
      toast('BATTERY +50', 1.4);
    } else if (t === 'ammo') {
      const got = [];
      for (const name of ['mg', 'missile', 'rocket', 'mortar']) {
        if (!player.weapons.has(name)) continue;
        const w = WEAPONS[name];
        player.ammo[name] = Math.min(ammoMax(name), player.ammo[name] + Math.round(w.pickup * player.ammoMul));
        got.push(w.name);
      }
      toast(`AMMO: ${got.join(', ')}`, 1.6);
    } else if (t === 'weapon') {
      const name = item.weapon;
      const w = WEAPONS[name];
      if (!w) return;
      if (!player.weapons.has(name)) {
        player.weapons.add(name);
        player.ammo[name] = w.ammo == null ? Infinity : Math.round(w.ammo * player.ammoMul);
        toast(`NEW WEAPON: ${w.name} (KEY ${w.key})`, 3);
        selectWeapon(name);
        showTip('weapon');
      } else {
        if (w.ammo != null) player.ammo[name] = Math.min(ammoMax(name), player.ammo[name] + Math.round(w.pickup * player.ammoMul));
        toast(`${w.name} AMMO`, 1.5);
      }
    }
    addScore(SCORE.pickup);
    player.pickups++;
  }

  // ----------------------------------------------------------- objectives
  function objectiveProgress() {
    const st = targets.status();
    switch (objective.type) {
      case 'turrets': { const total = enemies.turrets.length; return { done: total - enemies.aliveTurrets(), total, complete: enemies.aliveTurrets() === 0 && total > 0 }; }
      case 'depots': return { done: st.depots - st.depotsLeft, total: st.depots, complete: st.depots > 0 && st.depotsLeft === 0 };
      case 'radar': return { done: st.radars - st.radarsLeft, total: st.radars, complete: st.radars > 0 && st.radarsLeft === 0 };
      case 'convoy': return { done: st.campsFreed, total: st.camps, complete: st.camps > 0 && st.campsFreed === st.camps };
      case 'noNuke': return { done: player.nukesFired === 0 ? 1 : 0, total: 1, complete: player.nukesFired === 0, pending: true };
      default: return { done: 0, total: 0, complete: false };
    }
  }
  function checkObjective() {
    if (objectiveDone || won) return;
    const p = objectiveProgress();
    if (p.complete && !p.pending) {
      objectiveDone = true;
      addScore(SCORE.objective);
      toast(`OBJECTIVE COMPLETE +${SCORE.objective}`, 3);
      sounds.objective();
    }
  }
  // Where to point the player for the objective: the nearest thing still to do.
  function objectiveMarker() {
    let list = [];
    if (objective.type === 'radar') list = targets.radars.filter((r) => r.alive);
    else if (objective.type === 'depots') list = targets.depots.filter((d) => d.alive);
    else if (objective.type === 'convoy') list = targets.camps.filter((c) => !c.freed);
    else return null;
    let best = null, bd = 1e9;
    for (const t of list) { const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z); if (d < bd) { bd = d; best = t; } }
    if (!best) return null;
    return { pos: best.pos, label: objective.type === 'radar' ? 'RADAR' : objective.type === 'depots' ? 'DEPOT' : 'CONVOY', color: '#ff9ad8', lift: objective.type === 'convoy' ? 10 : 6 };
  }

  function checkFlag() {
    if (won || !player.alive) return;
    if (Math.hypot(fort.flagPos.x - player.pos.x, fort.flagPos.z - player.pos.z) < 5) {
      won = true;
      addScore(SCORE.flag);
      if (objective.type === 'noNuke' && player.nukesFired === 0) { objectiveDone = true; addScore(SCORE.objective); }
      if (level.parSeconds && elapsed <= level.parSeconds) { addScore(300); toast('FLAG CAPTURED — UNDER PAR +300', 4); }
      else toast('FLAG CAPTURED!', 4);
      sounds.fanfare();
      sounds.setLaser(false);
      fx.ring(_v.copy(fort.flagPos).setY(fort.flagPos.y + 0.5), 30, { life: 1.5, color: 0xffe060, flat: true });
      for (let i = 0; i < 60; i++) fx.pools.sparks.emit({ x: fort.flagPos.x, y: fort.flagPos.y + 8, z: fort.flagPos.z, vx: (Math.random() - 0.5) * 14, vy: 4 + Math.random() * 12, vz: (Math.random() - 0.5) * 14, life: 2, size: 0.8, sizeEnd: 0.1, color: new THREE.Color(0xffe060), colorEnd: new THREE.Color(0xff6040), gravity: 9 });
      fort.flag.cloth.visible = false;
      setTimeout(showWin, 2600);
    }
  }

  function showWin() {
    const dateKey = level.daily ? (level.id.replace('daily-', '') || todayKey()) : null;
    if (level.daily && dateKey) { progress.daily[dateKey] = progress.daily[dateKey] || {}; progress.daily[dateKey].name = level.name; }
    const result = recordClear(progress, level.id, { time: elapsed, deaths: player.deaths, parSeconds: level.parSeconds, score: player.score, objectiveDone, daily: !!level.daily, dateKey, loadout: snapshotLoadout(player) });
    const idx = list.findIndex((l) => l.id === level.id);
    const next = level.daily ? null : list[idx + 1];
    const starLine = `${objectiveDone ? '★' : '☆'} objective · ${player.deaths === 0 ? '★' : '☆'} never destroyed · ★ flag`;
    $('winStats').textContent = `Score ${player.score} (bank ${progress.bank})\nTime ${formatTime(elapsed)} (par ${formatTime(level.parSeconds)})${result.underPar ? ' — under par' : ''}\nDestroyed ${player.deaths} time${player.deaths === 1 ? '' : 's'} · missiles shot down ${player.missilesShot}\n${starLine}\n${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}${level.daily ? '' : '\nLoadout saved for the next level'}`;
    const board = $('dailyBoard');
    if (level.daily) {
      const keys = Object.keys(progress.daily).sort().slice(-7).reverse();
      board.innerHTML = `Daily forts, last ${keys.length} day${keys.length === 1 ? '' : 's'}:<table>${keys.map((k) => { const d = progress.daily[k]; return `<tr class="${k === dateKey ? 'today' : ''}"><td>${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}</td><td>${d.bestScore || 0}</td><td>${d.bestTime != null ? formatTime(d.bestTime) : '—'}</td><td>${'★'.repeat(d.stars || 0)}</td></tr>`; }).join('')}</table>`;
      board.hidden = false;
    } else board.hidden = true;
    $('nextBtn').hidden = !next;
    $('nextBtn').onclick = () => { location.href = `/games-3d/tank-terrain?level=${encodeURIComponent(next.id)}`; };
    $('retryBtn').onclick = () => location.reload();
    $('winGarage').onclick = () => openGarage(true);
    if (!tipSeen(progress, 'garage') && progress.bank >= 250) { $('winStats').textContent += '\nTip: spend your bank in the garage on armour, engine and more'; markTip(progress, 'garage'); }
    $('win').hidden = false;
    updateBank();
  }
  function showLose() {
    lost = true;
    $('loseStats').textContent = `Score ${player.score}\nTime ${formatTime(elapsed)}`;
    $('loseRetry').onclick = () => location.reload();
    $('loseGarage').onclick = () => openGarage(true);
    $('lose').hidden = false;
  }

  // --------------------------------------------------------------- garage
  function updateBank() { $('bankValue').textContent = String(progress.bank); }
  function renderGarage() {
    $('garageBank').textContent = String(progress.bank);
    const list = $('upgradeList');
    list.innerHTML = '';
    for (const key of Object.keys(UPGRADES)) {
      const def = UPGRADES[key];
      const lvl = progress.upgrades[key] || 0;
      const cost = upgradeCost(progress, key);
      const row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML = `<div><div class="name">${def.name}</div><div class="desc">${def.desc}</div></div><div class="pips">${Array.from({ length: def.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      if (cost == null) { btn.textContent = 'MAXED'; btn.className = 'maxed'; btn.disabled = true; }
      else { btn.textContent = `BUY ${cost}`; btn.disabled = progress.bank < cost; }
      btn.addEventListener('click', () => {
        if (buyUpgrade(progress, key)) { sounds.buy(); applyUpgrades(); renderGarage(); updateBank(); }
        else sounds.empty();
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
  }
  function applyUpgrades() {
    const m = upgradeMods(progress);
    const hpGain = TANK.hp + m.hp - player.maxHp;
    player.maxHp = TANK.hp + m.hp;
    if (hpGain > 0) player.hp = Math.min(player.maxHp, player.hp + hpGain);
    player.maxBattery = TANK.battery + m.battery;
    player.maxSpeed = TANK.maxSpeed * m.speedMul;
    player.acceleration = TANK.acceleration * m.speedMul;
    player.turretTurn = TANK.turretTurn * m.turretMul;
    player.ammoMul = m.ammoMul;
    Object.assign(mods, m);
  }
  let garageFromCard = false;
  function openGarage(fromCard = false) {
    garageFromCard = fromCard;
    paused = true;
    keys.clear();
    renderGarage();
    $('garage').hidden = false;
  }
  function closeGarage() {
    $('garage').hidden = true;
    paused = false;
  }
  $('garageBtn').addEventListener('click', () => { sounds.unlock(); openGarage(); });
  $('garageClose').addEventListener('click', closeGarage);
  $('resetTips').addEventListener('click', () => { resetTips(progress); toast('TUTORIAL TIPS WILL SHOW AGAIN', 1.6); sounds.buy(); });
  updateBank();

  // --------------------------------------------------------------- camera
  function updateCamera(dt) {
    if (window.__tankterrain && window.__tankterrain.freeCam) return;
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    forwardOf(player.heading, _v);
    _w.copy(player.pos).addScaledVector(_v, -CAMERA.back - Math.abs(player.speed) * 0.25).addScaledVector(WORLD_UP, CAMERA.up);
    camPos.lerp(_w, player.alive ? k : k * 0.3);
    const g = terrain.heightAt(camPos.x, camPos.z) + CAMERA.minClearance;
    if (camPos.y < g) camPos.y = g;
    _w.copy(player.pos).addScaledVector(_v, CAMERA.lookAhead).addScaledVector(WORLD_UP, CAMERA.lookUp);
    camLook.lerp(_w, k);
    camera.position.copy(camPos);
    const shake = fx.shake;
    if (shake > 0) camera.position.add(_o.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake).multiplyScalar(0.9));
    camera.up.copy(WORLD_UP);
    camera.lookAt(camLook);
  }

  // ------------------------------------------------------------------ DOM
  const speedEl = $('speedValue'), scoreEl = $('scoreValue'), timeEl = $('timeValue'), enemyEl = $('enemyValue'), flagEl = $('flagValue'), livesEl = $('livesValue');
  const objectiveEl = $('objectiveValue'), smokeEl = $('smokeValue'), shieldEl = $('shieldValue'), lightsEl = $('lightsValue'), weatherEl = $('weatherValue');
  const armorFill = $('armorFill'), batteryFill = $('batteryFill');
  const bossBar = $('bossBar'), bossFill = $('bossFill');
  weatherEl.textContent = weather.def.name + (targets.jammed() ? ' · jammed' : '');
  function updateDom() {
    speedEl.textContent = String(Math.round(Math.abs(player.speed) * 3.6));
    scoreEl.textContent = String(player.score);
    timeEl.textContent = formatTime(elapsed);
    enemyEl.textContent = String(enemies.aliveCount());
    flagEl.textContent = `${Math.round(Math.hypot(fort.flagPos.x - player.pos.x, fort.flagPos.z - player.pos.z))} m`;
    livesEl.textContent = '♥'.repeat(Math.max(0, player.lives));
    const p = objectiveProgress();
    objectiveEl.textContent = objective.type === 'noNuke' ? `${objective.text}${player.nukesFired ? ' ✗' : ''}` : `${objective.text} ${p.done}/${p.total}`;
    objectiveEl.classList.toggle('done', objectiveDone);
    smokeEl.textContent = player.smokeCharges > 0 ? '●'.repeat(player.smokeCharges) : (player.smokeTimer > 0 ? 'out' : `${Math.ceil(SMOKE.recharge - player.smokeRecharge)} s`);
    smokeEl.className = player.smokeTimer > 0 ? 'on' : (player.smokeCharges > 0 ? '' : 'off');
    shieldEl.textContent = player.shielding ? 'UP' : (player.battery > SHIELD.minBattery ? 'ready' : 'no power');
    shieldEl.className = player.shielding ? 'on' : (player.battery > SHIELD.minBattery ? '' : 'off');
    if (lights) { lightsEl.textContent = weather.lightsOn ? 'on' : 'off'; lightsEl.className = weather.lightsOn ? 'on' : 'off'; }
    weatherEl.textContent = weather.def.name + (targets.jammed() ? ' · radar jammed' : '');
    for (const el of weaponEls) {
      const name = el.dataset.w;
      const owned = player.weapons.has(name);
      el.classList.toggle('locked', !owned);
      const ammo = player.ammo[name];
      const small = el.querySelector('small');
      small.textContent = !owned ? '?' : ammo === Infinity ? (name === 'laser' ? `${Math.round(player.battery)}%` : '∞') : String(ammo);
      el.classList.toggle('empty', owned && ammo !== Infinity && ammo === 0);
    }
    armorFill.style.width = `${Math.max(0, player.hp / player.maxHp) * 100}%`;
    armorFill.parentElement.parentElement.classList.toggle('low', player.hp / player.maxHp < 0.35);
    batteryFill.style.width = `${(player.battery / player.maxBattery) * 100}%`;
    const b = enemies.boss;
    const showBoss = !!(b && b.alive && b.awake);
    bossBar.hidden = !showBoss;
    if (showBoss) bossFill.style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    hud.resize();
  });

  forwardOf(player.heading, _v);
  camPos.copy(player.pos).addScaledVector(_v, -CAMERA.back).addScaledVector(WORLD_UP, CAMERA.up);
  camLook.copy(player.pos);
  loadingEl.hidden = true;
  setTimeout(() => $('help').classList.add('fade'), 16000);
  $('levelName').textContent = level.name;
  toast(`${level.name.toUpperCase()} — TAKE THE FLAG`, 3.5);
  showTip('drive'); showTip('fire'); showTip('pickup');
  if (carried.length) setTimeout(() => toast(`LOADOUT CARRIED OVER: ${carried.map((n) => WEAPONS[n].name).join(', ')}`, 3), 3800);
  setTimeout(() => { if (!won && !lost) toast(`OBJECTIVE: ${objective.text.toUpperCase()}`, 3); }, carried.length ? 7200 : 3800);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    frames++;
    if (paused) { composer.render(); return; }
    if (!won && !lost && player.alive) elapsed += dt;
    readKeys();
    updatePlayer(dt);
    const targetsList = [...enemies.targets(), ...targets.targets(), ...boss.targets()];
    const missiles = missileTargets();
    pickLock(dt, targetsList, missiles);
    updateTurret(dt);
    updateWeapons(dt, targetsList);
    enemies.update(dt, player, elapsed, { sight: weather.sight(weather.lightsOn), smoked: player.smokeTimer > 0, jammed: targets.jammed(), alarm: alarmRaised });
    boss.update(dt, elapsed, player);
    targets.update(dt, player, enemies);
    bridges.update(dt, player);
    projectiles.update(dt, { player, enemyTargets: targetsList });
    fort.update(dt, elapsed);
    for (const item of pickups.update(dt, elapsed, player.pos, player.alive)) applyPickup(item);
    handleEvents();
    checkObjective();
    updateCheckpoints(dt);
    updateTips(dt);
    checkFlag();
    sounds.setRotor(Math.max(0, 1 - enemies.nearestHeli(player.pos) / 350));
    life.update(dt, player.pos);
    trackMarks.update(dt);
    weather.update(dt, camera);
    fx.setListener(player.pos);
    fx.update(dt, camera);
    terrain.update(dt);
    updateCamera(dt);
    sky.update(player.pos, dt);
    if (!player.alive) sounds.setEngine(0, 0, false);
    composer.render();
    hitMarker = Math.max(0, hitMarker - dt);
    reveal = Math.max(0, reveal - dt);
    fordMarkerTimer = Math.max(0, fordMarkerTimer - dt);
    for (let i = popups.length - 1; i >= 0; i--) { popups[i].age += dt; popups[i].pos.y += dt * 3; if (popups[i].age >= popups[i].life) popups.splice(i, 1); }
    const incoming = projectiles.incoming(player);
    markers.length = 0;
    const om = objectiveMarker();
    if (om && !won) markers.push(om);
    const fortDist = Math.hypot(level.fort.x - player.pos.x, level.fort.z - player.pos.z);
    if (incoming.length) showTip('missile');
    if (fortDist < Math.hypot(level.fort.hw, level.fort.hd) + 70) showTip('wall');
    if (boss.active && boss.domeUp && boss.generator?.alive && (fortDist < BOSS.bossRevealRange || alarmRaised)) {
      markers.push({ pos: boss.generator.pos, label: 'GENERATOR', color: '#80e0ff', lift: 8 });
      showTip('dome');
    }
    for (const c of enemies.commands) if (c.alive && c.alerted && c.called < c.max) markers.push({ pos: c.pos, label: 'COMMAND', color: '#40ff60', lift: 7 });
    if (fordMarkerTimer > 0 && level.fords?.length) {
      const f = level.fords[0];
      markers.push({ pos: _w.set((f[0][0] + f[1][0]) / 2, terrain.heightAt((f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2), (f[0][1] + f[1][1]) / 2), label: 'FORD', color: '#78c8ff', lift: 4 });
    }
    hud.draw({ camera, player, targets: missiles.length ? [...targetsList, ...missiles] : targetsList, lock: lockTarget, lockProgress, reticle: haveReticle ? reticle : null, flagPos: won ? null : fort.flagPos, popups, hitMarker, weapon: player.weapon, incoming, markers });
    domAcc += dt;
    if (domAcc > 0.1) {
      domAcc = 0;
      updateDom();
      hud.drawMinimap({ level, fort, enemies, pickups: pickups.items, player, flagPos: fort.flagPos, lock: lockTarget, reveal, bridges, targets, boss, checkpoint });
    }
  }
  frame();

  window.__tankterrain = {
    player, tank, enemies, fort, projectiles, pickups, fx, level, camera, scene, input, terrain, sky, sounds, targets, bridges, weather, life, progress, trackMarks, boss, checkpoint,
    get elapsed() { return elapsed; }, get frames() { return frames; }, get lock() { return lockTarget; }, get reveal() { return reveal; },
    get objectiveDone() { return objectiveDone; }, get alarmRaised() { return alarmRaised; }, get paused() { return paused; },
    objectiveProgress, selectWeapon, toast, openGarage, closeGarage, toggleLights, showTip, get tip() { return currentTip; }, get tipQueue() { return [...tipQueue]; }, setCheckpoint, die,
    giveAll() { for (const n of WEAPON_ORDER) { player.weapons.add(n); player.ammo[n] = WEAPONS[n].ammo == null ? Infinity : ammoMax(n); } },
    killAll() { for (const t of [...enemies.targets(), ...targets.targets(), ...boss.targets()]) if (t.kind !== 'barrel') t.takeDamage(1e6, t.pos, 'cheat'); },
    teleport(x, z, headingDeg) { player.pos.set(x, terrain.heightAt(x, z), z); if (headingDeg != null) player.heading = THREE.MathUtils.degToRad(headingDeg); player.speed = 0; trackMarks.lift(0); trackMarks.lift(1); },
    win() { player.pos.set(fort.flagPos.x, fort.flagPos.y, fort.flagPos.z); },
    smoke() { input.smokePressed = true; },
    breach() { const w = fort.walls.find((x) => x.perimeter && x.alive && x.hp !== Infinity); if (w) w.takeDamage(1e6, w.pos, 'cheat'); }
  };
}

boot();
