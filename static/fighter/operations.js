import * as THREE from 'three';
import { addRoad } from './convoy.js';
import { loadModel } from './jet.js';
import { buildMan } from './pilot.js';
import { createSightCheck } from './recon.js';

function makeRoute(points, loop = false) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)), loop);
  path.arcLengthDivisions = points.length * 64;
  return path;
}

function waypoint(point, terrain, name) {
  return { name, pos: new THREE.Vector3(point.x, terrain.heightAt(point.x, point.z) + 10, point.z) };
}

function createFriendly(scene, name, folder, length, health, boat = false) {
  const root = new THREE.Group();
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(length / 2, length / 4, length),
    new THREE.MeshStandardMaterial({ color: boat ? 0xeaa53d : 0x48663a }));
  fallback.position.y = length / 8;
  root.add(fallback);
  scene.add(root);
  loadModel(folder).then(({ object, size, box }) => {
    const model = object.clone();
    const scale = length / (boat ? size.x : size.z);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    if (boat) model.rotation.y = Math.PI / 2;
    root.add(model);
    fallback.visible = false;
  }).catch(() => { /* Keep the visible fallback if the library asset is unavailable. */ });
  return { root, name, pos: new THREE.Vector3(), hp: health, maxHp: health };
}

function takeFire(friendly, damage, sparks) {
  const previous = friendly.hp;
  friendly.hp = Math.max(0, previous - damage);
  if (Math.ceil(friendly.hp / 10) < Math.ceil(previous / 10)) sparks(friendly.pos, null, 6);
}

function travel(path, actor, terrain, afloat = false) {
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  const length = path.getLength();
  return (distance, dt = 0) => {
    const u = THREE.MathUtils.clamp(distance / length, 0, 1);
    path.getPointAt(u, point);
    path.getTangentAt(u, tangent);
    const ground = terrain.heightAt(point.x, point.z);
    point.y = afloat ? terrain.waterLevel ?? ground : ground + 0.55;
    const height = actor.built ? Math.min(actor.built.height, actor.radius * 1.2) * 0.5 : 4;
    actor.root.position.copy(point);
    if (actor.def?.afloat) actor.root.position.y -= (actor.built.sink || 0) * actor.root.scale.x;
    actor.root.rotation.y = Math.atan2(-tangent.x, -tangent.z);
    point.y += height;
    if (dt > 0 && actor.vel) actor.vel.copy(point).sub(actor.pos).divideScalar(dt);
    actor.pos.copy(point);
  };
}

function addLandingLights(scene, point, terrain, afloat = false) {
  const lights = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x78e7ff });
  for (const side of [-1, 1]) {
    const x = point.x + side * 25;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, 8, 8), material);
    beacon.position.set(x, (afloat ? terrain.waterLevel ?? terrain.heightAt(x, point.z) : terrain.heightAt(x, point.z)) + 3, point.z);
    lights.add(beacon);
  }
  scene.add(lights);
}

function addWake(scene, width, length, stern) {
  const root = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(229,249,255,0.9)');
  gradient.addColorStop(0.55, 'rgba(209,240,255,0.48)');
  gradient.addColorStop(1, 'rgba(209,240,255,0)');
  ctx.fillStyle = gradient;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(32 + side * 4, 0);
    ctx.quadraticCurveTo(32 + side * 16, 64, 32 + side * 31, 128);
    ctx.quadraticCurveTo(32 + side * 12, 94, 32 + side * 1, 0);
    ctx.fill();
  }
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false
  }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.z = stern + length / 2;
  root.add(foam);
  scene.add(root);
  return (actor, water, visible = true) => {
    root.visible = visible;
    root.position.set(actor.pos.x, water + 0.6, actor.pos.z);
    root.rotation.y = actor.root.rotation.y;
  };
}

export function createCrossing({ stage, scene, terrain, enemies, announce, sparks }) {
  const path = makeRoute(stage.path);
  const length = path.getLength();
  addRoad(scene, path, terrain);
  const destination = stage.path.at(-1);
  addLandingLights(scene, destination, terrain);
  const team = createFriendly(scene, 'Ground team', 'Trucks/ArmyTruck', 15, stage.health);
  const moveTeam = travel(path, team, terrain);
  const soldiers = Array.from({ length: 3 }, (_, i) => {
    const { man } = buildMan();
    man.position.set(i % 2 ? 7 : -7, 1.7, 4 + i * 3);
    man.scale.setScalar(1.65);
    team.root.add(man);
    return man;
  });
  let distance, sector, active, threat, spawned;

  function reset() {
    enemies.removeStructures(spawned || []);
    spawned = [];
    threat = [];
    distance = 0;
    sector = 0;
    active = false;
    team.hp = team.maxHp;
    team.root.visible = true;
    for (const soldier of soldiers) soldier.visible = true;
    moveTeam(0);
  }

  function update(dt, player) {
    if (team.hp <= 0) return 'failed';
    if (!active) {
      if (player.pos.distanceTo(team.pos) > 650) return;
      active = true;
      announce('GROUND TEAM MOVING TO THE FIRST CROSSING', 2.5);
    }
    if (threat.some(t => t.alive)) {
      if (threat.some(t => t.alive && t.stun <= 0)) {
        takeFire(team, stage.ambushes[sector - 1].damagePerSecond * dt, sparks);
      }
      return team.hp <= 0 ? 'failed' : undefined;
    }
    if (threat.length) {
      threat = [];
      announce('THREATS DOWN · GROUND TEAM ADVANCING', 2.5);
    }
    const ambush = stage.ambushes[sector];
    distance = Math.min(distance + stage.speed * dt, ambush ? length * ambush.at : length);
    moveTeam(distance);
    for (const soldier of soldiers) soldier.visible = false;
    if (ambush && distance >= length * ambush.at) {
      for (const soldier of soldiers) soldier.visible = true;
      threat = ambush.targets.map((target, index) => enemies.spawnStructure({ ...target, id: `ambush-${sector}-${index}` }));
      spawned.push(...threat);
      sector++;
      announce(`GROUND TEAM PINNED · CHECKPOINT ${sector}`, 3);
    }
    if (distance >= length) return 'complete';
  }

  function view() {
    const health = `${Math.ceil(team.hp)}% team health`;
    const target = threat.find(t => t.alive);
    if (!active) return { target: team, title: stage.title, hint: stage.hint, detail: health, step: 1, total: 3 };
    if (target) return { target, relay: team, title: `Clear checkpoint ${sector}`, step: sector + 1, total: 3,
      hint: 'The ground team is pinned. Hit the marked threat so they can move.', detail: `Pinned · ${health}` };
    return { target: team, title: 'Cover the advancing team', hint: 'Follow the team to the blue beacons.',
      detail: `Moving · ${Math.floor(100 * distance / length)}% across · ${health}`, step: Math.min(3, sector + 1), total: 3 };
  }
  return { reset, update, view, friendly: team, failure: 'Ground team lost', success: 'GROUND TEAM SAFE' };
}

export function createSeaRescue({ stage, scene, terrain, enemies, announce, spawn, sparks }) {
  const boatPath = makeRoute(stage.path);
  const shipPath = makeRoute(stage.patrolPath, true);
  const safeDistance = boatPath.getLength();
  const patrolDistance = shipPath.getLength();
  addLandingLights(scene, stage.path.at(-1), terrain, true);
  const area = { ...waypoint(stage.searchArea, terrain, 'Last known area'), searchArea: true, radius: stage.searchArea.radius };
  const boat = createFriendly(scene, 'Rescue boat', 'Watercraft/OutboardBoat', 18, stage.health, true);
  boat.attackCall = 'RESCUE BOAT UNDER ATTACK — INTERCEPT THE BOMBERS';
  const moveBoat = travel(boatPath, boat, terrain, true);
  const shipWake = addWake(scene, 74, 190, 72);
  const boatWake = addWake(scene, 25, 78, 8);
  const inSight = createSightCheck(terrain);
  const scanCone = Math.cos(THREE.MathUtils.degToRad(9));
  const deckOffset = new THREE.Vector3();
  let ship, battery, moveShip, shipDistance, boatDistance, scan, searchTime, phase, attempt = 0;

  function positionShip(dt) {
    if (!ship.alive) {
      shipWake(ship, 0, false);
      return;
    }
    moveShip(shipDistance, dt);
    shipWake(ship, terrain.waterLevel ?? terrain.heightAt(ship.pos.x, ship.pos.z));
    if (battery.alive) {
      deckOffset.set(0, 8, -24).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ship.root.rotation.y);
      battery.root.position.copy(ship.root.position).add(deckOffset);
      battery.root.rotation.y = ship.root.rotation.y;
      battery.pos.copy(battery.root.position);
      battery.pos.y += 4;
      battery.vel.copy(ship.vel);
    }
  }

  function reset() {
    if (ship) enemies.removeStructures([ship, battery]);
    const start = stage.patrolPath[0];
    battery = enemies.spawnStructure({ type: 'deckBattery', id: 'deck-battery', ...start });
    ship = enemies.spawnStructure({ type: 'destroyer', id: 'storm-warship', ...start });
    ship.name = 'Storm warship';
    battery.holdFire = ship.holdFire = true;
    battery.damageBlocked = ship.damageBlocked = true;
    moveShip = travel(shipPath, ship, terrain, true);
    shipDistance = patrolDistance * ((0.34 * attempt++ + 0.5 * Math.random()) % 1);
    boatDistance = scan = searchTime = 0;
    phase = 'search';
    boat.hp = boat.maxHp;
    moveBoat(0);
    boatWake(boat, 0, false);
    positionShip(0);
  }

  function update(dt, player) {
    if (boat.hp <= 0) return 'failed';
    shipDistance = (shipDistance + stage.shipSpeed * dt) % patrolDistance;
    positionShip(dt);
    if (phase === 'search') {
      searchTime += dt;
      if (searchTime >= stage.searchSeconds) return 'escaped';
      const visible = inSight(player, ship.pos, 1050, scanCone);
      scan = THREE.MathUtils.clamp(scan + (visible ? dt : -2 * dt), 0, 1.2);
      if (scan >= 1.2) {
        phase = 'battery';
        battery.holdFire = battery.damageBlocked = false;
        announce('WARSHIP IDENTIFIED · DISABLE THE DECK BATTERY', 3);
      }
    } else if (phase === 'battery') {
      if (battery.alive) {
        if (battery.stun <= 0) takeFire(boat, stage.batteryDamage * dt, sparks);
        if (boat.hp <= 0) return 'failed';
      } else {
        phase = 'escape';
        battery.root.visible = false;
        ship.damageBlocked = false;
        spawn(stage.airAttack, boat);
        announce('RESCUE BOAT MOVING · BOMBERS INBOUND', 3);
      }
    } else {
      boatDistance = Math.min(safeDistance, boatDistance + stage.speed * dt);
      moveBoat(boatDistance);
      boatWake(boat, terrain.waterLevel ?? terrain.heightAt(boat.pos.x, boat.pos.z));
      if (boatDistance >= safeDistance) return 'complete';
    }
  }

  function view() {
    if (phase === 'search') {
      const detail = `${Math.ceil(Math.max(0, stage.searchSeconds - searchTime))}s to find the ship`;
      return { title: stage.title, hint: stage.hint, target: area, step: 1, total: 3,
        detail: scan > 0 ? `Scan ${Math.floor(scan / 1.2 * 100)}% · ${detail}` : detail };
    }
    const health = `${Math.ceil(boat.hp)}% boat health`;
    if (phase === 'battery') return { title: 'Disable the deck battery', target: battery, relay: boat, step: 2, total: 3,
      detail: `Under fire · ${health}`, hint: 'Hit the launcher on the marked ship. EMP briefly stops its fire.' };
    return { title: 'Escort the rescue boat', target: boat, step: 3, total: 3,
      detail: `${Math.floor(100 * boatDistance / safeDistance)}% to safety · ${health}`,
      hint: ship.alive ? 'Intercept the bombers. Sink the exposed warship for a bonus.' : 'Intercept the bombers until the boat is safe.' };
  }
  return { reset, update, view, friendly: boat, failure: 'Rescue boat lost', escape: 'Lost the warship',
    success: 'RESCUE BOAT SAFE', get bonus() { return !ship.alive ? 350 : 0; } };
}
