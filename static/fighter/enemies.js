import * as THREE from 'three';
import { loadEnemyJet, loadModel, MATERIALS } from './jet.js';
import { ENEMY as ENEMY_DEFAULTS, STRUCTURES, SCORE } from './config.js';

// Bandit squadrons and the ground bases. Every structure and plane is a
// target: { kind, pos, radius, hp, alive, stun, vel, takeDamage() }.

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _q = new THREE.Quaternion();

const MAT = {
  olive: new THREE.MeshStandardMaterial({ color: 0x5f6a46, roughness: 0.85 }),
  oliveDark: new THREE.MeshStandardMaterial({ color: 0x3e4731, roughness: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8e8a80, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x5b5852, roughness: 0.95 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.6, metalness: 0.2 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb83030, roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6d7580, roughness: 0.45, metalness: 0.7 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x4a7a9a, roughness: 0.2, metalness: 0.6 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 1 }),
  paint: new THREE.MeshStandardMaterial({ color: 0xe8e0c0, roughness: 0.9 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xd8b030, roughness: 0.6 }),
  charred: new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 1, metalness: 0.1 }),
  ember: new THREE.MeshBasicMaterial({ color: 0xff6a20 }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfff0a0 })
};

function sh(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) {
  const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));
  m.position.set(x, y, z);
  return m;
}

const BUILDERS = {
  hangar() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-14, 0);
    shape.lineTo(14, 0);
    shape.absarc(0, 0, 14, 0, Math.PI, false);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 38, bevelEnabled: false });
    geo.translate(0, 0, -19);
    const arch = sh(new THREE.Mesh(geo, MAT.olive));
    g.add(arch);
    const door = box(18, 9, 0.6, MAT.oliveDark, 0, 4.5, -19);
    g.add(door);
    g.add(box(1.2, 11, 0.8, MAT.paint, -9.6, 5.5, -19.1), box(1.2, 11, 0.8, MAT.paint, 9.6, 5.5, -19.1));
    g.add(box(0.6, 0.6, 40, MAT.oliveDark, 0, 14.2, 0));
    return { group: g, height: 14 };
  },
  tower() {
    const g = new THREE.Group();
    g.add(cyl(2.4, 3.2, 18, MAT.concrete, 0, 9, 0));
    g.add(box(9, 4.2, 9, MAT.glass, 0, 20, 0));
    g.add(box(10, 0.6, 10, MAT.concreteDark, 0, 17.8, 0), box(10, 0.6, 10, MAT.concreteDark, 0, 22.3, 0));
    g.add(cyl(0.12, 0.12, 6, MAT.steel, 0, 25.5, 0, 6));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), MAT.ember);
    lamp.position.y = 28.6;
    g.add(lamp);
    return { group: g, height: 24, blink: lamp };
  },
  tank() {
    const g = new THREE.Group();
    g.add(cyl(6, 6, 9, MAT.white, 0, 4.5, 0, 24));
    const cap = sh(new THREE.Mesh(new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.white));
    cap.position.y = 9;
    cap.scale.y = 0.5;
    g.add(cap);
    g.add(cyl(6.1, 6.1, 1.2, MAT.red, 0, 6.5, 0, 24));
    g.add(cyl(0.4, 0.4, 12, MAT.steel, 7, 0.8, 0, 8).rotateZ(Math.PI / 2));
    return { group: g, height: 12 };
  },
  radar() {
    const g = new THREE.Group();
    g.add(box(8, 3, 8, MAT.concrete, 0, 1.5, 0));
    g.add(cyl(0.8, 1.1, 9, MAT.steel, 0, 7.5, 0, 10));
    const dishGroup = new THREE.Group();
    dishGroup.position.y = 12;
    const dish = sh(new THREE.Mesh(new THREE.SphereGeometry(6.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), MAT.white));
    dish.rotation.x = -Math.PI / 2 + 0.6;
    dish.position.z = 3;
    dishGroup.add(dish);
    dishGroup.add(cyl(0.15, 0.15, 5, MAT.steel, 0, 2, 0.5, 6).rotateX(0.6));
    g.add(dishGroup);
    return { group: g, height: 16, spin: dishGroup };
  },
  bunker() {
    const g = new THREE.Group();
    const body = sh(new THREE.Mesh(new THREE.CylinderGeometry(9, 12.5, 6, 4), MAT.concrete));
    body.rotation.y = Math.PI / 4;
    body.position.y = 3;
    g.add(body);
    g.add(box(10, 1.4, 0.8, MAT.concreteDark, 0, 3.6, -8.6));
    g.add(box(10, 1.4, 0.8, MAT.concreteDark, 0, 3.6, 8.6));
    g.add(box(0.8, 1.4, 10, MAT.concreteDark, -8.6, 3.6, 0));
    g.add(box(0.8, 1.4, 10, MAT.concreteDark, 8.6, 3.6, 0));
    g.add(cyl(0.2, 0.2, 4, MAT.steel, 3, 8, 3, 6));
    return { group: g, height: 7 };
  },
  sam() {
    const g = new THREE.Group();
    g.add(box(10, 1.2, 10, MAT.oliveDark, 0, 0.6, 0));
    g.add(cyl(1.4, 1.8, 2.2, MAT.olive, 0, 2.3, 0, 10));
    const yaw = new THREE.Group();
    yaw.position.y = 3.4;
    const rack = new THREE.Group();
    rack.rotation.x = -0.9;
    for (const [x, y] of [[-1.3, 0.4], [1.3, 0.4], [-1.3, 1.6], [1.3, 1.6]]) {
      const tube = cyl(0.42, 0.42, 6.5, MAT.olive, x, y, 0, 10);
      tube.rotation.x = Math.PI / 2;
      rack.add(tube);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10), MAT.white);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(x, y, -3.6);
      rack.add(tip);
      const band = cyl(0.45, 0.45, 0.4, MAT.red, x, y, -2.2, 10);
      band.rotation.x = Math.PI / 2;
      rack.add(band);
    }
    rack.add(box(3.6, 0.4, 2, MAT.oliveDark, 0, 1.0, 1.5));
    yaw.add(rack);
    g.add(yaw);
    return { group: g, height: 7, yaw, rack };
  },
  aa() {
    const g = new THREE.Group();
    g.add(cyl(3.2, 3.6, 1.4, MAT.concreteDark, 0, 0.7, 0, 12));
    const yaw = new THREE.Group();
    yaw.position.y = 1.4;
    yaw.add(box(3.2, 2.2, 3.4, MAT.olive, 0, 1.2, 0));
    const pitch = new THREE.Group();
    pitch.position.set(0, 1.6, -1.2);
    for (const x of [-0.6, 0.6]) {
      const barrel = cyl(0.14, 0.18, 5, MAT.steel, x, 0, -2.5, 8);
      barrel.rotation.x = Math.PI / 2;
      pitch.add(barrel);
    }
    pitch.add(box(2, 0.9, 1.2, MAT.oliveDark, 0, 0, 0));
    yaw.add(pitch);
    g.add(yaw);
    return { group: g, height: 4, yaw, pitch, muzzles: [new THREE.Vector3(-0.6, 0, -5), new THREE.Vector3(0.6, 0, -5)] };
  },
  runway() {
    const g = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(44, 420), MAT.asphalt);
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.3;
    strip.receiveShadow = true;
    g.add(strip);
    for (let z = -190; z <= 190; z += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12), MAT.paint);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.45, z);
      g.add(dash);
    }
    for (let z = -200; z <= 200; z += 40) {
      for (const x of [-23, 23]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), MAT.lamp);
        lamp.position.set(x, 0.8, z);
        g.add(lamp);
      }
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), MAT.asphalt);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(-40, 0.25, -100);
    g.add(apron);
    return { group: g, height: 1 };
  },
  crates() {
    const g = new THREE.Group();
    const spots = [[-3, 0, -3], [3, 0, -3], [0, 0, 3], [3.5, 0, 3.5], [-2, 3, -1], [1, 3, 1]];
    for (const [x, y, z] of spots) {
      const c = box(3, 3, 3, MAT.olive, x, y + 1.5, z);
      c.rotation.y = Math.random() * 0.4;
      g.add(c);
    }
    for (let i = 0; i < 4; i++) g.add(cyl(0.9, 0.9, 2.4, i % 2 ? MAT.yellow : MAT.red, 7 + (i % 2) * 2, 1.2, -4 + Math.floor(i / 2) * 2.2, 10));
    return { group: g, height: 6 };
  },
  rig() {
    const g = new THREE.Group();
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      g.add(cyl(1.8, 2.4, 34, MAT.rust, x, 10, z, 10));
      g.add(cyl(0.5, 0.5, 40, MAT.steel, x * 0.6, 8, z * 0.6, 6).rotateX(Math.atan2(z * 0.4, 36)));
    }
    g.add(box(42, 3, 42, MAT.steel, 0, 27, 0));
    g.add(box(40, 1, 40, MAT.concreteDark, 0, 29, 0));
    g.add(box(14, 10, 16, MAT.white, -12, 34, 8));
    g.add(box(14, 0.6, 16, MAT.red, -12, 39.3, 8));
    const derrick = sh(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.5, 36, 4, 1, true), MAT.rust));
    derrick.position.set(10, 47, -8);
    derrick.rotation.y = Math.PI / 4;
    g.add(derrick);
    g.add(cyl(0.5, 0.5, 30, MAT.steel, 20, 44, 18, 6));
    const pad = sh(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.6, 20), MAT.concrete));
    pad.position.set(12, 29.8, 12);
    g.add(pad);
    const h = new THREE.Mesh(new THREE.RingGeometry(6, 6.6, 24), MAT.paint);
    h.rotation.x = -Math.PI / 2;
    h.position.set(12, 30.2, 12);
    g.add(h);
    const crane = cyl(0.4, 0.4, 24, MAT.yellow, -16, 36, -14, 6);
    crane.rotation.z = 1.1;
    g.add(crane);
    return { group: g, height: 60, flare: new THREE.Vector3(20, 59, 18) };
  }
};

// Library vehicles. `length` metres along z, base on the ground.
async function vehicleBuilder(folder, length, { yawOffset = 0 } = {}) {
  const model = await loadModel(folder);
  const scale = length / model.size.z;
  const lift = -model.box.min.y * scale;
  const height = model.size.y * scale;
  return () => {
    const g = new THREE.Group();
    const o = model.object.clone();
    o.scale.setScalar(scale);
    o.position.y = lift;
    o.rotation.y = yawOffset;
    g.add(o);
    return { group: g, height };
  };
}

function fallbackVehicle(length, mat) {
  return () => {
    const g = new THREE.Group();
    g.add(box(length * 0.45, length * 0.3, length, mat, 0, length * 0.15, 0));
    return { group: g, height: length * 0.3 };
  };
}

// Library models placed by type. `scale` turns the model's centimetres into
// metres and then enlarges it (most kit models are life size, so 0.01 is true
// scale); `folders` alternate per instance; `turret` gives a yaw/pitch pair so
// the AA behaviour can aim it; `sink` metres of hull sit below the waterline.
const LIBRARY = {
  battletank: { folders: ['Vehicles/MainBattleTank'], scale: 0.012 },
  heavytank: { folders: ['Vehicles/TankHeavy', 'Vehicles/TankRocket'], scale: 0.012 },
  artillery: { folders: ['Vehicles/SelfPropelledArtillery'], scale: 0.012 },
  aatank: { folders: ['Vehicles/AntiAirTank'], scale: 0.012, turret: true },
  mech: { folders: ['Robots/MechHeavy', 'Robots/MechRaider', 'Robots/TitanMech'], scale: 0.015, turret: true },
  helo: { folders: ['Aircraft/AttackHelicopter', 'Aircraft/RescueHelicopter', 'Aircraft/TwinRotorHelicopter'], scale: 0.012 },
  jet: { folders: ['Aircraft/Interceptor', 'Aircraft/F16Jet', 'Aircraft/StarFighter'], scale: 0.012 },
  watertower: { folders: ['Buildings/WaterTower'], scale: 0.013 },
  turbine: { folders: ['Buildings/WindTurbine'], scale: 0.014 },
  antenna: { folders: ['Buildings/AntennaMast'], scale: 0.015 },
  fuelfarm: { folders: ['Buildings/FuelTank'], scale: 0.014 },
  container: { folders: ['Objects/ContainerRed', 'Objects/ContainerBlue'], scale: 0.012 },
  barrels: { folders: ['Objects/BarrelCluster'], scale: 0.025 },
  keep: { folders: ['Buildings/CastleKeep'], scale: 0.02 },
  gatehouse: { folders: ['Buildings/FortressGate'], scale: 0.02 },
  castle: { folders: ['Buildings/StoneCastle'], scale: 0.02 },
  carrier: { folders: ['Vehicles/AircraftCarrier'], scale: 0.04, sink: 7 },
  destroyer: { folders: ['Vehicles/Destroyer'], scale: 0.03, sink: 4, turret: true },
  patrolboat: { folders: ['Vehicles/PatrolBoat'], scale: 0.025, sink: 1.5, turret: true },
  submarine: { folders: ['Vehicles/Submarine'], scale: 0.03, sink: 18 },
  rock: { folders: ['Vegetation/RockLarge', 'Vegetation/RockMedium'], scale: 0.02 },
  boulder: { folders: ['Vegetation/BoulderSnow', 'Vegetation/RockMedium'], scale: 0.03 },
  pine: { folders: ['Vegetation/PineTree'], scale: 0.025 },
  deadtree: { folders: ['Vegetation/DeadTree'], scale: 0.03 },
  palm: { folders: ['Vegetation/PalmTall'], scale: 0.02 },
  cactus: { folders: ['Vegetation/PropCactus'], scale: 0.03 },
  lamp: { folders: ['Objects/LampPost'], scale: 0.015 },
  fence: { folders: ['Objects/FenceChainlink'], scale: 0.03 },
  barrier: { folders: ['Objects/JerseyBarrier'], scale: 0.03 },
  sandbags: { folders: ['Objects/SandbagWall'], scale: 0.03 },
  checkpoint: { folders: ['Objects/CheckpointGate'], scale: 0.025 },
  flag: { folders: ['Objects/FlagPole'], scale: 0.02 },
  approach: { folders: ['Roads/ApproachLights'], scale: 0.015 },
  tires: { folders: ['Objects/TireStack'], scale: 0.03 }
};

async function libraryBuilder(entry) {
  const models = await Promise.all(entry.folders.map((folder) => loadModel(folder)));
  let next = 0;
  return () => {
    const model = models[next++ % models.length];
    const g = new THREE.Group();
    const o = model.object.clone();
    o.scale.setScalar(entry.scale);
    o.position.y = -model.box.min.y * entry.scale;
    g.add(o);
    const height = model.size.y * entry.scale;
    const built = { group: g, height, sink: entry.sink || 0 };
    if (entry.turret) {
      // The whole model turns; a pivot near the top carries the muzzles.
      built.yaw = o;
      built.pitch = new THREE.Object3D();
      built.pitch.position.set(0, model.size.y * 0.7, 0);
      o.add(built.pitch);
      const reach = model.size.z * 0.35;
      built.muzzles = [new THREE.Vector3(-model.size.x * 0.15, 0, -reach), new THREE.Vector3(model.size.x * 0.15, 0, -reach)];
    }
    return built;
  };
}

function fallbackBuilder(def) {
  return fallbackVehicle(Math.max(6, def.radius * 1.2), MAT.oliveDark);
}

const BASE_SCALE = 1.35;

function buildPad(base, terrain) {
  const g = new THREE.Group();
  const y = base.kind === 'rig' ? null : terrain.groundAt(base.pos.x, base.pos.z);
  if (y == null) return g;
  const r = base.radius * 0.95;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 1 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.25;
  pad.receiveShadow = true;
  g.add(pad);
  const ringGeo = new THREE.RingGeometry(r - 4, r - 1.5, 40);
  const ring = new THREE.Mesh(ringGeo, MAT.paint);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);
  // Sandbag wall segments and lamp posts round the perimeter.
  const segments = 18;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    if (i % 6 === 0) continue; // gates
    const wall = box(r * 0.3, 2.2, 2.4, MAT.oliveDark, Math.sin(a) * (r + 3), 1.1, Math.cos(a) * (r + 3));
    wall.rotation.y = a;
    g.add(wall);
    if (i % 3 === 1) {
      g.add(cyl(0.25, 0.3, 9, MAT.steel, Math.sin(a) * (r + 6), 4.5, Math.cos(a) * (r + 6), 6));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), MAT.lamp);
      lamp.position.set(Math.sin(a) * (r + 6), 9.2, Math.cos(a) * (r + 6));
      g.add(lamp);
    }
  }
  g.position.set(base.pos.x, y, base.pos.z);
  return g;
}

export async function createEnemies({ scene, fx, projectiles, terrain, level, sounds, onEvent }) {
  // Per-theatre tuning (level.tuning) overrides the ENEMY defaults: the early
  // theatres have shorter AA reach, softer AA rounds and slower missile fire.
  const ENEMY = { ...ENEMY_DEFAULTS, ...(level.tuning || {}) };
  const [jetRes, tankRes, hummerRes, cisternaRes, ospreyRes, heliRes] = await Promise.allSettled([
    loadEnemyJet(),
    vehicleBuilder('Vehicles/TanqueFuturistaOrugas', 9),
    vehicleBuilder('Vehicles/Hummer', 5.5),
    vehicleBuilder('Vehicles/CamionCisterna', 12),
    vehicleBuilder('Vehicles/AvionMilitar', 18),
    vehicleBuilder('Vehicles/HelicopteroMilitar', 16)
  ]);
  for (const r of [jetRes, tankRes, hummerRes, cisternaRes, ospreyRes, heliRes]) if (r.status === 'rejected') console.warn('fighter model', r.reason);
  const jet = jetRes.status === 'fulfilled' ? jetRes.value : null;
  const vehicles = {
    armor: tankRes.status === 'fulfilled' ? tankRes.value : fallbackVehicle(9, MAT.olive),
    truck: [cisternaRes, hummerRes].map((r) => (r.status === 'fulfilled' ? r.value : fallbackVehicle(8, MAT.oliveDark))),
    parked: [ospreyRes, heliRes].map((r) => (r.status === 'fulfilled' ? r.value : fallbackVehicle(16, MAT.steel)))
  };

  // Library-backed types this level uses, loaded once each.
  const library = {};
  const used = new Set();
  for (const base of level.bases) for (const st of base.structures) if (LIBRARY[st.type]) used.add(st.type);
  const loaded = await Promise.allSettled([...used].map((type) => libraryBuilder(LIBRARY[type])));
  [...used].forEach((type, i) => {
    if (loaded[i].status === 'fulfilled') library[type] = loaded[i].value;
    else console.warn('fighter library model', type, loaded[i].reason);
  });

  const structures = [];
  const planes = [];
  const bases = [];
  let altIndex = 0;

  function makeStructure(spec, base) {
    const def = STRUCTURES[spec.type];
    if (!def) return null;
    let built;
    if (spec.type === 'armor') built = vehicles.armor();
    else if (spec.type === 'truck') built = vehicles.truck[altIndex++ % 2]();
    else if (spec.type === 'parked') built = vehicles.parked[altIndex++ % 2]();
    else if (LIBRARY[spec.type]) built = (library[spec.type] || fallbackBuilder(def))();
    else if (BUILDERS[spec.type]) built = BUILDERS[spec.type]();
    else return null;
    const g = built.group;
    const scale = spec.type === 'runway' ? 1 : BASE_SCALE;
    g.scale.setScalar(scale);
    built.height *= scale;
    const afloat = spec.type === 'rig' || def.afloat;
    const y = afloat ? terrain.waterLevel ?? 0 : terrain.groundAt(spec.x, spec.z);
    g.position.set(spec.x, y - (built.sink || 0) * scale, spec.z);
    g.rotation.y = THREE.MathUtils.degToRad(spec.yawDeg || 0);
    scene.add(g);
    const radius = def.radius * scale;
    const centreY = spec.type === 'rig' ? y + 32 * scale : y + Math.min(built.height, radius * 1.2) * 0.5;
    const s = {
      kind: 'ground', type: spec.type, name: def.name, def, base, root: g, built,
      pos: new THREE.Vector3(spec.x, centreY, spec.z), radius, hp: def.hp, maxHp: def.hp,
      alive: def.hp > 0, stun: 0, cooldown: 2 + Math.random() * 4, burst: 0, burstPause: 0, score: def.score,
      takeDamage(amount, at, how) {
        if (!s.alive) return;
        s.hp -= amount;
        if (how !== 'gun') fx.addShake(0.05);
        if (s.hp <= 0) destroyStructure(s);
      }
    };
    if (spec.type === 'rig' && built.flare) {
      const f = built.flare.clone().multiplyScalar(scale).applyMatrix4(g.matrixWorld.identity().makeRotationY(g.rotation.y)).add(g.position);
      fx.burn(f, { size: 3, duration: 1e9 });
    }
    return s;
  }

  function destroyStructure(s) {
    s.alive = false;
    s.hp = 0;
    const size = Math.max(10, s.radius * 1.1);
    _p.copy(s.pos);
    fx.explosion(_p, { size, ground: true });
    _p.y = s.root.position.y + 1;
    fx.burn(_p, { size: Math.max(4, s.radius * 0.5), duration: 45 + s.radius });
    sounds?.explosion(Math.min(1.6, 0.7 + s.radius * 0.03));
    s.root.traverse((n) => { if (n.isMesh) n.material = MAT.charred; });
    if (s.def.afloat) {
      // A ship lists and settles instead of collapsing.
      s.root.position.y -= s.built.height * 0.45;
      s.root.rotation.z += (Math.random() < 0.5 ? -1 : 1) * 0.35;
    } else {
      s.root.scale.y = 0.45;
      s.root.rotation.z += (Math.random() - 0.5) * 0.25;
    }
    onEvent?.({ type: 'structure', target: s });
    const base = s.base;
    if (base && !base.cleared && base.structures.every((x) => !x.alive || x.def.hp === 0)) {
      base.cleared = true;
      onEvent?.({ type: 'base', base });
    }
  }

  for (const spec of level.bases) {
    const base = { id: spec.id, name: spec.name, kind: spec.kind, pos: new THREE.Vector3(spec.x, spec.y, spec.z), radius: spec.radius, structures: [], cleared: false };
    scene.add(buildPad(base, terrain));
    for (const st of spec.structures) {
      const s = makeStructure(st, base);
      if (!s) continue;
      base.structures.push(s);
      if (s.def.hp > 0) structures.push(s);
    }
    bases.push(base);
  }

  // Bandits.
  function spawnPlane(spawnPos, dir, cfg) {
    const built = jet ? jet.make() : null;
    const root = built ? built.root : new THREE.Mesh(new THREE.ConeGeometry(2, 12, 6), MAT.steel);
    scene.add(root);
    const b = {
      kind: 'plane', name: 'Bandit', root, flame: built?.flame, glow: built?.glow,
      pos: spawnPos.clone(), dir: dir.clone().normalize(), vel: new THREE.Vector3(), speed: ENEMY.planeSpeed * (cfg.speed || 1),
      baseSpeed: ENEMY.planeSpeed * (cfg.speed || 1), radius: ENEMY.hitRadius, hp: cfg.hp || 80, maxHp: cfg.hp || 80,
      alive: true, stun: 0, bank: 0, state: 'attack', stateTime: 2 + Math.random() * 3, cooldown: 4 + Math.random() * 4, gunCooldown: 2,
      wreck: false, wreckTime: 0, spin: 0, smokeAcc: 0, score: SCORE.plane, missiles: cfg.missiles !== false,
      patrol: new THREE.Vector3((Math.random() - 0.5) * terrain.size * 0.5, 500, (Math.random() - 0.5) * terrain.size * 0.5),
      takeDamage(amount, at, how) {
        if (!b.alive) return;
        b.hp -= amount;
        if (b.hp <= 0) killPlane(b);
      }
    };
    b.vel.copy(b.dir).multiplyScalar(b.speed);
    planes.push(b);
    return b;
  }

  function killPlane(b) {
    b.alive = false;
    b.wreck = true;
    b.wreckTime = 0;
    b.spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
    fx.explosion(b.pos, { size: 13, velocity: b.vel });
    sounds?.explosion(1.0);
    if (b.flame) b.flame.visible = false;
    if (b.glow) b.glow.intensity = 0;
    onEvent?.({ type: 'plane', target: b });
  }

  // The squadron arrives together from one bearing (so the radar shows one
  // group, not planes closing from every side); returns that bearing in
  // radians (0 = north, clockwise) so the HUD can call it out.
  function spawnWave(index, player) {
    const cfg = level.waves[index];
    if (!cfg) return null;
    const groupBearing = Math.random() * Math.PI * 2;
    for (let i = 0; i < cfg.count; i++) {
      const bearing = groupBearing + (Math.random() - 0.5) * 0.5;
      const dist = 2200 + Math.random() * 600 + i * 120;
      _p.set(player.pos.x + Math.sin(bearing) * dist, 0, player.pos.z + Math.cos(bearing) * dist);
      _p.x = THREE.MathUtils.clamp(_p.x, -terrain.half * 0.9, terrain.half * 0.9);
      _p.z = THREE.MathUtils.clamp(_p.z, -terrain.half * 0.9, terrain.half * 0.9);
      _p.y = Math.max(terrain.heightAt(_p.x, _p.z) + 250, player.pos.y + (Math.random() - 0.3) * 200);
      _d.copy(player.pos).sub(_p).setY(0).normalize();
      spawnPlane(_p, _d, cfg);
    }
    return { count: cfg.count, bearing: groupBearing };
  }

  function aliveBandits() { return planes.filter((p) => p.alive).length; }
  function wreckCount() { return planes.filter((p) => p.wreck).length; }

  function orientPlane(b) {
    _m.lookAt(_p.set(0, 0, 0), b.dir, _up);
    b.root.quaternion.setFromRotationMatrix(_m);
    _q.setFromAxisAngle(b.dir, -b.bank);
    b.root.quaternion.premultiply(_q);
    b.root.position.copy(b.pos);
  }

  function updatePlane(b, dt, player, t) {
    if (b.wreck) {
      b.wreckTime += dt;
      b.vel.y -= 22 * dt;
      b.vel.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
      b.pos.addScaledVector(b.vel, dt);
      if (b.vel.lengthSq() > 1) b.dir.copy(b.vel).normalize();
      b.bank += b.spin * dt;
      orientPlane(b);
      b.smokeAcc += dt;
      while (b.smokeAcc > 0.03) { b.smokeAcc -= 0.03; fx.damageSmoke(b.pos, b.vel); }
      const ground = terrain.heightAt(b.pos.x, b.pos.z);
      if (b.pos.y <= ground + 2 || b.wreckTime > 14) {
        _p.set(b.pos.x, ground, b.pos.z);
        fx.explosion(_p, { size: 16, ground: true });
        if (!terrain.isWater(b.pos.x, b.pos.z)) fx.burn(_p, { size: 5, duration: 30 });
        sounds?.explosion(0.9);
        scene.remove(b.root);
        b.wreck = false;
        b.gone = true;
      }
      return;
    }
    if (b.stun > 0) {
      b.stun -= dt;
      b.dir.y -= 0.35 * dt;
      b.dir.normalize();
      b.speed = Math.max(60, b.speed - 20 * dt);
      b.bank += 1.5 * dt;
      if (Math.random() < dt * 8) fx.hitSparks(b.pos, null, 3);
      if (b.flame) b.flame.visible = false;
    } else {
      if (b.flame) b.flame.visible = true;
      b.speed += (b.baseSpeed - b.speed) * Math.min(1, dt * 0.8);
      b.stateTime -= dt;
      b.cooldown -= dt;
      b.gunCooldown -= dt;
      const toPlayer = _d.copy(player.pos).sub(b.pos);
      const dist = toPlayer.length();
      toPlayer.normalize();
      const facing = b.dir.dot(toPlayer);
      if (b.state === 'attack') {
        if (dist < 220 || b.stateTime <= 0) { b.state = 'break'; b.stateTime = 3 + Math.random() * 3; _side.crossVectors(b.dir, _up).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1); b.breakDir = _side.clone(); }
      } else if (b.state === 'break') {
        if (b.stateTime <= 0) { b.state = 'attack'; b.stateTime = 8 + Math.random() * 6; }
      }
      // Desired direction.
      let desired;
      if (b.state === 'attack' && player.alive) {
        _p.copy(player.pos).addScaledVector(player.vel, Math.min(3, dist / b.speed) * 0.5);
        desired = _p.sub(b.pos).normalize();
      } else {
        _p.copy(b.pos).addScaledVector(b.breakDir || _up, 600).addScaledVector(b.dir, 300);
        _p.y = Math.max(_p.y, player.pos.y + 80);
        desired = _p.sub(b.pos).normalize();
      }
      // Stay off the terrain and under the ceiling.
      const ahead = terrain.heightAt(b.pos.x + b.dir.x * 260, b.pos.z + b.dir.z * 260);
      const here = terrain.heightAt(b.pos.x, b.pos.z);
      const floor = Math.max(ahead, here) + 140;
      if (b.pos.y < floor) desired.y += (floor - b.pos.y) / 120;
      if (b.pos.y > 1300) desired.y -= 0.6;
      if (Math.abs(b.pos.x) > terrain.half * 0.92 || Math.abs(b.pos.z) > terrain.half * 0.92) {
        desired.x -= Math.sign(b.pos.x) * 0.8;
        desired.z -= Math.sign(b.pos.z) * 0.8;
      }
      desired.normalize();
      const angle = b.dir.angleTo(desired);
      const maxTurn = ENEMY.planeTurn * dt;
      let turnSign = 0;
      if (angle > 1e-4) {
        _side.crossVectors(b.dir, desired);
        turnSign = Math.sign(_side.y);
        b.dir.lerp(desired, Math.min(1, maxTurn / angle)).normalize();
      }
      const wantBank = THREE.MathUtils.clamp(turnSign * Math.min(1, angle / 0.5) * 1.1, -1.1, 1.1);
      b.bank += (wantBank - b.bank) * Math.min(1, dt * 3);
      // Weapons.
      if (player.alive && b.missiles && b.cooldown <= 0 && facing > 0.9 && dist > 300 && dist < 1900) {
        b.cooldown = ENEMY.missileEvery * (0.8 + Math.random() * 0.5);
        _p.copy(b.pos).addScaledVector(b.dir, 6).addScaledVector(_up, -1.5);
        projectiles.fireMissile({ origin: _p, dir: b.dir, ownerVel: b.vel, owner: 'enemy', target: player });
        onEvent?.({ type: 'missile', from: b });
      }
      if (player.alive && b.gunCooldown <= 0 && facing > 0.985 && dist < 650) {
        b.gunCooldown = 0.09;
        _p.copy(b.pos).addScaledVector(b.dir, 8);
        projectiles.fireGun({ origin: _p, dir: b.dir, ownerVel: b.vel, owner: 'enemy', speed: 550, damage: 2, spread: 0.03, range: 900 });
        if (Math.random() < 0.1) sounds?.enemyGun();
      }
    }
    b.vel.copy(b.dir).multiplyScalar(b.speed);
    b.pos.addScaledVector(b.vel, dt);
    orientPlane(b);
    if (b.hp < b.maxHp * 0.45) {
      b.smokeAcc += dt;
      while (b.smokeAcc > 0.05) { b.smokeAcc -= 0.05; fx.damageSmoke(b.pos, b.vel); }
    }
  }

  function updateStructure(s, dt, player, t) {
    const built = s.built;
    if (!s.alive) return;
    if (built.blink) built.blink.visible = Math.sin(t * 4) > 0;
    if (built.spin) built.spin.rotation.y += dt * (s.stun > 0 ? 0 : 0.8);
    if (s.stun > 0) {
      s.stun -= dt;
      if (Math.random() < dt * 6) fx.hitSparks(s.pos, null, 3);
      return;
    }
    const dist = s.pos.distanceTo(player.pos);
    const weapon = s.def.weapon;
    if (weapon === 'sam' && player.alive) {
      s.cooldown -= dt;
      if (dist < ENEMY.samRange) {
        const yaw = Math.atan2(player.pos.x - s.pos.x, player.pos.z - s.pos.z) - s.root.rotation.y + Math.PI;
        if (built.yaw && s.type === 'sam') built.yaw.rotation.y = yaw;
        if (s.cooldown <= 0 && player.pos.y > s.pos.y + 40) {
          s.cooldown = ENEMY.samEvery * (0.85 + Math.random() * 0.4);
          _p.copy(s.pos).setY(s.root.position.y + 7);
          _d.copy(player.pos).sub(_p).normalize().addScaledVector(_up, 1.2).normalize();
          projectiles.fireMissile({ origin: _p, dir: _d, owner: 'enemy', target: player });
          onEvent?.({ type: 'missile', from: s });
        }
      }
    } else if (weapon === 'aa' && player.alive && built.yaw && built.pitch) {
      if (dist < ENEMY.aaRange) {
        _p.copy(player.pos).addScaledVector(player.vel, dist / 700);
        const yaw = Math.atan2(_p.x - s.pos.x, _p.z - s.pos.z) - s.root.rotation.y + Math.PI;
        built.yaw.rotation.y = yaw;
        const flat = Math.hypot(_p.x - s.pos.x, _p.z - s.pos.z);
        built.pitch.rotation.x = Math.atan2(_p.y - s.pos.y, flat);
        s.burstPause -= dt;
        if (s.burstPause <= 0) {
          s.burst -= dt;
          s.cooldown -= dt;
          if (s.cooldown <= 0) {
            s.cooldown = 0.11;
            built.pitch.updateWorldMatrix(true, false);
            for (const muzzle of built.muzzles) {
              const origin = muzzle.clone().applyMatrix4(built.pitch.matrixWorld);
              _d.copy(_p).sub(origin).normalize();
              projectiles.fireGun({ origin, dir: _d, owner: 'enemy', speed: 450, damage: ENEMY.aaDamage, spread: ENEMY.aaSpread, range: 1100 });
              fx.exhaustFire(origin, 2.4);
            }
            if (Math.random() < 0.3) sounds?.enemyGun();
          }
          if (s.burst <= 0) { s.burst = 1.2; s.burstPause = 1.4 + Math.random(); }
        }
      }
    }
  }

  function update(dt, player, t) {
    for (const b of planes) if (!b.gone) updatePlane(b, dt, player, t);
    for (let i = planes.length - 1; i >= 0; i--) if (planes[i].gone) planes.splice(i, 1);
    for (const s of structures) updateStructure(s, dt, player, t);
  }

  // EMP: stun everything in range and deal light damage.
  function emp(center, radius, damage, seconds) {
    let n = 0;
    for (const target of [...planes, ...structures]) {
      if (!target.alive) continue;
      if (target.pos.distanceTo(center) > radius) continue;
      target.stun = Math.max(target.stun, seconds);
      target.takeDamage(damage, center, 'emp');
      n++;
    }
    return n;
  }

  function targets() {
    const list = [];
    for (const b of planes) if (b.alive) list.push(b);
    for (const s of structures) if (s.alive) list.push(s);
    return list;
  }

  return { planes, structures, bases, spawnWave, aliveBandits, wreckCount, update, emp, targets, jetLoaded: !!jet };
}

// Exposed for frontend/meshviewer/bake-sources.js, which bakes these into library models.
export { BUILDERS as STRUCTURE_BUILDERS };
