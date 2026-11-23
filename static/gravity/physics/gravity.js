/** Direct softened Newtonian gravity. No allocations in the pair loop. */

/**
 * Acceleration of every body from every other body.
 * For each i < j:
 *   s = |d|^2 + epsilon^2
 *   factor = G / (s * sqrt(s))
 *   a_i += m_j * factor * d
 *   a_j -= m_i * factor * d
 * Returns the indices whose acceleration became non-finite.
 */
export function computeAccelerations(store, G, epsilon, out) {
  const n = store.count;
  const pos = store.pos;
  const mass = store.mass;
  const eps2 = epsilon * epsilon;
  out.fill(0, 0, n * 3);
  const bad = [];
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    const xi = pos[ix];
    const yi = pos[ix + 1];
    const zi = pos[ix + 2];
    const mi = mass[i];
    for (let j = i + 1; j < n; j++) {
      const jx = j * 3;
      const dx = pos[jx] - xi;
      const dy = pos[jx + 1] - yi;
      const dz = pos[jx + 2] - zi;
      const s = dx * dx + dy * dy + dz * dz + eps2;
      const factor = G / (s * Math.sqrt(s));
      const mj = mass[j];
      const fi = mj * factor;
      const fj = mi * factor;
      out[ix] += fi * dx;
      out[ix + 1] += fi * dy;
      out[ix + 2] += fi * dz;
      out[jx] -= fj * dx;
      out[jx + 1] -= fj * dy;
      out[jx + 2] -= fj * dz;
    }
    if (!Number.isFinite(out[ix]) || !Number.isFinite(out[ix + 1]) || !Number.isFinite(out[ix + 2])) {
      bad.push(i);
    }
  }
  return bad;
}

/** Softened potential, the same kernel as the force: sum -G mi mj / sqrt(r^2 + eps^2). */
export function potentialEnergy(store, G, epsilon) {
  const n = store.count;
  const pos = store.pos;
  const mass = store.mass;
  const eps2 = epsilon * epsilon;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    const mi = mass[i];
    for (let j = i + 1; j < n; j++) {
      const jx = j * 3;
      const dx = pos[jx] - pos[ix];
      const dy = pos[jx + 1] - pos[ix + 1];
      const dz = pos[jx + 2] - pos[ix + 2];
      const s = dx * dx + dy * dy + dz * dz + eps2;
      energy += -G * mi * mass[j] / Math.sqrt(s);
    }
  }
  return energy;
}

export function kineticEnergy(store) {
  const n = store.count;
  const vel = store.vel;
  const mass = store.mass;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const speed2 = vel[k] * vel[k] + vel[k + 1] * vel[k + 1] + vel[k + 2] * vel[k + 2];
    energy += 0.5 * mass[i] * speed2;
  }
  return energy;
}

export function totalEnergy(store, G, epsilon) {
  return kineticEnergy(store) + potentialEnergy(store, G, epsilon);
}

export function momentum(store) {
  const n = store.count;
  const vel = store.vel;
  const mass = store.mass;
  let x = 0;
  let y = 0;
  let z = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const mi = mass[i];
    m += mi;
    x += mi * vel[k];
    y += mi * vel[k + 1];
    z += mi * vel[k + 2];
  }
  return { mass: m, p: [x, y, z] };
}

export function centerOfMass(store) {
  const n = store.count;
  const pos = store.pos;
  const mass = store.mass;
  let x = 0;
  let y = 0;
  let z = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const mi = mass[i];
    m += mi;
    x += mi * pos[k];
    y += mi * pos[k + 1];
    z += mi * pos[k + 2];
  }
  if (m === 0) return [0, 0, 0];
  return [x / m, y / m, z / m];
}

/**
 * Circular speed for a softened central force, from the radial acceleration
 * of a test mass: v = sqrt(r * |a|). This is the point-mass formula only when epsilon is 0.
 */
export function circularSpeed(G, centralMass, radius, epsilon) {
  const r = Math.abs(radius);
  const s = r * r + epsilon * epsilon;
  const a = G * centralMass * r / (s * Math.sqrt(s));
  return Math.sqrt(Math.max(0, r * a));
}

/**
 * Equal-mass or unequal two-body circular orbit about the barycenter.
 * Separation is along X. The relative velocity is along +Z, so the orbit lies in the XZ plane
 * and the angular momentum points along +Y.
 */
export function barycentricCircular(G, mass1, mass2, separation, epsilon) {
  const r = separation;
  const s = r * r + epsilon * epsilon;
  const aRel = G * (mass1 + mass2) * r / (s * Math.sqrt(s));
  const vRel = Math.sqrt(Math.max(0, r * Math.abs(aRel)));
  const total = mass1 + mass2;
  const x1 = -mass2 / total * r;
  const x2 = mass1 / total * r;
  const v1 = -mass2 / total * vRel;
  const v2 = mass1 / total * vRel;
  return {
    period: vRel > 0 ? (2 * Math.PI * r) / vRel : Infinity,
    vRel,
    aRel,
    bodies: [
      { position: [x1, 0, 0], velocity: [0, 0, v1], mass: mass1 },
      { position: [x2, 0, 0], velocity: [0, 0, v2], mass: mass2 },
    ],
  };
}
