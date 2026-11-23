import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

const AURA_SECONDS = 0.8;

export function createLevelAuraController(scene) {
  const auras = [];

  function spawn(position) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 28, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    group.add(ring, shell);
    group.position.set(position.x, position.y + 0.4, position.z);
    scene.add(group);
    auras.push({ group, ring, shell, age: 0 });
  }

  function update(delta, position) {
    for (let index = auras.length - 1; index >= 0; index--) {
      const aura = auras[index];
      aura.age += delta;
      const t = Math.min(1, aura.age / AURA_SECONDS);
      const scale = 1 + t * 2.6;
      aura.shell.scale.setScalar(scale);
      aura.ring.scale.set(scale, scale, scale);
      aura.shell.material.opacity = 0.4 * (1 - t);
      aura.ring.material.opacity = 0.95 * (1 - t);
      if (position) aura.group.position.set(position.x, position.y + 0.4, position.z);
      if (aura.age < AURA_SECONDS) continue;
      scene.remove(aura.group);
      aura.ring.geometry.dispose();
      aura.shell.geometry.dispose();
      aura.ring.material.dispose();
      aura.shell.material.dispose();
      auras.splice(index, 1);
    }
  }

  return { spawn, update, active: () => auras.length };
}
