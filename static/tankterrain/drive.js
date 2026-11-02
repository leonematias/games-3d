import * as THREE from 'three';

// Shared ground-following for tracked vehicles: the hull height, pitch and
// roll come from the terrain under four contact points. Heading 0 faces +z,
// forward is (sin heading, 0, cos heading).

const pose = { y: 0, pitch: 0, roll: 0 };

export function groundPose(terrain, x, z, heading, wheelbase, track, out = pose) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const hx = track / 2, hz = wheelbase / 2;
  // Contact points: front-left, front-right, rear-left, rear-right (local x right, z forward).
  const fl = terrain.heightAt(x - hx * c + hz * s, z + hx * s + hz * c);
  const fr = terrain.heightAt(x + hx * c + hz * s, z - hx * s + hz * c);
  const rl = terrain.heightAt(x - hx * c - hz * s, z + hx * s - hz * c);
  const rr = terrain.heightAt(x + hx * c - hz * s, z - hx * s - hz * c);
  out.y = (fl + fr + rl + rr) / 4;
  out.pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, wheelbase);
  out.roll = Math.atan2((fr + rr) / 2 - (fl + rl) / 2, track);
  return out;
}

// Signed slope (radians) the vehicle faces moving in `direction` (+1 forward, -1 reverse).
export function slopeAhead(terrain, x, z, heading, wheelbase, direction = 1) {
  const s = Math.sin(heading), c = Math.cos(heading);
  const f = terrain.heightAt(x + s * wheelbase * 0.5 * direction, z + c * wheelbase * 0.5 * direction);
  const r = terrain.heightAt(x - s * wheelbase * 0.5 * direction, z - c * wheelbase * 0.5 * direction);
  return Math.atan2(f - r, wheelbase);
}

export function forwardOf(heading, target = new THREE.Vector3()) {
  return target.set(Math.sin(heading), 0, Math.cos(heading));
}

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Low-arc launch elevation to hit a point `dist` away and `dy` higher with
// muzzle speed v under gravity g. Falls back to 45 degrees when out of range.
export function ballisticPitch(dist, dy, v, g) {
  if (g <= 0) return Math.atan2(dy, dist);
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dist * dist + 2 * dy * v2);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * dist));
}

// Apply a yaw/pitch (model space, forward +z) to a turret and gun group.
export function aimGroups(turret, gun, yaw, pitch) {
  turret.rotation.y = yaw;
  gun.rotation.x = -pitch;
}
