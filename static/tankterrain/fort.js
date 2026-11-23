import * as THREE from 'three';
import { MAT, buildBarrel, buildFlag, buildPennant } from './models.js';
import { SCORE, WALLS } from './config.js';

// The fort: wall segments with materials and hit points, corner towers, huts,
// explosive barrels and the flag. Also the static collision world: every
// solid thing (walls, towers, huts, trees, rocks) is here so tanks and shots
// can be tested against it in one place.
//
// Wall yaw uses the generator's convention: the wall's long axis points along
// (cos yaw, sin yaw) in the (x, z) plane. A Three.js mesh gets rotation.y = -yaw.

const _p = new THREE.Vector3();

function canvasTexture(draw, w = 256, h = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function cracks(ctx, w, h, n = 6) {
  ctx.strokeStyle = 'rgba(20,16,12,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, w, h);
}

// One 4 m x 2 m tile per material, plus a cracked variant.
const TEXTURES = {};
function textureFor(material, damaged) {
  const key = `${material}${damaged ? ':d' : ''}`;
  if (TEXTURES[key]) return TEXTURES[key];
  const DRAWERS = {
    brick(ctx, w, h) {
      ctx.fillStyle = '#8a7568';
      ctx.fillRect(0, 0, w, h);
      const bw = 32, bh = 16;
      for (let row = 0; row < h / bh; row++) {
        for (let col = -1; col < w / bw + 1; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0);
          const y = row * bh;
          const t = 150 + Math.random() * 40;
          ctx.fillStyle = `rgb(${t | 0}, ${(t * 0.55) | 0}, ${(t * 0.45) | 0})`;
          ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        }
      }
    },
    concrete(ctx, w, h) {
      ctx.fillStyle = '#8e8b84';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        const v = 110 + Math.random() * 60;
        ctx.fillStyle = `rgba(${v}, ${v}, ${v - 6}, 0.35)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.strokeStyle = 'rgba(40,40,40,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w / 2 - 4, h - 4);
      ctx.strokeRect(w / 2 + 2, 2, w / 2 - 4, h - 4);
      ctx.fillStyle = 'rgba(70,70,70,0.6)';
      for (const [x, y] of [[10, 10], [w / 2 - 10, 10], [10, h - 10], [w / 2 - 10, h - 10], [w / 2 + 10, 10], [w - 10, 10], [w / 2 + 10, h - 10], [w - 10, h - 10]]) ctx.fillRect(x - 2, y - 2, 4, 4);
    },
    wood(ctx, w, h) {
      ctx.fillStyle = '#7a5630';
      ctx.fillRect(0, 0, w, h);
      const pw = 20;
      for (let i = 0; i < w / pw; i++) {
        const t = 120 + Math.random() * 50;
        ctx.fillStyle = `rgb(${t | 0}, ${(t * 0.66) | 0}, ${(t * 0.38) | 0})`;
        ctx.fillRect(i * pw + 1, 0, pw - 2, h);
        ctx.strokeStyle = 'rgba(60,35,15,0.5)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(i * pw + 3 + Math.random() * 14, 0);
          ctx.lineTo(i * pw + 3 + Math.random() * 14, h);
          ctx.stroke();
        }
      }
    },
    gate(ctx, w, h) {
      DRAWERS.wood(ctx, w, h);
      ctx.fillStyle = '#3a3a3c';
      ctx.fillRect(0, h * 0.2, w, 8);
      ctx.fillRect(0, h * 0.72, w, 8);
      ctx.fillStyle = '#8a8a8c';
      for (let i = 0; i < w; i += 16) { ctx.fillRect(i + 5, h * 0.2 + 2, 4, 4); ctx.fillRect(i + 5, h * 0.72 + 2, 4, 4); }
    },
    steel(ctx, w, h) {
      ctx.fillStyle = '#5b6672';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        const v = 80 + Math.random() * 40;
        ctx.fillStyle = `rgba(${v}, ${v + 8}, ${v + 16}, 0.3)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 1);
      }
      ctx.strokeStyle = 'rgba(25,30,36,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, w / 2 - 6, h - 6);
      ctx.strokeRect(w / 2 + 3, 3, w / 2 - 6, h - 6);
      ctx.fillStyle = '#9aa4ae';
      for (let x = 10; x < w; x += 16) { ctx.fillRect(x, 8, 3, 3); ctx.fillRect(x, h - 11, 3, 3); }
      for (let y = 24; y < h - 16; y += 16) { ctx.fillRect(8, y, 3, 3); ctx.fillRect(w / 2 - 11, y, 3, 3); ctx.fillRect(w / 2 + 8, y, 3, 3); ctx.fillRect(w - 11, y, 3, 3); }
    }
  };
  const draw = DRAWERS[material] || ((ctx, w, h) => { ctx.fillStyle = '#888'; ctx.fillRect(0, 0, w, h); });
  const tex = canvasTexture((ctx, w, h) => { draw(ctx, w, h); if (damaged) cracks(ctx, w, h); });
  TEXTURES[key] = tex;
  return tex;
}

const MATERIAL_CACHE = new Map();
function wallMaterial(material, len, h, damaged) {
  const key = `${material}:${len.toFixed(1)}:${h.toFixed(1)}:${damaged ? 1 : 0}`;
  if (MATERIAL_CACHE.has(key)) return MATERIAL_CACHE.get(key);
  const tex = textureFor(material, damaged).clone();
  tex.repeat.set(Math.max(1, len / 4), Math.max(0.5, h / 2));
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: material === 'steel' ? 0.45 : 0.9, metalness: material === 'steel' ? 0.6 : 0.05 });
  MATERIAL_CACHE.set(key, mat);
  return mat;
}

const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4a4541, roughness: 1 });

export function createFort({ scene, terrain, fx, sounds, level, onEvent }) {
  const spec = level.fort;
  const walls = [];      // destructible or solid OBBs: walls, huts
  const towers = [];     // solid cylinders
  const barrels = [];
  const obstacles = [];  // trees and rocks: { x, z, r }
  const shields = [];    // energy domes: { x, y, z, r, alive, takeDamage } (the boss keep)
  const group = new THREE.Group();
  scene.add(group);

  function makeWall({ x, z, yawDeg, len, material, h, thick, kind = 'wall', w = null, d = null, hut = false, perimeter = false }) {
    const def = WALLS[material] || WALLS.concrete;
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const base = terrain.groundAt(x, z) - 0.6;
    thick = thick ?? def.thick;
    const height = h ?? 4;
    const geo = new THREE.BoxGeometry(len, height + 0.6, thick);
    const mesh = new THREE.Mesh(geo, wallMaterial(material, len, height, false));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, base + (height + 0.6) / 2, z);
    mesh.rotation.y = -yaw;
    group.add(mesh);
    const wall = {
      kind, material, def, x, z, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), len, thick, h: height, base, mesh,
      pos: new THREE.Vector3(x, base + 0.6 + height * 0.5, z), radius: Math.hypot(len / 2, thick / 2) + 0.5, hitRadius: Math.max(len, thick) * 0.5,
      hp: def.hp, maxHp: def.hp, alive: true, damaged: false, hut, perimeter,
      takeDamage(amount, at, how) {
        if (!wall.alive || wall.hp === Infinity) {
          if (wall.alive && at) fx.hitSparks(at, null, 4);
          return false;
        }
        wall.hp -= amount;
        if (!wall.damaged && wall.hp < wall.maxHp * 0.55) {
          wall.damaged = true;
          wall.mesh.material = wallMaterial(wall.material, wall.len, wall.h, true);
        }
        if (wall.hp <= 0) destroyWall(wall);
        return true;
      }
    };
    if (hut) {
      // A dark doorway, a roof lip and a chimney so huts read as buildings.
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), MAT.dark);
      door.position.set(0, -height / 2 + 1.5, thick / 2 + 0.02);
      mesh.add(door);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.3, thick + 0.4), MAT.concreteDark);
      roof.position.y = (height + 0.6) / 2 + 0.1;
      mesh.add(roof);
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), MAT.concreteDark);
      chimney.position.set(len * 0.3, (height + 0.6) / 2 + 0.6, -thick * 0.2);
      chimney.castShadow = true;
      mesh.add(chimney);
      wall.chimney = new THREE.Vector3(x + len * 0.3 * Math.cos(yaw), base + 0.6 + height + 1.2, z + len * 0.3 * Math.sin(yaw));
      wall.smokeAcc = Math.random();
    }
    walls.push(wall);
    return wall;
  }

  const WALL_COLORS = { wood: 0x8a6238, gate: 0x7c5a30, brick: 0x9a6050, concrete: 0x8a8880, steel: 0x5b6672 };
  let breached = false;
  function destroyWall(wall) {
    wall.alive = false;
    wall.hp = 0;
    group.remove(wall.mesh);
    const rubble = new THREE.Mesh(new THREE.BoxGeometry(wall.len * 1.05, 0.7, wall.thick * 2.4), rubbleMat);
    rubble.position.set(wall.x, wall.base + 0.6 + 0.2, wall.z);
    rubble.rotation.set((Math.random() - 0.5) * 0.15, -wall.yaw, (Math.random() - 0.5) * 0.1);
    rubble.receiveShadow = true;
    rubble.castShadow = true;
    group.add(rubble);
    _p.copy(wall.pos);
    fx.explosion(_p, { size: wall.hut ? 9 : 5.5, ground: true });
    fx.debrisBurst(_p, 10, 12, 0.5);
    // Chunks of the wall fly out, bounce and stay as small obstacles.
    fx.rubbleBurst(_p, wall.hut ? 14 : 7 + Math.round(wall.len * 0.6), WALL_COLORS[wall.material] || 0x807870, wall.hut ? 1.1 : 0.9, wall.hut ? 12 : 9);
    sounds?.crumble(wall.material === 'wood' || wall.material === 'gate' ? 0.6 : 1);
    onEvent?.({ type: 'wall', target: wall, score: SCORE.wall * (wall.material === 'concrete' ? 2 : 1) });
    if (wall.perimeter && !breached) {
      breached = true;
      onEvent?.({ type: 'breach', target: wall });
    }
  }

  for (const w of spec.walls) makeWall({ x: w.x, z: w.z, yawDeg: w.yawDeg, len: w.len, material: w.material, h: w.h, perimeter: isPerimeter(w) });
  for (const hut of spec.huts || []) makeWall({ x: hut.x, z: hut.z, yawDeg: hut.yawDeg, len: hut.w, thick: hut.d, material: 'concrete', h: hut.h, hut: true, kind: 'hut' });

  // Perimeter walls sit on the fort's outer rectangle; the keep's walls are well inside.
  function isPerimeter(w) {
    const a = THREE.MathUtils.degToRad(spec.headingDeg || 0);
    const dx = w.x - spec.x, dz = w.z - spec.z;
    const lx = dx * Math.cos(a) + dz * Math.sin(a);
    const lz = -dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(Math.abs(lx) - spec.hw) < 2 || Math.abs(Math.abs(lz) - spec.hd) < 2;
  }
  // Is a point inside the fort's outer rectangle (with a margin)?
  function inside(x, z, margin = 0) {
    const a = THREE.MathUtils.degToRad(spec.headingDeg || 0);
    const dx = x - spec.x, dz = z - spec.z;
    const lx = dx * Math.cos(a) + dz * Math.sin(a);
    const lz = -dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(lx) < spec.hw + margin && Math.abs(lz) < spec.hd + margin;
  }

  // Corner towers: solid cylinders with a crenellated top and a turret pad.
  for (const t of spec.towers) {
    const y = terrain.groundAt(t.x, t.z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(t.radius, t.radius * 1.15, t.h + 0.8, 14), wallMaterial('concrete', t.radius * 6, t.h, false));
    body.position.y = (t.h + 0.8) / 2 - 0.8;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.radius + 0.5, t.radius + 0.3, 0.6, 14), MAT.concreteDark);
    cap.position.y = t.h + 0.3;
    cap.castShadow = true;
    g.add(cap);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.5), MAT.concrete);
      m.position.set(Math.cos(a) * (t.radius + 0.2), t.h + 1.0, Math.sin(a) * (t.radius + 0.2));
      m.rotation.y = -a;
      m.castShadow = true;
      g.add(m);
    }
    // A pennant on the parapet and an alarm lamp that flashes once the fort is breached.
    const pennant = buildPennant(0xc02020);
    pennant.root.position.set(t.radius * 0.6, t.h + 1.2, -t.radius * 0.6);
    g.add(pennant.root);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0x802020, emissive: 0xff2020, emissiveIntensity: 0 }));
    lamp.position.set(-t.radius * 0.6, t.h + 1.3, t.radius * 0.6);
    g.add(lamp);
    const lampLight = new THREE.PointLight(0xff3020, 0, 40, 2);
    lampLight.position.copy(lamp.position);
    g.add(lampLight);
    g.position.set(t.x, y, t.z);
    group.add(g);
    towers.push({ kind: 'tower', x: t.x, z: t.z, r: t.radius + 0.2, h: t.h, top: y + t.h + 0.6, base: y, turret: t.turret, group: g, pennant, lamp, lampLight });
  }

  // Explosive barrels.
  for (const b of spec.barrels || []) {
    const mesh = buildBarrel();
    const y = terrain.groundAt(b.x, b.z);
    mesh.position.set(b.x, y, b.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    group.add(mesh);
    const barrel = {
      kind: 'barrel', name: 'Barrel', mesh, pos: new THREE.Vector3(b.x, y + 0.7, b.z), radius: 0.9, hp: 10, maxHp: 10, alive: true, score: SCORE.barrel, stun: 0,
      takeDamage(amount, at, how) {
        if (!barrel.alive) return;
        barrel.hp -= amount;
        if (barrel.hp <= 0) explodeBarrel(barrel);
      }
    };
    barrels.push(barrel);
  }
  const pendingBlasts = [];
  function explodeBarrel(barrel) {
    barrel.alive = false;
    barrel.hp = 0;
    group.remove(barrel.mesh);
    fx.explosion(barrel.pos, { size: 9, ground: true });
    fx.burn(_p.set(barrel.pos.x, barrel.pos.y - 0.6, barrel.pos.z), { size: 2.5, duration: 20 });
    sounds?.explosion(0.9);
    // Splash is applied by the owner of the targets list on the next update so chains spread over frames.
    pendingBlasts.push({ pos: barrel.pos.clone(), radius: 9, damage: 45, delay: 0.12 });
    onEvent?.({ type: 'barrel', target: barrel, score: barrel.score });
  }

  // The flag.
  const flagSpec = spec.flag;
  const flag = buildFlag();
  const flagY = terrain.groundAt(flagSpec.x, flagSpec.z);
  flag.root.position.set(flagSpec.x, flagY, flagSpec.z);
  group.add(flag.root);
  const flagPos = new THREE.Vector3(flagSpec.x, flagY, flagSpec.z);

  // ------------------------------------------------------------ geometry
  function pointInWall(w, x, y, z, margin = 0) {
    if (!w.alive) return false;
    const dx = x - w.x, dz = z - w.z;
    if (dx * dx + dz * dz > (w.radius + margin) ** 2) return false;
    const lx = dx * w.cos + dz * w.sin;
    const lz = -dx * w.sin + dz * w.cos;
    if (Math.abs(lx) > w.len / 2 + margin || Math.abs(lz) > w.thick / 2 + margin) return false;
    if (y != null && (y < w.base || y > w.base + 0.6 + w.h)) return false;
    return true;
  }
  function solidAt(x, y, z, margin = 0) {
    for (const w of walls) if (pointInWall(w, x, y, z, margin)) return w;
    for (const t of towers) {
      if ((y == null || y < t.top) && Math.hypot(x - t.x, z - t.z) < t.r + margin) return t;
    }
    for (const sh of shields) {
      if (!sh.alive) continue;
      const dy = y == null ? 0 : y - sh.y;
      if (Math.hypot(x - sh.x, dy, z - sh.z) < sh.r + margin) return sh;
    }
    return null;
  }

  // Push a circle out of every solid. Returns true when it was moved.
  function resolveCircle(pos, radius) {
    let moved = false;
    for (const w of walls) {
      if (!w.alive) continue;
      const dx = pos.x - w.x, dz = pos.z - w.z;
      if (dx * dx + dz * dz > (w.radius + radius) ** 2) continue;
      const lx = dx * w.cos + dz * w.sin;
      const lz = -dx * w.sin + dz * w.cos;
      const cx = THREE.MathUtils.clamp(lx, -w.len / 2, w.len / 2);
      const cz = THREE.MathUtils.clamp(lz, -w.thick / 2, w.thick / 2);
      let nx = lx - cx, nz = lz - cz;
      let d = Math.hypot(nx, nz);
      if (d >= radius) continue;
      if (d < 1e-4) { // centre inside: push along the thin axis
        nx = 0; nz = lz >= 0 ? 1 : -1; d = 0;
      } else { nx /= d; nz /= d; }
      const push = radius - d;
      // Back to world.
      const wx = nx * w.cos - nz * w.sin;
      const wz = nx * w.sin + nz * w.cos;
      pos.x += wx * push;
      pos.z += wz * push;
      moved = true;
    }
    for (const t of towers) {
      const dx = pos.x - t.x, dz = pos.z - t.z;
      const d = Math.hypot(dx, dz);
      const min = t.r + radius;
      if (d < min && d > 1e-4) { pos.x = t.x + (dx / d) * min; pos.z = t.z + (dz / d) * min; moved = true; }
    }
    for (const o of obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 1e-4) { pos.x = o.x + (dx / d) * min; pos.z = o.z + (dz / d) * min; moved = true; }
    }
    for (const sh of shields) {
      if (!sh.alive) continue;
      const dx = pos.x - sh.x, dz = pos.z - sh.z;
      const d = Math.hypot(dx, dz);
      const min = sh.r + radius * 0.5;
      if (d < min && d > 1e-4) { pos.x = sh.x + (dx / d) * min; pos.z = sh.z + (dz / d) * min; moved = true; sh.touched?.(pos); }
    }
    return moved;
  }
  function addShield(sh) { shields.push(sh); }

  // First solid along a segment (sampled every metre). Returns { solid, point } or null.
  const _h = new THREE.Vector3();
  function hitSegment(a, b, out = { solid: null, point: new THREE.Vector3() }) {
    const len = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(len / 1.0));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      _h.lerpVectors(a, b, t);
      const s = solidAt(_h.x, _h.y, _h.z, 0.15);
      if (s) { out.solid = s; out.point.copy(_h); return out; }
    }
    return null;
  }

  // Line of sight between two points: not under the terrain and not through a wall.
  function lineClear(a, b, step = 3) {
    const len = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      _h.lerpVectors(a, b, t);
      if (terrain.groundAt(_h.x, _h.z) > _h.y + 0.3) return false;
      if (solidAt(_h.x, _h.y, _h.z, 0)) return false;
    }
    return true;
  }

  // Splash damage to walls and barrels.
  function splash(pos, radius, damage) {
    for (const w of walls) {
      if (!w.alive) continue;
      const d = Math.max(0, pos.distanceTo(w.pos) - w.hitRadius);
      if (d > radius) continue;
      w.takeDamage(damage * (d <= 0 ? 1 : 1 - d / radius) * 0.9, null, 'splash');
    }
    for (const b of barrels) {
      if (!b.alive) continue;
      const d = pos.distanceTo(b.pos) - b.radius;
      if (d <= radius) b.takeDamage(damage, b.pos, 'splash');
    }
  }

  function addObstacle(x, z, r) { obstacles.push({ x, z, r }); }
  // Rubble chunks that come to rest become small obstacles (capped so the yard stays drivable).
  let rubbleObstacles = 0;
  fx.onRubbleSettle?.((x, z, r) => { if (rubbleObstacles < 120 && !inside(x, z, -6)) { obstacles.push({ x, z, r: Math.min(r, 0.9) }); rubbleObstacles++; } });

  let alarm = 0;
  function setAlarm(seconds) { alarm = Math.max(alarm, seconds); }

  const SMOKE_GREY = new THREE.Color(0x8a8580);
  function update(dt, t) {
    flag.update(t);
    for (const tw of towers) {
      tw.pennant.update(t);
      if (alarm > 0) {
        const on = Math.sin(t * 8) > 0;
        tw.lamp.material.emissiveIntensity = on ? 3 : 0.2;
        tw.lampLight.intensity = on ? 30 : 0;
      } else if (tw.lampLight.intensity > 0) { tw.lampLight.intensity = 0; tw.lamp.material.emissiveIntensity = 0; }
    }
    if (alarm > 0) alarm -= dt;
    // Chimney smoke from the huts still standing.
    for (const w of walls) {
      if (!w.hut || !w.alive) continue;
      w.smokeAcc += dt;
      if (w.smokeAcc > 0.35) {
        w.smokeAcc = 0;
        fx.pools.smoke.emit({ x: w.chimney.x, y: w.chimney.y, z: w.chimney.z, vx: 0.6 + (Math.random() - 0.5) * 0.4, vy: 1.2, vz: (Math.random() - 0.5) * 0.4, life: 3.5, size: 0.5, sizeEnd: 3.2, color: SMOKE_GREY, colorEnd: SMOKE_GREY, alpha: 0.28, fadeIn: 0.1 });
      }
    }
    for (let i = pendingBlasts.length - 1; i >= 0; i--) {
      pendingBlasts[i].delay -= dt;
      if (pendingBlasts[i].delay <= 0) { const b = pendingBlasts.splice(i, 1)[0]; onEvent?.({ type: 'blast', pos: b.pos, radius: b.radius, damage: b.damage }); }
    }
  }

  const aliveWalls = () => walls.filter((w) => w.alive && w.hp !== Infinity).length;

  return {
    group, walls, towers, barrels, obstacles, shields, flag, flagPos, spec,
    pointInWall, solidAt, resolveCircle, hitSegment, lineClear, splash, addObstacle, addShield, update, aliveWalls, inside, setAlarm,
    get breached() { return breached; }
  };
}
