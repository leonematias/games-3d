/** Kick-drift-kick leapfrog. Accelerations are recomputed from positions. */

import { computeAccelerations } from './gravity.js';

/**
 * v += dt/2 * a(x)
 * x += dt * v
 * v += dt/2 * a(x)
 * `accel` and `scratch` are Float64Array buffers of length >= count * 3.
 * Returns body indices whose acceleration was non-finite. Positions are unchanged in that case.
 */
export function kickDriftKick(store, G, epsilon, dt, accel, scratch) {
  const n = store.count;
  if (accel.length < n * 3) throw new Error('Acceleration buffer is too small');
  const bad0 = computeAccelerations(store, G, epsilon, accel);
  if (bad0.length) return bad0;

  const pos = store.pos;
  const vel = store.vel;
  const half = 0.5 * dt;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const vx = vel[k] + half * accel[k];
    const vy = vel[k + 1] + half * accel[k + 1];
    const vz = vel[k + 2] + half * accel[k + 2];
    vel[k] = vx;
    vel[k + 1] = vy;
    vel[k + 2] = vz;
    pos[k] += dt * vx;
    pos[k + 1] += dt * vy;
    pos[k + 2] += dt * vz;
  }

  const bad1 = computeAccelerations(store, G, epsilon, scratch);
  if (bad1.length) return bad1;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    vel[k] += half * scratch[k];
    vel[k + 1] += half * scratch[k + 1];
    vel[k + 2] += half * scratch[k + 2];
  }
  return [];
}
