import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Ambient weather and dust: a box of particles that follows the tank and wraps at its edges.

let softDot = null;
function softDotTexture() {
  if (softDot) return softDot;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  softDot = new THREE.CanvasTexture(canvas);
  return softDot;
}

function wrap(value, span) {
  return ((value % span) + span) % span;
}

const KINDS = {
  snow: { count: 700, size: 0.075, color: 0xffffff, opacity: 0.9, box: [16, 9, 16], fall: 0.7, drift: 0.25, sway: 0.5 },
  dust: { count: 260, size: 0.045, color: 0xd8d0c0, opacity: 0.35, box: [14, 5, 14], fall: 0.02, drift: 0.08, sway: 0.2 },
  motes: { count: 220, size: 0.05, color: 0xffe29a, opacity: 0.5, box: [14, 5, 14], fall: 0.03, drift: 0.05, sway: 0.25, additive: true },
  leaves: { count: 130, size: 0.1, color: 0x9a7a2a, opacity: 0.9, box: [16, 8, 16], fall: 0.45, drift: 0.35, sway: 0.9 },
  embers: { count: 260, size: 0.06, color: 0xff7a2a, opacity: 0.95, box: [14, 7, 14], fall: -0.65, drift: 0.2, sway: 0.6, additive: true, heat: true },
  sparks: { count: 110, size: 0.05, color: 0xffd27a, opacity: 0.9, box: [14, 6, 14], fall: 0.9, drift: 0.3, sway: 0.1, additive: true },
  rain: { count: 600, box: [16, 10, 16], fall: 11, drift: 0.8, streak: 0.4, color: 0xbfd4e6, opacity: 0.32 }
};

export function createAmbientParticles(scene, kind, look) {
  const spec = KINDS[kind];
  if (!spec) return null;
  const color = kind === 'leaves' && look?.foliage?.leaf ? look.foliage.leaf : spec.color;
  const [bw, bh, bd] = spec.box;
  const objects = [];
  const layers = [];

  function makeLayer({ count, size, opacity, additive, fall, drift, sway, scale = 1 }) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * bw;
      positions[i * 3 + 1] = Math.random() * bh;
      positions[i * 3 + 2] = (Math.random() - 0.5) * bd;
      velocities[i * 3] = (Math.random() - 0.5) * drift;
      velocities[i * 3 + 1] = -fall * (0.7 + Math.random() * 0.6);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * drift;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      size: size * scale,
      color,
      map: softDotTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    objects.push(points);
    layers.push({ positions, velocities, phases, count, geometry, sway });
  }

  let rain = null;
  if (kind === 'rain') {
    const count = spec.count;
    const positions = new Float32Array(count * 6);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * bw;
      const y = Math.random() * bh;
      const z = (Math.random() - 0.5) * bd;
      positions.set([x, y, z, x + spec.drift * 0.04, y + spec.streak, z], i * 6);
      velocities[i] = spec.fall * (0.8 + Math.random() * 0.4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    scene.add(lines);
    objects.push(lines);
    rain = { positions, velocities, count, geometry };
  } else {
    makeLayer(spec);
    if (spec.heat) {
      // Big faint rising blobs read as heat haze over lava.
      makeLayer({ count: 36, size: 1.4, opacity: 0.045, additive: true, fall: -0.35, drift: 0.1, sway: 0.3 });
    }
  }

  const center = new THREE.Vector3();
  let time = 0;

  function update(delta, focus) {
    time += delta;
    if (focus) center.set(focus.x, Math.max(0, focus.y), focus.z);
    for (const layer of layers) {
      const { positions, velocities, phases, count, geometry, sway } = layer;
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        positions[j] += (velocities[j] + Math.sin(time * 1.3 + phases[i]) * sway * 0.5) * delta;
        positions[j + 1] += velocities[j + 1] * delta;
        positions[j + 2] += (velocities[j + 2] + Math.cos(time * 1.1 + phases[i]) * sway * 0.5) * delta;
        // Wrap inside the box around the tank.
        positions[j] = center.x + wrap(positions[j] - center.x + bw / 2, bw) - bw / 2;
        positions[j + 2] = center.z + wrap(positions[j + 2] - center.z + bd / 2, bd) - bd / 2;
        positions[j + 1] = center.y + wrap(positions[j + 1] - center.y + 0.1, bh) - 0.1;
      }
      geometry.attributes.position.needsUpdate = true;
    }
    if (rain) {
      const { positions, velocities, count, geometry } = rain;
      for (let i = 0; i < count; i++) {
        const j = i * 6;
        const dy = velocities[i] * delta;
        positions[j + 1] -= dy;
        positions[j + 4] -= dy;
        positions[j] += spec.drift * delta;
        positions[j + 3] += spec.drift * delta;
        const nx = center.x + wrap(positions[j] - center.x + bw / 2, bw) - bw / 2;
        positions[j + 3] += nx - positions[j];
        positions[j] = nx;
        const nz = center.z + wrap(positions[j + 2] - center.z + bd / 2, bd) - bd / 2;
        positions[j + 5] += nz - positions[j + 2];
        positions[j + 2] = nz;
        const ny = center.y + wrap(positions[j + 1] - center.y + 0.1, bh) - 0.1;
        positions[j + 4] += ny - positions[j + 1];
        positions[j + 1] = ny;
      }
      geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    for (const obj of objects) {
      scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
  }

  return { update, dispose, kind };
}
