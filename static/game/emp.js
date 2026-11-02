import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { EMP_EXPAND_SECONDS } from './config.js';

// EMP zones: an expanding ring, then a faint dome that marks where enemies, lasers and toggle
// walls stay frozen until the zone expires.
export function createEmpController(scene) {
  const zones = [];

  function fire(origin, radius, seconds) {
    const group = new THREE.Group();
    group.position.set(origin.x, origin.y + 0.05, origin.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    dome.scale.setScalar(radius);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe0e7ff, transparent: true, opacity: 0.9, depthWrite: false })
    );
    flash.position.y = 0.4;
    group.add(ring, dome, flash);
    scene.add(group);
    zones.push({ x: origin.x, z: origin.z, radius, remaining: seconds, total: seconds, age: 0, group, ring, dome, flash });
  }

  function covers(x, z) {
    return zones.some((zone) => zone.remaining > 0 && Math.hypot(zone.x - x, zone.z - z) <= zone.radius);
  }

  function update(delta) {
    for (let index = zones.length - 1; index >= 0; index--) {
      const zone = zones[index];
      zone.age += delta;
      zone.remaining -= delta;
      const grow = Math.min(1, zone.age / EMP_EXPAND_SECONDS);
      const ringRadius = Math.max(0.2, grow * zone.radius);
      zone.ring.scale.set(ringRadius, ringRadius, ringRadius);
      zone.ring.material.opacity = 0.95 * (1 - grow);
      zone.flash.scale.setScalar(1 + grow * 2.5);
      zone.flash.material.opacity = Math.max(0, 0.9 - zone.age * 2.2);
      const fade = Math.min(1, zone.remaining / 0.6);
      zone.dome.material.opacity = (0.16 + Math.sin(zone.age * 6) * 0.05) * fade;
      if (zone.remaining > 0) continue;
      scene.remove(zone.group);
      zone.group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry.dispose();
        obj.material.dispose();
      });
      zones.splice(index, 1);
    }
  }

  return { fire, covers, update, active: () => zones.some((zone) => zone.remaining > 0) };
}
