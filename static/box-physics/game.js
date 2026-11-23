import * as THREE from 'three';
import RAPIER from 'rapier';
import { createGameMusic } from '../music/music-player.js';
import { createHands } from './hands.js';
import { createLava } from './lava.js';
import { createSounds } from './sounds.js';
import { buildCampaign, chapters } from './campaign.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const level = Math.max(1, Math.min(3, Math.floor(Number(new URLSearchParams(location.search).get('level'))) || 1));
const outpost = String(level).padStart(2, '0');
$('outpost-number').textContent = outpost;
document.title = `Box Physics — ${chapters[level - 1].name}`;
$('room').textContent = chapters[level - 1].name.toUpperCase();
$('loading').textContent = `BUILDING ${chapters[level - 1].name.toUpperCase()}…`;
$('objectives').innerHTML = '<b>MISSION / ESCAPE OUTPOST 07</b><ol>' + chapters[level-1].objectives.map((text,i)=>`<li id="goal-${i}">${text}</li>`).join('') + '</ol>';
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07131b);
scene.fog = new THREE.FogExp2(0x07131b, 0.024);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 130);
scene.add(camera);
const hands = createHands(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0x91c8d6, 0x1d2830, 1.7));
const sun = new THREE.DirectionalLight(0xb1d8e0, 2.1);
sun.position.set(-8, 17, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -8;
scene.add(sun);

const texLoader = new THREE.TextureLoader();
function texture(name, repeatX = 1, repeatY = 1) {
  const t = texLoader.load(`/games-3d/textures/${name}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return t;
}
const mats = {
  floor: new THREE.MeshStandardMaterial({ map: texture('metal_plates.jpg', 4, 14), roughness: 0.75, metalness: 0.45 }),
  wall: new THREE.MeshStandardMaterial({ map: texture('concrete_panels.jpg', 2, 1), roughness: 0.9, metalness: 0.15 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x1d313a, roughness: 0.8, metalness: 0.55 }),
  wood: new THREE.MeshStandardMaterial({ map: texture('wood_box2.png'), roughness: 0.87 }),
  fragile: new THREE.MeshStandardMaterial({ map: texture('wood_box3.png'), roughness: 0.9, color: 0xffd6ad }),
  metal: new THREE.MeshStandardMaterial({ map: texture('metal_bumpy.jpg'), roughness: 0.52, metalness: 0.78, color: 0xb8d4d7 }),
  special: new THREE.MeshStandardMaterial({ map: texture('metal_bumpy.jpg'), roughness: 0.39, metalness: 0.86, color: 0x70d9de, emissive: 0x075b65, emissiveIntensity: 0.32 }),
  flammable: new THREE.MeshStandardMaterial({ map: texture('wood_box3.png'), roughness: 0.85, color: 0xff8d50, emissive: 0x8e2408, emissiveIntensity: 0.38 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffac53, emissive: 0xb34d0b, emissiveIntensity: 0.7, metalness: 0.5 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x6be9f0, emissive: 0x067d8b, emissiveIntensity: 0.9, metalness: 0.5 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x233c45, metalness: 0.75, roughness: 0.43 }),
};

await RAPIER.init();
$('loading').textContent = 'BUILDING PHYSICS WORLD…';
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;
const events = new RAPIER.EventQueue(true);
const colliderEntities = new Map();
const crates = [];
const rocks = [];
const enemies = [];
const traps = [];
const keyMeshes = new Map();
const doors = [];
const owned = new Set();
const completed = new Set();
const debrisPieces = [];
const dustBursts = [];
const fireBursts = [];
let audio = null;
let effects = null;
const music = createGameMusic({ track: 'box-physics/outpost-pulse', volume: 0.43 });
music.startOnInput();
let held = null;
let heldYawAtGrab = 0;
let heldRotationAtGrab = null;
let charging = false;
let chargeStart = 0;
const CHARGE_DELAY_MS = 220;
const CHARGE_RAMP_MS = 500;
let grabbedThisPress = false;
let climbState = null;
let panel = null;
let won = false;
let yaw = 0;
let noticeUntil = 0;
let currentRoom = -1;
let lastPushSound = 0;
let lastStepSound = 0;
let lastHazardSound = 0;
let fallPeak = 0;
let health = 3;
let lastPlayerHit = 0;

function meshBox(x, y, z, w, h, d, material, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function fixed(x, y, z, w, h, d, material) {
  const mesh = meshBox(x, y, z, w, h, d, material, false);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(0.85), body);
  return { mesh, body, collider };
}
function glowingStrip(x, y, z, w, h, d, color) {
  const material = new THREE.MeshBasicMaterial({ color });
  meshBox(x, y, z, w, h, d, material, false);
  const light = new THREE.PointLight(color, 5, 7, 2);
  light.position.set(x, y, z);
  scene.add(light);
}

function createCrate(x, z, size = 1, type = 'wood', y = size / 2, debris = false) {
  const mesh = meshBox(x, y, z, size, size, size, debris ? mats[type].clone() : mats[type]);
  if (debris) mesh.material.transparent = true;
  const movable = type === 'special';
  const desc = movable
    ? RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.45).setAngularDamping(0.75).setCcdEnabled(true)
    : RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
  const body = world.createRigidBody(desc);
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setDensity(movable ? 3.2 : 1).setFriction(0.9).setRestitution(0.04).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const crate = { mesh, body, collider, size, type, debris, broken: false };
  colliderEntities.set(collider.handle, crate);
  crates.push(crate);
  return crate;
}
const salvageSteel = new THREE.MeshStandardMaterial({ map: texture('metal_bumpy.jpg'), color: 0x8ba8aa, metalness: 0.76, roughness: 0.4 });
const salvageDark = new THREE.MeshStandardMaterial({ color: 0x152a33, metalness: 0.83, roughness: 0.34 });
const salvageGlow = new THREE.MeshStandardMaterial({ color: 0x4fe0df, emissive: 0x0b9fae, emissiveIntensity: 1.3, metalness: 0.35 });
const salvageWarning = new THREE.MeshStandardMaterial({ color: 0xe39b41, metalness: 0.55, roughness: 0.38 });
function makeSalvage(radius) {
  const mesh = new THREE.Group();
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z);
    part.castShadow = true;
    mesh.add(part);
    return part;
  };
  // A battered power-cell casing is more legible in the hands than a plain polygonal pebble.
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.29, 10), salvageSteel);
  for (const y of [-0.14, 0.14]) {
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 10), salvageDark, 0, y);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.039, 10), salvageGlow, 0, y + Math.sign(y) * 0.015);
  }
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const rib = add(new THREE.BoxGeometry(0.048, 0.23, 0.024), i === 0 ? salvageWarning : salvageDark, Math.sin(angle) * 0.12, 0, Math.cos(angle) * 0.12);
    rib.rotation.y = angle;
  }
  mesh.scale.setScalar(radius / 0.18);
  mesh.userData.throwableVisual = 'salvage-cell';
  return mesh;
}
function createRock(x, z, radius = 0.18, y = radius + 0.04) {
  const mesh = makeSalvage(radius);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.16).setAngularDamping(0.25).setCcdEnabled(true));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(radius).setDensity(3.8).setFriction(0.82).setRestitution(0.18).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const rock = { kind: 'rock', mesh, body, collider, radius, broken: false, armed: false, spent: false, previous: { x, y, z } };
  colliderEntities.set(collider.handle, rock);
  rocks.push(rock);
  return rock;
}
function makeVentTrap({ x, z, top, width, depth, switchX, switchY, switchZ, startsActive = false }) {
  const plateMaterial = new THREE.MeshStandardMaterial({ color: startsActive ? 0xff4f1e : 0x17434b, emissive: startsActive ? 0xc3290a : 0x073c46, emissiveIntensity: 1.1, metalness: 0.65, roughness: 0.4 });
  const plate = meshBox(x, top + 0.018, z, width, 0.035, depth, plateMaterial, false);
  const switchMaterial = new THREE.MeshStandardMaterial({ color: startsActive ? 0xff5530 : 0x69e2e5, emissive: startsActive ? 0x9a260c : 0x0b6872, emissiveIntensity: 1.4, metalness: 0.55 });
  const switchMesh = meshBox(switchX, switchY, switchZ, 0.55, 0.55, 0.13, switchMaterial, false);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(switchX, switchY, switchZ));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.275, 0.275, 0.065).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const light = new THREE.PointLight(startsActive ? 0xff4e24 : 0x3bc5ce, startsActive ? 7 : 2, 5, 2);
  light.position.set(x, top + 0.45, z);
  scene.add(light);
  const trap = { x, z, top, width, depth, plate, switchMesh, light, active: startsActive, startsActive, until: Infinity, nextBurstAt: 0 };
  colliderEntities.set(collider.handle, { kind: 'trapSwitch', trap });
  traps.push(trap);
  return trap;
}
function plankGeometry(length, width, thickness) {
  const a = length / 2, b = width / 2, h = thickness / 2;
  const skew = Math.min(length * 0.19, width * 0.65);
  const outline = [
    [-a + skew * Math.random(), -b], [a - skew * Math.random(), -b],
    [a - skew * Math.random(), b], [-a + skew * Math.random(), b],
  ];
  const vertices = outline.map(([x, z]) => [x, h, z]).concat(outline.map(([x, z]) => [x, -h, z]));
  const positions = [], normals = [], uvs = [];
  function triangle(i, j, k) {
    const p = [vertices[i], vertices[j], vertices[k]];
    const v1 = new THREE.Vector3(...p[1]).sub(new THREE.Vector3(...p[0]));
    const v2 = new THREE.Vector3(...p[2]).sub(new THREE.Vector3(...p[0]));
    const n = v1.cross(v2).normalize();
    for (const point of p) { positions.push(...point); normals.push(n.x, n.y, n.z); uvs.push(point[0] / length + 0.5, point[2] / width + 0.5); }
  }
  triangle(0, 2, 1); triangle(0, 3, 2);
  triangle(4, 5, 6); triangle(4, 6, 7);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangle(i, j, j + 4); triangle(i, j + 4, i + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
function createPlank(x, y, z, length, width, thickness, type) {
  const material = new THREE.MeshStandardMaterial({
    color: type === 'fragile' ? 0xc99d67 : 0x8c6748,
    roughness: 0.93, transparent: true,
  });
  const mesh = new THREE.Mesh(plankGeometry(length, width, thickness), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, debris: true, broken: false, thickness, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), floorY: thickness / 2 + 0.025 };
}
const dustCanvas = document.createElement('canvas');
dustCanvas.width = dustCanvas.height = 32;
const dustContext = dustCanvas.getContext('2d');
const dustGradient = dustContext.createRadialGradient(16, 16, 1, 16, 16, 15);
dustGradient.addColorStop(0, '#ffffff');
dustGradient.addColorStop(0.35, '#ffffffbb');
dustGradient.addColorStop(1, '#ffffff00');
dustContext.fillStyle = dustGradient;
dustContext.fillRect(0, 0, 32, 32);
const dustTexture = new THREE.CanvasTexture(dustCanvas);
function spawnDust(position, type, size) {
  const count = type === 'blood' ? (size > 1.5 ? 150 : 52) : type === 'fire' ? 115 : type === 'metal' ? 48 : 80;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 3.3;
    positions[i * 3] = position.x + (Math.random() - 0.5) * size * 0.6;
    positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * size * 0.65;
    positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * size * 0.6;
    velocities[i * 3] = Math.cos(a) * speed;
    velocities[i * 3 + 1] = 0.7 + Math.random() * 3.0;
    velocities[i * 3 + 2] = Math.sin(a) * speed;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: type === 'blood' ? 0xb90c1b : type === 'fire' ? 0xff7224 : type === 'flammable' ? 0xef945f : type === 'fragile' ? 0xf3d9ab : type === 'metal' ? 0xb6dfe3 : 0xc6a17e,
    map: dustTexture, size: type === 'fire' ? 0.2 : type === 'blood' ? 0.085 : type === 'metal' ? 0.075 : 0.12,
    transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.015,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  dustBursts.push({ points, positions, velocities, born: performance.now(), life: type === 'fire' ? 1150 : 1900 });
}
function removeCrate(crate) {
  if (crate.broken) return;
  crate.broken = true;
  scene.remove(crate.mesh);
  crate.mesh.geometry.dispose();
  if (crate.debris) { crate.mesh.material.dispose(); return; }
  colliderEntities.delete(crate.collider.handle);
  world.removeRigidBody(crate.body);
}
function destroy(crate) {
  if (!crate || crate.broken) return;
  if (crate.type === 'metal' || crate.type === 'special') return;
  const center = crate.mesh.position.clone();
  removeCrate(crate);
  if (held === crate) { held = null; $('charge').hidden = true; }
  if (crate === panel) {
    mark('panel');
    say('SERVICE PANEL BREACHED');
    $('hint').textContent = 'Cross the thermal conduit by climbing fixed crates and movable step boxes.';
  }
  if (!crate.debris) {
    sound('break');
    spawnDust(center, crate.type, crate.size);
    const count = crate === panel ? 24 : 17;
    for (let i = 0; i < count; i++) {
      const length = crate.size * (0.19 + Math.random() * 0.36);
      const width = crate.size * (0.045 + Math.random() * 0.075);
      const thickness = crate.size * (0.015 + Math.random() * 0.025);
      const x = center.x + (Math.random() - 0.5) * crate.size * 0.7;
      const z = center.z + (Math.random() - 0.5) * crate.size * 0.7;
      const y = Math.max(thickness / 2 + 0.04, center.y + (Math.random() - 0.5) * crate.size * 0.65);
      const piece = createPlank(x, y, z, length, width, thickness, crate.type);
      piece.expireAt = performance.now() + 4900 + Math.random() * 1800;
      piece.fadeAt = piece.expireAt - 1200;
      piece.velocity.set(
        (Math.random() - 0.5) * 4.8,
        1.2 + Math.random() * 3.1,
        (Math.random() - 0.5) * 4.8,
      );
      piece.spin.set((Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9);
      piece.mesh.rotation.y = i * 2.8;
      debrisPieces.push(piece);
    }
  }
}
function explodeBox(crate, visited = new Set()) {
  if (!crate || crate.broken || crate.type !== 'flammable' || visited.has(crate)) return;
  visited.add(crate);
  const center = crate.body.translation();
  destroy(crate);
  spawnDust(center, 'fire', crate.size * 2.2);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0xff9b34, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flash.position.set(center.x, center.y, center.z);
  const light = new THREE.PointLight(0xff5819, 15, 6, 2);
  light.position.copy(flash.position);
  scene.add(flash, light);
  fireBursts.push({ flash, light, born: performance.now(), life: 720, size: crate.size });
  sound('explode');
  for (const other of crates) {
    if (other.broken || other === crate) continue;
    const p = other.body.translation();
    if (Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) > 2.5) continue;
    if (other.type === 'flammable') explodeBox(other, visited);
    else if (other.type === 'wood' || other.type === 'fragile') destroy(other);
  }
  for (const enemy of enemies) {
    if (enemy.dead || Math.hypot(enemy.x-center.x,enemy.elevation+0.8-center.y,enemy.z-center.z)>2.8) continue;
    damageEnemy(enemy, 3, true);
  }
}
function setTrapVisual(trap) {
  trap.plate.material.color.setHex(trap.active ? 0xff4f1e : 0x17434b);
  trap.plate.material.emissive.setHex(trap.active ? 0xc3290a : 0x073c46);
  trap.switchMesh.material.color.setHex(trap.active ? 0xff5530 : 0x69e2e5);
  trap.switchMesh.material.emissive.setHex(trap.active ? 0x9a260c : 0x0b6872);
  trap.light.color.setHex(trap.active ? 0xff4e24 : 0x3bc5ce);
  trap.light.intensity = trap.active ? 7 : 2;
}
function toggleTrap(trap) {
  trap.active = !trap.active;
  trap.until = performance.now() + (trap.active ? 3600 : 18000);
  setTrapVisual(trap);
  sound('vent');
  say(trap.active ? 'FURNACE VENT IGNITED' : 'FURNACE VENT COOLED', 1.4);
}
function updateTraps(now) {
  const p = playerBody.translation();
  for (const trap of traps) {
    if (!trap.campaignControlled && now >= trap.until) { trap.active = trap.startsActive; trap.until = Infinity; setTrapVisual(trap); }
    if(trap.campaignControlled)setTrapVisual(trap);
    if (!trap.active) continue;
    if (Math.abs(p.z - trap.z) < 6 && now >= trap.nextBurstAt) {
      spawnDust({ x: trap.x, y: trap.top + 0.12, z: trap.z }, 'fire', 0.85);
      trap.nextBurstAt = now + 650;
    }
    for (const crate of crates) {
      if (crate.broken || crate.type !== 'flammable') continue;
      const c = crate.body.translation();
      if (Math.abs(c.x - trap.x) < trap.width / 2 && Math.abs(c.z - trap.z) < trap.depth / 2 && Math.abs(c.y - trap.top) < 1.2) explodeBox(crate);
    }
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (Math.abs(enemy.x - trap.x) < trap.width / 2 && Math.abs(enemy.z - trap.z) < trap.depth / 2 && Math.abs((enemy.elevation ?? 0) - trap.top) < 0.9) damageEnemy(enemy, 3, true);
    }
    if (Math.abs(p.x - trap.x) < trap.width / 2 && Math.abs(p.z - trap.z) < trap.depth / 2 && Math.abs(playerFeet() - trap.top) < 0.65 && now - lastPlayerHit > 1100) {
      lastPlayerHit = now;
      health = Math.max(0, health - 1);
      $('health-value').textContent = `${'● '.repeat(health)}${'○ '.repeat(3 - health)}`.trim();
      sound('hazard');
      say(health ? 'FURNACE CONTACT — SUIT DAMAGED' : 'SUIT FAILED — RETURNED TO ROOM ENTRY', 1.4);
      if (!health) {
        respawn('FURNACE CONTACT');
      }
    }
  }
}

function makeKey(color, x, z, top = 0) {
  const group = new THREE.Group();
  const mat = mats[color];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 16), mat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.29), mat);
  stem.position.z = 0.23;
  group.add(stem);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.08), mat);
  tooth.position.set(0.07, 0, 0.34);
  group.add(tooth);
  group.position.set(x, top + 0.48, z);
  scene.add(group);
  const light = new THREE.PointLight(color === 'amber' ? 0xffa348 : 0x59e7ee, 3, 2.5);
  light.position.set(x, top + 0.5, z);
  scene.add(light);
  keyMeshes.set(color, { group, light, x, z, top });
}
const campaign = buildCampaign({ scene, world, fixed, meshBox, mats, createCrate, createRock, makeKey, makeVentTrap, colliderEntities, crates, rocks, owned,
  player: () => playerBody.translation(), feet: playerFeet, forward, held: () => held, climbing: () => !!climbState, won: () => won,
  carryPlayer(delta) { const p = playerBody.translation(); playerBody.setTranslation({ x:p.x,y:p.y+delta,z:p.z },true); },
  heal() { health=3; $('health-value').textContent='● ● ●'; }, say, sound,
}, level);
const finalPlatforms = campaign.surfaces;
const platformCrates = [campaign.stepBox];
const exitPosition = campaign.exit;
const exitDoor = campaign.departure;
const lava = createLava(scene, campaign.hazards.filter(h => h.kind === 'lava'));
let exiting = false;

const playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(campaign.spawn.x, campaign.spawn.y, campaign.spawn.z));
const playerCollider = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.35).setFriction(0.1), playerBody);
const controller = world.createCharacterController(0.025);
controller.setApplyImpulsesToDynamicBodies(false);
controller.enableAutostep(0.19, 0.28, true);
const keysDown = new Set();
function setEnemyAction(enemy, name) {
  if (enemy.actionName === name) return enemy.action;
  const clip = enemy.clips.find(c => c.name.toLowerCase() === name) || enemy.clips.find(c => c.name.toLowerCase().includes(name));
  if (!clip) return null;
  const action = enemy.mixer.clipAction(clip);
  if (enemy.action) enemy.action.fadeOut(0.18);
  action.reset().fadeIn(name === enemy.attackName ? 0.08 : 0.18).play();
  if (name === 'death' || name === enemy.attackName) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  enemy.action = action;
  enemy.actionName = name;
  return action;
}
function makeEnemy(template, x, z, room, attackName, behavior = 'direct', awakeWhen = null) {
  const model = SkeletonUtils.clone(template.scene);
  model.traverse(node => { if (node.isMesh) { node.castShadow = true; if (node.isSkinnedMesh) node.frustumCulled = false; } });
  const bounds = new THREE.Box3().setFromObject(model);
  const height = Math.max(0.1, bounds.max.y - bounds.min.y);
  const scale = 1.85 / height;
  model.scale.setScalar(scale);
  const root = new THREE.Group();
  root.add(model);
  root.position.set(x, 0, z);
  scene.add(root);
  const bar = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.11), new THREE.MeshBasicMaterial({ color: 0x1c090b, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.065), new THREE.MeshBasicMaterial({ color: 0xe73742, depthTest: false }));
  fill.position.z = 0.008;
  bar.add(back, fill);
  scene.add(bar);
  const enemy = { root, model, bar, fill, x, z, room, attackName, behavior, awakeWhen, elevation: 0, flankSign: room % 2 ? 1 : -1, hp: 3, dead: false, expireAt: 0, mixer: new THREE.AnimationMixer(model), clips: template.animations, action: null, actionName: null, attackAt: 0, attackImpactAt: 0, attackRecoverAt: 0, attackLanded: false, hitUntil: 0 };
  enemies.push(enemy);
  setEnemyAction(enemy, 'idle');
  return enemy;
}
async function loadEnemies() {
  const loader = new GLTFLoader();
  const ids = ['scrap-goblin', 'horned-brute', 'magma-brute'];
  const loaded = await Promise.allSettled(ids.map(id => loader.loadAsync(`/games-3d/character/api/characters/${id}/glb`)));
  const templates = Object.fromEntries(loaded.map((result, i) => [ids[i], result.status === 'fulfilled' ? result.value : null]));
  for (const entry of campaign.enemySpawns) {
    if (!templates[entry.id]) continue;
    const attackName = entry.id === 'scrap-goblin' ? 'slash' : entry.id === 'magma-brute' ? 'ground_slam' : 'claw_swipe';
    const e = makeEnemy(templates[entry.id],entry.x,entry.z,Math.floor(entry.z/12),attackName,entry.behavior,entry.awake);
    e.zone=entry.zone; e.homeElevation=entry.top; e.elevation=entry.top; e.root.position.y=entry.top;
  }
  if (!enemies.length) console.warn('Monster characters could not be loaded.');
}
function damageEnemy(enemy, amount = 1, fire = false) {
  if (enemy.dead) return;
  enemy.attackRecoverAt = 0;
  enemy.attackLanded = true;
  enemy.attackAt = Math.max(enemy.attackAt, performance.now() + 550);
  enemy.hp = Math.max(0, enemy.hp - amount);
  const point = { x: enemy.x, y: enemy.elevation + 1.0, z: enemy.z };
  spawnDust(point, 'blood', enemy.hp ? 1.1 : 2.0);
  sound(enemy.hp ? 'monsterHit' : 'monsterDie');
  enemy.fill.scale.x = enemy.hp / 3;
  enemy.fill.position.x = -0.42 * (1 - enemy.hp / 3);
  if (enemy.hp === 0) {
    enemy.dead = true;
    enemy.path = [];
    enemy.deathAt = performance.now();
    enemy.expireAt = enemy.deathAt + 6000;
    enemy.bar.visible = false;
    // Cancel the walking clip immediately; fading it leaves moving feet on the corpse.
    enemy.mixer.stopAllAction();
    enemy.action = null;
    enemy.actionName = null;
    setEnemyAction(enemy, 'death');
    if (fire) spawnDust(point, 'fire', 1.8);
  } else {
    enemy.hitUntil = performance.now() + 420;
    setEnemyAction(enemy, 'hit');
  }
}
const NAV_STEP = 0.5;
function enemyBlocked(enemy, x, z) {
  if (campaign.blocked(enemy,x,z)) return true;
  if (crates.some(c => !c.broken && c !== held && c.body.translation().y-c.size/2 < enemy.homeElevation+1.7 && c.body.translation().y+c.size/2 > enemy.homeElevation+0.2 && Math.abs(c.body.translation().x-x)<c.size/2+0.39 && Math.abs(c.body.translation().z-z)<c.size/2+0.39)) return true;
  if (enemy.behavior === 'cautious' && (traps.some(t => t.active && Math.abs(t.top - enemy.elevation) < 0.8 && Math.abs(x - t.x) < t.width / 2 + 0.45 && Math.abs(z - t.z) < t.depth / 2 + 0.45) || crates.some(c => !c.broken && c.type === 'flammable' && Math.hypot(c.body.translation().x - x, c.body.translation().z - z) < 1.5))) return true;
  return false;
}
function routeEnemy(enemy, targetX, targetZ) {
  const minZ = enemy.zone.minZ;
  const cols = 22, rows = Math.max(2, Math.floor((enemy.zone.maxZ-minZ)/NAV_STEP)+1);
  const point = (i) => ({ x: -5.25 + (i % cols) * NAV_STEP, z: minZ + Math.floor(i / cols) * NAV_STEP });
  const index = (x, z) => Math.max(0, Math.min(cols - 1, Math.round((x + 5.25) / NAV_STEP))) + cols * Math.max(0, Math.min(rows - 1, Math.round((z - minZ) / NAV_STEP)));
  const start = index(enemy.x, enemy.z);
  const goalPoint = { x: Math.max(-5.25, Math.min(5.25, targetX)), z: Math.max(minZ, Math.min(minZ + (rows - 1) * NAV_STEP, targetZ)) };
  let goal = -1, goalDistance = Infinity;
  for (let i = 0; i < cols * rows; i++) {
    const p = point(i);
    const d = (p.x - goalPoint.x) ** 2 + (p.z - goalPoint.z) ** 2;
    if (d < goalDistance && !enemyBlocked(enemy, p.x, p.z)) { goal = i; goalDistance = d; }
  }
  if (goal < 0) return [];
  const open = [start], scores = new Float32Array(cols * rows).fill(Infinity);
  const parents = new Int16Array(cols * rows).fill(-1), closed = new Uint8Array(cols * rows);
  scores[start] = 0;
  const heuristic = i => Math.hypot((i % cols) - (goal % cols), Math.floor(i / cols) - Math.floor(goal / cols));
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (scores[open[i]] + heuristic(open[i]) < scores[open[best]] + heuristic(open[best])) best = i;
    const current = open.splice(best, 1)[0];
    if (current === goal) {
      const path = [];
      for (let i = goal; i !== start && i >= 0; i = parents[i]) path.unshift(point(i));
      return path;
    }
    closed[current] = 1;
    const cx = current % cols, cz = Math.floor(current / cols);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;
      const next = nx + nz * cols, p = point(next);
      if (closed[next] || enemyBlocked(enemy, p.x, p.z)) continue;
      if (dx && dz && (enemyBlocked(enemy, point(cx + dx + cz * cols).x, point(cx + dx + cz * cols).z) || enemyBlocked(enemy, point(cx + (cz + dz) * cols).x, point(cx + (cz + dz) * cols).z))) continue;
      const score = scores[current] + Math.hypot(dx, dz);
      if (score >= scores[next]) continue;
      scores[next] = score;
      parents[next] = current;
      if (!open.includes(next)) open.push(next);
    }
  }
  return [];
}
function emitNoise(point) {
  for(const e of enemies)if(!e.dead&&Math.abs(point.y-e.elevation)<3&&Math.hypot(e.x-point.x,e.z-point.z)<11){e.noise={x:point.x,z:point.z,until:performance.now()+6500};e.nextPathAt=0;}
}
function updateEnemies(dt) {
  const p = playerBody.translation();
  const now = performance.now();
  for (const enemy of enemies) {
    if (enemy.dead) {
      const collapse = Math.min(1, (now - enemy.deathAt) / 850);
      if (collapse < 1) enemy.mixer.update(dt);
      enemy.root.rotation.z = -Math.PI * 0.5 * collapse;
      enemy.root.position.y = enemy.elevation + 0.48 * collapse;
      if (now > enemy.expireAt) { scene.remove(enemy.root, enemy.bar); enemy.expireAt = Infinity; }
      continue;
    }
    for (const rock of rocks) {
      if (!rock.armed || rock.spent || rock === held) continue;
      const end = rock.body.translation(), start = rock.previous;
      const vx = end.x - start.x, vz = end.z - start.z;
      const t = THREE.MathUtils.clamp(((enemy.x - start.x) * vx + (enemy.z - start.z) * vz) / Math.max(0.0001, vx * vx + vz * vz), 0, 1);
      const hitX = start.x + vx * t, hitZ = start.z + vz * t, hitY = start.y + (end.y - start.y) * t;
      if (Math.hypot(enemy.x - hitX, enemy.z - hitZ) > 0.64 || hitY < enemy.elevation + 0.12 || hitY > enemy.elevation + 1.95) continue;
      rock.spent = true;
      const v = rock.body.linvel();
      rock.body.setLinvel({ x: v.x * 0.12, y: 0.45, z: v.z * 0.12 }, true);
      damageEnemy(enemy, 0.45 + 2.55 * (rock.power ?? 0));
      break;
    }
    if (enemy.dead) continue;
    enemy.mixer.update(dt);
    const investigate = enemy.noise && now < enemy.noise.until && Math.hypot(p.x-enemy.x,p.z-enemy.z)>2.4;
    const target = investigate ? enemy.noise : p;
    const dx = target.x - enemy.x, dz = target.z - enemy.z;
    const distance = Math.hypot(dx, dz);
    if (enemy.awakeWhen && !owned.has(enemy.awakeWhen)) {
      setEnemyAction(enemy, 'idle');
    } else if (now < enemy.attackRecoverAt) {
      if (!enemy.attackLanded && now >= enemy.attackImpactAt) {
        enemy.attackLanded = true;
        if (Math.hypot(p.x-enemy.x,p.z-enemy.z) < 1.9 && Math.abs(playerFeet() - enemy.elevation) < 1.2) {
          lastPlayerHit = now;
          health = Math.max(0, health - 1);
          $('health-value').textContent = `${'● '.repeat(health)}${'○ '.repeat(3 - health)}`.trim();
          say(health ? 'MONSTER STRIKE — SUIT DAMAGED' : 'SUIT FAILED — RETURNED TO OUTPOST ENTRY', 1.5);
          if (!health) {
            respawn('SUIT FAILED');
          }
        }
      }
    } else if (now > enemy.hitUntil && distance < 12 && (investigate || Math.abs(playerFeet()-enemy.homeElevation)<2.4)) {
      if (distance > (investigate ? 0.4 : 1.65) || (enemy.behavior === 'climber' && playerFeet() - enemy.elevation > 0.45)) {
        const speed = enemy.room === 0 ? 0.62 : 0.78;
        const climbBox = !investigate && enemy.behavior === 'climber' && playerFeet() > enemy.homeElevation + 0.55
          ? crates.find(c => !c.broken && c.type !== 'flammable' && c !== held && c.size >= 0.75 && c.size <= 1.25 && Math.hypot(c.body.translation().x - enemy.x, c.body.translation().z - enemy.z) < 1.6 && Math.hypot(c.body.translation().x - p.x, c.body.translation().z - p.z) < 3.1)
          : null;
        if (climbBox) {
          const c = climbBox.body.translation();
          enemy.x = THREE.MathUtils.damp(enemy.x, c.x, 2.3, dt);
          enemy.z = THREE.MathUtils.damp(enemy.z, c.z, 2.3, dt);
          enemy.elevation = THREE.MathUtils.damp(enemy.elevation, c.y + climbBox.size / 2, 1.7, dt);
          setEnemyAction(enemy, enemy.elevation < c.y + climbBox.size / 2 - 0.13 ? 'climb' : 'walk');
        } else {
          enemy.elevation = THREE.MathUtils.damp(enemy.elevation, enemy.homeElevation, 2.5, dt);
          if (!enemy.path?.length || now > (enemy.nextPathAt ?? 0) || Math.hypot(target.x - (enemy.pathTarget?.x ?? 999), target.z - (enemy.pathTarget?.z ?? 999)) > 0.9) {
            enemy.path = routeEnemy(enemy, target.x, target.z);
            enemy.pathTarget = { x: target.x, z: target.z };
            enemy.nextPathAt = now + 2200;
          }
          while (enemy.path?.length && Math.hypot(enemy.path[0].x - enemy.x, enemy.path[0].z - enemy.z) < 0.16) enemy.path.shift();
          const waypoint = enemy.path?.[0];
          if (waypoint) {
            const toX = waypoint.x - enemy.x, toZ = waypoint.z - enemy.z;
            const length = Math.hypot(toX, toZ);
            const step = Math.min(length, speed * dt);
            const nextX = enemy.x + toX / length * step, nextZ = enemy.z + toZ / length * step;
            if (!enemyBlocked(enemy, nextX, nextZ)) {
              enemy.x = nextX; enemy.z = nextZ;
              setEnemyAction(enemy, 'walk');
            } else { enemy.path = []; setEnemyAction(enemy, 'idle'); }
          } else setEnemyAction(enemy, 'idle');
        }
      } else if (investigate) { enemy.noise=null; setEnemyAction(enemy,'idle'); } else if (now > enemy.attackAt && now - lastPlayerHit > 1100) {
        const action = setEnemyAction(enemy, enemy.attackName) || setEnemyAction(enemy, 'attack');
        const duration = action?.getClip().duration ?? 0.9;
        enemy.attackImpactAt = now + Math.max(280, Math.min(620, duration * 460));
        enemy.attackRecoverAt = now + Math.max(850, duration * 1000);
        enemy.attackAt = now + Math.max(1450, duration * 1000 + 300);
        enemy.attackLanded = false;
        sound('monsterAttack');
      }
    } else if (now > enemy.hitUntil && now > enemy.attackAt) setEnemyAction(enemy, 'idle');
    enemy.root.position.x = enemy.x;
    enemy.root.position.y = enemy.elevation;
    enemy.root.position.z = enemy.z;
    enemy.root.rotation.y = Math.atan2(dx, dz);
    enemy.bar.position.set(enemy.x, 2.05 + enemy.elevation, enemy.z);
    enemy.bar.quaternion.copy(camera.quaternion);
  }
}
function forward() { return { x: Math.sin(yaw), z: Math.cos(yaw) }; }
function playerFeet() { return playerBody.translation().y - 0.85; }
function say(message, seconds = 2.5) { $('toast').textContent = message; noticeUntil = performance.now() + seconds * 1000; }
function mark(id) { completed.add(id); $(`obj-${id}`)?.classList.add('done'); }
function startAudio() {
  if (audio) { audio.resume(); return; }
  audio = new AudioContext();
  effects = createSounds({ context: audio });
}
function sound(kind) {
  effects?.[kind]?.();
}

function visibleCarryable(item) {
  const p=playerBody.translation(),q=item.body.translation();
  const origin={x:p.x,y:p.y+0.65,z:p.z};
  const delta={x:q.x-origin.x,y:q.y-origin.y,z:q.z-origin.z};
  const distance=Math.hypot(delta.x,delta.y,delta.z);
  const direction={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
  const hit=world.castRay(new RAPIER.Ray(origin,direction),distance,true,undefined,undefined,playerCollider);
  return !hit || hit.collider.handle===item.collider.handle;
}
function nearestCrate() {
  const p = playerBody.translation();
  const f = forward();
  let result = null;
  let best = 3.1;
  for (const crate of crates) {
    if (crate.broken || crate.type !== 'special' || crate === held) continue;
    const q = crate.body.translation();
    const dx = q.x - p.x, dz = q.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance > best || dx * f.x + dz * f.z < distance * 0.38 || Math.abs(q.y - p.y) > 2.2) continue;
    if (!visibleCarryable(crate)) continue;
    best = distance;
    result = crate;
  }
  return result;
}
function nearestRock() {
  const p = playerBody.translation();
  const f = forward();
  let result = null;
  let best = 2.1;
  for (const rock of rocks) {
    if (rock.broken || rock === held) continue;
    const q = rock.body.translation();
    const dx = q.x - p.x, dz = q.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance > best || dx * f.x + dz * f.z < distance * 0.3 || Math.abs(q.y - p.y) > 1.2) continue;
    if (!visibleCarryable(rock)) continue;
    best = distance;
    result = rock;
  }
  return result;
}
function nearestCarryable() {
  const rock = nearestRock(), box = nearestCrate();
  if (!rock) return box;
  if (!box) return rock;
  const p = playerBody.translation();
  const r = rock.body.translation(), b = box.body.translation();
  return Math.hypot(r.x - p.x, r.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? rock : box;
}
function grabBlockReason(crate) {
  if (crate.kind === 'rock') return null;
  const p = crate.body.translation();
  const bottom = p.y - crate.size / 2;
  const top = p.y + crate.size / 2;
  const onMainFloor = Math.abs(bottom) < 0.16;
  const onPlatform = finalPlatforms.some(stage =>
    Math.abs(bottom - stage.top) < 0.18 &&
    Math.abs(p.x - stage.x) + crate.size / 2 < stage.width / 2 + 0.08 &&
    Math.abs(p.z - stage.z) + crate.size / 2 < stage.depth / 2 + 0.08
  );
  if (!onMainFloor && !onPlatform) return 'CRATE MUST REST ON A FLOOR';
  if (Math.abs(crate.body.linvel().y) > 0.7) return 'WAIT FOR CRATE TO SETTLE';
  const stacked = crates.some(other => {
    if (other === crate || other.broken || other === held) return false;
    const q = other.body.translation();
    const otherBottom = q.y - other.size / 2;
    return otherBottom > top - 0.16 && otherBottom < top + 0.25 &&
      Math.abs(q.x - p.x) < (crate.size + other.size) * 0.42 &&
      Math.abs(q.z - p.z) < (crate.size + other.size) * 0.42;
  });
  if (stacked) return 'CLEAR THE BOX ON TOP FIRST';
  const player = playerBody.translation();
  if (playerFeet() > top - 0.15 && playerFeet() < top + 0.4 &&
      Math.abs(player.x - p.x) < crate.size * 0.58 && Math.abs(player.z - p.z) < crate.size * 0.58) return 'STEP OFF THE CRATE FIRST';
  return null;
}
function carriedRotation(crate) {
  const rotation = crate.body.rotation();
  if (crate !== held || !heldRotationAtGrab) return rotation;
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - heldYawAtGrab);
  const target = turn.multiply(heldRotationAtGrab);
  return { x: target.x, y: target.y, z: target.z, w: target.w };
}
function heldPosition(crate) {
  const p = playerBody.translation(), f = forward();
  const distance = crate.kind === 'rock' ? 1.18 : 1.5 + crate.size * 0.25;
  return { x: p.x + f.x * distance, y: p.y + (crate.kind === 'rock' ? 0.15 : 0.2), z: p.z + f.z * distance };
}
// Clearance checks apply only when releasing a box back into the physics world.
function dropPositionClear(crate, position, rotation, shape) {
  let clear = true;
  world.intersectionsWithShape(position, rotation, shape, collider => {
    if (collider.handle !== crate.collider.handle && collider.handle !== playerCollider.handle) {
      clear = false;
      return false;
    }
    return true;
  }, undefined, undefined, crate.collider, playerBody);
  return clear;
}
function safeDropPosition(crate, requestedDistance, playerPosition = playerBody.translation(), rotation = carriedRotation(crate)) {
  const p = playerPosition;
  const f = forward();
  const minDistance = 0.45 + crate.size * 0.5;
  const origin = { x: p.x + f.x * minDistance, y: p.y + 0.2, z: p.z + f.z * minDistance };
  const shape = new RAPIER.Cuboid(crate.size / 2, crate.size / 2, crate.size / 2);
  if (!dropPositionClear(crate, origin, rotation, shape)) return null;
  const travel = Math.max(0, requestedDistance - minDistance);
  const hit = world.castShape(
    origin, rotation, { x: f.x * travel, y: 0, z: f.z * travel },
    shape,
    0.035, 1, true, undefined, undefined, crate.collider, playerBody
  );
  const fraction = hit ? Math.max(0, hit.time_of_impact - 0.02 / Math.max(travel, 0.01)) : 1;
  return { x: origin.x + f.x * travel * fraction, y: origin.y, z: origin.z + f.z * travel * fraction };
}
function grab() {
  const crate = nearestCarryable();
  if (!crate) { say('NO CELL OR STEP BOX IN REACH', 0.8); return; }
  const reason = grabBlockReason(crate);
  if (reason) { sound('denied'); say(reason, 1.2); return; }
  held = crate;
  if (crate.kind === 'rock') { crate.armed = false; crate.spent = false; }
  heldYawAtGrab = yaw;
  const rotation = crate.body.rotation();
  heldRotationAtGrab = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  crate.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  crate.collider.setEnabled(false);
  crate.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  const carryPosition = heldPosition(crate);
  crate.body.setTranslation(carryPosition, true);
  crate.body.setNextKinematicTranslation(carryPosition);
  crate.mesh.position.set(carryPosition.x, carryPosition.y, carryPosition.z);
  grabbedThisPress = true;
  sound('grab');
  say(crate.kind === 'rock' ? 'CELL READY' : 'STEP BOX SECURED', 0.8);
}
function throwHeld() {
  if (!held) return;
  const f = forward();
  const seconds = (performance.now() - chargeStart) / 1000;
  const drop = held.type === 'special' || seconds < CHARGE_DELAY_MS / 1000;
  const power = Math.min(1, Math.max(0, (seconds * 1000 - CHARGE_DELAY_MS) / CHARGE_RAMP_MS));
  const speed = drop ? 0 : 3 + power * 9;
  const crate = held;
  const dropPosition = crate.kind === 'rock'
    ? (() => { const p = playerBody.translation(); return { x: p.x + f.x * 1.15, y: p.y + (drop ? -0.45 : 0.15), z: p.z + f.z * 1.15 }; })()
    : drop ? (()=>{const target=campaign.placement();const shape=new RAPIER.Cuboid(crate.size/2,crate.size/2,crate.size/2);return dropPositionClear(crate,target,carriedRotation(crate),shape)?target:safeDropPosition(crate,1.05);})() : null;
  held = null;
  heldRotationAtGrab = null;
  if (dropPosition) crate.body.setTranslation(dropPosition, true);
  crate.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  crate.collider.setEnabled(true);
  if (crate.kind === 'rock') { crate.armed = !drop; crate.spent = drop; crate.power = power; }
  crate.body.setLinvel({ x: f.x * speed, y: drop ? 0 : 0.4 + power * 1.2, z: f.z * speed }, true);
  if (!drop) crate.body.setAngvel({ x: 2.1 * power, y: 1.3 * power, z: -1.8 * power }, true);
  charging = false;
  $('charge').hidden = true;
  sound(drop ? 'drop' : 'throw');
}
function climb() {
  const p = playerBody.translation();
  const feet = playerFeet();
  const f = forward();
  const targets = crates.filter(c => !c.broken && c !== held && c !== panel && !c.debris && c.body.linvel().x ** 2 + c.body.linvel().z ** 2 < 1.7 && Math.abs(c.body.linvel().y) < 0.6)
    .map(c => ({ x: c.body.translation().x, z: c.body.translation().z, top: c.body.translation().y + c.size / 2, size: c.size, kind: 'crate' }));
  targets.push(...finalPlatforms.map((stage, index) => ({ ...stage, index, kind: 'platform' })));
  targets.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  for (const t of targets) {
    const dx = t.x - p.x, dz = t.z - p.z;
    const edgeDistance = t.kind === 'platform'
      ? Math.hypot(Math.max(0, Math.abs(dx) - t.width / 2), Math.max(0, Math.abs(dz) - t.depth / 2))
      : Math.hypot(dx, dz);
    const reach = t.kind === 'platform' ? 0.82 : 1.55 + t.size * 0.15;
    if (edgeDistance > reach || dx * f.x + dz * f.z < -0.1) continue;
    if (t.top - feet < 0.18 || t.top - feet > 1.18) continue;
    const landing = t.kind === 'platform'
      ? { x: THREE.MathUtils.clamp(p.x, t.x - t.width / 2 + 0.38, t.x + t.width / 2 - 0.38), z: THREE.MathUtils.clamp(p.z, t.z - t.depth / 2 + 0.38, t.z + t.depth / 2 - 0.38) }
      : { x: t.x, z: t.z };
    const liftY=Math.max(p.y,t.top+0.91)+0.16;
    const obstruction=world.castShape({x:p.x,y:liftY,z:p.z},{x:0,y:0,z:0,w:1},{x:landing.x-p.x,y:0,z:landing.z-p.z},playerCollider.shape,0.015,1,true,undefined,undefined,playerCollider,playerBody);
    if(obstruction)continue;
    climbState = {
      from: { ...p }, to: { ...landing, y: t.top + 0.91 },
      elapsed: 0, duration: 0.74,
    };
    sound('climb');
    say('CLIMBING…', 0.75);
    return;
  }
  say('NO REACHABLE SURFACE', 0.8);
}
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyX','KeyR'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keysDown.add(e.code);
  startAudio();
  if (won) return;
  if (climbState && e.code !== 'KeyR') return;
  if (e.code === 'Space') {
    if (tryExit()) return;
    const control=campaign.nearControl();
    if(control && !held) { control.use(); return; }
    if (!held) grab();
    else { charging = true; chargeStart = performance.now(); $('charge').hidden = held.type === 'special'; }
  }
  if (e.code === 'KeyX') climb();
  if (e.code === 'KeyR') location.reload();
});
window.addEventListener('keyup', e => {
  keysDown.delete(e.code);
  if (e.code === 'Space') {
    if (grabbedThisPress) grabbedThisPress = false;
    else if (charging) throwHeld();
  }
});
window.addEventListener('blur', () => { keysDown.clear(); if (charging) throwHeld(); });
$('restart').addEventListener('click', () => { location.href='/games-3d/box-physics?level=1'; });

function respawn(reason) {
  const p=campaign.checkpoint;
  climbState=null; fallPeak=p.y-0.85; charging=false; $('charge').hidden=true;
  if(held) { held.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true); held.collider.setEnabled(true); held.body.setTranslation({x:p.x-1,y:p.y-0.4,z:p.z},true);held.body.setLinvel({x:0,y:0,z:0},true);held=null; }
  playerBody.setTranslation(p,true);playerBody.setNextKinematicTranslation(p); health=3;$('health-value').textContent='● ● ●';
  sound('hazard');say(`${reason} — ${campaign.checkpointName} CHECKPOINT`);
}
function nearExit() {
  const p=playerBody.translation();return Math.abs(p.x-exitPosition.x)<1.3&&Math.abs(p.z-exitPosition.z)<1.5&&Math.abs(playerFeet()-exitPosition.y)<0.25;
}
function tryExit() {
  if(!nearExit())return false;
  if(!owned.has(exitPosition.key)){say(`${exitPosition.key.toUpperCase()} KEY REQUIRED`);sound('denied');return true;}
  if(level===3&&!campaign.flags.has('shutdown')){say('SHUT DOWN THE FURNACE BEFORE EVACUATING');return true;}
  if(!exiting){exiting=true;campaign.departure.open=true;sound('door');say('DEPARTURE DOOR LOWERING…');}
  return true;
}
function updateKeys() {
  const p = playerBody.translation();
  for (const [color, key] of keyMeshes) {
    if (owned.has(color)) continue;
    key.group.rotation.y += 0.02;
    if (Math.hypot(key.x-p.x,key.z-p.z)>0.85 || Math.abs(playerFeet()-key.top)>0.65) continue;
    // A key must actually be uncovered; proximity through its covering crate does not count.
    if (crates.some(c => !c.broken && !c.debris && Math.hypot(c.body.translation().x - key.x, c.body.translation().z - key.z) < c.size * 0.65 && Math.abs(c.body.translation().y-key.top)<1.2)) continue;
    owned.add(color);
    scene.remove(key.group);
    scene.remove(key.light);
    $(`key-${color}`).classList.add('active');
    sound('key');
    say(`${color.toUpperCase()} KEY FOUND — USE AT MATCHING DOOR`);
    if (color === 'amber') $('hint').textContent = 'The goblin woke up. An orange fuel crate can stop it. Use the key at the amber door.';
    if (color === 'cyan') $('hint').textContent = 'Use the cyan key at its door; salvage cells and step boxes wait upstairs.';
  }
}
function updateMission() {
  const p=playerBody.translation(),feet=playerFeet();
  $('hint').textContent=campaign.hint();
  for(const h of campaign.hazards)if(h.kind==='lava'&&Math.abs(p.x-h.x)<h.width/2&&Math.abs(p.z-h.z)<h.depth/2&&feet<h.top+0.3){respawn('THERMAL CONTACT');break;}
  if(performance.now()>noticeUntil)$('toast').textContent='';
  const candidate=nearestCarryable(),control=campaign.nearControl();
  const carryingHint=held?.type==='special'?'SPACE → SET DOWN STEP BOX':'TAP SPACE → DROP CELL • HOLD → THROW';
  const grabHint=candidate?(grabBlockReason(candidate)??`SPACE → GRAB ${candidate.kind==='rock'?'CELL':'STEP BOX'}`):null;
  $('prompt').textContent=climbState?'CLIMBING…':nearExit()?(exiting?'DOOR LOWERING…':`SPACE → USE ${exitPosition.key.toUpperCase()} KEY`):held?carryingHint:control?`SPACE → ${control.label}`:grabHint??'X → CLIMB BOX OR LEDGE';
  $('prompt').hidden=charging&&held?.kind==='rock';
  if(charging){const v=Math.min(1,Math.max(0,(performance.now()-chargeStart-CHARGE_DELAY_MS)/CHARGE_RAMP_MS));$('charge-fill').style.width=`${v*100}%`;$('charge-percent').textContent=`${Math.round(v*100)}%`;}
  if(exiting&&!won&&campaign.departure.t===1){won=true;localStorage.setItem(`box-physics-chapter-${level}-cleared`,'1');sound('win');if(level<3)location.href=`/games-3d/box-physics?level=${level+1}`;else{music.win();$('end').hidden=false;}}
}

function physicsStep(dt) {
  campaign.update(dt);
  if (!won) {
    if (climbState) {
      fallPeak = playerFeet();
      climbState.elapsed = Math.min(climbState.duration, climbState.elapsed + dt);
      const t = climbState.elapsed / climbState.duration;
      const smooth = v => v * v * (3 - 2 * v);
      const progress = smooth(Math.max(0, Math.min(1, (t - 0.25) / 0.65)));
      const lift = Math.max(climbState.from.y, climbState.to.y) + 0.16;
      const y = t < 0.33
        ? THREE.MathUtils.lerp(climbState.from.y, lift, smooth(t / 0.33))
        : t < 0.8 ? lift : THREE.MathUtils.lerp(lift, climbState.to.y, smooth((t - 0.8) / 0.2));
      playerBody.setNextKinematicTranslation({
        x: THREE.MathUtils.lerp(climbState.from.x, climbState.to.x, progress),
        y, z: THREE.MathUtils.lerp(climbState.from.z, climbState.to.z, progress),
      });
      if (t >= 1) climbState = null;
    } else {
      yaw += ((keysDown.has('ArrowLeft') ? 1 : 0) - (keysDown.has('ArrowRight') ? 1 : 0)) * dt * 2.05;
      const move = (keysDown.has('ArrowUp') ? 1 : 0) - (keysDown.has('ArrowDown') ? 1 : 0);
      const f = forward();
      if (move > 0 && !held) {
        const crate = nearestCrate();
        if (crate) {
          const p = playerBody.translation(), q = crate.body.translation();
          if (Math.hypot(q.x - p.x, q.z - p.z) < 1.05 + crate.size * 0.5 && Math.abs(q.y - p.y) < 1.1) {
            const v = crate.body.linvel();
            const push = crate.type === 'metal' ? 0.42 : 0.82;
            crate.body.setLinvel({ x: f.x * push, y: v.y, z: f.z * push }, true);
            if (performance.now() - lastPushSound > 400) { sound('push'); lastPushSound = performance.now(); }
          }
        }
      }
      controller.computeColliderMovement(playerCollider, { x: f.x * move * dt * 3.4, y: -dt * 4.8, z: f.z * move * dt * 3.4 });
      const d = controller.computedMovement();
      if (Math.hypot(d.x, d.z) > 0.018 && playerFeet() < 0.2 && performance.now() - lastStepSound > 490) {
        sound('step'); lastStepSound = performance.now();
      }
      const p = playerBody.translation();
      const next = { x: p.x + d.x, y: p.y + d.y, z: p.z + d.z };
      for (const enemy of enemies) {
        if (enemy.dead || Math.abs(next.y - 0.85 - enemy.elevation) > 1.15) continue;
        const oldDistance = Math.hypot(p.x - enemy.x, p.z - enemy.z);
        const newDistance = Math.hypot(next.x - enemy.x, next.z - enemy.z);
        if (newDistance < 1.35 && newDistance < oldDistance) { next.x = p.x; next.z = p.z; break; }
      }
      const nextFeet = next.y - 0.85;
      if(nextFeet < -0.55 || (d.y < -0.015 && fallPeak-nextFeet>2.5)) {
        respawn(nextFeet < -0.55?'PIT FALL':'FATAL FALL');Object.assign(next,campaign.checkpoint);
      } else if(d.y > -0.015) fallPeak=nextFeet;
      else fallPeak=Math.max(fallPeak,p.y-0.85);
      playerBody.setNextKinematicTranslation(next);
    }
  }
  if (held) {
    held.body.setNextKinematicTranslation(heldPosition(held));
    held.body.setNextKinematicRotation(carriedRotation(held));
  }
  const incomingVelocity = new Map();
  for (const rock of rocks) {
    if (rock.broken) continue;
    rock.previous = { ...rock.body.translation() };
    incomingVelocity.set(rock, rock.body.linvel());
  }
  world.step(events);
  events.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const a = colliderEntities.get(h1), b = colliderEntities.get(h2);
    const rock = a?.kind === 'rock' ? a : b?.kind === 'rock' ? b : null;
    const crate = rock === a ? b : a;
    if (!rock?.armed || rock.spent) return;
    emitNoise(rock.body.translation());
    if(!crate || crate.broken)return;
    const v = incomingVelocity.get(rock) || { x: 0, y: 0, z: 0 };
    if (Math.hypot(v.x, v.y, v.z) < 2.1) return;
    rock.spent = true;
    emitNoise(rock.body.translation());
    if (crate.kind === 'relay') { if(!crate.relay.manual)campaign.activate(crate.relay);else sound('hardHit'); return; }
    if (crate.kind === 'trapSwitch') { if(!crate.trap.campaignControlled)toggleTrap(crate.trap); return; }
    if (!crate.type) return;
    if (crate.type === 'flammable') explodeBox(crate);
    else if (crate.type === 'wood' || crate.type === 'fragile') destroy(crate);
    else sound('hardHit');
  });
  updateTraps(performance.now());
  updateEnemies(dt);
  const now = performance.now();
  for (let i = debrisPieces.length - 1; i >= 0; i--) {
    const c = debrisPieces[i];
    if (now >= c.expireAt) { removeCrate(c); debrisPieces.splice(i, 1); continue; }
    c.velocity.y -= 9.81 * dt;
    c.mesh.position.addScaledVector(c.velocity, dt);
    c.mesh.rotation.x += c.spin.x * dt;
    c.mesh.rotation.y += c.spin.y * dt;
    c.mesh.rotation.z += c.spin.z * dt;
    if (c.mesh.position.y < c.floorY) {
      c.mesh.position.y = c.floorY;
      c.velocity.y = Math.abs(c.velocity.y) > 0.65 ? -c.velocity.y * 0.2 : 0;
      c.velocity.x *= 0.94; c.velocity.z *= 0.94;
      c.spin.multiplyScalar(0.86);
      c.mesh.rotation.x *= 0.86; c.mesh.rotation.z *= 0.86;
    }
    if (now > c.fadeAt) c.mesh.material.opacity = Math.max(0.02, (c.expireAt - now) / (c.expireAt - c.fadeAt));
  }
  for (let j = dustBursts.length - 1; j >= 0; j--) {
    const burst = dustBursts[j];
    const age = now - burst.born;
    if (age > burst.life) {
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      burst.points.material.dispose();
      dustBursts.splice(j, 1);
      continue;
    }
    const { positions, velocities } = burst;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += velocities[i] * dt;
      positions[i + 1] += velocities[i + 1] * dt;
      positions[i + 2] += velocities[i + 2] * dt;
      velocities[i + 1] -= 5.5 * dt;
      if (positions[i + 1] < 0.05) { positions[i + 1] = 0.05; velocities[i + 1] *= -0.24; velocities[i] *= 0.86; velocities[i + 2] *= 0.86; }
    }
    burst.points.geometry.attributes.position.needsUpdate = true;
    burst.points.material.opacity = 0.9 * (1 - age / burst.life);
  }
  for (let j = fireBursts.length - 1; j >= 0; j--) {
    const blast = fireBursts[j];
    const t = (now - blast.born) / blast.life;
    if (t >= 1) {
      scene.remove(blast.flash, blast.light);
      blast.flash.geometry.dispose();
      blast.flash.material.dispose();
      fireBursts.splice(j, 1);
      continue;
    }
    const radius = blast.size * (0.18 + 1.7 * Math.sqrt(t));
    blast.flash.scale.setScalar(radius);
    blast.flash.material.opacity = 0.67 * (1 - t) ** 2;
    blast.light.intensity = 15 * (1 - t) ** 2;
  }
  for (const c of crates) {
    if (c.broken) continue;
    const p = c.body.translation(), q = c.body.rotation();
    c.mesh.position.set(p.x, p.y, p.z);
    c.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
  for (const rock of rocks) {
    if (rock.broken) continue;
    const p = rock.body.translation(), q = rock.body.rotation();
    rock.mesh.position.set(p.x, p.y, p.z);
    rock.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
  updateKeys();
  updateMission();
}

let last = performance.now(), accumulator = 0;
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.06);
  last = now;
  accumulator += elapsed;
  while (accumulator >= 1 / 60) { physicsStep(1 / 60); accumulator -= 1 / 60; }
  const p = playerBody.translation();
  const f = forward();
  camera.position.set(p.x, p.y + 0.75, p.z);
  camera.lookAt(p.x + f.x * 5, p.y + 0.33, p.z + f.z * 5);
  const climbProgress = climbState ? climbState.elapsed / climbState.duration : null;
  if (climbProgress !== null) camera.rotateZ(Math.sin(Math.PI * climbProgress) * 0.023);
  hands.update(Boolean(held), climbProgress, now / 1000);
  lava.update(now / 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
$('loading').textContent = 'DEPLOYING HOSTILES…';
await loadEnemies();
$('loading').hidden = true;
requestAnimationFrame(frame);
window.__boxPhysics = { campaign, level, playerCollider, respawn, world, crates, rocks, enemies, traps, debrisPieces, playerBody, owned, completed, doors, panel, destroy, explodeBox, damageEnemy, grabBlockReason, exitDoor, exitPosition, finalPlatforms, platformCrates, setYaw(value) { yaw = value; }, get yaw() { return yaw; }, get held() { return held; }, get climbing() { return Boolean(climbState); }, get health() { return health; } };
