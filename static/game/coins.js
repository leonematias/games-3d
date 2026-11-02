import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { DROP_VALUES, reservedDropValue } from './drop-logic.js';

const SMALL_COIN_VALUE = 1;
const BIG_COIN_VALUE = 10;
const SMALL_COIN_RADIUS = 0.14;
const BIG_COIN_RADIUS = 0.28;
const SMALL_COIN_LIFT = 0.42;
const BIG_COIN_LIFT = 0.56;

function tileKey(x, z) {
  return `${x},${z}`;
}

export function createCoinsController(level, tileSize, heightStep) {
  const group = new THREE.Group();
  const coins = new Map();
  let collectedValue = 0;
  let totalValue = 0;
  let elapsed = 0;

  function addCoins(list, value, countTowardTotal = true) {
    const radius = value === BIG_COIN_VALUE ? BIG_COIN_RADIUS : SMALL_COIN_RADIUS;
    const lift = value === BIG_COIN_VALUE ? BIG_COIN_LIFT : SMALL_COIN_LIFT;
    for (const item of list) {
      if (!Number.isInteger(item?.x) || !Number.isInteger(item?.z)) continue;
      const key = tileKey(item.x, item.z);
      if (coins.has(key)) continue;
      const tile = level.tiles[item.z]?.[item.x];
      if (!tile) continue;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x5f4304, roughness: 0.35 })
      );
      mesh.castShadow = true;
      mesh.userData.baseY = Math.max(0, tile.floor || 0) * heightStep + lift;
      mesh.position.set(item.x * tileSize + tileSize / 2, mesh.userData.baseY, item.z * tileSize + tileSize / 2);
      group.add(mesh);
      coins.set(key, { x: item.x, z: item.z, mesh, value });
      if (countTowardTotal) totalValue += value;
    }
  }

  addCoins(Array.isArray(level.coins) ? level.coins : [], SMALL_COIN_VALUE);
  addCoins(Array.isArray(level.bigCoins) ? level.bigCoins : [], BIG_COIN_VALUE);
  totalValue += reservedDropValue(level);

  function spawnDrop(x, z, kind) {
    const value = DROP_VALUES[kind];
    if (!value) return false;
    const key = tileKey(x, z);
    if (coins.has(key)) return false;
    const tile = level.tiles[z]?.[x];
    if (!tile || (tile.floor || 0) > 0) return false;
    addCoins([{ x, z }], value, false);
    return coins.has(key);
  }

  function disposeCoin(coin) {
    group.remove(coin.mesh);
    if (coin.mesh.geometry) coin.mesh.geometry.dispose();
    if (coin.mesh.material) coin.mesh.material.dispose();
  }

  function update(delta) {
    elapsed += delta;
    for (const [key, coin] of coins.entries()) {
      if (!coin.mesh.parent) {
        coins.delete(key);
        continue;
      }
      coin.mesh.position.y = coin.mesh.userData.baseY + Math.sin(elapsed * 3 + coin.x + coin.z) * 0.08;
    }
  }

  function collectAtPosition(position) {
    const x = Math.floor(position.x / tileSize);
    const z = Math.floor(position.z / tileSize);
    const key = tileKey(x, z);
    const coin = coins.get(key);
    if (!coin) return { collected: false, count: collectedValue, total: totalValue, won: false };
    disposeCoin(coin);
    coins.delete(key);
    collectedValue += coin.value;
    return {
      collected: true,
      count: collectedValue,
      total: totalValue,
      won: totalValue > 0 && collectedValue === totalValue
    };
  }

  function removeTile(x, z) {
    const key = tileKey(x, z);
    const coin = coins.get(key);
    if (!coin) return;
    disposeCoin(coin);
    coins.delete(key);
  }

  return {
    group,
    update,
    collectAtPosition,
    spawnDrop,
    removeTile,
    getRemaining: () => [...coins.values()].map((coin) => ({ x: coin.x, z: coin.z, value: coin.value })),
    getCollectedCount: () => collectedValue,
    getTotalCount: () => totalValue
  };
}
