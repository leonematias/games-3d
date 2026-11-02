import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { planarForward, yawToward } from './facing.js';
import { TANK_AIM_Y } from './main_character.js';
import {
  BOSS_ENRAGED_MOVE_SPEED,
  BOSS_ENRAGED_REFIRE_SECONDS,
  BOSS_ENRAGED_WINDUP_SECONDS,
  BOSS_FIRE_ANGLE,
  BOSS_HOLD_DISTANCE_CELLS,
  BOSS_MAX_HP,
  BOSS_MEMORY_SECONDS,
  BOSS_MOVE_SPEED,
  BOSS_RANGE_CELLS,
  BOSS_REFIRE_SECONDS,
  BOSS_RING_SHOTS,
  BOSS_RING_WINDUP_SECONDS,
  BOSS_TURN_SPEED,
  BOSS_VOLLEY_COUNT,
  BOSS_WINDUP_SECONDS,
  TURRET_HALF_ANGLE
} from './config.js';
import { bossCells, bossCenter, bossCovers, bossIsEnraged, bossSpreadAngles, inBossRange, stepBossYaw, wrapAngle } from './boss-logic.js';
import { circleHitsCell } from './drone-logic.js';
import { lineOfSightClear } from './turret-logic.js';
import { makeHealthBar, paintHealth } from './turrets.js';

const MUZZLE_Y = 0.74;
const MUZZLE_Z = 1.55;

function makeBossBody() {
  const body = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.55, metalness: 0.35 });
  const trackMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.84, metalness: 0.2 });
  const turretMaterial = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.42, metalness: 0.4 });
  const barrelMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb,
    emissive: 0xfbbf24,
    emissiveIntensity: 0,
    roughness: 0.28,
    metalness: 0.72
  });

  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 1.9), trackMaterial);
    track.position.set(side * 0.78, 0.16, 0);
    track.castShadow = true;
    body.add(track);
  }

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.38, 1.7), hullMaterial);
  hull.position.y = 0.42;
  hull.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.95), turretMaterial);
  head.position.set(0, 0.72, -0.04);
  head.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.15, 14), barrelMaterial);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, MUZZLE_Y, 0.82);
  barrel.castShadow = true;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, MUZZLE_Y, MUZZLE_Z);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.95, depthWrite: false })
  );
  flash.position.set(0, MUZZLE_Y, MUZZLE_Z);
  flash.visible = false;
  body.add(hull, head, barrel, muzzle, flash);
  return { body, muzzle, barrel, flash, hull };
}

// Ground ring that grows under an enraged boss while it charges the all-around burst.
function makeTelegraph() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  return ring;
}

export function createBossMesh(item, level) {
  const tileSize = level.tileSize || 1;
  const heightStep = level.heightStep || 1;
  const tile = level.tiles?.[item.z]?.[item.x];
  const floorY = Math.max(0, tile?.floor || 0) * heightStep;
  const center = bossCenter(item.x, item.z, tileSize);
  const root = new THREE.Group();
  root.position.set(center.x, floorY, center.z);
  const { body, muzzle, barrel, flash, hull } = makeBossBody();
  root.add(body);
  const telegraph = makeTelegraph();
  root.add(telegraph);
  const health = makeHealthBar(1.7, 0.22);
  health.group.position.y = 1.38;
  root.add(health.group);
  return { root, body, muzzle, barrel, flash, hull, telegraph, fill: health.fill, bar: health.group };
}

export function createBossController(scene, level, hooks = {}) {
  const items = Array.isArray(level.bosses) ? level.bosses : [];
  const group = new THREE.Group();
  const bosses = [];
  const barAnchor = new THREE.Vector3();
  const muzzlePoint = new THREE.Vector3();
  let elapsed = 0;

  for (const item of items) {
    if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
    const cells = bossCells(item.x, item.z);
    const blocked = cells.some((cell) => {
      const tile = level.tiles?.[cell.z]?.[cell.x];
      return !tile || (tile.floor || 0) > 0;
    });
    if (blocked) continue;
    const mesh = createBossMesh(item, level);
    const yaw = ((item.x * 0.73 + item.z * 1.17) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    mesh.body.rotation.y = yaw;
    paintHealth(mesh.fill, BOSS_MAX_HP, BOSS_MAX_HP);
    group.add(mesh.root);
    bosses.push({
      item,
      origin: { x: item.x, z: item.z },
      x: item.x,
      z: item.z,
      from: null, // previous footprint origin while gliding to (x, z)
      moveT: 0,
      moveDuration: 1,
      mobile: item.static !== true,
      lastSeen: null,
      hp: BOSS_MAX_HP,
      yaw,
      cooldown: 0.35,
      windup: 0,
      windupTotal: 0,
      attack: 'volley',
      enraged: false,
      drop: item.drop,
      ...mesh
    });
  }
  scene.add(group);

  function living() {
    return bosses.filter((boss) => boss.hp > 0);
  }

  // The cells a boss occupies right now: its footprint plus the one it is leaving mid-step.
  function bossOccupies(boss, tileX, tileZ) {
    if (bossCovers(boss.x, boss.z, tileX, tileZ)) return true;
    return Boolean(boss.from) && bossCovers(boss.from.x, boss.from.z, tileX, tileZ);
  }

  function covers(tileX, tileZ) {
    return living().some((boss) => bossOccupies(boss, tileX, tileZ));
  }

  function getTargets() {
    const cells = [];
    for (const boss of living()) {
      cells.push(...bossCells(boss.x, boss.z));
      if (boss.from) {
        for (const cell of bossCells(boss.from.x, boss.from.z)) {
          if (!bossCovers(boss.x, boss.z, cell.x, cell.z)) cells.push(cell);
        }
      }
    }
    return cells;
  }

  function applyHit(target, damage = 1) {
    const boss = living().find((entry) => bossOccupies(entry, target.x, target.z));
    if (!boss) return false;
    boss.hp = Math.max(0, boss.hp - damage);
    paintHealth(boss.fill, boss.hp, BOSS_MAX_HP);
    hooks.onHit?.(boss);
    if (boss.hp > 0) {
      if (!boss.enraged && bossIsEnraged(boss.hp, BOSS_MAX_HP)) {
        boss.enraged = true;
        boss.hull.material.emissive = new THREE.Color(0xf97316);
        boss.hull.material.emissiveIntensity = 0.55;
        boss.flash.material.color.setHex(0xfb923c);
        hooks.onEnrage?.(boss);
      }
      return false;
    }
    group.remove(boss.root);
    const materials = new Set();
    boss.root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      if (obj.material && !obj.material.map) materials.add(obj.material);
    });
    for (const material of materials) material.dispose();
    level.bosses = (level.bosses || []).filter((item) => item !== boss.item);
    hooks.onDeath?.(boss);
    return true;
  }

  // Can the 2x2 footprint stand at (originX, originZ)? Cells it already occupies are fine; the
  // rest must be open floor at the same height, free of other actors and clear of the tank.
  function footprintFree(boss, originX, originZ, context) {
    const tileSize = context.tileSize || 1;
    const floorHere = level.tiles?.[boss.z]?.[boss.x]?.floor || 0;
    const player = context.playerPosition;
    for (const cell of bossCells(originX, originZ)) {
      if (bossOccupies(boss, cell.x, cell.z)) continue;
      const tile = level.tiles?.[cell.z]?.[cell.x];
      if (!tile || (tile.floor || 0) !== floorHere) return false;
      if (context.isTileBlocked?.(cell.x, cell.z)) return false;
      if (living().some((other) => other !== boss && bossOccupies(other, cell.x, cell.z))) return false;
      if (player && circleHitsCell(player.x, player.z, (context.playerRadius || 0.42) + 0.15, cell.x, cell.z, tileSize)) return false;
    }
    return true;
  }

  // One cell toward the target along the dominant axis, falling back to the other axis.
  function beginStep(boss, target, context) {
    const tileSize = context.tileSize || 1;
    const center = bossCenter(boss.x, boss.z, tileSize);
    const dx = target.x - center.x;
    const dz = target.z - center.z;
    const options = Math.abs(dx) >= Math.abs(dz)
      ? [[Math.sign(dx), 0], [0, Math.sign(dz)]]
      : [[0, Math.sign(dz)], [Math.sign(dx), 0]];
    for (const [stepX, stepZ] of options) {
      if (stepX === 0 && stepZ === 0) continue;
      const nextX = boss.x + stepX;
      const nextZ = boss.z + stepZ;
      if (!footprintFree(boss, nextX, nextZ, context)) continue;
      boss.from = { x: boss.x, z: boss.z };
      boss.x = nextX;
      boss.z = nextZ;
      boss.item.x = nextX;
      boss.item.z = nextZ;
      boss.moveT = 0;
      boss.moveDuration = tileSize / (boss.enraged ? BOSS_ENRAGED_MOVE_SPEED : BOSS_MOVE_SPEED);
      return true;
    }
    return false;
  }

  function advanceStep(boss, delta, tileSize) {
    if (!boss.from) return;
    boss.moveT = Math.min(1, boss.moveT + delta / boss.moveDuration);
    const start = bossCenter(boss.from.x, boss.from.z, tileSize);
    const end = bossCenter(boss.x, boss.z, tileSize);
    const u = boss.moveT;
    boss.root.position.x = start.x + (end.x - start.x) * u;
    boss.root.position.z = start.z + (end.z - start.z) * u;
    if (boss.moveT >= 1) boss.from = null;
  }

  function fireVolley(boss, context) {
    const player = context.playerPosition;
    if (!player || !context.tryFireVolley) return false;
    boss.muzzle.updateWorldMatrix(true, false);
    boss.muzzle.getWorldPosition(muzzlePoint);
    muzzlePoint.y = player.y + TANK_AIM_Y;
    const directions = bossSpreadAngles(BOSS_VOLLEY_COUNT, TURRET_HALF_ANGLE).map((offset) => {
      const forward = planarForward(boss.yaw + offset);
      return new THREE.Vector3(forward.x, 0, forward.z);
    });
    return context.tryFireVolley(`boss:${boss.x},${boss.z}`, muzzlePoint, directions);
  }

  // Phase two: a full ring of shots from the hull centre, telegraphed on the ground first.
  function fireRing(boss, context) {
    const player = context.playerPosition;
    if (!player || !context.tryFireVolley) return false;
    const origin = boss.root.position.clone();
    origin.y = player.y + TANK_AIM_Y;
    const directions = [];
    for (let index = 0; index < BOSS_RING_SHOTS; index++) {
      const forward = planarForward(boss.yaw + (index / BOSS_RING_SHOTS) * Math.PI * 2);
      directions.push(new THREE.Vector3(forward.x, 0, forward.z));
    }
    return context.tryFireVolley(`boss:${boss.x},${boss.z}:ring`, origin, directions);
  }

  function update(delta, context) {
    elapsed += delta;
    const tileSize = context.tileSize || 1;
    const player = context.playerPosition;
    const range = BOSS_RANGE_CELLS * tileSize;
    for (const boss of living()) {
      boss.cooldown = Math.max(0, boss.cooldown - delta);
      const center = boss.root.position;
      boss.bar.getWorldPosition(barAnchor);
      const camX = context.camera.position.x - barAnchor.x;
      const camZ = context.camera.position.z - barAnchor.z;
      boss.bar.rotation.y = Math.atan2(camX, camZ);
      if (context.stunned?.(center.x, center.z)) {
        boss.flash.visible = false;
        boss.telegraph.visible = false;
        boss.windup = 0;
        boss.body.rotation.y = boss.yaw + Math.sin(elapsed * 30) * 0.03;
        continue;
      }
      advanceStep(boss, delta, tileSize);
      if (boss.lastSeen) {
        boss.lastSeen.age += delta;
        if (boss.lastSeen.age > BOSS_MEMORY_SECONDS) boss.lastSeen = null;
      }

      if (boss.windup > 0) {
        boss.windup = Math.max(0, boss.windup - delta);
        const charge = 1 - boss.windup / Math.max(0.01, boss.windupTotal);
        boss.flash.visible = true;
        boss.flash.scale.setScalar(0.55 + (Math.sin(elapsed * 34) + 1) * 0.4);
        boss.barrel.material.emissiveIntensity = 1.6;
        boss.body.rotation.y = boss.yaw;
        if (boss.attack === 'ring') {
          boss.telegraph.visible = true;
          const radius = 0.6 + charge * 2.4;
          boss.telegraph.scale.set(radius, radius, radius);
          boss.telegraph.material.opacity = 0.25 + charge * 0.6;
          boss.hull.material.emissiveIntensity = 0.55 + charge * 1.2;
        }
        if (boss.windup > 0) continue;
        boss.flash.visible = false;
        boss.telegraph.visible = false;
        boss.hull.material.emissiveIntensity = boss.enraged ? 0.55 : 0;
        boss.barrel.material.emissiveIntensity = boss.enraged ? 0.35 : 0;
        const fired = boss.attack === 'ring' ? fireRing(boss, context) : fireVolley(boss, context);
        if (fired) {
          boss.cooldown = boss.enraged ? BOSS_ENRAGED_REFIRE_SECONDS * 2.2 : BOSS_REFIRE_SECONDS;
          if (boss.enraged) boss.attack = boss.attack === 'ring' ? 'volley' : 'ring';
        }
        continue;
      }

      boss.flash.visible = false;
      boss.telegraph.visible = false;
      boss.barrel.material.emissiveIntensity = boss.enraged ? 0.35 : 0;
      let targetYaw = null;
      if (context.alive && player) {
        const dx = player.x - center.x;
        const dz = player.z - center.z;
        const seen = inBossRange(center.x, center.z, player.x, player.z, range + (context.playerRadius || 0));
        const clear = seen && lineOfSightClear(
          center.x,
          center.z,
          player.x,
          player.z,
          tileSize,
          (tileX, tileZ) => bossOccupies(boss, tileX, tileZ) ? false : context.isOccluder(tileX, tileZ)
        );
        if (clear && (dx !== 0 || dz !== 0)) targetYaw = yawToward(dx, dz);
        if (clear) boss.lastSeen = { x: player.x, z: player.z, age: 0 };
      }

      // Advance on the tank's last seen position until close enough to hold and shoot.
      if (boss.mobile && !boss.from && boss.lastSeen) {
        const hold = BOSS_HOLD_DISTANCE_CELLS * tileSize;
        if (Math.hypot(boss.lastSeen.x - center.x, boss.lastSeen.z - center.z) > hold) beginStep(boss, boss.lastSeen, context);
      }
      if (targetYaw == null && boss.from) {
        targetYaw = yawToward(boss.x - boss.from.x, boss.z - boss.from.z);
      }
      boss.yaw = stepBossYaw(boss.yaw, targetYaw, BOSS_TURN_SPEED, delta);
      boss.body.rotation.y = boss.yaw;
      if (targetYaw == null || boss.cooldown > 0) continue;
      if (boss.attack !== 'ring' && Math.abs(wrapAngle(targetYaw - boss.yaw)) > BOSS_FIRE_ANGLE) continue;
      boss.windup = boss.attack === 'ring' ? BOSS_RING_WINDUP_SECONDS : boss.enraged ? BOSS_ENRAGED_WINDUP_SECONDS : BOSS_WINDUP_SECONDS;
      boss.windupTotal = boss.windup;
    }
  }

  return { group, update, applyHit, getTargets, covers, living };
}

// Exposed for frontend/meshviewer/bake-sources.js, which bakes these into library models.
export { makeBossBody };
