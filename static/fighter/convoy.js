import * as THREE from 'three';
import { loadModel } from './jet.js';
import { createSightCheck } from './recon.js';

const COMMAND_SLOTS = [1, 2, 0, 3];
const FORMATION = ['convoyGun', ...COMMAND_SLOTS.map(() => 'convoyTruck'), 'convoyJammer'];
const SCAN_RANGE = 550;
const SCAN_COS = Math.cos(THREE.MathUtils.degToRad(8));
const SCAN_SECONDS = 1.35;

export function addRoad(scene, path, terrain, end = 1) {
  const steps = Math.ceil(path.getLength() * end / 3);
  const positions = [], indices = [], markingPositions = [], markingIndices = [];
  function quad(vertices, faces, a, b, c, d) {
    const i = vertices.length / 3;
    for (const p of [a, b, c, d]) vertices.push(p.x, p.y, p.z);
    faces.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
  }
  function edge(at, side, height) {
    const point = path.getPointAt(at);
    const tangent = path.getTangentAt(at);
    point.x -= tangent.z * side;
    point.z += tangent.x * side;
    point.y = terrain.heightAt(point.x, point.z) + height;
    return point;
  }
  for (let step = 0; step < steps; step++) {
    const a = end * step / steps, b = end * (step + 1) / steps;
    quad(positions, indices, edge(a, -7, 0.55), edge(b, -7, 0.55), edge(a, 7, 0.55), edge(b, 7, 0.55));
    if (step % 7 < 3) {
      quad(markingPositions, markingIndices, edge(a, -0.25, 0.75), edge(b, -0.25, 0.75),
        edge(a, 0.25, 0.75), edge(b, 0.25, 0.75));
    }
  }
  for (const [vertices, faces, color] of [[positions, indices, 0x514a43], [markingPositions, markingIndices, 0xc7b887]]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function addTunnel(scene, path, terrain) {
  const end = path.getPointAt(1), tangent = path.getTangentAt(1);
  const portal = new THREE.Group();
  portal.position.set(end.x, terrain.heightAt(end.x, end.z), end.z);
  portal.rotation.y = Math.atan2(-tangent.x, -tangent.z);
  const interior = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 0.6), new THREE.MeshBasicMaterial({ color: 0x181413 }));
  interior.position.set(0, 5.5, -6);
  portal.add(interior);
  scene.add(portal);
  loadModel('Roads/TunnelPortal').then(({ object }) => {
    object.scale.setScalar(0.013);
    portal.add(object);
  }).catch(() => {
    const frame = new THREE.MeshStandardMaterial({ color: 0x635a51 });
    for (const [x, y, width, height] of [[-7.5, 6, 3, 12], [7.5, 6, 3, 12], [0, 13.5, 18, 3]]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(width, height, 10), frame);
      piece.position.set(x, y, 0);
      portal.add(piece);
    }
  });
}

export function createConvoy({ stage, scene, terrain, enemies, dust }) {
  function makePath(points) {
    const route = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0, p.z)));
    route.arcLengthDivisions = (points.length - 1) * 64;
    return route;
  }
  const mainRoad = makePath(stage.path);
  const roads = [mainRoad];
  addRoad(scene, mainRoad, terrain);
  addTunnel(scene, mainRoad, terrain);
  if (stage.alternateApproach?.length) {
    const alternate = makePath([...stage.alternateApproach, ...stage.path.slice(-3)]);
    const mergeDistance = alternate.getLengths()[stage.alternateApproach.length * 64];
    addRoad(scene, alternate, terrain, mergeDistance / alternate.getLength());
    roads.push(alternate);
  }

  const area = stage.searchArea || { ...stage.path[0], radius: 780 };
  const searchArea = { pos: new THREE.Vector3(area.x, terrain.heightAt(area.x, area.z), area.z),
    name: 'Last known area', radius: area.radius, searchArea: true };
  const firstRoad = Math.floor(Math.random() * roads.length);
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  const inSight = createSightCheck(terrain);
  const deadline = stage.secondsToTunnel > 0 ? stage.secondsToTunnel : Infinity;
  let trucks = [], command, jammer, path, length, spacing, speed, leadDistance, escapeDistance, scan, identified, attempt = 0;
  let dustTimer = 0;

  function placeTrucks(dt) {
    dustTimer += dt;
    const kickDust = dustTimer >= 0.22;
    if (kickDust) dustTimer = 0;
    for (const [slot, truck] of trucks.entries()) {
      if (!truck.alive) continue;
      const at = (leadDistance - slot * spacing) / length;
      if (at >= 1 && truck !== command) {
        truck.alive = false;
        truck.root.visible = false;
        continue;
      }
      const t = THREE.MathUtils.clamp(at, 0, 1);
      path.getPointAt(t, point);
      path.getTangentAt(t, tangent);
      const y = terrain.heightAt(point.x, point.z) + 0.55;
      truck.vel.set(point.x - truck.pos.x, y - truck.root.position.y, point.z - truck.pos.z);
      if (dt > 0) truck.vel.multiplyScalar(1 / dt);
      else truck.vel.copy(tangent).multiplyScalar(speed);
      truck.root.position.set(point.x, y, point.z);
      truck.root.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      truck.pos.set(point.x, y + truck.built.height * 0.5, point.z);
      if (kickDust) dust(point.copy(truck.root.position).addScaledVector(tangent, -4), 1);
    }
  }

  function reset() {
    enemies.removeStructures(trucks);
    path = roads[(firstRoad + attempt) % roads.length];
    length = path.getLength();
    spacing = Math.min(stage.spacing, length / (FORMATION.length * 2));
    trucks = enemies.spawnConvoy(FORMATION, path.points[0]);
    const commandSlot = 1 + COMMAND_SLOTS[attempt % COMMAND_SLOTS.length];
    command = trucks[commandSlot];
    jammer = trucks.at(-1);
    attempt++;
    leadDistance = spacing * (FORMATION.length - 1) + 25;
    escapeDistance = length + commandSlot * spacing;
    speed = deadline < Infinity ? (escapeDistance - leadDistance) / deadline : stage.speed;
    scan = 0;
    dustTimer = 0;
    identified = false;
    placeTrucks(0);
  }

  function secondsLeft() {
    return Math.max(0, Math.min(deadline, (escapeDistance - leadDistance) / speed));
  }

  function update(dt, player) {
    if (!command.alive) return identified ? 'complete' : 'unconfirmed';
    leadDistance += speed * dt;
    placeTrucks(dt);
    if (secondsLeft() <= 0) {
      command.alive = false;
      command.root.visible = false;
      return 'escaped';
    }
    if (identified) return;
    const onTarget = trucks.some(truck => truck.alive && !truck.convoyEscort && inSight(player, truck.pos, SCAN_RANGE, SCAN_COS));
    scan = THREE.MathUtils.clamp(scan + (onTarget ? dt : -dt * 2), 0, SCAN_SECONDS);
    if (scan < SCAN_SECONDS) return;
    identified = true;
    command.name = 'Command truck';
    for (const truck of trucks) {
      truck.holdFire = false;
      if (truck !== command && !truck.convoyEscort) truck.name = 'Decoy truck';
    }
    return 'identified';
  }

  function canTrack(target) {
    return !target.convoyMember || identified;
  }
  function canLock(target) {
    return canTrack(target) && (target !== command || !activeJammer());
  }
  function activeJammer() {
    return jammer.alive && jammer.stun <= 0 ? jammer : null;
  }

  return { reset, update, secondsLeft, canTrack, canLock, activeJammer, get identified() { return identified; },
    get decoysSpared() { return trucks.every(t => t === command || t.convoyEscort || t.hp > 0); },
    get scanProgress() { return scan / SCAN_SECONDS; }, get target() { return identified ? command : searchArea; } };
}
