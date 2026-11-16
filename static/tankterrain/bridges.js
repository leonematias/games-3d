import * as THREE from 'three';
import { MAT } from './models.js';
import { BRIDGE } from './config.js';

// Road bridges over deep water. A bridge is drivable ground (the terrain's
// height is overridden on the deck) until it is destroyed: the enemy has it
// wired and blows it when the tank gets close, so the player has to find the
// ford further along the river. Shots and splashes hurt it too.

const _p = new THREE.Vector3();

export function createBridges({ scene, terrain, fx, sounds, level, onEvent }) {
  const list = [];
  const group = new THREE.Group();
  scene.add(group);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.9, metalness: 0.1 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.5, metalness: 0.7 });

  for (const b of level.bridges || []) {
    const x1 = b.x1, z1 = b.z1, x2 = b.x2, z2 = b.z2;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const yaw = Math.atan2(z2 - z1, x2 - x1);       // long axis along (cos yaw, sin yaw)
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const y = Math.max(terrain.groundAt(x1, z1), terrain.groundAt(x2, z2)) + 0.35;
    const width = b.width || 9;
    const root = new THREE.Group();
    root.position.set(cx, y, cz);
    root.rotation.y = -yaw;
    group.add(root);
    // Two deck halves so the collapse can fold them into the river.
    const halves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.x = s * len / 2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len / 2, 0.6, width), deckMat);
      deck.position.x = -s * len / 4;
      deck.castShadow = true;
      deck.receiveShadow = true;
      pivot.add(deck);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len / 2, 0.9, 0.15), steelMat);
        rail.position.set(-s * len / 4, 0.75, side * (width / 2 - 0.2));
        rail.castShadow = true;
        pivot.add(rail);
        for (let i = 0; i < Math.floor(len / 2 / 4); i++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), steelMat);
          post.position.set(-s * (i * 4 + 2), 0.55, side * (width / 2 - 0.2));
          pivot.add(post);
        }
      }
      root.add(pivot);
      halves.push(pivot);
    }
    // Pylons down to the river bed.
    const n = Math.max(1, Math.floor(len / 14));
    for (let i = 0; i < n; i++) {
      const lx = -len / 2 + (len / (n + 1)) * (i + 1);
      const wx = cx + Math.cos(yaw) * lx, wz = cz + Math.sin(yaw) * lx;
      const bed = terrain.groundAt(wx, wz);
      const h = y - bed + 0.5;
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, h, 10), MAT.concrete);
        pylon.position.set(lx, -h / 2 - 0.2, side * (width / 2 - 1.2));
        pylon.castShadow = true;
        root.add(pylon);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, width), MAT.concreteDark);
      beam.position.set(lx, -0.6, 0);
      root.add(beam);
    }
    // The charges: small red boxes under the deck.
    const charges = [];
    if (b.wired) {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x802020, emissive: 0xff2020, emissiveIntensity: 0.6 }));
        c.position.set(-len / 3 + i * len / 3, -0.5, (i % 2 ? 1 : -1) * width * 0.3);
        root.add(c);
        charges.push(c);
      }
    }
    list.push({
      kind: 'bridge', name: 'Bridge', x1, z1, x2, z2, cx, cz, len, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), width, y, root, halves, charges,
      pos: new THREE.Vector3(cx, y, cz), radius: Math.max(len, width) * 0.5,
      hp: BRIDGE.hp, maxHp: BRIDGE.hp, alive: true, wired: !!b.wired, fuse: -1, beepAcc: 0, collapse: 0, warned: false,
      takeDamage(amount) { damage(this, amount); }
    });
  }

  function local(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz;
    return { lx: dx * b.cos + dz * b.sin, lz: -dx * b.sin + dz * b.cos };
  }
  // Deck height at a point, or null when the point is off every live bridge.
  function heightAt(x, z) {
    for (const b of list) {
      if (!b.alive) continue;
      const { lx, lz } = local(b, x, z);
      if (Math.abs(lx) <= b.len / 2 + 1.5 && Math.abs(lz) <= b.width / 2) return b.y + 0.3;
    }
    return null;
  }
  function at(x, z, margin = 0) {
    for (const b of list) {
      if (!b.alive) continue;
      const { lx, lz } = local(b, x, z);
      if (Math.abs(lx) <= b.len / 2 + margin && Math.abs(lz) <= b.width / 2 + margin) return b;
    }
    return null;
  }
  function onDeck(b, x, z, margin = 0) {
    const { lx, lz } = local(b, x, z);
    return Math.abs(lx) <= b.len / 2 + margin && Math.abs(lz) <= b.width / 2 + margin;
  }

  function damage(b, amount) {
    if (!b.alive) return;
    b.hp -= amount;
    if (b.hp <= 0) destroy(b, false);
  }
  function splash(pos, radius, amount) {
    for (const b of list) {
      if (!b.alive) continue;
      const { lx, lz } = local(b, pos.x, pos.z);
      const d = Math.max(0, Math.abs(lx) - b.len / 2, Math.abs(lz) - b.width / 2, Math.abs(pos.y - b.y) - 2);
      if (d < radius) damage(b, amount * (1 - d / radius));
    }
  }

  function destroy(b, blown) {
    b.alive = false;
    b.hp = 0;
    b.collapse = 0.001;
    for (const c of b.charges) c.visible = false;
    _p.copy(b.pos);
    fx.explosion(_p, { size: blown ? 11 : 8, ground: false });
    fx.debrisBurst(_p, 24, 16, 0.6);
    fx.addShake(0.8);
    sounds?.explosion(1.3);
    sounds?.crumble(1.2);
    onEvent?.({ type: 'bridge', target: b, blown });
  }

  function update(dt, player) {
    for (const b of list) {
      if (b.collapse > 0 && b.collapse < 1) {
        b.collapse = Math.min(1, b.collapse + dt * 0.7);
        const k = b.collapse * b.collapse;
        b.halves[0].rotation.z = -k * 0.75;
        b.halves[1].rotation.z = k * 0.75;
        if (Math.random() < dt * 8) {
          _p.set(b.cx + (Math.random() - 0.5) * b.len * 0.6, b.y - k * 3, b.cz + (Math.random() - 0.5) * b.width);
          fx.dust(_p, 2);
        }
        continue;
      }
      if (!b.alive || !b.wired || !player?.alive) continue;
      const d = Math.hypot(player.pos.x - b.cx, player.pos.z - b.cz);
      if (b.fuse < 0) {
        if (d < BRIDGE.wireRange && !onDeck(b, player.pos.x, player.pos.z, 8)) {
          b.fuse = BRIDGE.fuse;
          b.beepAcc = 0;
          onEvent?.({ type: 'bridgeWarning', target: b });
        }
        continue;
      }
      b.fuse -= dt;
      b.beepAcc += dt;
      if (b.beepAcc > 0.35) { b.beepAcc = 0; sounds?.beep?.(); for (const c of b.charges) c.material.emissiveIntensity = c.material.emissiveIntensity > 1 ? 0.6 : 3; }
      // The charges wait while the tank is on the deck: blowing it up with the tank on it is no fun.
      if (b.fuse <= 0 && !onDeck(b, player.pos.x, player.pos.z, 6)) destroy(b, true);
    }
  }

  const aliveCount = () => list.filter((b) => b.alive).length;
  return { list, heightAt, at, splash, damage, update, aliveCount, group };
}
