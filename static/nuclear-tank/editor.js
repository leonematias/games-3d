import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createLaserMarker } from './lasers.js';
import { createBossMesh } from './bosses.js';
import { laserStep } from './laser-logic.js';
import { createNukeMesh } from './nukes.js';
import { createLifeMesh } from './lives.js';
import { createGrenadePickupMesh } from './grenades.js';
import { createDroneMesh } from './drones.js';
import { createGateMesh, createKeyMesh } from './locks.js';
import { woodBoxTextureFor } from './box-textures.js';
import { applyBrushFields, brushMatches, lockIdOf } from './brush-fields.js';
import { createPatrolMesh } from './patrols.js';
import { createMortarMesh } from './mortars.js';
import { createShieldMesh } from './shields.js';
import { createConveyorMesh, createCrackedWallMesh, createOneWayMesh, createSwitchMesh, createToggleWallMesh } from './interactive.js';
import { createEmpMesh, createShieldProjectorMesh } from './pickups.js';

const levelSelect = document.getElementById('levelSelect');
const loadLevelBtn = document.getElementById('loadLevelBtn');
const newLevelBtn = document.getElementById('newLevelBtn');
const saveLevelBtn = document.getElementById('saveLevelBtn');
const saveAsLevelBtn = document.getElementById('saveAsLevelBtn');
const reloadTexturesBtn = document.getElementById('reloadTexturesBtn');
const playLevelBtn = document.getElementById('playLevelBtn');
const levelIdInput = document.getElementById('levelIdInput');
const levelNameInput = document.getElementById('levelNameInput');
const tileSizeInput = document.getElementById('tileSizeInput');
const heightStepInput = document.getElementById('heightStepInput');
const widthInput = document.getElementById('widthInput');
const depthInput = document.getElementById('depthInput');
const resizeBtn = document.getElementById('resizeBtn');
const spawnXInput = document.getElementById('spawnX');
const spawnYInput = document.getElementById('spawnY');
const spawnZInput = document.getElementById('spawnZ');
const spawnRotInput = document.getElementById('spawnRot');
const setSpawnFromSelectionBtn = document.getElementById('setSpawnFromSelectionBtn');
const toolSelect = document.getElementById('toolSelect');
const dropField = document.getElementById('dropField');
const dropSelect = document.getElementById('dropSelect');
const lockIdField = document.getElementById('lockIdField');
const lockIdInput = document.getElementById('lockIdInput');
const brushFeatureHint = document.getElementById('brushFeatureHint');
const brushSizeSelect = document.getElementById('brushSizeSelect');
const heightModeSelect = document.getElementById('heightModeSelect');
const heightValueInput = document.getElementById('heightValueInput');
const floorTexSelect = document.getElementById('floorTexSelect');
const wallTexSelect = document.getElementById('wallTexSelect');
const ceilingTexSelect = document.getElementById('ceilingTexSelect');
const floorTexPreview = document.getElementById('floorTexPreview');
const wallTexPreview = document.getElementById('wallTexPreview');
const ceilingTexPreview = document.getElementById('ceilingTexPreview');
const selectedTileInfo = document.getElementById('selectedTileInfo');
const statusBar = document.getElementById('statusBar');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatUndoBtn = document.getElementById('chatUndoBtn');
const chatClearBtn = document.getElementById('chatClearBtn');
const canvasContainer = document.getElementById('canvasContainer');
const camZoomInBtn = document.getElementById('camZoomIn');
const camZoomOutBtn = document.getElementById('camZoomOut');
const camMoveLeftBtn = document.getElementById('camMoveLeft');
const camMoveRightBtn = document.getElementById('camMoveRight');
const camMoveUpBtn = document.getElementById('camMoveUp');
const camMoveDownBtn = document.getElementById('camMoveDown');
const camRotateLeftBtn = document.getElementById('camRotateLeft');
const camRotateRightBtn = document.getElementById('camRotateRight');

const textureLoader = new THREE.TextureLoader();
const materialCache = new Map();
const fallbackMaterials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xcc3366, side: THREE.DoubleSide }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x555577 }),
  breakable: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
  coin: new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x5f4304, roughness: 0.35 }),
  turretBase: new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.5, metalness: 0.3 }),
  turretBarrel: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.32, metalness: 0.7 }),
  machineGun: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.4 }),
  machineGunBarrel: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.75, roughness: 0.28 }),
  machineGunMag: new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.45, roughness: 0.42 }),
  dropCoin: new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x5f4304, roughness: 0.35 }),
  dropBigCoin: new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, roughness: 0.35 })
};

const FLOOR_LISTS = ['breakableItems', 'coins', 'bigCoins', 'turrets', 'machineGuns', 'nukes', 'lives', 'grenades', 'drones', 'keys', 'gates', 'patrols', 'mortars', 'shields', 'switches', 'toggleWalls', 'oneWays', 'conveyors', 'crackedWalls', 'shieldProjectors', 'emps'];
const DIRECTIONAL_LISTS = ['oneWays', 'conveyors'];
const MAX_UNDO = 10;
const DRAG_THRESHOLD = 5;

const editorState = {
  levelsList: [],
  currentLevelId: null,
  currentLevelData: null,
  texturesCatalog: { floor: [], wall: [], ceiling: [], all: [] },
  selectedTile: { x: null, z: null },
  currentTool: 'height',
  brushSize: 1,
  heightToolMode: 'raise',
  heightToolValue: 0,
  selectedFloorTexId: null,
  selectedWallTexId: null,
  selectedCeilingTexId: null,
  hasUnsavedChanges: false,
  undoStack: []
};

let scene, camera, renderer, controls, clock, raycaster;
let levelGroup = null;
let highlightMesh = null;
let spawnMarker = null;
let pointer = new THREE.Vector2();
let isMouseDown = false;
let isDragging = false;
let mouseDownPos = { x: 0, y: 0 };
let chatHistory = [];
let chatUndoLevel = null;
let chatBusy = false;

function setStatus(text) {
  if (statusBar) statusBar.textContent = text;
}

function showPanelTab(name) {
  for (const tab of document.querySelectorAll('.panel-tab')) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const panel of document.querySelectorAll('.panel-tab-panel')) {
    panel.classList.toggle('is-active', panel.dataset.panel === name);
  }
}

function resetLevelChat() {
  chatHistory = [];
  chatUndoLevel = null;
  chatBusy = false;
  if (chatLog) chatLog.replaceChildren();
  if (chatInput) chatInput.disabled = false;
  if (chatSendBtn) chatSendBtn.disabled = false;
  if (chatUndoBtn) chatUndoBtn.disabled = true;
}

function appendChatEntry(role, text) {
  const item = document.createElement('div');
  item.className = `chat-entry is-${role}`;
  const who = document.createElement('div');
  who.className = 'chat-who';
  who.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'AI' : 'Error';
  const body = document.createElement('div');
  body.className = 'chat-body';
  body.textContent = text;
  item.append(who, body);
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendLevelChat() {
  const text = chatInput.value.trim();
  if (!text || chatBusy || !editorState.currentLevelData) {
    if (!editorState.currentLevelData) setStatus('Load a level before chatting');
    return;
  }
  chatBusy = true;
  chatSendBtn.disabled = true;
  chatInput.disabled = true;
  appendChatEntry('user', text);
  chatInput.value = '';
  const prior = chatHistory.slice();
  setStatus('Asking the model…');
  try {
    const res = await fetch('/games-3d/nuclear-tank/api/level-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: editorState.currentLevelData,
        message: text,
        history: prior
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed ${res.status}`);
    chatHistory = prior.concat([
      { role: 'user', content: text },
      { role: 'assistant', content: data.message || 'Updated the level.' }
    ]);
    appendChatEntry('assistant', data.message || 'Updated the level.');
    if (Array.isArray(data.edits) && data.edits.length && data.level) {
      chatUndoLevel = structuredClone(editorState.currentLevelData);
      editorState.currentLevelData = ensureLevelExtras(data.level);
      editorState.undoStack = [];
      chatUndoBtn.disabled = false;
      syncFormInputs();
      await rebuildLevel({ preserveView: true });
      markDirty(true);
      setStatus(`Applied ${data.edits.length} edit${data.edits.length === 1 ? '' : 's'}`);
    } else {
      setStatus('The model made no edits');
    }
  } catch (err) {
    console.error(err);
    appendChatEntry('error', err.message || 'The model request failed');
    setStatus('Level chat failed');
  } finally {
    chatBusy = false;
    chatSendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

async function undoLevelChat() {
  if (!chatUndoLevel) return;
  editorState.currentLevelData = chatUndoLevel;
  chatUndoLevel = null;
  chatUndoBtn.disabled = true;
  editorState.undoStack = [];
  syncFormInputs();
  await rebuildLevel({ preserveView: true });
  markDirty(true);
  setStatus('Restored the level from before the last AI edit');
}

function ensureLevelExtras(level) {
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

function fetchJson(url, options) {
  return fetch(url, options).then(async (res) => {
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `Request failed ${res.status}`);
    }
    return res.json();
  });
}

function normalizeTextureUrl(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/')) return url;
  return `/${url.replace(/^\/+/, '')}`;
}

function cloneTile(tile) {
  return {
    floor: tile.floor ?? 0,
    ceiling: tile.ceiling ?? 4,
    floorTex: tile.floorTex ?? null,
    wallTex: tile.wallTex ?? null,
    ceilingTex: tile.ceilingTex ?? null
  };
}

function tilesEqual(a, b) {
  return a.floor === b.floor
    && a.ceiling === b.ceiling
    && a.floorTex === b.floorTex
    && a.wallTex === b.wallTex
    && a.ceilingTex === b.ceilingTex;
}

function setTexturePreview(element, textureUrl) {
  if (!element) return;
  const normalized = normalizeTextureUrl(textureUrl);
  if (!normalized) {
    element.style.backgroundImage = '';
    element.classList.add('is-empty');
    return;
  }
  element.style.backgroundImage = `url("${normalized}")`;
  element.classList.remove('is-empty');
}

function syncTexturePreviews() {
  setTexturePreview(floorTexPreview, editorState.selectedFloorTexId);
  setTexturePreview(wallTexPreview, editorState.selectedWallTexId);
  setTexturePreview(ceilingTexPreview, editorState.selectedCeilingTexId);
}

async function getMaterial(texUrl, type) {
  const normalized = normalizeTextureUrl(texUrl);
  if (!normalized) return fallbackMaterials[type];
  if (materialCache.has(normalized)) return materialCache.get(normalized);

  const promise = new Promise((resolve) => {
    textureLoader.load(
      normalized,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          side: type === 'wall' ? THREE.DoubleSide : THREE.FrontSide
        });
        materialCache.set(normalized, mat);
        resolve(mat);
      },
      undefined,
      () => resolve(fallbackMaterials[type])
    );
  });
  materialCache.set(normalized, promise);
  return promise;
}

function disposeLevelGroup(group) {
  group.traverse((obj) => {
    if (obj.isMesh && obj.geometry) obj.geometry.dispose();
  });
}

function buildHighlight() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

function buildSpawnMarker() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x4c0519 })
  );
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

async function createFloorMesh(tile, x, z, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const safeFloor = Math.max(0, tile.floor || 0);
  const worldX = x * tileSize + tileSize / 2;
  const worldZ = z * tileSize + tileSize / 2;
  const material = await getMaterial(tile.floorTex, 'floor');

  let mesh;
  if (safeFloor === 0) {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX, 0, worldZ);
  } else {
    const wallMaterial = await getMaterial(tile.wallTex, 'wall');
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tileSize, safeFloor * heightStep, tileSize),
      [wallMaterial, wallMaterial, material, wallMaterial, wallMaterial, wallMaterial]
    );
    mesh.position.set(worldX, (safeFloor * heightStep) / 2, worldZ);
    mesh.castShadow = true;
  }
  mesh.receiveShadow = true;
  mesh.userData = { tileX: x, tileZ: z };
  return mesh;
}

async function createCeilingMesh(tile, x, z, level) {
  if (typeof tile.ceiling !== 'number') return null;
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  if (tile.ceiling <= (tile.floor || 0)) return null;
  const material = await getMaterial(tile.ceilingTex, 'ceiling');
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x * tileSize + tileSize / 2, tile.ceiling * heightStep, z * tileSize + tileSize / 2);
  mesh.receiveShadow = true;
  return mesh;
}

async function createBreakableMesh(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile) return null;
  const material = await getMaterial(woodBoxTextureFor(item), 'breakable');
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(tileSize, heightStep, tileSize), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(
    item.x * tileSize + tileSize / 2,
    Math.max(0, tile.floor || 0) * heightStep + heightStep / 2,
    item.z * tileSize + tileSize / 2
  );
  return mesh;
}

function createMachineGunMarker(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile) return null;
  const group = new THREE.Group();
  const floorY = Math.max(0, tile.floor || 0) * heightStep;
  group.position.set(item.x * tileSize + tileSize / 2, floorY + 0.08, item.z * tileSize + tileSize / 2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.42), fallbackMaterials.machineGun);
  body.position.set(0, 0.22, 0.02);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.64, 12), fallbackMaterials.machineGunBarrel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.26, 0.5);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.12), fallbackMaterials.machineGunMag);
  magazine.position.set(0, 0.1, 0.04);
  group.add(body, barrel, magazine);
  return group;
}

const laserSwitchField = document.getElementById('laserSwitchField');
const laserSwitchSelect = document.getElementById('laserSwitchSelect');

function currentBrush() {
  return { drop: dropSelect?.value || '', lockId: lockIdInput?.value || '', laserSwitch: laserSwitchSelect?.value || '' };
}

function syncBrushFields() {
  const tool = editorState.currentTool;
  const showDrop = tool === 'turrets' || tool === 'bosses' || tool === 'patrols' || tool === 'mortars';
  const showLock = tool === 'keys' || tool === 'gates' || tool === 'switches' || tool === 'toggleWalls';
  const showLaserSwitch = tool === 'lasers';
  if (dropField) dropField.hidden = !showDrop;
  if (lockIdField) lockIdField.hidden = !showLock;
  if (laserSwitchField) laserSwitchField.hidden = !showLaserSwitch;
  if (!brushFeatureHint) return;
  const hints = {
    turrets: 'The drop appears when this enemy dies and already counts toward the coins.',
    bosses: 'The drop appears when this enemy dies and already counts toward the coins.',
    patrols: 'Click places a patrol tank; shift-click open cells to add waypoints to the last patrol. It drives the loop back and forth.',
    mortars: 'Lobs shells over walls at the last place it saw the tank. The drop counts toward the coins.',
    shields: 'Turrets, mortars and bosses within 4 cells ignore everything but nukes while this stands.',
    keys: 'A red key opens every red door. Blue and yellow work the same way.',
    gates: 'A red key opens every red door. Blue and yellow work the same way.',
    switches: 'Driving over the plate flips every toggle wall and switch-tied laser of the same color.',
    toggleWalls: 'Raised until a switch of the same color is pressed; pressing again raises it.',
    lasers: 'Tie the laser to a switch color and it goes dark while that switch is on.',
    oneWays: 'The tank can only cross in the arrow direction. Click again to rotate, and once more past -x to remove.',
    conveyors: 'Pushes the tank along the arrow. Click again to rotate, and once more past -x to remove.',
    crackedWalls: 'Blocks shots and driving. Only nukes and grenades break it.',
    shieldProjectors: 'Weapon pickup: raises a bubble that absorbs three hits and bounces shells back.',
    emps: 'Weapon pickup: freezes enemies, lasers and toggle walls within six cells for a few seconds.'
  };
  brushFeatureHint.hidden = !hints[tool];
  brushFeatureHint.textContent = hints[tool] || '';
}

function addDropGem(group, drop, y) {
  if (drop !== 'coin' && drop !== 'bigCoin') return;
  const gem = new THREE.Mesh(
    new THREE.SphereGeometry(drop === 'bigCoin' ? 0.16 : 0.1, 12, 10),
    drop === 'bigCoin' ? fallbackMaterials.dropBigCoin : fallbackMaterials.dropCoin
  );
  gem.position.y = y;
  gem.castShadow = true;
  group.add(gem);
}

function createFloorMarker(item, level, mesh, lift) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile || !mesh) return null;
  const floorY = Math.max(0, tile.floor || 0) * heightStep;
  mesh.position.set(item.x * tileSize + tileSize / 2, floorY + lift, item.z * tileSize + tileSize / 2);
  return mesh;
}

function createLifeMarker(item, level) {
  return createFloorMarker(item, level, createLifeMesh(), 0);
}

function createGrenadeMarker(item, level) {
  return createFloorMarker(item, level, createGrenadePickupMesh(), 0.02);
}

function createNukeMarker(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile) return null;
  const mesh = createNukeMesh();
  const floorY = Math.max(0, tile.floor || 0) * heightStep;
  mesh.position.set(item.x * tileSize + tileSize / 2, floorY + 0.04, item.z * tileSize + tileSize / 2);
  return mesh;
}

function createTurretMarker(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile) return null;
  const group = new THREE.Group();
  const floorY = Math.max(0, tile.floor || 0) * heightStep;
  group.position.set(item.x * tileSize + tileSize / 2, floorY, item.z * tileSize + tileSize / 2);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.22, 16), fallbackMaterials.turretBase);
  base.position.y = 0.11;
  base.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 10), fallbackMaterials.turretBarrel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.4, 0.28);
  barrel.castShadow = true;
  group.add(base, barrel);
  addDropGem(group, item.drop, 0.9);
  return group;
}

function createCoinMesh(item, level, big) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles[item.z]?.[item.x];
  if (!tile) return null;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(big ? 0.28 : 0.14, 16, 16),
    fallbackMaterials.coin
  );
  mesh.castShadow = true;
  mesh.position.set(
    item.x * tileSize + tileSize / 2,
    Math.max(0, tile.floor || 0) * heightStep + (big ? 0.56 : 0.42),
    item.z * tileSize + tileSize / 2
  );
  return mesh;
}

async function buildLevelGroup(level) {
  const group = new THREE.Group();
  for (let z = 0; z < level.size.depth; z++) {
    for (let x = 0; x < level.size.width; x++) {
      const tile = level.tiles[z][x];
      group.add(await createFloorMesh(tile, x, z, level));
      const ceiling = await createCeilingMesh(tile, x, z, level);
      if (ceiling) group.add(ceiling);
    }
  }

  for (const item of level.breakableItems) {
    const mesh = await createBreakableMesh(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.coins) {
    const mesh = createCoinMesh(item, level, false);
    if (mesh) group.add(mesh);
  }
  for (const item of level.bigCoins) {
    const mesh = createCoinMesh(item, level, true);
    if (mesh) group.add(mesh);
  }
  for (const item of level.turrets) {
    const mesh = createTurretMarker(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.bosses) {
    const mesh = createBossMesh(item, level);
    if (mesh?.root) {
      addDropGem(mesh.root, item.drop, 1.75);
      group.add(mesh.root);
    }
  }
  for (const item of level.machineGuns) {
    const mesh = createMachineGunMarker(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.nukes) {
    const mesh = createNukeMarker(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.lives) {
    const mesh = createLifeMarker(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.grenades) {
    const mesh = createGrenadeMarker(item, level);
    if (mesh) group.add(mesh);
  }
  for (const item of level.drones) {
    const mesh = createFloorMarker(item, level, createDroneMesh(), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.keys) {
    const mesh = createFloorMarker(item, level, createKeyMesh(lockIdOf(item)), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.gates) {
    const mesh = createFloorMarker(item, level, createGateMesh(lockIdOf(item)), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.lasers) {
    const mesh = createLaserMarker(item, level);
    if (mesh) group.add(mesh);
  }
  const tileSize = level.tileSize || 1;
  for (const item of level.patrols) {
    const mesh = createFloorMarker(item, level, createPatrolMesh(), 0);
    if (mesh) group.add(mesh);
    for (const stop of item.path || []) {
      const post = createFloorMarker(stop, level, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), fallbackMaterials.dropCoin), 0.25);
      if (post) group.add(post);
    }
  }
  for (const item of level.mortars) {
    const mesh = createFloorMarker(item, level, createMortarMesh(), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.shields) {
    const mesh = createFloorMarker(item, level, createShieldMesh(), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.switches) {
    const mesh = createFloorMarker(item, level, createSwitchMesh(lockIdOf(item)), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.toggleWalls) {
    const tile = level.tiles[item.z]?.[item.x];
    const mesh = createFloorMarker(item, level, createToggleWallMesh(lockIdOf(item), tile?.wallTex, getMaterial), item.open ? -0.7 : 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.oneWays) {
    const mesh = createFloorMarker(item, level, createOneWayMesh(item.dir, tileSize), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.conveyors) {
    const mesh = createFloorMarker(item, level, createConveyorMesh(item.dir, tileSize), 0);
    if (mesh) group.add(mesh);
  }
  for (const item of level.crackedWalls) {
    const mesh = createFloorMarker(item, level, createCrackedWallMesh(), 0.5);
    if (mesh) group.add(mesh);
  }
  for (const item of level.shieldProjectors) {
    const mesh = createFloorMarker(item, level, createShieldProjectorMesh(), 0.02);
    if (mesh) group.add(mesh);
  }
  for (const item of level.emps) {
    const mesh = createFloorMarker(item, level, createEmpMesh(), 0.02);
    if (mesh) group.add(mesh);
  }
  return group;
}

function setupThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  camera = new THREE.PerspectiveCamera(60, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.set(8, 8, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.shadowMap.enabled = true;
  canvasContainer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(6, 0, 6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(5, 10, 3);
  dir.castShadow = true;
  scene.add(dir);

  highlightMesh = buildHighlight();
  spawnMarker = buildSpawnMarker();
  scene.add(highlightMesh);
  scene.add(spawnMarker);

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onResize() {
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update(clock.getDelta());
  renderer.render(scene, camera);
}

function updateSelectedTileInfo() {
  const { x, z } = editorState.selectedTile;
  const level = editorState.currentLevelData;
  if (x === null || z === null || !level) {
    selectedTileInfo.textContent = 'No selection';
    return;
  }
  const tile = level.tiles[z][x];
  const hasBreakable = level.breakableItems.some((item) => item.x === x && item.z === z);
  const hasCoin = level.coins.some((item) => item.x === x && item.z === z);
  const hasBigCoin = level.bigCoins.some((item) => item.x === x && item.z === z);
  const turret = level.turrets.find((item) => item.x === x && item.z === z);
  const boss = level.bosses.find((item) => x >= item.x && x < item.x + 2 && z >= item.z && z < item.z + 2);
  const hasMachineGun = level.machineGuns.some((item) => item.x === x && item.z === z);
  const hasNuke = level.nukes.some((item) => item.x === x && item.z === z);
  const hasLife = level.lives.some((item) => item.x === x && item.z === z);
  const hasGrenade = level.grenades.some((item) => item.x === x && item.z === z);
  const hasDrone = level.drones.some((item) => item.x === x && item.z === z);
  const key = level.keys.find((item) => item.x === x && item.z === z);
  const gate = level.gates.find((item) => item.x === x && item.z === z);
  const laser = level.lasers.find((item) => item.x === x && item.z === z);
  const extras = ['patrols', 'mortars', 'shields', 'switches', 'toggleWalls', 'oneWays', 'conveyors', 'crackedWalls', 'shieldProjectors', 'emps']
    .map((name) => {
      const found = level[name].find((item) => item.x === x && item.z === z);
      if (!found) return null;
      const detail = found.id ? lockIdOf(found) : Number.isInteger(found.dir) ? `dir ${found.dir}` : found.path ? `${found.path.length} stops` : 'yes';
      return `${name}:${detail}`;
    })
    .filter(Boolean)
    .join(' ');
  selectedTileInfo.textContent =
    `x:${x} z:${z}\n` +
    `floor:${tile.floor} ceiling:${tile.ceiling}\n` +
    `floorTex:${tile.floorTex || '-'}\n` +
    `wallTex:${tile.wallTex || '-'}\n` +
    `ceilingTex:${tile.ceilingTex || '-'}\n` +
    `breakable:${hasBreakable ? 'yes' : 'no'} coin:${hasCoin ? 'yes' : 'no'} big:${hasBigCoin ? 'yes' : 'no'} turret:${turret ? (turret.drop || 'none') : 'no'} boss:${boss ? (boss.drop || 'none') : 'no'} gun:${hasMachineGun ? 'yes' : 'no'} nuke:${hasNuke ? 'yes' : 'no'} life:${hasLife ? 'yes' : 'no'} grenade:${hasGrenade ? 'yes' : 'no'} drone:${hasDrone ? 'yes' : 'no'} key:${key ? lockIdOf(key) : 'no'} gate:${gate ? lockIdOf(gate) : 'no'} laser:${laser ? `${laser.dir}${laser.switch ? ' switch ' + laser.switch : ''}` : 'no'}${extras ? '\n' + extras : ''}`;
}

function updateHighlight() {
  const { x, z } = editorState.selectedTile;
  const level = editorState.currentLevelData;
  if (x === null || z === null || !level) {
    highlightMesh.visible = false;
    return;
  }
  const tile = level.tiles[z][x];
  const floorY = Math.max(0, tile.floor || 0) * (level.heightStep || 1) + 0.02;
  const tileSize = level.tileSize || 1;
  const { width, depth } = brushSpan(editorState.brushSize);
  highlightMesh.scale.set(tileSize * width, tileSize * depth, 1);
  highlightMesh.position.set(x * tileSize + tileSize / 2, floorY, z * tileSize + tileSize / 2);
  highlightMesh.visible = true;
}

function updateSpawnMarker() {
  const spawn = editorState.currentLevelData?.playerSpawn;
  if (!spawn) {
    spawnMarker.visible = false;
    return;
  }
  spawnMarker.position.set(spawn.x, spawn.y, spawn.z);
  spawnMarker.visible = true;
}

function setSelection(tile) {
  editorState.selectedTile = tile;
  updateHighlight();
  updateSelectedTileInfo();
}

function markDirty(dirty = true) {
  editorState.hasUnsavedChanges = dirty;
  if (!dirty && editorState.undoStack.length > MAX_UNDO) {
    editorState.undoStack = editorState.undoStack.slice(-MAX_UNDO);
  }
  setStatus(dirty ? 'Unsaved changes' : 'All changes saved');
}

function getTileFromIntersection(point) {
  const level = editorState.currentLevelData;
  if (!level) return null;
  const tileSize = level.tileSize || 1;
  const x = Math.floor(point.x / tileSize);
  const z = Math.floor(point.z / tileSize);
  if (x < 0 || z < 0 || x >= level.size.width || z >= level.size.depth) return null;
  return { x, z };
}

function pointerToTile(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(levelGroup ? levelGroup.children : [], true);
  if (!intersects.length) return null;
  return getTileFromIntersection(intersects[0].point);
}

function onPointerDown(e) {
  editorState.shiftHeld = Boolean(e.shiftKey);
  if (e.button !== 0) return;
  isMouseDown = true;
  isDragging = false;
  mouseDownPos = { x: e.clientX, y: e.clientY };
}

function onPointerMove(e) {
  if (!isMouseDown) return;
  if (Math.abs(e.clientX - mouseDownPos.x) > DRAG_THRESHOLD || Math.abs(e.clientY - mouseDownPos.y) > DRAG_THRESHOLD) {
    isDragging = true;
  }
}

function onPointerUp(e) {
  if (!isMouseDown) return;
  if (!isDragging && e.button === 0) {
    const tile = pointerToTile(e);
    if (tile) handleTool(tile);
  }
  isMouseDown = false;
  isDragging = false;
}

async function rebuildLevel({ preserveView = true } = {}) {
  if (!editorState.currentLevelData) return;
  if (levelGroup) {
    scene.remove(levelGroup);
    disposeLevelGroup(levelGroup);
  }
  levelGroup = await buildLevelGroup(editorState.currentLevelData);
  scene.add(levelGroup);
  updateHighlight();
  updateSpawnMarker();
  updateSelectedTileInfo();
  if (!preserveView) frameLevel();
}

function frameLevel() {
  const level = editorState.currentLevelData;
  if (!level) return;
  const tileSize = level.tileSize || 1;
  const centerX = (level.size.width * tileSize) / 2;
  const centerZ = (level.size.depth * tileSize) / 2;
  controls.target.set(centerX, 0, centerZ);
  const offset = Math.max(level.size.width, level.size.depth) * tileSize * 0.8;
  camera.position.set(centerX + offset, offset, centerZ + offset);
}

function brushSpan(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (match) return { width: Number(match[1]), depth: Number(match[2]) };
  const size = Number(value) || 1;
  return { width: size, depth: size };
}

function applyBrush(center, fn) {
  const level = editorState.currentLevelData;
  const { width, depth } = brushSpan(editorState.brushSize);
  const halfX = Math.floor(width / 2);
  const halfZ = Math.floor(depth / 2);
  for (let dz = -halfZ; dz <= halfZ; dz++) {
    for (let dx = -halfX; dx <= halfX; dx++) {
      const tx = center.x + dx;
      const tz = center.z + dz;
      if (tx < 0 || tz < 0 || tx >= level.size.width || tz >= level.size.depth) continue;
      fn(tx, tz, level.tiles[tz][tx]);
    }
  }
}

function pushUndoAction(changes) {
  if (!changes.length) return;
  editorState.undoStack.push(changes);
  if (editorState.undoStack.length > MAX_UNDO) editorState.undoStack.shift();
}

async function applyBrushMutation(center, mutator) {
  const changes = [];
  applyBrush(center, (x, z, tile) => {
    const before = cloneTile(tile);
    mutator(tile, x, z);
    const after = cloneTile(tile);
    if (!tilesEqual(before, after)) changes.push({ x, z, before, after });
  });
  if (!changes.length) return;
  pushUndoAction(changes);
  markDirty(true);
  await rebuildLevel();
}

async function applyHeightTool(tileCoord) {
  const mode = editorState.heightToolMode;
  const value = Number(heightValueInput.value) || 0;
  await applyBrushMutation(tileCoord, (tile) => {
    if (mode === 'raise') tile.floor = Math.min(10, (tile.floor || 0) + 1);
    else if (mode === 'lower') tile.floor = Math.max(0, (tile.floor || 0) - 1);
    else tile.floor = Math.max(0, Math.min(20, value));
    tile.ceiling = Math.max(tile.ceiling ?? tile.floor + 4, tile.floor + 1);
  });
}

async function applyTextureTool(tileCoord) {
  await applyBrushMutation(tileCoord, (tile) => {
    if (editorState.selectedFloorTexId) tile.floorTex = editorState.selectedFloorTexId;
    if (editorState.selectedWallTexId) tile.wallTex = editorState.selectedWallTexId;
    if (editorState.selectedCeilingTexId) tile.ceilingTex = editorState.selectedCeilingTexId;
  });
}

async function applyHeightTextureTool(tileCoord) {
  const mode = editorState.heightToolMode;
  const value = Number(heightValueInput.value) || 0;
  await applyBrushMutation(tileCoord, (tile) => {
    if (mode === 'raise') tile.floor = Math.min(10, (tile.floor || 0) + 1);
    else if (mode === 'lower') tile.floor = Math.max(0, (tile.floor || 0) - 1);
    else tile.floor = Math.max(0, Math.min(20, value));
    tile.ceiling = Math.max(tile.ceiling ?? tile.floor + 4, tile.floor + 1);
    if (editorState.selectedFloorTexId) tile.floorTex = editorState.selectedFloorTexId;
    if (editorState.selectedWallTexId) tile.wallTex = editorState.selectedWallTexId;
    if (editorState.selectedCeilingTexId) tile.ceilingTex = editorState.selectedCeilingTexId;
  });
}

function applySpawnTool(tileCoord) {
  const level = editorState.currentLevelData;
  const tile = level.tiles[tileCoord.z][tileCoord.x];
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  level.playerSpawn = {
    x: tileCoord.x * tileSize + tileSize / 2,
    z: tileCoord.z * tileSize + tileSize / 2,
    y: Math.max(0, tile.floor || 0) * heightStep + 0.5,
    rotationY: level.playerSpawn?.rotationY || 0
  };
  syncSpawnInputs();
  markDirty(true);
  updateSpawnMarker();
}

function applyEyedropper(tileCoord) {
  const tile = editorState.currentLevelData.tiles[tileCoord.z][tileCoord.x];
  editorState.heightToolValue = tile.floor || 0;
  editorState.selectedFloorTexId = tile.floorTex || null;
  editorState.selectedWallTexId = tile.wallTex || null;
  editorState.selectedCeilingTexId = tile.ceilingTex || null;
  heightValueInput.value = editorState.heightToolValue;
  floorTexSelect.value = editorState.selectedFloorTexId || '';
  wallTexSelect.value = editorState.selectedWallTexId || '';
  ceilingTexSelect.value = editorState.selectedCeilingTexId || '';
  syncTexturePreviews();
  setStatus('Eyedropper: values copied from tile');
}

function laserFacesOpen(level, x, z, dir) {
  const step = laserStep(dir);
  const nx = x + step.x;
  const nz = z + step.z;
  const tile = level.tiles[nz]?.[nx];
  if (!tile || (tile.floor || 0) > 0) return false;
  return !level.breakableItems.some((item) => item.x === nx && item.z === nz);
}

function toggleLaser(tileCoord) {
  const level = editorState.currentLevelData;
  const tile = level.tiles[tileCoord.z]?.[tileCoord.x];
  if (!tile || (tile.floor || 0) <= 0) {
    setStatus('Lasers sit on a wall');
    return;
  }
  const dirs = [0, 1, 2, 3].filter((dir) => laserFacesOpen(level, tileCoord.x, tileCoord.z, dir));
  if (!dirs.length) {
    setStatus('That wall does not face an open cell');
    return;
  }
  const index = level.lasers.findIndex((item) => item.x === tileCoord.x && item.z === tileCoord.z);
  const switchId = currentBrush().laserSwitch;
  if (index < 0) {
    const laser = { x: tileCoord.x, z: tileCoord.z, dir: dirs[0] };
    if (switchId) laser.switch = switchId;
    level.lasers.push(laser);
  } else {
    const pos = dirs.indexOf(level.lasers[index].dir);
    if (pos === -1 || pos === dirs.length - 1) level.lasers.splice(index, 1);
    else level.lasers[index].dir = dirs[pos + 1];
    if (level.lasers[index]) {
      if (switchId) level.lasers[index].switch = switchId;
      else delete level.lasers[index].switch;
    }
  }
  markDirty(true);
  rebuildLevel();
}

// One-way doors and conveyors: each click turns the arrow a quarter turn, the fifth click removes it.
function toggleDirectional(listName, tileCoord) {
  const level = editorState.currentLevelData;
  const tile = level.tiles[tileCoord.z]?.[tileCoord.x];
  if (!tile || (tile.floor || 0) > 0) {
    setStatus('That piece needs open floor');
    return;
  }
  const list = level[listName];
  const index = list.findIndex((item) => item.x === tileCoord.x && item.z === tileCoord.z);
  if (index < 0) {
    for (const name of FLOOR_LISTS) {
      if (name !== listName) removeEntityAt(name, tileCoord);
    }
    removeBossCovering(tileCoord);
    list.push({ x: tileCoord.x, z: tileCoord.z, dir: 0 });
  } else if (list[index].dir >= 3) list.splice(index, 1);
  else list[index].dir += 1;
  markDirty(true);
  rebuildLevel();
}

// Patrols: a plain click places or removes the tank, a shift-click appends a waypoint to the
// most recently placed patrol.
function togglePatrol(tileCoord, addWaypoint) {
  const level = editorState.currentLevelData;
  const tile = level.tiles[tileCoord.z]?.[tileCoord.x];
  if (!tile || (tile.floor || 0) > 0) {
    setStatus('Patrols need open floor');
    return;
  }
  if (addWaypoint) {
    const patrol = level.patrols[editorState.lastPatrolIndex ?? level.patrols.length - 1] || level.patrols[level.patrols.length - 1];
    if (!patrol) {
      setStatus('Place a patrol tank first');
      return;
    }
    patrol.path = Array.isArray(patrol.path) ? patrol.path : [];
    const existing = patrol.path.findIndex((stop) => stop.x === tileCoord.x && stop.z === tileCoord.z);
    if (existing >= 0) patrol.path.splice(existing, 1);
    else patrol.path.push({ x: tileCoord.x, z: tileCoord.z });
    setStatus(`Patrol has ${patrol.path.length} waypoint${patrol.path.length === 1 ? '' : 's'}`);
  } else {
    const index = level.patrols.findIndex((item) => item.x === tileCoord.x && item.z === tileCoord.z);
    if (index >= 0) {
      if (brushMatches('patrols', level.patrols[index], currentBrush())) level.patrols.splice(index, 1);
      else applyBrushFields('patrols', level.patrols[index], currentBrush());
      editorState.lastPatrolIndex = Math.min(index, level.patrols.length - 1);
    } else {
      for (const name of FLOOR_LISTS) {
        if (name !== 'patrols') removeEntityAt(name, tileCoord);
      }
      removeBossCovering(tileCoord);
      level.patrols.push(applyBrushFields('patrols', { x: tileCoord.x, z: tileCoord.z, path: [] }, currentBrush()));
      editorState.lastPatrolIndex = level.patrols.length - 1;
    }
  }
  markDirty(true);
  rebuildLevel();
}

function removeEntityAt(listName, tileCoord) {
  const list = editorState.currentLevelData[listName];
  const index = list.findIndex((item) => item.x === tileCoord.x && item.z === tileCoord.z);
  if (index >= 0) list.splice(index, 1);
}

function removeBossCovering(tileCoord) {
  const level = editorState.currentLevelData;
  level.bosses = level.bosses.filter((boss) => tileCoord.x < boss.x || tileCoord.x >= boss.x + 2 || tileCoord.z < boss.z || tileCoord.z >= boss.z + 2);
}

function toggleBoss(tileCoord) {
  const level = editorState.currentLevelData;
  const index = level.bosses.findIndex((boss) => tileCoord.x >= boss.x && tileCoord.x < boss.x + 2 && tileCoord.z >= boss.z && tileCoord.z < boss.z + 2);
  if (index >= 0) {
    const boss = level.bosses[index];
    if (brushMatches('bosses', boss, currentBrush())) level.bosses.splice(index, 1);
    else applyBrushFields('bosses', boss, currentBrush());
  } else {
    const cells = [
      { x: tileCoord.x, z: tileCoord.z },
      { x: tileCoord.x + 1, z: tileCoord.z },
      { x: tileCoord.x, z: tileCoord.z + 1 },
      { x: tileCoord.x + 1, z: tileCoord.z + 1 }
    ];
    const fits = cells.every((cell) => {
      const tile = level.tiles[cell.z]?.[cell.x];
      return tile && (tile.floor || 0) === 0 && cell.x < level.size.width && cell.z < level.size.depth;
    });
    if (!fits) {
      setStatus('Boss needs a clear 2x2 floor');
      return;
    }
    level.bosses = level.bosses.filter((boss) => !cells.some((cell) => cell.x >= boss.x && cell.x < boss.x + 2 && cell.z >= boss.z && cell.z < boss.z + 2));
    for (const cell of cells) {
      for (const name of FLOOR_LISTS) {
        removeEntityAt(name, cell);
      }
    }
    level.bosses.push(applyBrushFields('bosses', { x: tileCoord.x, z: tileCoord.z }, currentBrush()));
  }
  markDirty(true);
  rebuildLevel();
}

function toggleEntity(listName, tileCoord) {
  const list = editorState.currentLevelData[listName];
  const index = list.findIndex((item) => item.x === tileCoord.x && item.z === tileCoord.z);
  const brush = currentBrush();
  if (index >= 0) {
    if (brushMatches(listName, list[index], brush)) list.splice(index, 1);
    else applyBrushFields(listName, list[index], brush);
  } else {
    for (const name of FLOOR_LISTS) {
      if (name !== listName) removeEntityAt(name, tileCoord);
    }
    removeBossCovering(tileCoord);
    list.push(applyBrushFields(listName, { x: tileCoord.x, z: tileCoord.z }, brush));
  }
  markDirty(true);
  rebuildLevel();
}

async function undoLastBrushAction() {
  if (!editorState.undoStack.length || !editorState.currentLevelData) return;
  const action = editorState.undoStack.pop();
  for (const change of action) {
    editorState.currentLevelData.tiles[change.z][change.x] = { ...change.before };
  }
  markDirty(true);
  await rebuildLevel();
  setStatus('Undid last brush action');
}

function toolSupportsUndo() {
  return ['height', 'texture', 'heightTexture'].includes(editorState.currentTool);
}

async function handleTool(tileCoord) {
  setSelection(tileCoord);
  if (editorState.currentTool === 'height') await applyHeightTool(tileCoord);
  else if (editorState.currentTool === 'texture') await applyTextureTool(tileCoord);
  else if (editorState.currentTool === 'heightTexture') await applyHeightTextureTool(tileCoord);
  else if (editorState.currentTool === 'breakable') toggleEntity('breakableItems', tileCoord);
  else if (editorState.currentTool === 'coins') toggleEntity('coins', tileCoord);
  else if (editorState.currentTool === 'bigCoins') toggleEntity('bigCoins', tileCoord);
  else if (editorState.currentTool === 'turrets') toggleEntity('turrets', tileCoord);
  else if (editorState.currentTool === 'bosses') toggleBoss(tileCoord);
  else if (editorState.currentTool === 'machineGuns') toggleEntity('machineGuns', tileCoord);
  else if (editorState.currentTool === 'nukes') toggleEntity('nukes', tileCoord);
  else if (editorState.currentTool === 'lives') toggleEntity('lives', tileCoord);
  else if (editorState.currentTool === 'grenades') toggleEntity('grenades', tileCoord);
  else if (editorState.currentTool === 'drones') toggleEntity('drones', tileCoord);
  else if (editorState.currentTool === 'keys') toggleEntity('keys', tileCoord);
  else if (editorState.currentTool === 'gates') toggleEntity('gates', tileCoord);
  else if (editorState.currentTool === 'lasers') toggleLaser(tileCoord);
  else if (editorState.currentTool === 'patrols') togglePatrol(tileCoord, editorState.shiftHeld);
  else if (DIRECTIONAL_LISTS.includes(editorState.currentTool)) toggleDirectional(editorState.currentTool, tileCoord);
  else if (['mortars', 'shields', 'switches', 'toggleWalls', 'crackedWalls', 'shieldProjectors', 'emps'].includes(editorState.currentTool)) toggleEntity(editorState.currentTool, tileCoord);
  else if (editorState.currentTool === 'spawn') applySpawnTool(tileCoord);
  else if (editorState.currentTool === 'eyedropper') applyEyedropper(tileCoord);
}

async function loadLevelsList() {
  editorState.levelsList = await fetchJson('/games-3d/nuclear-tank/api/levels');
  levelSelect.innerHTML = '';
  for (const lvl of editorState.levelsList) {
    const opt = document.createElement('option');
    opt.value = lvl.id;
    opt.textContent = `${lvl.name} (${lvl.id})`;
    levelSelect.appendChild(opt);
  }
  if (!editorState.levelsList.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No levels found';
    levelSelect.appendChild(opt);
  }
}

async function loadTextures() {
  editorState.texturesCatalog = await fetchJson('/games-3d/nuclear-tank/api/textures');
  const populate = (select, list, placeholder) => {
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    for (const t of list || []) {
      const opt = document.createElement('option');
      opt.value = t.url;
      opt.textContent = t.filename;
      select.appendChild(opt);
    }
  };

  populate(floorTexSelect, editorState.texturesCatalog.floor, 'Floor Tex');
  populate(wallTexSelect, editorState.texturesCatalog.wall, 'Wall Tex');
  populate(ceilingTexSelect, editorState.texturesCatalog.ceiling, 'Ceiling Tex');

  editorState.selectedFloorTexId ||= editorState.texturesCatalog.floor[0]?.url || null;
  editorState.selectedWallTexId ||= editorState.texturesCatalog.wall[0]?.url || null;
  editorState.selectedCeilingTexId ||= editorState.texturesCatalog.ceiling[0]?.url || null;
  floorTexSelect.value = editorState.selectedFloorTexId || '';
  wallTexSelect.value = editorState.selectedWallTexId || '';
  ceilingTexSelect.value = editorState.selectedCeilingTexId || '';
  syncTexturePreviews();
}

function syncFormInputs() {
  const level = editorState.currentLevelData;
  if (!level) return;
  levelIdInput.value = level.id;
  levelNameInput.value = level.name || '';
  tileSizeInput.value = level.tileSize ?? 1;
  heightStepInput.value = level.heightStep ?? 1;
  widthInput.value = level.size.width;
  depthInput.value = level.size.depth;
  syncSpawnInputs();
}

function syncSpawnInputs() {
  const spawn = editorState.currentLevelData?.playerSpawn || {};
  spawnXInput.value = spawn.x ?? '';
  spawnYInput.value = spawn.y ?? '';
  spawnZInput.value = spawn.z ?? '';
  spawnRotInput.value = spawn.rotationY ?? 0;
}

async function loadLevel(levelId) {
  if (!levelId) return;
  if (editorState.hasUnsavedChanges && !window.confirm('You have unsaved changes. Load anyway?')) return;
  editorState.currentLevelData = ensureLevelExtras(await fetchJson(`/games-3d/nuclear-tank/api/level/${levelId}`));
  editorState.currentLevelId = levelId;
  editorState.undoStack = [];
  editorState.selectedTile = { x: null, z: null };
  resetLevelChat();
  syncFormInputs();
  await rebuildLevel({ preserveView: false });
  markDirty(false);
  setStatus(`Loaded level ${levelId}`);
}

function buildEmptyTiles(width, depth, defaults) {
  const rows = [];
  for (let z = 0; z < depth; z++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        floor: defaults.floor,
        ceiling: defaults.floor + 4,
        floorTex: defaults.floorTex,
        wallTex: defaults.wallTex,
        ceilingTex: defaults.ceilingTex
      });
    }
    rows.push(row);
  }
  return rows;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildDefaultEntities(width, depth, spawnTile) {
  const candidates = [];
  for (let z = 1; z < depth - 1; z++) {
    for (let x = 1; x < width - 1; x++) {
      if (x === spawnTile.x && z === spawnTile.z) continue;
      candidates.push({ x, z });
    }
  }

  shuffleInPlace(candidates);
  const breakableCount = Math.min(10, candidates.length);
  const breakableItems = candidates.slice(0, breakableCount);
  const coins = candidates.slice(breakableCount, breakableCount + Math.min(5, Math.max(0, candidates.length - breakableCount)));
  return { breakableItems, coins };
}

function makeDefaultLevel(id, name) {
  const width = 10;
  const depth = 10;
  const tileSize = 1;
  const heightStep = 1;
  const grassTexture = editorState.texturesCatalog.floor.find((item) => item.url.includes('grass'))?.url || editorState.selectedFloorTexId || '/games-3d/textures/grass.png';
  const stoneTexture = editorState.texturesCatalog.wall.find((item) => item.url.includes('stone'))?.url || '/games-3d/textures/stone.png';
  const ceilingTexture = editorState.selectedCeilingTexId || editorState.texturesCatalog.ceiling.find((item) => item.url.includes('stone'))?.url || '/games-3d/textures/stone.png';
  const defaults = {
    floor: 0,
    floorTex: grassTexture,
    wallTex: stoneTexture,
    ceilingTex: ceilingTexture
  };
  const tiles = buildEmptyTiles(width, depth, defaults);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const isPerimeter = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
      if (!isPerimeter) continue;
      tiles[z][x].floor = 1;
      tiles[z][x].ceiling = Math.max(tiles[z][x].ceiling, 5);
      tiles[z][x].floorTex = stoneTexture;
      tiles[z][x].wallTex = stoneTexture;
      tiles[z][x].ceilingTex = ceilingTexture;
    }
  }

  const spawnTile = { x: 1, z: 1 };
  const { breakableItems, coins } = buildDefaultEntities(width, depth, spawnTile);
  return ensureLevelExtras({
    id,
    name,
    tileSize,
    heightStep,
    size: { width, depth },
    tiles,
    playerSpawn: {
      x: spawnTile.x * tileSize + tileSize / 2,
      z: spawnTile.z * tileSize + tileSize / 2,
      y: 0.5,
      rotationY: 0
    },
    breakableItems,
    coins
  });
}

async function createNewLevel() {
  if (editorState.hasUnsavedChanges && !window.confirm('Discard unsaved changes and create a new level?')) return;
  const serial = String(editorState.levelsList.length + 1).padStart(2, '0');
  const id = `level_new_${Date.now()}_${serial}`;
  const name = `New Level ${editorState.levelsList.length + 1}`;
  const level = makeDefaultLevel(id, name);
  await fetchJson('/games-3d/nuclear-tank/api/level', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(level)
  });
  await loadLevelsList();
  levelSelect.value = id;
  await loadLevel(id);
  setStatus(`Created level ${id}`);
}

async function saveLevel(saveAs = false) {
  if (!editorState.currentLevelData) return;
  const level = editorState.currentLevelData;
  if (saveAs) {
    const newId = prompt('Save As - new level id:', `${level.id}_copy`);
    if (!newId) return;
    level.id = newId.trim();
    editorState.currentLevelId = level.id;
  }
  const exists = editorState.levelsList.some((item) => item.id === level.id);
  const method = exists && !saveAs ? 'PUT' : 'POST';
  const url = method === 'POST' ? '/games-3d/nuclear-tank/api/level' : `/games-3d/nuclear-tank/api/level/${level.id}`;
  await fetchJson(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(level)
  });
  await loadLevelsList();
  levelSelect.value = level.id;
  markDirty(false);
  setStatus(`Saved level ${level.id}`);
}

function resizeLevel() {
  const level = editorState.currentLevelData;
  if (!level) return;
  const newWidth = Math.max(1, Number(widthInput.value) || level.size.width);
  const newDepth = Math.max(1, Number(depthInput.value) || level.size.depth);
  const defaults = {
    floor: 0,
    floorTex: editorState.selectedFloorTexId,
    wallTex: editorState.selectedWallTexId,
    ceilingTex: editorState.selectedCeilingTexId
  };
  const newTiles = buildEmptyTiles(newWidth, newDepth, defaults);
  for (let z = 0; z < Math.min(level.size.depth, newDepth); z++) {
    for (let x = 0; x < Math.min(level.size.width, newWidth); x++) {
      newTiles[z][x] = level.tiles[z][x];
    }
  }
  level.tiles = newTiles;
  level.size.width = newWidth;
  level.size.depth = newDepth;
  level.bosses = level.bosses.filter((item) => item.x + 1 < newWidth && item.z + 1 < newDepth);
  for (const name of FLOOR_LISTS) {
    level[name] = level[name].filter((item) => item.x < newWidth && item.z < newDepth);
  }
  for (const patrol of level.patrols) {
    patrol.path = (patrol.path || []).filter((stop) => stop.x < newWidth && stop.z < newDepth);
  }
  level.lasers = level.lasers.filter((item) => item.x < newWidth && item.z < newDepth);
  markDirty(true);
  rebuildLevel();
}

function updateLevelBasics() {
  const level = editorState.currentLevelData;
  if (!level) return;
  level.name = levelNameInput.value;
  level.tileSize = Number(tileSizeInput.value) || 1;
  level.heightStep = Number(heightStepInput.value) || 1;
  markDirty(true);
  rebuildLevel();
}

function setSpawnFromSelection() {
  const { x, z } = editorState.selectedTile;
  if (x === null || z === null) {
    alert('Select a tile first.');
    return;
  }
  applySpawnTool({ x, z });
}

function parseLevelParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('level');
}

function attachEventHandlers() {
  loadLevelBtn.addEventListener('click', () => loadLevel(levelSelect.value).catch(console.error));
  newLevelBtn.addEventListener('click', () => createNewLevel().catch(console.error));
  saveLevelBtn.addEventListener('click', () => saveLevel(false).catch(console.error));
  saveAsLevelBtn.addEventListener('click', () => saveLevel(true).catch(console.error));
  reloadTexturesBtn.addEventListener('click', async () => {
    await loadTextures();
    await rebuildLevel();
  });
  playLevelBtn.addEventListener('click', async () => {
    if (!editorState.currentLevelData?.id) return;
    if (editorState.hasUnsavedChanges && window.confirm('Save changes before playing?')) {
      await saveLevel(false);
    }
    window.open(`/games-3d/nuclear-tank?level=${encodeURIComponent(editorState.currentLevelData.id)}`, '_blank');
  });

  levelNameInput.addEventListener('change', updateLevelBasics);
  tileSizeInput.addEventListener('change', updateLevelBasics);
  heightStepInput.addEventListener('change', updateLevelBasics);
  widthInput.addEventListener('change', resizeLevel);
  depthInput.addEventListener('change', resizeLevel);
  resizeBtn.addEventListener('click', resizeLevel);

  toolSelect.addEventListener('change', (e) => {
    editorState.currentTool = e.target.value;
    syncBrushFields();
  });
  brushSizeSelect.addEventListener('change', (e) => {
    editorState.brushSize = e.target.value;
    updateHighlight();
  });
  heightModeSelect.addEventListener('change', (e) => { editorState.heightToolMode = e.target.value; });
  heightValueInput.addEventListener('change', (e) => { editorState.heightToolValue = Number(e.target.value) || 0; });

  floorTexSelect.addEventListener('change', (e) => {
    editorState.selectedFloorTexId = e.target.value || null;
    syncTexturePreviews();
  });
  wallTexSelect.addEventListener('change', (e) => {
    editorState.selectedWallTexId = e.target.value || null;
    syncTexturePreviews();
  });
  ceilingTexSelect.addEventListener('change', (e) => {
    editorState.selectedCeilingTexId = e.target.value || null;
    syncTexturePreviews();
  });
  setSpawnFromSelectionBtn.addEventListener('click', setSpawnFromSelection);
  spawnRotInput.addEventListener('change', (e) => {
    if (!editorState.currentLevelData?.playerSpawn) return;
    editorState.currentLevelData.playerSpawn.rotationY = Number(e.target.value) || 0;
    markDirty(true);
  });

  const panStep = 0.5;
  const rotateStep = 0.1;
  const zoomFactor = 0.1;
  camZoomInBtn.addEventListener('click', () => {
    camera.position.sub(controls.target);
    camera.position.multiplyScalar(1 - zoomFactor);
    camera.position.add(controls.target);
    controls.update();
  });
  camZoomOutBtn.addEventListener('click', () => {
    camera.position.sub(controls.target);
    camera.position.multiplyScalar(1 + zoomFactor);
    camera.position.add(controls.target);
    controls.update();
  });
  camMoveLeftBtn.addEventListener('click', () => { controls.panLeft(panStep); controls.update(); });
  camMoveRightBtn.addEventListener('click', () => { controls.panLeft(-panStep); controls.update(); });
  camMoveUpBtn.addEventListener('click', () => { controls.panUp(panStep); controls.update(); });
  camMoveDownBtn.addEventListener('click', () => { controls.panUp(-panStep); controls.update(); });
  camRotateLeftBtn.addEventListener('click', () => { controls.rotateLeft(rotateStep); controls.update(); });
  camRotateRightBtn.addEventListener('click', () => { controls.rotateLeft(-rotateStep); controls.update(); });

  for (const tab of document.querySelectorAll('.panel-tab')) {
    tab.addEventListener('click', () => showPanelTab(tab.dataset.tab));
  }
  chatSendBtn.addEventListener('click', () => { sendLevelChat(); });
  chatUndoBtn.addEventListener('click', () => { undoLevelChat(); });
  chatClearBtn.addEventListener('click', () => {
    chatHistory = [];
    chatLog.replaceChildren();
    setStatus('Cleared the chat history');
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendLevelChat();
    }
  });

  window.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      await saveLevel(false);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      await createNewLevel();
      return;
    }
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (typing) return;
    if (e.key === 'Delete' && toolSupportsUndo()) {
      e.preventDefault();
      await undoLastBrushAction();
      return;
    }

    const hotkeys = {
      '1': 'height',
      '2': 'texture',
      '3': 'heightTexture',
      '4': 'breakable',
      '5': 'coins',
      '6': 'spawn',
      '7': 'eyedropper',
      '8': 'turrets',
      '9': 'machineGuns',
      '0': 'nukes',
      'b': 'bigCoins',
      'g': 'bosses',
      'l': 'lasers',
      'h': 'lives',
      'y': 'grenades',
      'd': 'drones',
      'k': 'keys',
      'j': 'gates'
    };
    const letter = e.key.toLowerCase();
    const hotkey = hotkeys[e.key] || hotkeys[letter];
    if (hotkey) {
      toolSelect.value = hotkey;
      editorState.currentTool = hotkey;
      syncBrushFields();
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const { x, z } = editorState.selectedTile;
      if (x === null || z === null || !editorState.currentLevelData) return;
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dz = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      const nx = Math.min(Math.max(0, x + dx), editorState.currentLevelData.size.width - 1);
      const nz = Math.min(Math.max(0, z + dz), editorState.currentLevelData.size.depth - 1);
      setSelection({ x: nx, z: nz });
    }
  });

  window.onbeforeunload = (e) => {
    if (!editorState.hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = '';
  };
}

async function init() {
  setStatus('Loading editor…');
  attachEventHandlers();
  syncBrushFields();
  setupThree();
  animate();
  onResize();

  await loadTextures();
  await loadLevelsList();

  const initialLevel = parseLevelParam() || editorState.levelsList[0]?.id;
  if (initialLevel) {
    levelSelect.value = initialLevel;
    await loadLevel(initialLevel);
  } else {
    setStatus('No levels available');
  }
}

init().catch((err) => {
  console.error(err);
  setStatus('Failed to initialize editor');
});
