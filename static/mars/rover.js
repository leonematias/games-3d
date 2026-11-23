import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { ROVER } from './config.js';

// Rover mesh inspired by NASA's 2017 concept rover (Parker Brothers Concepts):
// a low, angular black body with a raked blue windshield up front, a detachable
// science lab at the back, huge wheels with open spokes, and solar panels on
// the roof. Scaled down to four wheels as the game asks for.
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.55, metalness: 0.55 });
const PANEL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 });
const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.35, metalness: 0.6 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x3a8ad6, roughness: 0.1, metalness: 0.4, emissive: 0x0d2a4a, emissiveIntensity: 0.5 });
const SOLAR_MAT = new THREE.MeshStandardMaterial({ color: 0x15264d, roughness: 0.25, metalness: 0.8, emissive: 0x0a1630, emissiveIntensity: 0.35 });
const TIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.92, metalness: 0.1 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0x8b9199, roughness: 0.35, metalness: 0.85 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1.6 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWheel() {
  const { wheelRadius: r, wheelWidth: wdt } = ROVER;
  const spin = new THREE.Group();
  // Tire: a wide cylinder with a chunky tread band, axle along local X.
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 28, 1, true), TIRE_MAT);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);
  for (let i = 0; i < 14; i++) {
    const lug = box(wdt * 0.92, 0.08, 0.14, TIRE_MAT);
    const a = (i / 14) * Math.PI * 2;
    lug.position.set(0, Math.cos(a) * (r + 0.02), Math.sin(a) * (r + 0.02));
    lug.rotation.x = -a;
    spin.add(lug);
  }
  // Open-spoke rim on both faces (the concept's "see-through" wheels).
  for (const side of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.08, 16), RIM_MAT);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * wdt * 0.5;
    spin.add(hub);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, 0.05, 8, 28), RIM_MAT);
    lip.rotation.y = Math.PI / 2;
    lip.position.x = side * wdt * 0.5;
    spin.add(lip);
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 0.72, 0.11), RIM_MAT);
      const a = (i / 6) * Math.PI * 2;
      spoke.position.set(side * wdt * 0.5, Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
      spoke.rotation.x = -a;
      spin.add(spoke);
    }
  }
  const pivot = new THREE.Group();
  pivot.add(spin);
  return { pivot, spin };
}

export function createRoverMesh() {
  const { wheelRadius, track, wheelbase, clearance } = ROVER;
  const root = new THREE.Group();          // yaw + position only
  const body = new THREE.Group();          // pitch + roll follow the wheels
  root.add(body);

  const floorY = wheelRadius + clearance;   // underside of the chassis (root-local)
  // Front cab: wedge made from a low base plus a raked windshield block.
  body.add(box(2.1, 0.5, 1.9, BODY_MAT, 0, 0.25, 0.55));
  const cabTop = box(1.75, 0.55, 1.15, BODY_MAT, 0, 0.72, 0.42);
  body.add(cabTop);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.12), GLASS_MAT);
  windshield.position.set(0, 0.72, 1.02);
  windshield.rotation.x = -0.55;
  windshield.castShadow = true;
  body.add(windshield);
  const nose = box(1.7, 0.3, 0.5, PANEL_MAT, 0, 0.3, 1.5);
  nose.rotation.x = 0.25;
  body.add(nose);
  for (const side of [-1, 1]) {
    body.add(box(0.5, 0.12, 0.05, LIGHT_MAT, side * 0.6, 0.42, 1.72));
    body.add(box(0.12, 0.45, 1.6, TRIM_MAT, side * 1.07, 0.3, 0.55));
    body.add(box(0.5, 0.3, 0.1, GLASS_MAT, side * 0.9, 0.78, 0.4));
  }
  // Rear science lab: a separate block with a visible seam/connector.
  const lab = box(2.0, 0.95, 1.5, BODY_MAT, 0, 0.47, -0.95);
  body.add(lab);
  body.add(box(0.6, 0.4, 0.3, TRIM_MAT, 0, 0.35, -0.12));   // coupling
  body.add(box(2.02, 0.08, 1.52, TRIM_MAT, 0, 0.97, -0.95)); // roof rail
  const solar = box(1.6, 0.04, 1.2, SOLAR_MAT, 0, 1.03, -0.95);
  body.add(solar);
  for (let i = 0; i < 3; i++) body.add(box(1.62, 0.05, 0.03, TRIM_MAT, 0, 1.04, -0.55 - i * 0.4));
  for (const side of [-1, 1]) {
    body.add(box(0.35, 0.1, 0.05, TAIL_MAT, side * 0.65, 0.5, -1.72));
    body.add(box(0.08, 0.5, 1.3, PANEL_MAT, side * 1.0, 0.45, -0.95));
  }
  // Antenna mast and dish.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 8), TRIM_MAT);
  mast.position.set(-0.7, 1.4, -0.3);
  body.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), TRIM_MAT);
  dish.position.set(-0.7, 1.85, -0.3);
  dish.rotation.x = -0.6;
  body.add(dish);
  body.position.y = floorY;

  // Headlights: a spotlight that the game switches on after sunset.
  const headlight = new THREE.SpotLight(0xfff1d6, 0, 80, 0.62, 0.6, 1.3);
  headlight.position.set(0, 0.5, 1.6);
  headlight.target.position.set(0, -1.2, 14);
  body.add(headlight);
  body.add(headlight.target);

  // Wheels hang off the root so each can meet the ground independently.
  const wheels = [];
  const offsets = [
    { name: 'FL', x: track / 2, z: wheelbase / 2 },
    { name: 'FR', x: -track / 2, z: wheelbase / 2 },
    { name: 'RL', x: track / 2, z: -wheelbase / 2 },
    { name: 'RR', x: -track / 2, z: -wheelbase / 2 }
  ];
  for (const offset of offsets) {
    const { pivot, spin } = buildWheel();
    pivot.position.set(offset.x, wheelRadius, offset.z);
    root.add(pivot);
    // Suspension arm drawn from the body down to the wheel.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), PANEL_MAT);
    arm.rotation.z = Math.PI / 2;
    pivot.add(arm);
    arm.position.x = -Math.sign(offset.x) * ROVER.wheelWidth * 0.1;
    wheels.push({ ...offset, pivot, spin, arm });
  }

  return { root, body, wheels, headlight };
}

// Kinematic rover: drives over the terrain heightfield, tilting the body to the
// four wheel contact points and each wheel to its local ground normal.
export function createRoverController({ terrain, mesh, start, sounds, maxSlopeDeg, obstacles = () => [] }) {
  const state = {
    position: new THREE.Vector3(start.x, 0, start.z),
    heading: THREE.MathUtils.degToRad(start.headingDeg ?? 0),
    speed: 0,
    pitch: 0,
    roll: 0,
    slopeAheadDeg: 0,
    blocked: false,
    steer: 0
  };
  const maxSlope = THREE.MathUtils.degToRad(maxSlopeDeg ?? ROVER.maxSlopeDeg);
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const tiltQuat = new THREE.Quaternion();
  const steerQuat = new THREE.Quaternion();
  const wheelHeights = [0, 0, 0, 0];

  function forwardVector(target = new THREE.Vector3()) {
    return target.set(Math.sin(state.heading), 0, Math.cos(state.heading));
  }

  function wheelWorldXZ(wheel, pos = state.position, heading = state.heading) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    return { x: pos.x + wheel.x * c + wheel.z * s, z: pos.z - wheel.x * s + wheel.z * c };
  }

  // Slope the rover would face moving in `direction` (+1 forward, -1 reverse):
  // signed pitch between the leading and trailing axles at the candidate spot.
  function slopeAlong(pos, direction) {
    const front = { x: 0, z: ROVER.wheelbase / 2 * direction };
    const rear = { x: 0, z: -ROVER.wheelbase / 2 * direction };
    const f = wheelWorldXZ(front, pos);
    const r = wheelWorldXZ(rear, pos);
    return Math.atan2(terrain.heightAt(f.x, f.z) - terrain.heightAt(r.x, r.z), ROVER.wheelbase);
  }

  function update(delta, input) {
    const dt = Math.min(delta, 0.05);
    const speedRatio = Math.min(1, Math.abs(state.speed) / ROVER.maxSpeed);

    // Steering: faster rover turns in wider arcs.
    const turnRate = THREE.MathUtils.lerp(ROVER.turnSpeed, ROVER.turnSpeedAtMax, speedRatio);
    let turning = 0;
    if (input.left) turning += 1;
    if (input.right) turning -= 1;
    const reverseFlip = state.speed < -0.2 ? -1 : 1;
    state.heading += turning * reverseFlip * turnRate * dt;
    state.steer = THREE.MathUtils.lerp(state.steer, turning * 0.32, Math.min(1, dt * 10));

    // Throttle with acceleration while the key is held.
    const dir = input.forward ? 1 : input.backward ? -1 : 0;
    const uphill = slopeAlong(state.position, Math.sign(state.speed || dir || 1));
    state.slopeAheadDeg = THREE.MathUtils.radToDeg(uphill);
    const slopeFactor = Math.max(0.25, 1 - Math.max(0, uphill) / maxSlope * 0.7);
    if (dir > 0) {
      const cap = ROVER.maxSpeed * slopeFactor;
      if (state.speed < 0) state.speed = Math.min(0, state.speed + ROVER.brakeDecel * dt);
      else state.speed = Math.min(cap, state.speed + ROVER.acceleration * slopeFactor * dt);
    } else if (dir < 0) {
      const cap = ROVER.reverseMaxSpeed * slopeFactor;
      if (state.speed > 0) state.speed = Math.max(0, state.speed - ROVER.brakeDecel * dt);
      else state.speed = Math.max(-cap, state.speed - ROVER.acceleration * 0.8 * slopeFactor * dt);
    } else if (state.speed !== 0) {
      const decel = ROVER.coastDecel * dt;
      state.speed = Math.abs(state.speed) <= decel ? 0 : state.speed - Math.sign(state.speed) * decel;
    }
    // Gravity nudges the rover downhill when it is coasting on a steep slope.
    if (dir === 0 && Math.abs(uphill) > maxSlope * 0.6) {
      state.speed -= Math.sin(uphill) * 6 * dt;
    }

    // Move, then reject the move if the slope is beyond what the rover can climb.
    state.blocked = false;
    if (state.speed !== 0) {
      const step = forwardVector(tmp).multiplyScalar(state.speed * dt);
      const next = state.position.clone().add(step);
      const limit = terrain.half - ROVER.edgeMargin;
      next.x = THREE.MathUtils.clamp(next.x, -limit, limit);
      next.z = THREE.MathUtils.clamp(next.z, -limit, limit);
      const moveDir = Math.sign(state.speed);
      const slopeNext = slopeAlong(next, moveDir);
      if (slopeNext > maxSlope) {
        state.blocked = true;
        state.speed = 0;
        if (dir !== 0) sounds?.playSlopeBlocked();
      } else {
        state.position.x = next.x;
        state.position.z = next.z;
      }
    }

    // Push the rover out of base modules it would otherwise drive through.
    const roverRadius = ROVER.track / 2 + 0.3;
    for (const obstacle of obstacles()) {
      const dx = state.position.x - obstacle.x;
      const dz = state.position.z - obstacle.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obstacle.radius + roverRadius;
      if (dist < minDist && dist > 1e-4) {
        state.position.x = obstacle.x + (dx / dist) * minDist;
        state.position.z = obstacle.z + (dz / dist) * minDist;
        state.speed *= 0.2;
      }
    }

    // Wheel contact heights -> body height, pitch, roll.
    const mesh_ = mesh;
    for (let i = 0; i < mesh_.wheels.length; i++) {
      const w = wheelWorldXZ(mesh_.wheels[i]);
      wheelHeights[i] = terrain.heightAt(w.x, w.z);
    }
    const [hFL, hFR, hRL, hRR] = wheelHeights;
    const avg = (hFL + hFR + hRL + hRR) / 4;
    const targetPitch = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, ROVER.wheelbase);
    const targetRoll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, ROVER.track);
    const smoothing = Math.min(1, dt * 9);
    state.pitch = THREE.MathUtils.lerp(state.pitch, targetPitch, smoothing);
    state.roll = THREE.MathUtils.lerp(state.roll, targetRoll, smoothing);
    state.position.y = THREE.MathUtils.lerp(state.position.y || avg, avg, smoothing);

    mesh_.root.position.copy(state.position);
    mesh_.root.rotation.set(0, state.heading, 0);
    mesh_.body.rotation.set(-state.pitch, 0, state.roll, 'YXZ');

    // Each wheel sits on its own ground height, tilted to the local normal and
    // rolled by the distance covered. Front wheels also show the steer angle.
    const rollDelta = (state.speed * dt) / ROVER.wheelRadius;
    for (let i = 0; i < mesh_.wheels.length; i++) {
      const wheel = mesh_.wheels[i];
      const w = wheelWorldXZ(wheel);
      wheel.pivot.position.y = wheelHeights[i] - state.position.y + ROVER.wheelRadius;
      terrain.normalAt(w.x, w.z, tmpNormal);
      // Bring the world normal into the root's yaw-only frame.
      tmpNormal.applyAxisAngle(up, -state.heading);
      tiltQuat.setFromUnitVectors(up, tmpNormal);
      const isFront = wheel.z > 0;
      steerQuat.setFromAxisAngle(up, isFront ? state.steer : 0);
      wheel.pivot.quaternion.copy(tiltQuat).multiply(steerQuat);
      wheel.spin.rotation.x += rollDelta;
    }

    // Audio: motor hum follows the throttle, servo whine while steering in place.
    const moving = Math.abs(state.speed) > 0.15;
    sounds?.setMoving(moving, speedRatio);
    sounds?.setTurning(turning !== 0 && !moving);
    return state;
  }

  return { state, update, forwardVector };
}
