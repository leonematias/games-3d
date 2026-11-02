import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { EMP_AMMO, EMP_RADIUS_CELLS, EMP_STUN_SECONDS, SHIELD_BUBBLE_HITS, SHIELD_BUBBLE_SECONDS, SHIELD_PROJECTOR_AMMO, BOSS_MAX_HP, DRONE_CONTACT_SECONDS, DRONE_MAX_HP, GRENADE_AMMO, GRENADE_DAMAGE, GRENADE_RADIUS_CELLS, GRENADE_REFIRE_SECONDS, HIT_FLASH_SECONDS, JUMP_ENABLED, LASER_HIT_COOLDOWN, MACHINE_GUN_AMMO, MACHINE_GUN_REFIRE_SECONDS, NUKE_AMMO, NUKE_RADIUS_CELLS, PLAYER_LIVES, PLAYER_MAX_HP, RESPAWN_INVULN_SECONDS, RESPAWN_SECONDS, SHAKE_BLAST, SHAKE_GRENADE, SHAKE_HIT, SLOWMO_SCALE, SLOWMO_SECONDS, TURRET_HALF_ANGLE, TURRET_MAX_HP } from './config.js';
import { planarForward } from './facing.js';
import { createMainCharacter, getCannonWorldPosition, setTankWeapon, spinTankWeapon, syncMainCharacterMesh, TANK_BODY_HEIGHT, TANK_COLLISION_RADIUS, updateTankTransform, upgradeTank } from './main_character.js';
import { createCoinsController } from './coins.js';
import { createMachineGunController } from './machine-guns.js';
import { createLaserController } from './lasers.js';
import { createLifeController } from './lives.js';
import { createGrenadeController, createGrenadeFlight } from './grenades.js';
import { grenadeRangeCells } from './grenade-flight.js';
import { createLevelAuraController } from './level-aura.js';
import { cannonDamage, tankLevelForCoins, tankMaxHp } from './tank-level.js';
import { isLavaTexture, isWaterTexture, lookFor } from './themes.js';
import { aoTexture, createAtmosphere, rippleTexture } from './atmosphere.js';
import { buildProps, disposeProps, hashString, mulberry32 } from './props.js';
import { createAmbientParticles } from './ambient-particles.js';
import { createLightPool } from './light-pool.js';
import { createEffects } from './effects.js';
import { levelRecord, markLevelCleared, recordResult } from './progress.js';
import { formatTime, parSeconds, starsFor, starText } from './scoring.js';
import { canSeeCell, createMinimapFog, drawMinimap, floodOpenCells, shouldShowMinimap } from './minimap.js';
import { createDroneController } from './drones.js';
import { createGateController, createKeyController, gateId } from './locks.js';
import { ammoLabel, chooseWeapon, grantPickup, machineGunShotCount, resetWeaponState, spendAmmo } from './weapon-ammo.js';
import { cellDistance, createBlastController, createNukeController } from './nukes.js';
import { createSoundManager } from './sounds.js';
import { createTurretController, makeHealthBar, paintHealth } from './turrets.js';
import { createBossController } from './bosses.js';
import { bossCenter, bossCovers } from './boss-logic.js';
import { woodBoxTextureFor } from './box-textures.js';
import { createProjectileSystem } from '../editor/projectile.js';
import { createPatrolController } from './patrols.js';
import { createMortarController } from './mortars.js';
import { createShieldController } from './shields.js';
import { createCrackedWallController, createFloorPieceController, createSwitchController } from './interactive.js';
import { createEmpMesh, createPickupController, createShieldProjectorMesh } from './pickups.js';
import { createEmpController } from './emp.js';

const levelNameEl = document.getElementById('levelName');
const coinCounterEl = document.getElementById('coinCounter');
const winPopupEl = document.getElementById('winPopup');
const winMessageEl = document.getElementById('winMessage');
const gameOverPopupEl = document.getElementById('gameOverPopup');
const gameOverMessageEl = document.getElementById('gameOverMessage');
const retryBtn = document.getElementById('retryBtn');
const nextLevelBtn = document.getElementById('nextLevelBtn');
const weaponBarEl = document.getElementById('weaponBar');
const tankLevelEl = document.getElementById('tankLevel');
const tankHpBonusEl = document.getElementById('tankHpBonus');
const minimapEl = document.getElementById('minimap');
const livesEl = document.getElementById('livesCounter');
const vignetteEl = document.getElementById('damageVignette');
const timerEl = document.getElementById('levelTimer');
const winStarsEl = document.getElementById('winStars');
const winDetailsEl = document.getElementById('winDetails');

const keyState = { forward: false, backward: false, left: false, right: false, fire: false };
let scene, camera, renderer, clock, currentLevelGroup, projectileSystem, coinsController, machineGunController, nukeController, lifeController, grenadeController, grenadeFlight, levelAura, blastController, laserController, breakableGroup, soundManager, turretController, bossController, droneController, keyController, gateController, patrolController, mortarController, shieldController, switchController, floorPieceController, crackedWallController, shieldPickupController, empPickupController, empController;
let bubble = null;
let atmosphere = null;
let currentLook = lookFor(null);
let propsBundle = null;
let ambientParticles = null;
let lightPool = null;
let effects = null;
let intro = null; // { t, duration } while the opening flyover plays
let waterSheen = null;
let mapsManifest = null;
const animatedTextures = []; // { tex, vx, vz }
const lavaMaterials = [];
const turretEmitters = new Map();
let playerHealthBar = null;
let playerHealthFill = null;
let levelData = null;
let outcome = null;
let levelCatalog = [];
let currentLevelId = null;
const player = {
  mesh: null,
  position: new THREE.Vector3(),
  direction: 0,
  moveSpeed: 3,
  turnSpeed: Math.PI,
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  weapon: 'cannon',
  unlocked: { cannon: true, machinegun: false, nuke: false, grenade: false },
  ammo: { machinegun: 0, nuke: 0, grenade: 0 },
  previousWeapon: null,
  fireCooldown: 0,
  laserCooldown: 0,
  droneCooldown: 0,
  tankLevel: 1,
  lives: PLAYER_LIVES,
  invulnerable: 0,
  respawnTimer: 0
};
const checkpoint = { x: 0, z: 0, direction: 0 };
const stats = { hits: 0, deaths: 0 };
const shake = { remaining: 0, seconds: 0, strength: 0 };
const flashes = [];
let slowMo = 0;
let levelTime = 0;
let timerLabel = '';
let tileSize = 1;
let heightStep = 1;
let grenadeCharge = null;
let minimapFog = null;
const muzzlePoint = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 3.8, -6.4);
const textureLoader = new THREE.TextureLoader();
const materialCache = new Map();
const fallbackMaterials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.8 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xcc3366, side: THREE.DoubleSide }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x555577 }),
  breakable: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 })
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function parseLevelParam(levelsList) {
  const params = new URLSearchParams(window.location.search);
  const levelParam = params.get('level');
  if (levelParam) return levelParam;
  if (Array.isArray(levelsList) && levelsList.length > 0) return levelsList[0].id;
  throw new Error('No level available');
}

function normalizeLevelData(level) {
  level.breakableItems = Array.isArray(level.breakableItems) ? level.breakableItems : [];
  level.coins = Array.isArray(level.coins) ? level.coins : [];
  level.bigCoins = Array.isArray(level.bigCoins) ? level.bigCoins : [];
  level.turrets = Array.isArray(level.turrets) ? level.turrets : [];
  level.bosses = Array.isArray(level.bosses) ? level.bosses : [];
  level.machineGuns = Array.isArray(level.machineGuns) ? level.machineGuns : [];
  level.nukes = Array.isArray(level.nukes) ? level.nukes : [];
  level.lives = Array.isArray(level.lives) ? level.lives : [];
  level.grenades = Array.isArray(level.grenades) ? level.grenades : [];
  level.drones = Array.isArray(level.drones) ? level.drones : [];
  level.keys = Array.isArray(level.keys) ? level.keys : [];
  level.gates = Array.isArray(level.gates) ? level.gates : [];
  level.lasers = Array.isArray(level.lasers) ? level.lasers : [];
  for (const name of ['patrols', 'mortars', 'shields', 'switches', 'toggleWalls', 'oneWays', 'conveyors', 'crackedWalls', 'shieldProjectors', 'emps']) {
    level[name] = Array.isArray(level[name]) ? level[name] : [];
  }
  return level;
}

function normalizeTextureUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) return url;
  return `/${url.replace(/^\/+/, '')}`;
}

async function getMaterial(texUrl, type) {
  const normalized = normalizeTextureUrl(texUrl);
  if (!normalized) return fallbackMaterials[type];
  if (materialCache.has(normalized)) return materialCache.get(normalized);

  const loadTexture = (url, srgb) => new Promise((resolve) => {
    if (!url) return resolve(null);
    textureLoader.load(
      url,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() || 1;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
  const baseName = normalized.split('/').pop();
  const maps = mapsManifest?.[baseName] || null;
  const materialPromise = Promise.all([
    loadTexture(normalized, true),
    loadTexture(maps?.normal, false),
    loadTexture(maps?.roughness, false)
  ]).then(([tex, normalMap, roughnessMap]) => {
    if (!tex) {
      console.warn(`Texture failed to load: ${normalized}`);
      return fallbackMaterials[type];
    }
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      side: type === 'wall' ? THREE.DoubleSide : THREE.FrontSide
    });
    if (normalMap) {
      mat.normalMap = normalMap;
      mat.normalScale.set(0.7, 0.7);
    }
    if (roughnessMap) mat.roughnessMap = roughnessMap;
    if (isLavaTexture(normalized, currentLook)) {
      mat.emissive = new THREE.Color(0xff6a1a);
      mat.emissiveMap = tex;
      mat.emissiveIntensity = 0.9;
      lavaMaterials.push(mat);
      animatedTextures.push({ tex, vx: 0.006, vz: 0.011 });
    } else if (isWaterTexture(normalized, currentLook)) {
      mat.roughness = 0.35;
      animatedTextures.push({ tex, vx: 0.022, vz: 0.014 });
    }
    materialCache.set(normalized, mat);
    return mat;
  });

  materialCache.set(normalized, materialPromise);
  return materialPromise;
}

function disposeLevelGroup(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry) obj.geometry.dispose();
  });
}

function validateLevelSize(level) {
  const width = level.size?.width;
  const depth = level.size?.depth;
  if (!Number.isFinite(width) || !Number.isFinite(depth)) return false;
  if (!Array.isArray(level.tiles) || level.tiles.length !== depth) return false;
  for (let z = 0; z < depth; z++) {
    if (!Array.isArray(level.tiles[z]) || level.tiles[z].length !== width) return false;
  }
  return true;
}

// Level geometry is merged into one mesh per texture: floors, ceilings and only the exposed wall
// faces. A 57x47 level becomes a handful of draw calls instead of thousands.
function createBatch() {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

// uvTurns rotates the texture a quarter turn per step and tint darkens the tile a little, so a run
// of identical tiles stops reading as a repeating pattern.
function addQuad(batch, corners, normal, uvScale = [1, 1], { uvTurns = 0, tint = 1 } = {}) {
  const base = batch.positions.length / 3;
  const uv = [[0, 0], [uvScale[0], 0], [uvScale[0], uvScale[1]], [0, uvScale[1]]];
  corners.forEach((corner, index) => {
    batch.positions.push(corner[0], corner[1], corner[2]);
    batch.normals.push(normal[0], normal[1], normal[2]);
    const [u, v] = uv[(index + uvTurns) % 4];
    batch.uvs.push(u, v);
    batch.colors.push(tint, tint, tint);
  });
  batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Same, but guarantees the quad faces up whatever order the corners came in.
function addQuadUp(batch, corners, uvScale, options) {
  const ax = corners[1][0] - corners[0][0];
  const az = corners[1][2] - corners[0][2];
  const bx = corners[2][0] - corners[0][0];
  const bz = corners[2][2] - corners[0][2];
  const cross = az * bx - ax * bz; // y component of (a x b)
  const ordered = cross >= 0 ? corners : [corners[0], corners[3], corners[2], corners[1]];
  addQuad(batch, ordered, [0, 1, 0], uvScale, options);
}

function batchFor(batches, texUrl, type) {
  const key = `${type}|${texUrl || ''}`;
  if (!batches.has(key)) batches.set(key, { texUrl, type, batch: createBatch() });
  return batches.get(key).batch;
}

function specialBatch(batches, name, material, extra = {}) {
  if (!batches.has(name)) batches.set(name, { texUrl: null, type: name, material, batch: createBatch(), ...extra });
  return batches.get(name).batch;
}

const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x1f1f23, roughness: 0.95, vertexColors: true });
const aoMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const sheenMaterial = new THREE.MeshBasicMaterial({ color: 0xdcefff, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const TRIM = 0.07;
const AO_WIDTH = 0.42;
let tileRandom = () => 0.5;

function isWaterTile(tile) {
  return (tile.floor || 0) < 0 || isWaterTexture(tile.floorTex, currentLook);
}

function isRoofed(level) {
  let roofed = 0;
  let total = 0;
  for (const row of level.tiles) {
    for (const tile of row) {
      total += 1;
      if (typeof tile.ceiling === 'number' && tile.ceiling > 0) roofed += 1;
    }
  }
  return total > 0 && roofed / total > 0.3;
}

function tileFloorAt(level, x, z) {
  if (x < 0 || z < 0 || x >= level.size.width || z >= level.size.depth) return 0;
  return Math.max(0, level.tiles[z][x].floor || 0);
}

function appendTileGeometry(level, batches, x, z) {
  const tile = level.tiles[z][x];
  const floor = Math.max(0, tile.floor || 0);
  const x0 = x * tileSize;
  const x1 = x0 + tileSize;
  const z0 = z * tileSize;
  const z1 = z0 + tileSize;
  const top = floor * heightStep;
  const water = isWaterTile(tile);
  const variation = { uvTurns: water ? 0 : Math.floor(tileRandom() * 4), tint: 0.86 + tileRandom() * 0.14 };
  addQuad(batchFor(batches, tile.floorTex, 'floor'), [[x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0]], [0, 1, 0], [1, 1], variation);
  if (water) {
    const y = top + 0.035;
    addQuadUp(specialBatch(batches, 'sheen', sheenMaterial, { sheen: true }), [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [1, 1]);
  }
  const sides = [
    { dx: 0, dz: 1, normal: [0, 0, 1], a: [x0, z1], b: [x1, z1] },
    { dx: 1, dz: 0, normal: [1, 0, 0], a: [x1, z1], b: [x1, z0] },
    { dx: 0, dz: -1, normal: [0, 0, -1], a: [x1, z0], b: [x0, z0] },
    { dx: -1, dz: 0, normal: [-1, 0, 0], a: [x0, z0], b: [x0, z1] }
  ];
  if (floor > 0) {
    const wallTint = 0.88 + tileRandom() * 0.12;
    for (const side of sides) {
      const neighbour = tileFloorAt(level, x + side.dx, z + side.dz);
      if (neighbour >= floor) continue;
      const bottom = neighbour * heightStep;
      addQuad(
        batchFor(batches, tile.wallTex, 'wall'),
        [[side.a[0], bottom, side.a[1]], [side.b[0], bottom, side.b[1]], [side.b[0], top, side.b[1]], [side.a[0], top, side.a[1]]],
        side.normal,
        [1, floor - neighbour],
        { tint: wallTint }
      );
      // Dark cap: a band on the top edge of the face and a strip along the top surface.
      const [nx, nz] = [side.normal[0] * 0.004, side.normal[2] * 0.004];
      const trim = specialBatch(batches, 'trim', trimMaterial);
      addQuad(
        trim,
        [[side.a[0] + nx, top - TRIM, side.a[1] + nz], [side.b[0] + nx, top - TRIM, side.b[1] + nz], [side.b[0] + nx, top, side.b[1] + nz], [side.a[0] + nx, top, side.a[1] + nz]],
        side.normal,
        [1, 1],
        { tint: 1 }
      );
      const ix = -side.normal[0] * TRIM;
      const iz = -side.normal[2] * TRIM;
      addQuadUp(trim, [[side.a[0], top + 0.004, side.a[1]], [side.a[0] + ix, top + 0.004, side.a[1] + iz], [side.b[0] + ix, top + 0.004, side.b[1] + iz], [side.b[0], top + 0.004, side.b[1]]], [1, 1], { tint: 1 });
    }
  } else {
    // Contact shadow on the floor along every wall foot.
    for (const side of sides) {
      if (tileFloorAt(level, x + side.dx, z + side.dz) <= floor) continue;
      const ix = -side.normal[0] * AO_WIDTH;
      const iz = -side.normal[2] * AO_WIDTH;
      const y = top + 0.006;
      addQuadUp(specialBatch(batches, 'ao', aoMaterial), [[side.a[0], y, side.a[1]], [side.a[0] + ix, y, side.a[1] + iz], [side.b[0] + ix, y, side.b[1] + iz], [side.b[0], y, side.b[1]]], [1, 1]);
    }
  }
  if (typeof tile.ceiling === 'number' && tile.ceiling > floor) {
    const y = tile.ceiling * heightStep;
    addQuad(batchFor(batches, tile.ceilingTex, 'ceiling'), [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0], [1, 1], { uvTurns: Math.floor(tileRandom() * 4), tint: 0.84 + tileRandom() * 0.16 });
  }
}

async function buildLevelGeometry(level) {
  if (!validateLevelSize(level)) return null;
  const group = new THREE.Group();
  tileSize = level.tileSize || 1;
  heightStep = level.heightStep || 1;
  const batches = new Map();
  tileRandom = mulberry32(hashString(`${currentLevelId || level.name || 'level'}|tiles`));
  aoMaterial.map = aoTexture();
  sheenMaterial.map = rippleTexture();
  waterSheen = null;
  for (let z = 0; z < level.size.depth; z++) {
    for (let x = 0; x < level.size.width; x++) appendTileGeometry(level, batches, x, z);
  }
  for (const entry of batches.values()) {
    const { texUrl, type, batch } = entry;
    if (!batch.indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3));
    geometry.setIndex(batch.indices);
    let material = entry.material;
    if (!material) {
      const base = await getMaterial(texUrl, type);
      material = base.clone();
      material.vertexColors = true;
      if (lavaMaterials.includes(base)) lavaMaterials.push(material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = type === 'wall';
    mesh.receiveShadow = type !== 'ao' && type !== 'sheen';
    if (type === 'ao' || type === 'sheen') mesh.renderOrder = 1;
    if (entry.sheen) waterSheen = mesh;
    group.add(mesh);
  }
  return group;
}

function currentTile(position) {
  const tileX = Math.floor(position.x / tileSize);
  const tileZ = Math.floor(position.z / tileSize);
  if (!levelData || tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return null;
  return levelData.tiles[tileZ][tileX];
}

function worldToTileIndex(vec) {
  return { tileX: Math.floor(vec.x / tileSize), tileZ: Math.floor(vec.z / tileSize) };
}

function getTileFloor(tileX, tileZ) {
  if (!levelData) return null;
  if (tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return null;
  return levelData.tiles[tileZ][tileX].floor ?? 0;
}

function isStepAllowed(currentFloor, targetFloor) {
  if (currentFloor === null || targetFloor === null) return false;
  const diff = targetFloor - currentFloor;
  return JUMP_ENABLED ? diff === 0 || diff === 1 || diff === -1 : diff === 0;
}

function circleIntersectsTile(position, radius, tileX, tileZ) {
  const minX = tileX * tileSize;
  const maxX = minX + tileSize;
  const minZ = tileZ * tileSize;
  const maxZ = minZ + tileSize;
  const closestX = Math.max(minX, Math.min(position.x, maxX));
  const closestZ = Math.max(minZ, Math.min(position.z, maxZ));
  const dx = position.x - closestX;
  const dz = position.z - closestZ;
  return (dx * dx) + (dz * dz) < radius * radius;
}

function footprintHitsBlockedTile(position, currentFloor, currentTileX, currentTileZ) {
  const minTileX = Math.floor((position.x - TANK_COLLISION_RADIUS) / tileSize);
  const maxTileX = Math.floor((position.x + TANK_COLLISION_RADIUS) / tileSize);
  const minTileZ = Math.floor((position.z - TANK_COLLISION_RADIUS) / tileSize);
  const maxTileZ = Math.floor((position.z + TANK_COLLISION_RADIUS) / tileSize);

  for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      if (tileX === currentTileX && tileZ === currentTileZ) continue;
      if (!circleIntersectsTile(position, TANK_COLLISION_RADIUS, tileX, tileZ)) continue;
      if (tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return true;
      if (cellBlocked(tileX, tileZ)) return true;
      if (floorPieceController?.stepBlocked(currentTileX, currentTileZ, tileX, tileZ)) return true;
      if (!isStepAllowed(currentFloor, getTileFloor(tileX, tileZ))) return true;
    }
  }

  return false;
}

function getBreakableCenter(item) {
  const tile = levelData.tiles[item.z]?.[item.x];
  const floorY = Math.max(0, tile?.floor || 0) * heightStep;
  return new THREE.Vector3(
    item.x * tileSize + tileSize / 2,
    floorY + heightStep / 2,
    item.z * tileSize + tileSize / 2
  );
}

function hasBreakableAt(tileX, tileZ) {
  return levelData?.breakableItems?.some((item) => item.x === tileX && item.z === tileZ);
}

function hasTurretAt(tileX, tileZ) {
  return levelData?.turrets?.some((item) => item.x === tileX && item.z === tileZ);
}

function hasBossAt(tileX, tileZ) {
  if (bossController) return bossController.covers(tileX, tileZ);
  return levelData?.bosses?.some((item) => bossCovers(item.x, item.z, tileX, tileZ));
}

function hasGateAt(tileX, tileZ) {
  return gateController?.blocks(tileX, tileZ) || levelData?.gates?.some((item) => item.x === tileX && item.z === tileZ);
}

function hasDroneAt(tileX, tileZ) {
  return droneController?.occupies(tileX, tileZ) ?? false;
}

function hasPatrolAt(tileX, tileZ) {
  return patrolController?.occupies(tileX, tileZ) ?? false;
}

function hasStaticEnemyAt(tileX, tileZ) {
  return Boolean(mortarController?.living().some((item) => item.x === tileX && item.z === tileZ)
    || shieldController?.living().some((item) => item.x === tileX && item.z === tileZ));
}

function hasSolidPieceAt(tileX, tileZ) {
  return Boolean(switchController?.blocks(tileX, tileZ) || crackedWallController?.blocks(tileX, tileZ));
}

// Everything that stops the tank and shells on an open floor cell.
function cellBlocked(tileX, tileZ, { ignoreDrones = false, ignoreBosses = false } = {}) {
  if (hasBreakableAt(tileX, tileZ) || hasTurretAt(tileX, tileZ) || hasGateAt(tileX, tileZ)) return true;
  if (!ignoreBosses && hasBossAt(tileX, tileZ)) return true;
  if (hasStaticEnemyAt(tileX, tileZ) || hasSolidPieceAt(tileX, tileZ)) return true;
  if (!ignoreDrones && (hasDroneAt(tileX, tileZ) || hasPatrolAt(tileX, tileZ))) return true;
  return false;
}

function shieldedAt(tileX, tileZ) {
  return Boolean(shieldController?.protects(tileX, tileZ));
}

function deflectHit(tileX, tileZ) {
  shieldController?.deflect(tileX, tileZ);
  soundManager?.playHit();
}

function isOccluder(tileX, tileZ) {
  if (!levelData) return true;
  if (tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return true;
  if ((levelData.tiles[tileZ][tileX].floor ?? 0) > 0) return true;
  return cellBlocked(tileX, tileZ);
}

async function rebuildBreakables() {
  if (breakableGroup) {
    scene.remove(breakableGroup);
    disposeLevelGroup(breakableGroup);
  }

  breakableGroup = new THREE.Group();
  for (const item of levelData.breakableItems) {
    const tile = levelData.tiles[item.z]?.[item.x];
    if (!tile) continue;
    const material = await getMaterial(woodBoxTextureFor(item), 'breakable');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(tileSize, heightStep, tileSize), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(getBreakableCenter(item));
    mesh.userData.tileX = item.x;
    mesh.userData.tileZ = item.z;
    breakableGroup.add(mesh);
  }
  scene.add(breakableGroup);
}

function updateWeaponLabel() {
  if (!weaponBarEl) return;
  weaponBarEl.dataset.weapon = player.weapon;
  for (const slot of weaponBarEl.querySelectorAll('.weapon-slot')) {
    const weapon = slot.dataset.weapon;
    const unlocked = Boolean(player.unlocked[weapon]);
    slot.hidden = !unlocked;
    const ammoEl = slot.querySelector('.weapon-ammo');
    if (ammoEl) {
      const shellPower = weapon === 'cannon' ? cannonDamage(player.tankLevel) : 1;
      ammoEl.textContent = shellPower > 1 ? `${ammoLabel(player, weapon)} ×${shellPower}` : ammoLabel(player, weapon);
    }
    const active = unlocked && weapon === player.weapon;
    slot.classList.toggle('is-active', active);
    slot.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function refreshWeaponView() {
  updateWeaponLabel();
  if (player.mesh && player.mesh.userData.weaponId !== player.weapon) {
    setTankWeapon(player.mesh, player.weapon);
  }
}

function selectWeapon(weapon) {
  if (outcome) return;
  if (!chooseWeapon(player, weapon)) return;
  if (weapon !== 'grenade') cancelGrenadeCharge();
  refreshWeaponView();
}

const PICKUP_AMMO = { machinegun: MACHINE_GUN_AMMO, nuke: NUKE_AMMO, grenade: GRENADE_AMMO, shield: SHIELD_PROJECTOR_AMMO, emp: EMP_AMMO };

function grantWeapon(weapon) {
  const amount = PICKUP_AMMO[weapon] || 0;
  if (grantPickup(player, weapon, amount)) player.fireCooldown = 0;
  refreshWeaponView();
}

// A level-up tops every weapon the tank carries back up to a full pickup's worth of ammo.
function restockWeapons() {
  let changed = false;
  for (const weapon of Object.keys(PICKUP_AMMO)) {
    if (!player.unlocked[weapon]) continue;
    const full = PICKUP_AMMO[weapon] || 0;
    if ((player.ammo[weapon] || 0) >= full) continue;
    player.ammo[weapon] = full;
    changed = true;
  }
  if (changed) player.fireCooldown = 0;
  refreshWeaponView();
}

function syncTankHpLabel() {
  if (!tankHpBonusEl) return;
  tankHpBonusEl.textContent = player.maxHp > PLAYER_MAX_HP ? ` · ${player.maxHp} HP` : '';
}

function syncTankLevel(animateUpgrade) {
  const next = tankLevelForCoins(coinsController?.getCollectedCount() ?? 0);
  const nextMax = tankMaxHp(next);
  const gained = nextMax - player.maxHp;
  if (animateUpgrade && next > player.tankLevel) {
    levelAura?.spawn(player.position);
    if (upgradeTank(player.mesh, next)) {
      soundManager?.playTransform();
      startShake(0.5, 0.12);
    }
  }
  const leveledUp = next > player.tankLevel;
  player.tankLevel = next;
  if (animateUpgrade && leveledUp) restockWeapons();
  player.maxHp = nextMax;
  if (gained > 0) player.hp = Math.min(nextMax, player.hp + gained);
  else player.hp = Math.min(player.hp, nextMax);
  if (tankLevelEl) tankLevelEl.textContent = String(player.tankLevel);
  syncTankHpLabel();
  if (playerHealthFill) paintHealth(playerHealthFill, player.hp, player.maxHp);
}

function createPlayer(level) {
  const spawn = level.playerSpawn || { x: 0, y: TANK_BODY_HEIGHT, z: 0, rotationY: 0 };
  player.direction = spawn.rotationY || 0;
  player.hp = PLAYER_MAX_HP;
  player.maxHp = PLAYER_MAX_HP;
  resetWeaponState(player);
  player.tankLevel = 1;
  player.fireCooldown = 0;
  player.laserCooldown = 0;
  player.lives = PLAYER_LIVES;
  player.invulnerable = 0;
  player.respawnTimer = 0;
  syncTankLevel(false);
  updateWeaponLabel();
  updateLivesLabel();
  if (playerHealthFill) paintHealth(playerHealthFill, player.hp, PLAYER_MAX_HP);
  const mesh = createMainCharacter(1);
  const spawnTile = currentTile(new THREE.Vector3(spawn.x || 0, 0, spawn.z || 0));
  const spawnFloor = spawnTile ? Math.max(0, spawnTile.floor || 0) : 0;
  const startPos = new THREE.Vector3(spawn.x || 0, spawnFloor * heightStep, spawn.z || 0);
  player.position.copy(startPos);
  setCheckpoint();
  syncMainCharacterMesh(mesh, startPos, player.direction);
  player.mesh = mesh;
  setTankWeapon(mesh, player.weapon);
  return mesh;
}

function updateCoinCounter() {
  if (!coinsController || !coinCounterEl) return;
  coinCounterEl.textContent = `${coinsController.getCollectedCount()} / ${coinsController.getTotalCount()}`;
}

function applyNextLevelLink() {
  if (!nextLevelBtn) return;
  const index = levelCatalog.findIndex((level) => level.id === currentLevelId);
  const next = index >= 0 ? levelCatalog[index + 1] : null;
  if (!next) {
    nextLevelBtn.hidden = true;
    nextLevelBtn.removeAttribute('href');
    return;
  }
  nextLevelBtn.href = `/games-3d/game?level=${encodeURIComponent(next.id)}`;
  nextLevelBtn.hidden = false;
}

function showWinPopup(totalCoins) {
  if (outcome === 'dead' || !winPopupEl || !winMessageEl) return;
  outcome = 'won';
  markLevelCleared(currentLevelId);
  const par = parSeconds(levelData);
  const stars = starsFor(levelTime, stats.deaths, par);
  const previous = levelRecord(currentLevelId);
  const record = recordResult(currentLevelId, { time: levelTime, stars });
  if (winStarsEl) {
    winStarsEl.innerHTML = '';
    for (let index = 0; index < 3; index++) {
      const span = document.createElement('span');
      span.textContent = '\u2605';
      if (index >= stars) span.className = 'dim';
      winStarsEl.appendChild(span);
    }
  }
  if (winDetailsEl) {
    const lines = [
      `Time ${formatTime(levelTime)} · par ${formatTime(par)}`,
      `Deaths ${stats.deaths} · hits taken ${stats.hits}`
    ];
    if (previous?.bestTime != null && levelTime < previous.bestTime) lines.push(`New best time! Previous ${formatTime(previous.bestTime)}`);
    else if (record?.bestTime != null) lines.push(`Best ${formatTime(record.bestTime)}`);
    if (stars < 3) lines.push(stats.deaths > 0 ? 'Finish without dying for another star.' : 'Beat par for another star.');
    winDetailsEl.textContent = lines.join('\n');
  }
  winMessageEl.textContent = `You collected all ${totalCoins} coin${totalCoins === 1 ? '' : 's'} and won the level.`;
  applyNextLevelLink();
  winPopupEl.hidden = false;
}

function showGameOver() {
  if (!gameOverPopupEl) return;
  gameOverPopupEl.hidden = false;
}

function updateLivesLabel() {
  if (!livesEl) return;
  livesEl.textContent = '\u2665'.repeat(Math.max(0, player.lives)) + '\u2661'.repeat(Math.max(0, PLAYER_LIVES - player.lives));
}

function setCheckpoint() {
  checkpoint.x = player.position.x;
  checkpoint.z = player.position.z;
  checkpoint.direction = player.direction;
}

function startShake(seconds, strength) {
  if (strength < shake.strength * (shake.remaining / Math.max(0.01, shake.seconds))) return;
  shake.remaining = seconds;
  shake.seconds = seconds;
  shake.strength = strength;
}

function flashVignette() {
  if (!vignetteEl) return;
  vignetteEl.classList.remove('is-hit');
  void vignetteEl.offsetWidth;
  vignetteEl.classList.add('is-hit');
}

// Short white flash plus a scale pop on whatever was hit. Shared materials only get the pop.
function flashObject(root) {
  if (!root) return;
  const entry = { root, age: 0, materials: [] };
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material || obj.userData.shared || obj.material.userData?.shared || !obj.material.emissive) return;
    entry.materials.push({ material: obj.material, emissive: obj.material.emissive.getHex(), intensity: obj.material.emissiveIntensity });
    obj.material.emissive.setHex(0xffffff);
    obj.material.emissiveIntensity = 1;
  });
  entry.baseScale = root.scale.clone();
  root.scale.copy(entry.baseScale).multiplyScalar(1.18);
  flashes.push(entry);
}

function updateFlashes(delta) {
  for (let index = flashes.length - 1; index >= 0; index--) {
    const entry = flashes[index];
    entry.age += delta;
    const t = Math.min(1, entry.age / HIT_FLASH_SECONDS);
    entry.root.scale.copy(entry.baseScale).multiplyScalar(1.18 - 0.18 * t);
    if (t < 1) continue;
    for (const { material, emissive, intensity } of entry.materials) {
      material.emissive.setHex(emissive);
      material.emissiveIntensity = intensity;
    }
    entry.root.scale.copy(entry.baseScale);
    flashes.splice(index, 1);
  }
}

function respawnAtCheckpoint() {
  player.position.set(checkpoint.x, 0, checkpoint.z);
  const tile = currentTile(player.position);
  player.position.y = Math.max(0, tile?.floor || 0) * heightStep;
  player.direction = checkpoint.direction;
  player.hp = player.maxHp;
  player.invulnerable = RESPAWN_INVULN_SECONDS;
  player.fireCooldown = 0;
  cancelGrenadeCharge();
  if (bubble) popBubble();
  projectileSystem?.clearProjectile();
  if (playerHealthFill) paintHealth(playerHealthFill, player.hp, player.maxHp);
  if (player.mesh) {
    player.mesh.visible = true;
    syncMainCharacterMesh(player.mesh, player.position, player.direction);
  }
  outcome = null;
}

// ---------------------------------------------------------------- shield bubble
function raiseBubble() {
  if (bubble) popBubble();
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
  );
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(0.97, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xbae6fd, wireframe: true, transparent: true, opacity: 0.18, depthWrite: false })
  );
  group.add(shell, wire);
  scene.add(group);
  bubble = { group, shell, wire, remaining: SHIELD_BUBBLE_SECONDS, hits: SHIELD_BUBBLE_HITS, flash: 0, age: 0 };
  soundManager?.playShieldUp();
}

function popBubble() {
  if (!bubble) return;
  const core = player.position.clone();
  core.y += 0.4;
  projectileSystem?.burstAt(core, 0.7);
  scene.remove(bubble.group);
  bubble.shell.geometry.dispose();
  bubble.shell.material.dispose();
  bubble.wire.geometry.dispose();
  bubble.wire.material.dispose();
  bubble = null;
  soundManager?.playShieldPop();
}

// Returns true when the bubble took the hit instead of the tank.
function bubbleAbsorbs() {
  if (!bubble || outcome) return false;
  bubble.hits -= 1;
  bubble.flash = 0.18;
  startShake(0.12, 0.05);
  soundManager?.playHit();
  if (bubble.hits <= 0) popBubble();
  return true;
}

function updateBubble(delta) {
  if (!bubble) return;
  bubble.remaining -= delta;
  bubble.age += delta;
  bubble.flash = Math.max(0, bubble.flash - delta);
  if (bubble.remaining <= 0) {
    popBubble();
    return;
  }
  bubble.group.position.set(player.position.x, player.position.y + 0.42, player.position.z);
  const pulse = 1 + Math.sin(bubble.age * 5) * 0.03;
  const fade = Math.min(1, bubble.remaining / 1.2);
  bubble.group.scale.setScalar(pulse);
  bubble.shell.material.opacity = (0.16 + 0.05 * (bubble.hits / SHIELD_BUBBLE_HITS) + bubble.flash * 2.4) * fade;
  bubble.wire.material.opacity = (0.14 + bubble.flash * 1.5) * fade;
  bubble.wire.rotation.y += delta * 0.8;
}

function fireShieldProjector() {
  if ((player.ammo.shield || 0) <= 0) {
    spendAmmo(player, 'shield', 0);
    refreshWeaponView();
    return;
  }
  raiseBubble();
  spendAmmo(player, 'shield', 1);
  player.fireCooldown = 0.5;
  refreshWeaponView();
}

// ---------------------------------------------------------------- EMP pulse
function fireEmp() {
  if ((player.ammo.emp || 0) <= 0) {
    spendAmmo(player, 'emp', 0);
    refreshWeaponView();
    return;
  }
  const origin = player.position.clone();
  const radius = EMP_RADIUS_CELLS * tileSize;
  empController?.fire(origin, radius, EMP_STUN_SECONDS);
  projectileSystem?.clearHostileWithin(origin, radius);
  startShake(0.35, 0.16);
  soundManager?.playEmp();
  spendAmmo(player, 'emp', 1);
  player.fireCooldown = 0.6;
  refreshWeaponView();
}

function stunnedAt(x, z) {
  return Boolean(empController?.covers(x, z));
}

function hurtPlayer(source) {
  if (outcome || player.hp <= 0 || player.invulnerable > 0) return;
  if (bubbleAbsorbs()) return;
  player.hp -= 1;
  stats.hits += 1;
  if (playerHealthFill) paintHealth(playerHealthFill, player.hp, player.maxHp);
  startShake(SHAKE_HIT.seconds, SHAKE_HIT.strength);
  flashVignette();
  if (player.hp > 0) {
    if (source !== 'laser') soundManager?.playHit();
    return;
  }
  stats.deaths += 1;
  if (player.lives > 1) {
    player.lives -= 1;
    updateLivesLabel();
    outcome = 'respawn';
    player.respawnTimer = RESPAWN_SECONDS;
    soundManager?.setMoving(false);
    soundManager?.setTurning(false);
    soundManager?.playBreak();
    startShake(0.6, 0.3);
    if (player.mesh) {
      const core = player.position.clone();
      core.y += 0.4;
      projectileSystem?.burstAt(core, 1.3);
      player.mesh.visible = false;
    }
    return;
  }
  player.lives = 0;
  updateLivesLabel();
  outcome = 'dead';
  if (gameOverMessageEl) {
    const messages = {
      laser: 'A laser destroyed the tank.',
      boss: 'The boss destroyed the tank.',
      drone: 'A drone destroyed the tank.',
      mortar: 'A mortar shell destroyed the tank.',
      patrol: 'A patrol tank destroyed the tank.'
    };
    gameOverMessageEl.textContent = messages[source] || 'Turret fire destroyed the tank.';
  }
  soundManager?.setMoving(false);
  soundManager?.setTurning(false);
  soundManager?.playHit();
  showGameOver();
}

function resolveStepAndMove(proposedPos) {
  const { tileX: curX, tileZ: curZ } = worldToTileIndex(player.position);
  const { tileX: destX, tileZ: destZ } = worldToTileIndex(proposedPos);
  const currentFloor = getTileFloor(curX, curZ);
  const targetFloor = getTileFloor(destX, destZ);
  if (currentFloor === null || targetFloor === null) return false;
  if ((destX !== curX || destZ !== curZ) && (cellBlocked(destX, destZ) || floorPieceController?.stepBlocked(curX, curZ, destX, destZ))) return false;
  if (!isStepAllowed(currentFloor, targetFloor)) return false;
  if (footprintHitsBlockedTile(proposedPos, currentFloor, curX, curZ)) return false;

  player.position.x = proposedPos.x;
  player.position.z = proposedPos.z;
  player.position.y = Math.max(0, targetFloor) * heightStep;
  return true;
}

// The cannon is fixed to the hull: it fires wherever the arrow keys point the tank.
function aimYaw() {
  return player.direction;
}

function updateMovement(delta) {
  const isTurning = keyState.left || keyState.right;
  if (keyState.left) player.direction += player.turnSpeed * delta;
  if (keyState.right) player.direction -= player.turnSpeed * delta;

  const forward = planarForward(player.direction);
  const forwardDir = new THREE.Vector3(forward.x, 0, forward.z);
  let moveAmount = 0;
  if (keyState.forward) moveAmount += player.moveSpeed * delta;
  if (keyState.backward) moveAmount -= player.moveSpeed * delta;
  if (moveAmount === 0) return { moved: false, turning: isTurning };

  const desiredMove = forwardDir.multiplyScalar(moveAmount);
  return { moved: moveWithSlide(desiredMove), turning: isTurning };
}

// FPS-style wall sliding: when the full step is blocked, keep whichever axis component of the
// move is still free, so brushing a wall at an angle slides the tank along it instead of stopping.
function moveWithSlide(move) {
  if (resolveStepAndMove(player.position.clone().add(move))) return true;
  const slides = Math.abs(move.x) >= Math.abs(move.z)
    ? [[move.x, 0], [0, move.z]]
    : [[0, move.z], [move.x, 0]];
  for (const [dx, dz] of slides) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) continue;
    if (resolveStepAndMove(player.position.clone().add(new THREE.Vector3(dx, 0, dz)))) return true;
  }
  return false;
}

function applyConveyor(delta) {
  const push = floorPieceController?.conveyorPush(player.position.x, player.position.z);
  if (!push) return;
  resolveStepAndMove(player.position.clone().add(new THREE.Vector3(push.x * delta, 0, push.z * delta)));
}

// Steepens the follow camera over walls that would sit between it and the tank, so corners and
// corridors never leave the view inside a wall.
function segmentClear(focus, target) {
  if (!levelData) return true;
  const steps = 24;
  const delta = target.clone().sub(focus);
  for (let index = 2; index <= steps; index++) {
    const point = focus.clone().addScaledVector(delta, index / steps);
    const tileX = Math.floor(point.x / tileSize);
    const tileZ = Math.floor(point.z / tileSize);
    if (tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) continue;
    const top = Math.max(0, levelData.tiles[tileZ][tileX].floor || 0) * heightStep;
    if (point.y < top + 0.2) return false;
  }
  return true;
}

function clampCameraToWalls(focus, offset) {
  let candidate = focus.clone().add(offset);
  for (let k = 1; k >= 0.14; k -= 0.06) {
    candidate = new THREE.Vector3(focus.x + offset.x * k, focus.y + offset.y + (1 - k) * 1.6, focus.z + offset.z * k);
    if (segmentClear(focus, candidate)) return candidate;
  }
  return candidate;
}

function updateCamera() {
  const rotatedOffset = cameraOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.direction);
  const focus = player.position.clone();
  focus.y += 0.45;
  atmosphere?.update(player.position);
  const targetPos = clampCameraToWalls(focus, rotatedOffset);
  if (intro) {
    // Opening flyover: orbit in from the tank's front while descending, settling behind it.
    // Roofed levels keep the sweep low so it stays under the ceiling.
    const u = Math.min(1, intro.t / intro.duration);
    const k = u * u * (3 - 2 * u);
    const swing = (1 - k) * Math.PI * 0.8;
    const orbit = cameraOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.direction + swing);
    const reach = 1 + (intro.roofed ? 0.45 : 1.5) * (1 - k);
    const lift = (intro.roofed ? 2.2 : 8) * (1 - k);
    camera.position.copy(focus).addScaledVector(orbit, reach).add(new THREE.Vector3(0, lift, 0));
    camera.lookAt(focus);
    if (u >= 1) intro = null;
    return;
  }
  camera.position.lerp(targetPos, 0.15);
  if (shake.remaining > 0) {
    const amount = shake.strength * (shake.remaining / shake.seconds);
    camera.position.x += (Math.random() - 0.5) * amount;
    camera.position.y += (Math.random() - 0.5) * amount;
    camera.position.z += (Math.random() - 0.5) * amount;
  }
  camera.lookAt(focus);
}

let surfaceTime = 0;
function updateSurfaces(delta) {
  surfaceTime += delta;
  for (const entry of animatedTextures) {
    entry.tex.offset.x = (entry.tex.offset.x + entry.vx * delta) % 1;
    entry.tex.offset.y = (entry.tex.offset.y + entry.vz * delta) % 1;
  }
  if (waterSheen) {
    const tex = waterSheen.material.map;
    if (tex) {
      tex.offset.x = (tex.offset.x - 0.03 * delta) % 1;
      tex.offset.y = (tex.offset.y + 0.02 * delta) % 1;
    }
    waterSheen.position.y = Math.sin(surfaceTime * 1.6) * 0.012;
  }
  const glow = 0.75 + 0.25 * Math.sin(surfaceTime * 2.1);
  for (const material of lavaMaterials) material.emissiveIntensity = glow;
}

function floorYAt(x, z) {
  const tile = levelData?.tiles?.[Math.floor(z / tileSize)]?.[Math.floor(x / tileSize)];
  return tile ? Math.max(0, tile.floor || 0) * heightStep : 0;
}

// Point-light emitters from the level itself: lava cells, gates and turrets.
function levelEmitters(level) {
  const list = [];
  for (let z = 0; z < level.size.depth; z++) {
    for (let x = 0; x < level.size.width; x++) {
      const tile = level.tiles[z][x];
      if (!isLavaTexture(tile.floorTex, currentLook)) continue;
      list.push({ x: (x + 0.5) * tileSize, y: Math.max(0, tile.floor || 0) * heightStep + 0.4, z: (z + 0.5) * tileSize, color: 0xff6a1a, intensity: 4, distance: 3.8, pulse: 2.3, phase: (x * 7 + z * 13) % 6 });
    }
  }
  for (const gate of level.gates || []) {
    list.push({ x: (gate.x + 0.5) * tileSize, y: floorYAt((gate.x + 0.5) * tileSize, (gate.z + 0.5) * tileSize) + 0.9, z: (gate.z + 0.5) * tileSize, color: 0x9ad0ff, intensity: 2.5, distance: 3.4, pulse: 1.7, phase: gate.x });
  }
  for (const turret of level.turrets || []) {
    const emitter = { x: (turret.x + 0.5) * tileSize, y: floorYAt((turret.x + 0.5) * tileSize, (turret.z + 0.5) * tileSize) + 0.7, z: (turret.z + 0.5) * tileSize, color: 0xff5040, intensity: 2.2, distance: 2.8, pulse: 3.1, phase: turret.z };
    turretEmitters.set(`${turret.x},${turret.z}`, emitter);
    list.push(emitter);
  }
  return list;
}

function onResize() {
  const { innerWidth: w, innerHeight: h } = window;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// Everything a blast can reach from origin within limit, nearest first by the wave front.
function collectBlastTargets(origin, limit) {
  const targets = [];
  for (const item of patrolController?.getTargets() ?? []) {
    const dist = Math.hypot(item.worldX - origin.x, item.worldZ - origin.z);
    if (dist <= limit + 1e-3) targets.push({ kind: 'patrol', id: item.id, x: item.x, z: item.z, dist });
  }
  for (const kind of ['mortar', 'shield', 'cracked']) {
    const list = kind === 'mortar' ? mortarController?.getTargets() : kind === 'shield' ? shieldController?.getTargets() : crackedWallController?.cells();
    for (const item of list ?? []) {
      const dist = cellDistance(origin.x, origin.z, item, tileSize);
      if (dist <= limit + 1e-3) targets.push({ kind, x: item.x, z: item.z, dist });
    }
  }
  return targets;
}

function applyBlastToExtra(target, origin, damage, pierceShields, scale) {
  if (target.kind === 'cracked') {
    if (crackedWallController?.destroy(target.x, target.z)) {
      projectileSystem?.burstAt(getBreakableCenter(target), scale);
      soundManager?.playBreak();
    }
    return true;
  }
  if (target.kind === 'patrol') {
    projectileSystem?.burstAt(getBreakableCenter(target), scale);
    patrolController?.applyHit(target, damage);
    soundManager?.playBreak();
    return true;
  }
  if (target.kind === 'mortar') {
    projectileSystem?.burstAt(getBreakableCenter(target), scale);
    if (!pierceShields && shieldedAt(target.x, target.z)) deflectHit(target.x, target.z);
    else mortarController?.applyHit(target, damage);
    soundManager?.playBreak();
    return true;
  }
  if (target.kind === 'shield') {
    projectileSystem?.burstAt(getBreakableCenter(target), scale);
    shieldController?.applyHit(target, damage);
    soundManager?.playBreak();
    return true;
  }
  return false;
}

function detonateNuke() {
  const origin = player.position.clone();
  const limit = NUKE_RADIUS_CELLS * tileSize;
  const targets = collectBlastTargets(origin, limit);
  for (const item of levelData.breakableItems) {
    const dist = cellDistance(origin.x, origin.z, item, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'box', x: item.x, z: item.z, dist });
  }
  for (const item of turretController?.getTargets() ?? []) {
    const dist = cellDistance(origin.x, origin.z, item, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'turret', x: item.x, z: item.z, dist });
  }
  for (const boss of bossController?.living() ?? []) {
    const center = bossCenter(boss.x, boss.z, tileSize);
    const dist = Math.hypot(center.x - origin.x, center.z - origin.z);
    if (dist <= limit + 1e-3) targets.push({ kind: 'boss', x: boss.x, z: boss.z, dist });
  }
  for (const drone of droneController?.getTargets() ?? []) {
    const dist = Math.hypot(drone.worldX - origin.x, drone.worldZ - origin.z);
    if (dist <= limit + 1e-3) targets.push({ kind: 'drone', id: drone.id, x: drone.x, z: drone.z, dist });
  }
  for (const laser of laserController?.getTargets() ?? []) {
    const dist = cellDistance(origin.x, origin.z, laser, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'laser', x: laser.x, z: laser.z, dir: laser.dir, hitX: laser.hitX, hitZ: laser.hitZ, dist });
  }
  blastController?.detonate(origin, targets, (target) => {
    if (applyBlastToExtra(target, origin, BOSS_MAX_HP, true, 1)) return;
    if (target.kind === 'laser') {
      destroyLaserTarget(target, origin.y, 0.9);
      return;
    }
    if (target.kind === 'boss') {
      const center = bossCenter(target.x, target.z, tileSize);
      projectileSystem?.burstAt(new THREE.Vector3(center.x, origin.y, center.z), 1.4);
      bossController?.applyHit(target, BOSS_MAX_HP);
      soundManager?.playBreak();
      return;
    }
    projectileSystem?.burstAt(getBreakableCenter(target), 1);
    if (target.kind === 'box') {
      handleBreakableHit(target);
      return;
    }
    if (target.kind === 'drone') {
      droneController?.applyHit(target, DRONE_MAX_HP);
      soundManager?.playBreak();
      return;
    }
    turretController?.applyHit(target, TURRET_MAX_HP);
    soundManager?.playBreak();
  });
  const core = origin.clone();
  core.y += 0.55;
  projectileSystem?.burstAt(core, 2.2);
  effects?.impact(origin, 'large');
  startShake(SHAKE_BLAST.seconds, SHAKE_BLAST.strength);
  soundManager?.playFire();
  spendAmmo(player, 'nuke', NUKE_AMMO);
  player.fireCooldown = MACHINE_GUN_REFIRE_SECONDS;
  refreshWeaponView();
}

function detonateGrenade(landing) {
  const origin = new THREE.Vector3(landing.x, landing.y, landing.z);
  const limit = GRENADE_RADIUS_CELLS * tileSize;
  const targets = collectBlastTargets(origin, limit);
  for (const item of levelData.breakableItems) {
    const dist = cellDistance(origin.x, origin.z, item, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'box', x: item.x, z: item.z, dist });
  }
  for (const item of turretController?.getTargets() ?? []) {
    const dist = cellDistance(origin.x, origin.z, item, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'turret', x: item.x, z: item.z, dist });
  }
  for (const boss of bossController?.living() ?? []) {
    const center = bossCenter(boss.x, boss.z, tileSize);
    const dist = Math.hypot(center.x - origin.x, center.z - origin.z);
    if (dist <= limit + 1e-3) targets.push({ kind: 'boss', x: boss.x, z: boss.z, dist });
  }
  for (const drone of droneController?.getTargets() ?? []) {
    const dist = Math.hypot(drone.worldX - origin.x, drone.worldZ - origin.z);
    if (dist <= limit + 1e-3) targets.push({ kind: 'drone', id: drone.id, x: drone.x, z: drone.z, dist });
  }
  for (const laser of laserController?.getTargets() ?? []) {
    const dist = cellDistance(origin.x, origin.z, laser, tileSize);
    if (dist <= limit + 1e-3) targets.push({ kind: 'laser', x: laser.x, z: laser.z, dir: laser.dir, hitX: laser.hitX, hitZ: laser.hitZ, dist });
  }
  blastController?.detonate(origin, targets, (target) => {
    if (applyBlastToExtra(target, origin, GRENADE_DAMAGE, false, 0.55)) return;
    if (target.kind === 'laser') {
      destroyLaserTarget(target, origin.y, 0.7);
      return;
    }
    if (target.kind === 'boss') {
      const center = bossCenter(target.x, target.z, tileSize);
      projectileSystem?.burstAt(new THREE.Vector3(center.x, origin.y, center.z), 0.7);
      if (shieldedAt(target.x, target.z)) deflectHit(target.x, target.z);
      else bossController?.applyHit(target, GRENADE_DAMAGE);
      soundManager?.playBreak();
      return;
    }
    projectileSystem?.burstAt(getBreakableCenter(target), 0.55);
    if (target.kind === 'box') {
      handleBreakableHit(target);
      return;
    }
    if (target.kind === 'drone') {
      droneController?.applyHit(target, GRENADE_DAMAGE);
      soundManager?.playBreak();
      return;
    }
    if (shieldedAt(target.x, target.z)) deflectHit(target.x, target.z);
    else turretController?.applyHit(target, GRENADE_DAMAGE);
    soundManager?.playBreak();
  }, {
    radiusCells: GRENADE_RADIUS_CELLS,
    visualScale: GRENADE_RADIUS_CELLS / NUKE_RADIUS_CELLS
  });
  projectileSystem?.burstAt(origin, 1.15);
  effects?.impact(origin, 'medium');
  startShake(SHAKE_GRENADE.seconds, SHAKE_GRENADE.strength);
  soundManager?.playBreak();
}

function cancelGrenadeCharge() {
  grenadeCharge = null;
  grenadeFlight?.hideAim();
}

function beginGrenadeCharge() {
  if (outcome || grenadeCharge != null || player.weapon !== 'grenade' || player.fireCooldown > 0) return;
  if ((player.ammo.grenade || 0) <= 0) {
    spendAmmo(player, 'grenade', 0);
    refreshWeaponView();
    return;
  }
  grenadeCharge = 0;
}

function fireGrenade(heldSeconds) {
  if (intro || outcome === 'dead' || !player.mesh || player.fireCooldown > 0) return;
  if ((player.ammo.grenade || 0) <= 0) {
    spendAmmo(player, 'grenade', 0);
    refreshWeaponView();
    return;
  }
  if (!grenadeFlight) return;
  const range = grenadeRangeCells(heldSeconds);
  getCannonWorldPosition(player.mesh, muzzlePoint);
  grenadeFlight.launch(muzzlePoint, player.position.x, player.position.y, player.position.z, aimYaw(), range);
  player.fireCooldown = GRENADE_REFIRE_SECONDS;
  soundManager?.playFire();
  spendAmmo(player, 'grenade', 1);
  refreshWeaponView();
}

function releaseGrenadeCharge() {
  if (grenadeCharge == null) return;
  const held = grenadeCharge;
  cancelGrenadeCharge();
  if (outcome || player.weapon !== 'grenade') return;
  fireGrenade(held);
}

function fireProjectile() {
  if (intro || outcome === 'dead' || !player.mesh || player.fireCooldown > 0) return;
  if (player.weapon === 'nuke') {
    detonateNuke();
    return;
  }
  if (player.weapon === 'shield') {
    fireShieldProjector();
    return;
  }
  if (player.weapon === 'emp') {
    fireEmp();
    return;
  }
  if (player.weapon === 'grenade') return;
  if (!projectileSystem) return;
  const origin = getCannonWorldPosition(player.mesh, new THREE.Vector3());
  if (player.weapon === 'machinegun') {
    const count = machineGunShotCount(player);
    if (count <= 0) {
      spendAmmo(player, 'machinegun', 0);
      refreshWeaponView();
      return;
    }
    const sides = count === 1 ? [0] : count === 2 ? [-1, 1] : [-1, 0, 1];
    const directions = sides.map((side) => {
      const forward = planarForward(aimYaw() + side * TURRET_HALF_ANGLE);
      return new THREE.Vector3(forward.x, 0, forward.z);
    });
    if (!projectileSystem.tryFireVolley(origin, directions)) return;
    player.fireCooldown = MACHINE_GUN_REFIRE_SECONDS;
    soundManager?.playFire();
    spendAmmo(player, 'machinegun', count);
    refreshWeaponView();
    return;
  }
  if (projectileSystem.hasActiveProjectile()) return;
  const forward = planarForward(aimYaw());
  const fired = projectileSystem.tryFire(origin, new THREE.Vector3(forward.x, 0, forward.z), cannonDamage(player.tankLevel));
  if (fired) soundManager?.playFire();
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  currentLook = lookFor(levelData?.theme);
  atmosphere = createAtmosphere(scene, renderer, currentLook, { roofed: levelData ? isRoofed(levelData) : false });

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp') keyState.forward = true;
    if (e.code === 'ArrowDown') keyState.backward = true;
    if (e.code === 'ArrowLeft') keyState.left = true;
    if (e.code === 'ArrowRight') keyState.right = true;
    if (e.code === 'Space') {
      e.preventDefault();
      keyState.fire = true;
      if (player.weapon === 'grenade') {
        if (!e.repeat) beginGrenadeCharge();
      } else if (player.weapon === 'machinegun' || !e.repeat) fireProjectile();
    }
    const weaponKeys = {
      Digit1: 'cannon',
      Numpad1: 'cannon',
      Digit2: 'machinegun',
      Numpad2: 'machinegun',
      Digit3: 'nuke',
      Numpad3: 'nuke',
      Digit4: 'grenade',
      Numpad4: 'grenade',
      Digit5: 'shield',
      Numpad5: 'shield',
      Digit6: 'emp',
      Numpad6: 'emp'
    };
    const nextWeapon = weaponKeys[e.code];
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (nextWeapon && !e.repeat && !typing) selectWeapon(nextWeapon);
  });
  weaponBarEl?.addEventListener('click', (event) => {
    const slot = event.target.closest('.weapon-slot');
    if (!slot || slot.hidden) return;
    selectWeapon(slot.dataset.weapon);
    slot.blur();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp') keyState.forward = false;
    if (e.code === 'ArrowDown') keyState.backward = false;
    if (e.code === 'ArrowLeft') keyState.left = false;
    if (e.code === 'ArrowRight') keyState.right = false;
    if (e.code === 'Space') {
      keyState.fire = false;
      releaseGrenadeCharge();
    }
  });
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || outcome) return;
    keyState.fire = true;
    if (player.weapon === 'grenade') beginGrenadeCharge();
    else fireProjectile();
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    keyState.fire = false;
    releaseGrenadeCharge();
  });
}

function attachLevel(group) {
  if (currentLevelGroup) {
    scene.remove(currentLevelGroup);
    disposeLevelGroup(currentLevelGroup);
  }
  scene.add(group);
  currentLevelGroup = group;
}

function nearestDropCell(x, z) {
  const width = levelData.size.width;
  const depth = levelData.size.depth;
  const blocked = (cx, cz) => {
    if (cx < 0 || cz < 0 || cx >= width || cz >= depth) return true;
    if ((levelData.tiles[cz][cx].floor || 0) > 0) return true;
    return cellBlocked(cx, cz, { ignoreDrones: true });
  };
  if (!blocked(x, z)) return { x, z };
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        if (!blocked(x + dx, z + dz)) return { x: x + dx, z: z + dz };
      }
    }
  }
  return { x, z };
}

function destroyLaserTarget(target, originY, scale) {
  if (!laserController?.destroy(target.x, target.z, target.dir)) return;
  const x = Number.isFinite(target.hitX) ? target.hitX : target.x * tileSize + tileSize / 2;
  const z = Number.isFinite(target.hitZ) ? target.hitZ : target.z * tileSize + tileSize / 2;
  projectileSystem?.burstAt(new THREE.Vector3(x, originY, z), scale);
  soundManager?.playBreak();
}

function releaseBossDrone(boss) {
  if (!droneController || !levelData) return;
  const width = levelData.size.width;
  const depth = levelData.size.depth;
  const playerX = Math.floor(player.position.x / tileSize);
  const playerZ = Math.floor(player.position.z / tileSize);
  const blocked = (cx, cz) => {
    if (cx < 0 || cz < 0 || cx >= width || cz >= depth) return true;
    if ((levelData.tiles[cz][cx].floor || 0) > 0) return true;
    return cellBlocked(cx, cz);
  };
  let fallback = null;
  for (let radius = 1; radius <= 6; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const cx = boss.x + dx;
        const cz = boss.z + dz;
        if (blocked(cx, cz)) continue;
        if (Math.max(Math.abs(cx - playerX), Math.abs(cz - playerZ)) <= 1) {
          if (!fallback) fallback = { x: cx, z: cz };
          continue;
        }
        droneController.spawn(cx, cz);
        return;
      }
    }
  }
  if (fallback) droneController.spawn(fallback.x, fallback.z);
}

function releaseGuardianDrop(entity) {
  const emitter = turretEmitters.get(`${entity?.x},${entity?.z}`);
  if (emitter) emitter.disabled = true;
  const kind = entity?.drop === 'bigCoin' || entity?.drop === 'coin' ? entity.drop : null;
  if (!kind) return;
  const cell = nearestDropCell(entity.x, entity.z);
  coinsController?.spawnDrop(cell.x, cell.z, kind);
}

function handleBreakableHit(hitItem) {
  levelData.breakableItems = levelData.breakableItems.filter((item) => !(item.x === hitItem.x && item.z === hitItem.z));
  soundManager?.playBreak();
  if (breakableGroup) {
    const mesh = breakableGroup.children.find((child) => child.userData.tileX === hitItem.x && child.userData.tileZ === hitItem.z);
    if (mesh) {
      breakableGroup.remove(mesh);
      mesh.geometry.dispose();
    }
  }
  coinsController?.removeTile(hitItem.x, hitItem.z);
}

function blocksMinimapRoom(x, z) {
  if (!levelData || x < 0 || z < 0 || x >= levelData.size.width || z >= levelData.size.depth) return true;
  if ((levelData.tiles[z][x].floor || 0) > 0) return true;
  return hasBreakableAt(x, z) || hasGateAt(x, z) || hasSolidPieceAt(x, z);
}

function updateMinimapFog() {
  if (!minimapFog || !levelData) return;
  const tileX = Math.floor(player.position.x / tileSize);
  const tileZ = Math.floor(player.position.z / tileSize);
  if (!minimapFog.isExplored(tileX, tileZ)) {
    minimapFog.reveal(floodOpenCells(levelData.size.width, levelData.size.depth, tileX, tileZ, blocksMinimapRoom));
  }
  const px = player.position.x;
  const pz = player.position.z;
  for (const item of levelData.keys || []) {
    if (minimapFog.hasSeen('key', item.x, item.z)) continue;
    if (canSeeCell(px, pz, item.x, item.z, tileSize, isOccluder)) minimapFog.see('key', item.x, item.z);
  }
  for (const item of levelData.gates || []) {
    if (minimapFog.hasSeen('gate', item.x, item.z)) continue;
    if (canSeeCell(px, pz, item.x, item.z, tileSize, isOccluder)) minimapFog.see('gate', item.x, item.z);
  }
  for (const boss of bossController?.living() ?? []) {
    if (minimapFog.hasSeen('boss', boss.origin.x, boss.origin.z)) continue;
    const center = bossCenter(boss.x, boss.z, tileSize);
    const cellX = Math.floor(center.x / tileSize);
    const cellZ = Math.floor(center.z / tileSize);
    const hidesBoss = (x, z) => bossController.covers(x, z) ? false : isOccluder(x, z);
    if (canSeeCell(px, pz, cellX, cellZ, tileSize, hidesBoss)) minimapFog.see('boss', boss.origin.x, boss.origin.z);
  }
}

function drawGameMinimap() {
  if (!minimapEl || minimapEl.hidden || !levelData) return;
  const ctx = minimapEl.getContext('2d');
  if (!ctx) return;
  updateMinimapFog();
  const forward = planarForward(player.direction);
  const remaining = coinsController?.getRemaining?.() ?? [];
  drawMinimap(ctx, minimapEl.width, minimapEl.height, levelData, {
    boxes: levelData.breakableItems,
    gates: levelData.gates,
    keys: levelData.keys,
    coins: remaining.filter((coin) => coin.value < 10),
    bigCoins: remaining.filter((coin) => coin.value >= 10),
    turrets: [...(turretController?.getTargets() ?? []), ...(mortarController?.getTargets() ?? [])],
    bosses: bossController?.living() ?? [],
    drones: [...(droneController?.getTargets() ?? []), ...(patrolController?.getTargets() ?? [])],
    shields: shieldController?.getTargets() ?? [],
    switches: switchController?.switches() ?? [],
    walls: [...(switchController?.blockingCells() ?? []), ...(crackedWallController?.cells() ?? [])],
    player: { x: player.position.x, z: player.position.z, fx: forward.x, fz: forward.z },
    fog: minimapFog
  });
}

function animate() {
  const realDelta = Math.min(0.1, clock.getDelta());
  if (intro) intro.t += realDelta;
  if (slowMo > 0) slowMo = Math.max(0, slowMo - realDelta);
  const delta = intro ? 0 : slowMo > 0 ? realDelta * SLOWMO_SCALE : realDelta;
  shake.remaining = Math.max(0, shake.remaining - realDelta);
  if (outcome === 'respawn') {
    player.respawnTimer -= realDelta;
    if (player.respawnTimer <= 0) respawnAtCheckpoint();
  }
  if (outcome !== 'won' && outcome !== 'dead' && !intro) {
    levelTime += realDelta;
    const label = formatTime(levelTime);
    if (label !== timerLabel && timerEl) {
      timerLabel = label;
      timerEl.textContent = label;
    }
  }
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  if (player.mesh && outcome !== 'respawn') player.mesh.visible = player.invulnerable <= 0 || Math.floor(player.invulnerable * 12) % 2 === 0;
  const movementState = outcome || intro
    ? { moved: false, turning: false }
    : updateMovement(delta);
  updateFlashes(realDelta);
  soundManager?.setMoving(Boolean(movementState.moved));
  soundManager?.setTurning(Boolean(movementState.turning));
  player.fireCooldown = Math.max(0, player.fireCooldown - delta);
  player.laserCooldown = Math.max(0, player.laserCooldown - delta);
  player.droneCooldown = Math.max(0, player.droneCooldown - delta);
  if (grenadeCharge != null) {
    if (outcome || player.weapon !== 'grenade' || (player.ammo.grenade || 0) <= 0) cancelGrenadeCharge();
    else {
      grenadeCharge += delta;
      grenadeFlight?.showAim(
        player.position.x,
        player.position.y,
        player.position.z,
        aimYaw(),
        grenadeRangeCells(grenadeCharge)
      );
    }
  }
  if (outcome !== 'dead' && keyState.fire && player.weapon === 'machinegun') fireProjectile();
  if (!outcome) applyConveyor(delta);
  floorPieceController?.update(delta);
  if (!outcome) switchController?.update(delta, player.position);
  updateBubble(delta);
  empController?.update(delta);
  patrolController?.update(delta, {
    playerPosition: player.position,
    alive: outcome === null,
    playerRadius: TANK_COLLISION_RADIUS,
    camera,
    isOccluder,
    stunned: stunnedAt,
    isTileBlocked: (tileX, tileZ) => {
      if (!levelData || tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return true;
      if ((levelData.tiles[tileZ][tileX].floor || 0) > 0) return true;
      return cellBlocked(tileX, tileZ, { ignoreDrones: true }) || hasDroneAt(tileX, tileZ);
    },
    tryFire: (ownerId, origin, direction) => {
      const fired = projectileSystem?.tryFireHostile(ownerId, origin, direction);
      if (fired) soundManager?.playFire();
      return Boolean(fired);
    }
  });
  mortarController?.update(delta, {
    playerPosition: player.position,
    alive: outcome === null,
    camera,
    isOccluder,
    stunned: stunnedAt,
    onFire: () => soundManager?.playFire(),
    onImpact: (landing, radius) => {
      const impact = new THREE.Vector3(landing.x, landing.y, landing.z);
      projectileSystem?.burstAt(impact, 0.8);
      soundManager?.playBreak();
      if (!outcome && Math.hypot(player.position.x - landing.x, player.position.z - landing.z) <= radius + TANK_COLLISION_RADIUS) hurtPlayer('mortar');
      for (const item of [...levelData.breakableItems]) {
        if (cellDistance(landing.x, landing.z, item, tileSize) <= radius) handleBreakableHit(item);
      }
    }
  });
  shieldController?.update(delta, {
    camera,
    protectedCells: [
      ...(turretController?.getTargets() ?? []).filter((item) => shieldedAt(item.x, item.z)),
      ...(mortarController?.getTargets() ?? []).filter((item) => shieldedAt(item.x, item.z)),
      ...(bossController?.living() ?? []).filter((boss) => shieldedAt(boss.x, boss.z)).map((boss) => ({ x: boss.x, z: boss.z, span: 2 }))
    ]
  });
  droneController?.update(delta, {
    tileSize,
    playerPosition: player.position,
    alive: outcome === null,
    playerRadius: TANK_COLLISION_RADIUS,
    camera,
    stunned: stunnedAt,
    contactSeconds: DRONE_CONTACT_SECONDS,
    isTileBlocked: (tileX, tileZ, droneId) => {
      if (!levelData || tileX < 0 || tileZ < 0 || tileX >= levelData.size.width || tileZ >= levelData.size.depth) return true;
      if ((levelData.tiles[tileZ][tileX].floor || 0) > 0) return true;
      if (cellBlocked(tileX, tileZ, { ignoreDrones: true })) return true;
      return (droneController?.occupies(tileX, tileZ, droneId) ?? false) || hasPatrolAt(tileX, tileZ);
    },
    onContact: () => {
      if (player.droneCooldown > 0 || outcome) return;
      player.droneCooldown = DRONE_CONTACT_SECONDS;
      hurtPlayer('drone');
    }
  });
  turretController?.update(delta, {
    tileSize,
    playerPosition: player.position,
    alive: outcome === null,
    playerRadius: TANK_COLLISION_RADIUS,
    camera,
    isOccluder,
    stunned: stunnedAt,
    tryFire: (ownerId, origin, direction) => {
      const fired = projectileSystem?.tryFireHostile(ownerId, origin, direction);
      if (fired) soundManager?.playFire();
      return Boolean(fired);
    }
  });
  bossController?.update(delta, {
    tileSize,
    playerPosition: player.position,
    alive: outcome === null,
    playerRadius: TANK_COLLISION_RADIUS,
    camera,
    isOccluder,
    stunned: stunnedAt,
    isTileBlocked: (tileX, tileZ) => cellBlocked(tileX, tileZ, { ignoreBosses: true }) || hasDroneAt(tileX, tileZ) || hasPatrolAt(tileX, tileZ),
    tryFireVolley: (ownerId, origin, directions) => {
      const fired = projectileSystem?.tryFireHostileVolley(ownerId, origin, directions);
      if (fired) soundManager?.playFire();
      return Boolean(fired);
    }
  });
  nukeController?.update(delta);
  lifeController?.update(delta);
  grenadeController?.update(delta);
  keyController?.update(delta);
  grenadeFlight?.update(delta, detonateGrenade);
  blastController?.update(delta, tileSize);
  projectileSystem?.update(delta, levelData, {
    breakables: levelData?.breakableItems,
    turrets: [
      ...(turretController?.getTargets() ?? []),
      ...(bossController?.getTargets() ?? []),
      ...(droneController?.getTargets() ?? []),
      ...(patrolController?.getTargets() ?? []),
      ...(mortarController?.getTargets() ?? []),
      ...(shieldController?.getTargets() ?? [])
    ],
    gates: [...(levelData?.gates ?? []), ...(switchController?.blockingCells() ?? []), ...(crackedWallController?.cells() ?? [])],
    lasers: laserController?.getTargets() ?? [],
    onLaserHit: (laser) => {
      if (laserController?.destroy(laser.x, laser.z, laser.dir)) soundManager?.playBreak();
    },
    playerPosition: player.position,
    playerRadius: TANK_COLLISION_RADIUS,
    reflectShot: () => bubbleAbsorbs(),
    onBreakableHit: handleBreakableHit,
    onTurretHit: (turret, damage = 1) => {
      if (turret.kind === 'drone') droneController?.applyHit(turret, damage);
      else if (turret.kind === 'patrol') patrolController?.applyHit(turret, damage);
      else if (turret.kind === 'shield') shieldController?.applyHit(turret, damage);
      else if (shieldedAt(turret.x, turret.z)) {
        deflectHit(turret.x, turret.z);
        return;
      } else if (turret.kind === 'mortar') mortarController?.applyHit(turret, damage);
      else if (bossController?.covers(turret.x, turret.z)) bossController.applyHit(turret, damage);
      else turretController?.applyHit(turret, damage);
      soundManager?.playBreak();
    },
    onPlayerHit: (ownerId) => {
      const owner = typeof ownerId === 'string' ? ownerId : '';
      hurtPlayer(owner.startsWith('boss') ? 'boss' : owner.startsWith('patrol') ? 'patrol' : 'turret');
    }
  });
  const laserHit = laserController?.update(delta, player.position, TANK_COLLISION_RADIUS);
  if (laserHit && player.laserCooldown <= 0 && !outcome && player.hp > 0 && player.invulnerable <= 0) {
    player.laserCooldown = LASER_HIT_COOLDOWN;
    soundManager?.playLaser();
    hurtPlayer('laser');
  }
  coinsController?.update(delta);
  machineGunController?.update(delta);
  shieldPickupController?.update(delta);
  empPickupController?.update(delta);

  if (!outcome) {
    if (nukeController?.collectAtPosition(player.position)) {
      grantWeapon('nuke');
      soundManager?.playCoin();
    }
    if (machineGunController?.collectAtPosition(player.position)) {
      grantWeapon('machinegun');
      soundManager?.playCoin();
    }
    if (grenadeController?.collectAtPosition(player.position)) {
      grantWeapon('grenade');
      soundManager?.playCoin();
    }
    if (shieldPickupController?.collectAtPosition(player.position)) {
      grantWeapon('shield');
      soundManager?.playCoin();
    }
    if (empPickupController?.collectAtPosition(player.position)) {
      grantWeapon('emp');
      soundManager?.playCoin();
    }
    if (lifeController?.collectAtPosition(player.position)) {
      player.hp = player.maxHp;
      if (playerHealthFill) paintHealth(playerHealthFill, player.hp, player.maxHp);
      soundManager?.playCoin();
    }
    const collectedKey = keyController?.collectAtPosition(player.position);
    if (collectedKey) {
      const opened = gateController?.open(gateId(collectedKey));
      soundManager?.playKey();
      if (opened) soundManager?.playGate();
      setCheckpoint();
    }
    const coinResult = coinsController?.collectAtPosition(player.position);
    if (coinResult?.collected) {
      soundManager?.playCoin();
      updateCoinCounter();
      syncTankLevel(true);
      if (coinResult.won) {
        soundManager?.playVictory();
        showWinPopup(coinResult.total);
      }
    }
  }

  if (player.mesh) {
    syncMainCharacterMesh(player.mesh, player.position, player.direction);
    spinTankWeapon(player.mesh, delta);
    updateTankTransform(player.mesh, realDelta);
  }
  levelAura?.update(delta, player.position);
  updateSurfaces(realDelta);
  effects?.update(realDelta);
  ambientParticles?.update(realDelta, player.position);
  lightPool?.update(realDelta, player.position);
  drawGameMinimap();
  updateCamera();
  if (playerHealthBar) {
    playerHealthBar.position.set(player.position.x, player.position.y + 0.95, player.position.z);
    const dx = camera.position.x - playerHealthBar.position.x;
    const dz = camera.position.z - playerHealthBar.position.z;
    playerHealthBar.rotation.y = Math.atan2(dx, dz);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function init() {
  try {
    levelCatalog = await fetchJson('/games-3d/api/levels');
    const levelId = parseLevelParam(levelCatalog);
    currentLevelId = levelId;
    applyNextLevelLink();
    levelData = normalizeLevelData(await fetchJson(`/games-3d/api/levels/${levelId}`));
    levelNameEl.textContent = levelData.name || levelId;

    clock = new THREE.Clock();
    setupScene();
    soundManager = createSoundManager();
    projectileSystem = createProjectileSystem(scene);
    mapsManifest = await fetchJson('/games-3d/textures/maps/manifest.json').catch(() => null);

    const levelGroup = await buildLevelGeometry(levelData);
    if (!levelGroup) throw new Error('Level data is invalid, cannot render');
    attachLevel(levelGroup);
    await rebuildBreakables();

    propsBundle = buildProps(levelData, currentLook, { levelId });
    scene.add(propsBundle.group);
    lightPool = createLightPool(scene, 6);
    lightPool.setEmitters([...propsBundle.emitters, ...levelEmitters(levelData)]);
    ambientParticles = currentLook.particles ? createAmbientParticles(scene, currentLook.particles, currentLook) : null;
    effects = createEffects(scene, { floorYAt });
    projectileSystem.onExplosion((point) => effects?.impact(point, 'small'));

    coinsController = createCoinsController(levelData, tileSize, heightStep);
    scene.add(coinsController.group);
    updateCoinCounter();
    machineGunController = createMachineGunController(levelData, tileSize, heightStep);
    scene.add(machineGunController.group);
    nukeController = createNukeController(levelData, tileSize, heightStep);
    scene.add(nukeController.group);
    lifeController = createLifeController(levelData, tileSize, heightStep);
    scene.add(lifeController.group);
    grenadeController = createGrenadeController(levelData, tileSize, heightStep);
    scene.add(grenadeController.group);
    grenadeFlight = createGrenadeFlight(scene, levelData, tileSize, heightStep);
    levelAura = createLevelAuraController(scene);
    blastController = createBlastController(scene);
    empController = createEmpController(scene);
    shieldPickupController = createPickupController(levelData, 'shieldProjectors', tileSize, heightStep, createShieldProjectorMesh, 0.02);
    scene.add(shieldPickupController.group);
    empPickupController = createPickupController(levelData, 'emps', tileSize, heightStep, createEmpMesh, 0.02);
    scene.add(empPickupController.group);
    switchController = createSwitchController(levelData, tileSize, heightStep, {
      getMaterial,
      isForcedOpen: (x, z) => stunnedAt((x + 0.5) * tileSize, (z + 0.5) * tileSize),
      onToggle: (id, on) => {
        laserController?.setGroupEnabled(id, !on);
        soundManager?.playGate();
      },
      onPress: () => soundManager?.playKey()
    });
    scene.add(switchController.group);
    floorPieceController = createFloorPieceController(levelData, tileSize, heightStep);
    scene.add(floorPieceController.group);
    crackedWallController = createCrackedWallController(levelData, tileSize, heightStep);
    scene.add(crackedWallController.group);
    laserController = createLaserController(levelData, tileSize, { isBlocked: (x, z) => hasSolidPieceAt(x, z), isSuppressed: stunnedAt });
    scene.add(laserController.group);
    const playerHealth = makeHealthBar();
    playerHealthBar = playerHealth.group;
    playerHealthFill = playerHealth.fill;
    scene.add(playerHealthBar);
    paintHealth(playerHealthFill, PLAYER_MAX_HP, PLAYER_MAX_HP);
    keyController = createKeyController(levelData, tileSize, heightStep);
    scene.add(keyController.group);
    gateController = createGateController(levelData, tileSize, heightStep);
    scene.add(gateController.group);
    droneController = createDroneController(scene, levelData);
    turretController = createTurretController(scene, levelData, { onDeath: releaseGuardianDrop, onHit: (turret) => flashObject(turret.root) });
    bossController = createBossController(scene, levelData, {
      onDeath: (boss) => {
        releaseGuardianDrop(boss);
        slowMo = SLOWMO_SECONDS;
        startShake(0.7, 0.28);
      },
      onEnrage: releaseBossDrone,
      onHit: (boss) => flashObject(boss.body)
    });
    droneController.onHit = (drone) => flashObject(drone.mesh);
    patrolController = createPatrolController(scene, levelData, { onDeath: releaseGuardianDrop, onHit: (patrol) => flashObject(patrol.mesh.userData.body) });
    mortarController = createMortarController(scene, levelData, { onDeath: releaseGuardianDrop, onHit: (mortar) => flashObject(mortar.mesh.userData.pivot) });
    shieldController = createShieldController(scene, levelData, { onHit: (shield) => flashObject(shield.mesh.userData.orb) });
    if (minimapEl && shouldShowMinimap(levelData.size.width, levelData.size.depth)) {
      const scale = Math.min(2, window.devicePixelRatio || 1);
      minimapEl.width = Math.round(168 * scale);
      minimapEl.height = Math.round(168 * scale);
      minimapEl.hidden = false;
      minimapFog = createMinimapFog();
    }
    retryBtn?.addEventListener('click', () => window.location.reload());

    const playerMesh = createPlayer(levelData);
    scene.add(playerMesh);
    camera.position.copy(player.position).add(new THREE.Vector3(0, 4, -8));
    camera.lookAt(player.position);
    if (new URLSearchParams(window.location.search).get('intro') !== '0') intro = { t: 0, duration: 2.4, roofed: isRoofed(levelData) };

    onResize();
    window.__tank = {
      player,
      stats,
      level: () => levelData,
      upgrade: (level) => upgradeTank(player.mesh, level),
      grant: (weapon) => grantWeapon(weapon),
      syncLevel: () => syncTankLevel(true),
      hurt: (source = 'turret') => hurtPlayer(source),
      teleport: (x, z) => { player.position.x = x; player.position.z = z; },
      coins: () => coinsController,
      cameraOffset,
      controllers: () => ({ patrolController, mortarController, shieldController, switchController, floorPieceController, crackedWallController, laserController, turretController, bossController, empController, droneController }),
      bubble: () => bubble && { hits: bubble.hits, remaining: +bubble.remaining.toFixed(2) },
      camera: () => ({ pos: camera.position.toArray(), player: player.position.toArray(), dir: player.direction, fov: camera.fov, aspect: camera.aspect }),
      state: () => ({ outcome, hp: player.hp, lives: player.lives, tier: player.mesh?.userData.tier, transform: Boolean(player.mesh?.userData.transform), time: levelTime }),
      look: () => ({ theme: levelData?.theme || null, particles: currentLook.particles, props: propsBundle?.counts, emitters: lightPool?.count(), animatedTextures: animatedTextures.length, maps: Boolean(mapsManifest) }),
      skipIntro: () => { intro = null; },
      intro: () => intro,
      effects: () => effects
    };
    animate();
  } catch (err) {
    console.error(err);
    levelNameEl.textContent = 'Failed to load level';
  }
}

init();
