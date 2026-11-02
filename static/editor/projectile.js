import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { PROJECTILE_SPEED } from '../game/config.js';

function makeProjectileMesh(hostile) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.38, 14),
    new THREE.MeshStandardMaterial({
      color: hostile ? 0xfecaca : 0xf5f5f4,
      emissive: hostile ? 0x7f1d1d : 0x4b5563,
      roughness: 0.28,
      metalness: 0.8
    })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function makeExplosion(position) {
  const group = new THREE.Group();
  const particles = [];
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.34, 3),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xfb923c : 0xfde047, emissive: 0x6b210a, roughness: 0.45 })
    );
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.castShadow = true;
    group.add(mesh);
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4.4,
      Math.random() * 2.5 + 0.8,
      (Math.random() - 0.5) * 4.4
    );
    particles.push({ mesh, velocity });
  }
  return { group, particles, age: 0, duration: 1.1 };
}

function boundsForCellItem(item, level) {
  const tileSize = level.tileSize;
  const tileX = Number.isFinite(item.worldX) ? Math.floor(item.worldX / tileSize) : item.x;
  const tileZ = Number.isFinite(item.worldZ) ? Math.floor(item.worldZ / tileSize) : item.z;
  const tile = level.tiles[tileZ]?.[tileX];
  if (!tile) return null;
  const floorY = Math.max(0, tile.floor || 0) * level.heightStep;
  const half = tileSize / 2;
  const center = new THREE.Vector3(
    Number.isFinite(item.worldX) ? item.worldX : item.x * tileSize + half,
    floorY + level.heightStep / 2,
    Number.isFinite(item.worldZ) ? item.worldZ : item.z * tileSize + half
  );
  return new THREE.Box3(
    new THREE.Vector3(center.x - half, center.y - level.heightStep / 2, center.z - half),
    new THREE.Vector3(center.x + half, center.y + level.heightStep / 2, center.z + half)
  );
}

function hitsWall(position, level) {
  const tileX = Math.floor(position.x / level.tileSize);
  const tileZ = Math.floor(position.z / level.tileSize);
  if (tileX < 0 || tileZ < 0 || tileX >= level.size.width || tileZ >= level.size.depth) return true;
  const tile = level.tiles[tileZ]?.[tileX];
  if (!tile) return true;
  return Math.max(0, tile.floor || 0) > 0;
}

function hitsPlayer(position, playerPosition, playerRadius) {
  if (!playerPosition) return false;
  const dx = position.x - playerPosition.x;
  const dz = position.z - playerPosition.z;
  const horizontal = Math.hypot(dx, dz);
  const y = position.y;
  return horizontal < playerRadius + 0.08 && y >= playerPosition.y && y <= playerPosition.y + 0.7;
}

export function createProjectileSystem(scene) {
  const projectiles = [];
  const explosions = [];

  function spawnProjectile(kind, ownerId, origin, direction, hostile, damage = 1) {
    const mesh = makeProjectileMesh(hostile);
    mesh.position.copy(origin);
    // Heavier shells (an upgraded cannon) are drawn a little bigger.
    if (damage > 1) mesh.scale.setScalar(1 + 0.22 * (damage - 1));
    scene.add(mesh);
    projectiles.push({
      kind,
      ownerId,
      mesh,
      damage,
      position: origin.clone(),
      direction: direction.clone().normalize()
    });
  }

  function tryFire(origin, direction, damage = 1) {
    if (projectiles.some((shot) => shot.kind === 'player')) return false;
    spawnProjectile('player', 'player', origin, direction, false, damage);
    return true;
  }

  function tryFireVolley(origin, directions, damage = 1) {
    if (!directions.length) return false;
    for (const direction of directions) {
      spawnProjectile('player', 'player', origin, direction, false, damage);
    }
    return true;
  }

  function tryFireHostile(ownerId, origin, direction) {
    if (projectiles.some((shot) => shot.ownerId === ownerId)) return false;
    spawnProjectile('turret', ownerId, origin, direction, true);
    return true;
  }

  function tryFireHostileVolley(ownerId, origin, directions) {
    if (!directions.length) return false;
    for (const direction of directions) {
      spawnProjectile('turret', ownerId, origin, direction, true);
    }
    return true;
  }

  function clearProjectile(shot) {
    scene.remove(shot.mesh);
    shot.mesh.geometry.dispose();
    shot.mesh.material.dispose();
    const index = projectiles.indexOf(shot);
    if (index >= 0) projectiles.splice(index, 1);
  }

  let explosionHook = null;

  function spawnExplosion(position) {
    const explosion = makeExplosion(position);
    explosions.push(explosion);
    scene.add(explosion.group);
    explosionHook?.(position);
  }

  function burstAt(position, scale = 1) {
    const explosion = makeExplosion(position);
    if (scale !== 1) {
      for (const particle of explosion.particles) {
        particle.mesh.scale.setScalar(scale);
        particle.velocity.multiplyScalar(scale);
      }
    }
    explosions.push(explosion);
    scene.add(explosion.group);
  }

  function hitsItem(item, position, level) {
    if (Number.isFinite(item?.hitRadius)) {
      const dx = position.x - item.hitX;
      const dy = position.y - (Number.isFinite(item.hitY) ? item.hitY : position.y);
      const dz = position.z - item.hitZ;
      return dx * dx + dy * dy + dz * dz <= item.hitRadius * item.hitRadius;
    }
    const bounds = boundsForCellItem(item, level);
    return Boolean(bounds && bounds.containsPoint(position));
  }

  function firstHit(items, position, level) {
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      if (hitsItem(item, position, level)) return item;
    }
    return null;
  }

  function update(delta, level, handlers = {}) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const shot = projectiles[i];
      shot.position.addScaledVector(shot.direction, PROJECTILE_SPEED * delta);
      shot.mesh.position.copy(shot.position);
      shot.mesh.lookAt(shot.position.clone().add(shot.direction));
      shot.mesh.rotateX(Math.PI / 2);

      if (shot.kind === 'player') {
        const laser = firstHit(handlers.lasers, shot.position, level);
        if (laser) {
          const hitPoint = shot.position.clone();
          clearProjectile(shot);
          spawnExplosion(hitPoint);
          handlers.onLaserHit?.(laser);
          continue;
        }
      }

      if (hitsWall(shot.position, level)) {
        clearProjectile(shot);
        continue;
      }

      const gate = firstHit(handlers.gates, shot.position, level);
      if (gate) {
        const hitPoint = shot.position.clone();
        clearProjectile(shot);
        spawnExplosion(hitPoint);
        continue;
      }

      const breakable = firstHit(handlers.breakables, shot.position, level);
      if (breakable) {
        const hitPoint = shot.position.clone();
        clearProjectile(shot);
        spawnExplosion(hitPoint);
        if (shot.kind === 'player') handlers.onBreakableHit?.(breakable);
        continue;
      }

      if (shot.kind === 'player') {
        const turret = firstHit(handlers.turrets, shot.position, level);
        if (turret) {
          const hitPoint = shot.position.clone();
          clearProjectile(shot);
          spawnExplosion(hitPoint);
          handlers.onTurretHit?.(turret, shot.damage || 1);
          continue;
        }
      } else {
        const blockedByTurret = firstHit(handlers.turrets, shot.position, level);
        if (blockedByTurret) {
          const hitPoint = shot.position.clone();
          clearProjectile(shot);
          spawnExplosion(hitPoint);
          continue;
        }
        if (hitsPlayer(shot.position, handlers.playerPosition, handlers.playerRadius || 0.42)) {
          if (handlers.reflectShot?.(shot.ownerId)) {
            // The shield bubble bounces the shell back as a player shot.
            shot.kind = 'player';
            shot.ownerId = 'player';
            shot.direction.negate();
            shot.position.addScaledVector(shot.direction, 0.6);
            shot.mesh.material.color.setHex(0xbae6fd);
            shot.mesh.material.emissive.setHex(0x0369a1);
            continue;
          }
          const hitPoint = shot.position.clone();
          clearProjectile(shot);
          spawnExplosion(hitPoint);
          handlers.onPlayerHit?.(shot.ownerId);
        }
      }
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
      const explosion = explosions[i];
      explosion.age += delta;
      for (const particle of explosion.particles) {
        particle.mesh.position.addScaledVector(particle.velocity, delta);
        particle.velocity.y -= 3.4 * delta;
        particle.mesh.material.opacity = Math.max(0, 1 - explosion.age / explosion.duration);
        particle.mesh.material.transparent = true;
      }
      if (explosion.age >= explosion.duration) {
        scene.remove(explosion.group);
        explosion.group.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.geometry.dispose();
          obj.material.dispose();
        });
        explosions.splice(i, 1);
      }
    }
  }

  return {
    tryFire,
    tryFireVolley,
    tryFireHostile,
    tryFireHostileVolley,
    burstAt,
    update,
    onExplosion: (fn) => { explosionHook = fn; },
    hasActiveProjectile: () => projectiles.some((shot) => shot.kind === 'player'),
    clearProjectile: () => {
      for (const shot of [...projectiles]) clearProjectile(shot);
    },
    clearHostileWithin: (origin, radius) => {
      let count = 0;
      for (const shot of [...projectiles]) {
        if (shot.kind === 'player') continue;
        if (Math.hypot(shot.position.x - origin.x, shot.position.z - origin.z) > radius) continue;
        const hitPoint = shot.position.clone();
        clearProjectile(shot);
        spawnExplosion(hitPoint);
        count += 1;
      }
      return count;
    }
  };
}
