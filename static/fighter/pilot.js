// The ejected pilot: seat rocket, canopy pop, a striped parachute that the
// player steers (← → turn, ↑ ↓ faster or slower), and the landing. Units are
// metres and seconds. The pilot root sits at the hips and faces -Z.
import * as THREE from 'three';
import { MATERIALS } from './jet.js';

export const CHUTE = {
  seatSeconds: 1.4,     // ballistic seat ride before the canopy opens
  openSeconds: 0.9,     // canopy inflation
  sink: 6.5,            // m/s descent under the open canopy
  forward: 9,           // m/s forward drift with no input
  forwardMin: 3,
  forwardMax: 16,
  forwardAccel: 6,
  turnRate: 1.25,       // rad/s at full stick
  seatKick: 42,         // m/s up the seat rails
  wind: 1.2             // m/s drift towards +X
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

const MAT = {
  seat: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.7, metalness: 0.3 }),
  strap: new THREE.MeshStandardMaterial({ color: 0x8a7a3a, roughness: 0.9 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x4a4a3a, roughness: 0.9 }),
  canopy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  line: new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.8 })
};

function sh(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

function buildMan() {
  const man = new THREE.Group();
  const torso = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 10), MATERIALS.pilot));
  torso.position.y = 0.45;
  const helmet = sh(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), MATERIALS.helmet));
  helmet.position.y = 1.02;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MATERIALS.nozzle);
  visor.rotation.x = -Math.PI / 2;
  visor.position.set(0, 0.98, -0.05);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), MAT.strap);
  strap.position.y = 0.55;
  man.add(torso, helmet, visor, strap);
  const limbs = { arms: [], legs: [] };
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 0.75, 0);
    const upper = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 8), MATERIALS.pilot));
    upper.position.y = 0.3;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), MAT.glove);
    glove.position.y = 0.62;
    arm.add(upper, glove);
    arm.rotation.z = side * 0.35;
    man.add(arm);
    limbs.arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.05, 0);
    const thigh = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.7, 3, 8), MATERIALS.pilot));
    thigh.position.y = -0.4;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), MAT.boot);
    boot.position.set(0, -0.82, -0.05);
    leg.add(thigh, boot);
    man.add(leg);
    limbs.legs.push(leg);
  }
  return { man, limbs };
}

function buildSeat() {
  const seat = new THREE.Group();
  const back = sh(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.25), MAT.seat));
  back.position.set(0, 0.6, 0.32);
  const pan = sh(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.6), MAT.seat));
  pan.position.set(0, -0.1, 0.05);
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.15), MATERIALS.dark);
  headrest.position.set(0, 1.25, 0.25);
  const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), MATERIALS.nozzle);
  rocket.position.set(0, -0.35, 0.3);
  seat.add(back, pan, headrest, rocket);
  return seat;
}

// A striped dome with twelve gores, radius 4.6, plus its suspension lines.
function buildChute() {
  const chute = new THREE.Group();
  const radius = 4.6;
  const geo = new THREE.SphereGeometry(radius, 36, 10, 0, Math.PI * 2, 0, Math.PI * 0.46).toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(0xff7a1a), b = new THREE.Color(0xf4f4f4), c = new THREE.Color(0xffd23a);
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const sector = Math.floor(((Math.atan2(z, x) / (Math.PI * 2)) + 1) * 12) % 3;
    const col = sector === 0 ? a : sector === 1 ? b : c;
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = col.r; colors[(i + j) * 3 + 1] = col.g; colors[(i + j) * 3 + 2] = col.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const canopy = new THREE.Mesh(geo, MAT.canopy);
  canopy.castShadow = true;
  canopy.scale.y = 0.62;
  const top = 7.6;                       // height of the canopy centre over the hips
  const rimY = top - Math.cos(Math.PI * 0.46) * radius * 0.62;
  canopy.position.y = top - radius * 0.62;
  chute.add(canopy);
  const points = [];
  const rimR = Math.sin(Math.PI * 0.46) * radius;
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    const side = Math.cos(t) >= 0 ? 1 : -1;
    points.push(Math.cos(t) * rimR, rimY, Math.sin(t) * rimR, side * 0.32, 0.85, 0);
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), MAT.line);
  chute.add(lines);
  return { chute, canopy, lines, top };
}

export function createPilot({ scene, fx, terrain, sounds }) {
  const root = new THREE.Group();
  const { man, limbs } = buildMan();
  const seat = buildSeat();
  const { chute, canopy, lines } = buildChute();
  root.add(man, seat, chute);
  root.visible = false;
  scene.add(root);
  let canopyPiece = null;

  const p = {
    root, active: false, phase: 'idle', time: 0, landed: false, water: false,
    pos: root.position, vel: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), heading: 0,
    speed: CHUTE.forward, turn: 0, swing: 0, tumble: 0, altitude: 0,
    eject(jetPos, jetVel, jetQuat, jetCanopy) {
      p.active = true;
      p.phase = 'seat';
      p.time = 0;
      p.landed = false;
      p.water = false;
      p.pos.copy(jetPos).addScaledVector(_v.set(0, 1, 0).applyQuaternion(jetQuat), 1.2);
      _w.set(0, 1, 0).applyQuaternion(jetQuat);
      p.vel.copy(jetVel).multiplyScalar(0.9).addScaledVector(_w, CHUTE.seatKick);
      p.heading = Math.atan2(-jetVel.x, -jetVel.z);
      p.speed = CHUTE.forward;
      p.turn = 0;
      p.swing = 0;
      p.tumble = 0;
      root.visible = true;
      root.quaternion.copy(jetQuat);
      seat.visible = true;
      seat.position.set(0, 0, 0);
      man.rotation.set(0, 0, 0);
      man.position.set(0, 0, 0);
      chute.visible = false;
      chute.scale.setScalar(0.02);
      chute.rotation.set(0, 0, 0);
      chute.position.set(0, 0, 0);
      canopy.scale.y = 0.62;
      lines.visible = true;
      for (const leg of limbs.legs) leg.rotation.x = -1.3;   // knees up in the seat
      for (const arm of limbs.arms) arm.rotation.x = -0.8;
      // The jet's canopy flies off ahead of the seat.
      if (jetCanopy) {
        canopyPiece = jetCanopy.clone();
        canopyPiece.position.copy(jetPos).addScaledVector(_w, 0.6);
        canopyPiece.quaternion.copy(jetQuat);
        canopyPiece.userData.vel = jetVel.clone().multiplyScalar(0.97).addScaledVector(_w, 26);
        canopyPiece.userData.life = 4;
        scene.add(canopyPiece);
      }
      fx.hitSparks(p.pos, null, 10);
      fx.addShake(0.5);
      sounds?.eject?.();
    },
    update(dt, input) {
      if (!p.active) return;
      p.time += dt;
      updateCanopyPiece(dt);
      const ground = terrain.groundAt(p.pos.x, p.pos.z);
      const surface = terrain.isWater(p.pos.x, p.pos.z) ? terrain.waterLevel : ground;
      p.altitude = p.pos.y - surface;
      if (p.phase === 'seat') {
        p.vel.y -= 9.8 * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - 0.55 * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.tumble += dt * 2.4;
        _e.set(p.tumble * 0.4, p.heading, Math.sin(p.tumble) * 0.3, 'YXZ');
        root.quaternion.setFromEuler(_e);
        if (p.time < 0.6) {
          _v.set(0, -0.6, 0.3).applyQuaternion(root.quaternion).add(p.pos);
          fx.exhaustFire(_v, 1.6);
          fx.trail(_v, p.vel, { size: 1.4, life: 1.2 });
        }
        if (p.time >= CHUTE.seatSeconds || p.altitude < 60) openChute();
      } else if (p.phase === 'opening' || p.phase === 'descent') {
        const open = p.phase === 'descent' ? 1 : Math.min(1, (p.time) / CHUTE.openSeconds);
        if (p.phase === 'opening') {
          chute.scale.set(0.05 + open * 0.95, 0.3 + open * 0.7, 0.05 + open * 0.95);
          if (open >= 1) { p.phase = 'descent'; chute.scale.setScalar(1); }
        }
        // Steering: ← → turn, ↑ ↓ speed up or slow down the forward drift.
        const stick = p.phase === 'descent' ? input : { roll: 0, pitch: 0 };
        p.turn += (stick.roll * CHUTE.turnRate - p.turn) * Math.min(1, dt * 3);
        p.heading -= p.turn * dt;
        const wantSpeed = THREE.MathUtils.clamp(CHUTE.forward + stick.pitch * 7, CHUTE.forwardMin, CHUTE.forwardMax);
        p.speed += THREE.MathUtils.clamp(wantSpeed - p.speed, -CHUTE.forwardAccel * dt, CHUTE.forwardAccel * dt);
        p.forward.set(-Math.sin(p.heading), 0, -Math.cos(p.heading));
        const brake = Math.min(1, dt * (p.phase === 'opening' ? 2.5 : 4));
        const sink = p.phase === 'opening' ? -CHUTE.sink - (1 - open) * 10 : -CHUTE.sink - Math.max(0, p.speed - CHUTE.forward) * 0.12;
        _w.copy(p.forward).multiplyScalar(p.speed * open).setY(sink);
        _w.x += CHUTE.wind;
        p.vel.lerp(_w, brake);
        p.pos.addScaledVector(p.vel, dt);
        // Keep inside the theatre.
        const limit = terrain.half * 0.97;
        p.pos.x = THREE.MathUtils.clamp(p.pos.x, -limit, limit);
        p.pos.z = THREE.MathUtils.clamp(p.pos.z, -limit, limit);
        // The pilot swings under the canopy; the canopy banks into turns and
        // tips forward as the drift picks up.
        const wantSwing = -p.turn * 0.35;
        p.swing += (wantSwing - p.swing) * Math.min(1, dt * 2.2) + Math.sin(p.time * 1.7) * 0.0025;
        _e.set(0, p.heading, 0, 'YXZ');
        root.quaternion.setFromEuler(_e);
        chute.rotation.z = p.swing * 1.4;
        chute.rotation.x = -(p.speed / CHUTE.forwardMax) * 0.28;
        man.rotation.z = p.swing * 0.6;
        man.rotation.x = 0.12;
        for (const leg of limbs.legs) leg.rotation.x += (-0.25 - leg.rotation.x) * Math.min(1, dt * 2);
        for (const arm of limbs.arms) arm.rotation.x += (-2.6 - arm.rotation.x) * Math.min(1, dt * 2);
        if (p.altitude <= 0.95) land(surface);
      } else if (p.phase === 'landed') {
        // Canopy collapses to the ground beside the pilot.
        const k = Math.min(1, p.time / 1.3);
        chute.position.y = -7.2 * k;
        chute.position.z = 2.5 * k;
        canopy.scale.y = 0.62 * (1 - k * 0.92);
        chute.scale.x = 1 + k * 0.25;
        lines.visible = k < 0.6;
        man.rotation.set(0, 0, 0);
        for (const leg of limbs.legs) leg.rotation.x += (0 - leg.rotation.x) * Math.min(1, dt * 4);
        for (const arm of limbs.arms) arm.rotation.x += (0 - arm.rotation.x) * Math.min(1, dt * 3);
        if (p.water) p.pos.y = surface + 0.6 + Math.sin(p.time * 2) * 0.1;
      }
      // Seat separates when the canopy opens and falls away.
      if (!seat.visible && seat.userData.vel) {
        seat.userData.vel.y -= 9.8 * dt;
        seat.userData.pos.addScaledVector(seat.userData.vel, dt);
        seat.userData.mesh.position.copy(seat.userData.pos);
        seat.userData.mesh.rotation.x += dt * 3;
        if (seat.userData.pos.y < terrain.groundAt(seat.userData.pos.x, seat.userData.pos.z)) { scene.remove(seat.userData.mesh); seat.userData.vel = null; }
      }
    },
    reset() {
      p.active = false;
      p.phase = 'idle';
      p.landed = false;
      root.visible = false;
      if (seat.userData.mesh) { scene.remove(seat.userData.mesh); seat.userData.vel = null; }
      if (canopyPiece) { scene.remove(canopyPiece); canopyPiece = null; }
    }
  };

  function openChute() {
    p.phase = 'opening';
    p.time = 0;
    chute.visible = true;
    // Drop the seat as a separate falling piece.
    seat.visible = false;
    const loose = seat.clone();
    loose.visible = true;
    loose.position.copy(p.pos);
    scene.add(loose);
    seat.userData = { mesh: loose, pos: p.pos.clone(), vel: p.vel.clone().multiplyScalar(0.6).addScaledVector(_up, -3) };
    sounds?.chute?.();
  }

  function land(surface) {
    p.phase = 'landed';
    p.time = 0;
    p.landed = true;
    p.water = terrain.isWater(p.pos.x, p.pos.z);
    p.pos.y = surface + 0.95;
    p.vel.set(0, 0, 0);
    _v.set(p.pos.x, surface, p.pos.z);
    if (p.water) { fx.ring(_v, 5, { life: 1.2, color: 0xcfe8ff, flat: true }); fx.hitSparks(_v, null, 6); }
    else fx.dust(_v, 8);
    sounds?.land?.();
  }

  function updateCanopyPiece(dt) {
    if (!canopyPiece) return;
    const u = canopyPiece.userData;
    u.life -= dt;
    u.vel.y -= 9.8 * dt;
    u.vel.multiplyScalar(Math.max(0, 1 - 0.8 * dt));
    canopyPiece.position.addScaledVector(u.vel, dt);
    canopyPiece.rotation.x += dt * 4;
    canopyPiece.rotation.z += dt * 2;
    if (u.life <= 0 || canopyPiece.position.y < terrain.groundAt(canopyPiece.position.x, canopyPiece.position.z)) { scene.remove(canopyPiece); canopyPiece = null; }
  }

  return p;
}
