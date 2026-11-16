import * as THREE from 'three';
import { buildDome, buildGenerator, buildPylon, flashTank, updateTankFlash } from './models.js';
import { BOSS } from './config.js';

// The boss level: a shield generator off in the marsh powers an energy dome
// over the keep. The dome stops shots and the tank; pylons carry the beam
// from the generator to the fort so the player can follow the line. Killing
// the generator drops the dome. The boss tank itself lives in enemies.js.

const _p = new THREE.Vector3();
const BEAM_COLOR = new THREE.Color(0x60d0ff);

export function createBoss({ scene, terrain, fort, fx, sounds, level, onEvent }) {
  const spec = level.boss;
  const none = { active: false, generator: null, dome: null, pylons: [], update() {}, targets: () => [], get domeUp() { return false; } };
  if (!spec) return none;
  const group = new THREE.Group();
  scene.add(group);

  // Dome over the keep.
  const keep = level.fort.keep || { hw: level.fort.hw * 0.34, hd: level.fort.hd * 0.34 };
  const domeR = Math.hypot(keep.hw, keep.hd) + BOSS.domeMargin;
  const domeY = terrain.groundAt(level.fort.flag.x, level.fort.flag.z) - domeR * 0.25;
  const domeBuilt = buildDome(domeR);
  domeBuilt.mesh.position.set(level.fort.flag.x, domeY, level.fort.flag.z);
  domeBuilt.mesh.visible = !!spec.generator;
  group.add(domeBuilt.mesh);
  let hitFlash = 0;
  const dome = {
    kind: 'dome', name: 'Keep shield', x: level.fort.flag.x, y: domeY, z: level.fort.flag.z, r: domeR, alive: !!spec.generator, hp: Infinity, maxHp: Infinity,
    pos: new THREE.Vector3(level.fort.flag.x, domeY + domeR * 0.6, level.fort.flag.z), radius: domeR, mesh: domeBuilt.mesh,
    // Shots splash off the dome; nothing gets through.
    takeDamage(amount, at) {
      if (!dome.alive) return false;
      hitFlash = 1;
      if (at) { fx.hitSparks(at, null, 8); fx.ring(at, 4, { life: 0.5, color: 0x80e0ff }); }
      sounds?.domeHit?.();
      return false;
    },
    touched() { hitFlash = Math.max(hitFlash, 0.4); }
  };
  if (dome.alive) fort.addShield(dome);

  // Generator and its pylons.
  let generator = null;
  const pylons = [];
  const beams = [];
  if (spec.generator) {
    const g = spec.generator;
    const y = terrain.groundAt(g.x, g.z);
    const built = buildGenerator();
    built.root.position.set(g.x, y, g.z);
    group.add(built.root);
    generator = {
      kind: 'generator', name: 'Shield generator', built, root: built.root, pos: new THREE.Vector3(g.x, y + 5, g.z), radius: BOSS.generatorRadius,
      hp: BOSS.generatorHp, maxHp: BOSS.generatorHp, alive: true, score: BOSS.generatorScore, stun: 0, state: 'engage',
      takeDamage(amount, at) {
        if (!generator.alive) return;
        generator.hp -= amount;
        flashTank(built, 1);
        if (at) fx.hitSparks(at, null, 4);
        if (generator.hp <= 0) killGenerator();
      }
    };
    fort.addObstacle(g.x, g.z, 6.5);
    const points = [new THREE.Vector3(g.x, y + 10.4, g.z)];
    for (const [px, pz] of spec.pylons || []) {
      const py = terrain.groundAt(px, pz);
      const p = buildPylon();
      p.root.position.set(px, py, pz);
      p.root.rotation.y = Math.atan2(level.fort.flag.x - px, level.fort.flag.z - pz);
      group.add(p.root);
      fort.addObstacle(px, pz, 0.9);
      pylons.push(p);
      points.push(new THREE.Vector3(px, py + 9.1, pz));
    }
    points.push(new THREE.Vector3(dome.x, domeY + domeR * 0.95, dome.z));
    // Beam segments between the points: thin additive tubes.
    const beamMat = new THREE.MeshBasicMaterial({ color: BEAM_COLOR, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const len = a.distanceTo(b);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 6, 1, true), beamMat);
      mesh.position.lerpVectors(a, b, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _p.copy(b).sub(a).normalize());
      group.add(mesh);
      beams.push({ mesh, a, b, len });
    }
  }

  function killGenerator() {
    generator.alive = false;
    generator.hp = 0;
    fx.explosion(generator.pos, { size: 14, ground: false });
    fx.burn(_p.copy(generator.pos).setY(generator.pos.y - 4), { size: 4, duration: 80 });
    fx.debrisBurst(generator.pos, 24, 18, 0.7);
    fx.ring(_p.copy(generator.pos).setY(generator.pos.y - 4.5), 30, { life: 1.2, color: 0x80e0ff, flat: true });
    fx.shakeAt(generator.pos, 1.0, 200);
    fx.flash(generator.pos, { intensity: 3000, life: 0.8, color: 0x80e0ff, distance: 300 });
    sounds?.explosion(1.5);
    generator.built.glow.emissiveIntensity = 0;
    generator.built.orb.material.emissiveIntensity = 0;
    generator.built.light.intensity = 0;
    generator.root.traverse((n) => { if (n.isMesh && n.material !== generator.built.orb.material) n.material = charMat(); });
    for (const b of beams) b.mesh.visible = false;
    for (const p of pylons) p.tip.material.emissiveIntensity = 0;
    // The dome collapses a moment later.
    domeDownTimer = 1.6;
    onEvent?.({ type: 'generator', target: generator, score: generator.score });
  }
  let _charMat = null;
  function charMat() { return _charMat || (_charMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 })); }

  let domeDownTimer = 0;
  let collapse = 0;
  function dropDome() {
    dome.alive = false;
    collapse = 1;
    fx.ring(_p.set(dome.x, terrain.groundAt(dome.x, dome.z) + 0.5, dome.z), domeR * 2.2, { life: 1.6, color: 0x80e0ff, flat: true });
    fx.flash(_p.set(dome.x, domeY + domeR, dome.z), { intensity: 2500, life: 1.0, color: 0x80e0ff, distance: 400 });
    sounds?.domeDown?.();
    onEvent?.({ type: 'domeDown', target: dome });
  }

  function update(dt, t, player) {
    if (generator?.alive) {
      updateTankFlash(generator.built, dt);
      generator.built.rings.rotation.y += dt * 1.6;
      for (let i = 0; i < generator.built.rings.children.length; i++) generator.built.rings.children[i].position.y = 4.6 + i * 1.2 + Math.sin(t * 3 + i) * 0.15;
      const pulse = 1.8 + Math.sin(t * 5) * 0.6;
      generator.built.orb.material.emissiveIntensity = pulse;
      generator.built.light.intensity = 30 + pulse * 8;
      for (const b of beams) b.mesh.material.opacity = 0.4 + Math.sin(t * 9 + b.len) * 0.15;
      if (Math.random() < dt * 6) fx.pools.sparks.emit({ x: generator.pos.x + (Math.random() - 0.5) * 2, y: generator.pos.y + 5.4, z: generator.pos.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.5, size: 0.3, sizeEnd: 0.05, color: new THREE.Color(0xa0f0ff), colorEnd: new THREE.Color(0x4080ff), gravity: 6 });
    } else if (generator) updateTankFlash(generator.built, dt);
    if (domeDownTimer > 0) { domeDownTimer -= dt; if (domeDownTimer <= 0 && dome.alive) dropDome(); }
    hitFlash = Math.max(0, hitFlash - dt * 3);
    domeBuilt.mat.uniforms.uTime.value = t;
    domeBuilt.mat.uniforms.uHit.value = hitFlash;
    if (collapse > 0) {
      collapse = Math.max(0, collapse - dt * 0.8);
      domeBuilt.mesh.scale.setScalar(Math.max(0.01, collapse));
      domeBuilt.mesh.position.y = domeY - (1 - collapse) * domeR;
      if (collapse <= 0) domeBuilt.mesh.visible = false;
    }
  }

  const targets = () => (generator && generator.alive ? [generator] : []);
  return {
    active: true, generator, dome, pylons, update, targets,
    get domeUp() { return dome.alive; }
  };
}
