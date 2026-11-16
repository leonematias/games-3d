// Terrain-aware ground routes, shared by site placement and pilot movement.
// Plain objects keep this testable without a renderer.
export function createRecoveryNavigation(terrain, obstacles = []) {
  const limit = terrain.half * 0.96;
  function clear(x, z, margin = 0.8) {
    return Math.abs(x) < limit && Math.abs(z) < limit && !terrain.isWater(x, z)
      && !obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.radius + margin);
  }
  function canWalk(a, b) {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(distance / 1.5));
    let last = terrain.groundAt(a.x, a.z);
    for (let i = 1; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      if (!clear(x, z)) return false;
      const height = terrain.groundAt(x, z);
      if (Math.abs(height - last) > distance / steps * 0.7 + 0.04) return false;
      last = height;
    }
    return true;
  }
  function parkingHeight(x, z) {
    let lo = Infinity, hi = -Infinity;
    for (const dx of [-7, 0, 7]) for (const dz of [-11, 0, 11]) {
      if (!clear(x + dx, z + dz, 4)) return null;
      const h = terrain.groundAt(x + dx, z + dz);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return hi - lo <= 2.2 ? hi : null;
  }
  function findSite(origin) {
    if (!clear(origin.x, origin.z)) return null;
    const step = 10, queue = [{ x: origin.x, z: origin.z, i: 0, j: 0, length: 0, parent: null }];
    const seen = new Set(['0,0']);
    let best = null, bestScore = Infinity;
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      if (node.length >= 100) {
        const height = parkingHeight(node.x, node.z);
        const score = Math.abs(node.length - 180);
        if (height !== null && score < bestScore) { best = { node, height }; bestScore = score; }
        if (bestScore === 0) break;
      }
      if (node.length >= 260) continue;
      for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const i = node.i + di, j = node.j + dj, key = `${i},${j}`;
        if (seen.has(key)) continue;
        const next = { x: origin.x + i * step, z: origin.z + j * step, i, j, length: node.length + step, parent: node };
        if (!canWalk(node, next)) continue;
        seen.add(key); queue.push(next);
      }
    }
    if (!best) return null;
    const route = [];
    for (let node = best.node; node; node = node.parent) route.unshift({ x: node.x, y: terrain.groundAt(node.x, node.z), z: node.z });
    return { x: best.node.x, y: best.height, z: best.node.z, route, length: best.node.length };
  }
  function routeTo(origin, target) {
    // Reuse a visible airborne landing suggestion only if the ground route
    // is safe. Otherwise choose a new reachable field after touchdown.
    if (Math.hypot(origin.x - target.x, origin.z - target.z) > 300 || !canWalk(origin, target)) return null;
    const steps = Math.max(1, Math.ceil(Math.hypot(origin.x - target.x, origin.z - target.z) / 10));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const x = origin.x + (target.x - origin.x) * i / steps;
      const z = origin.z + (target.z - origin.z) * i / steps;
      return { x, y: terrain.groundAt(x, z), z };
    });
  }
  return { clear, canWalk, findSite, routeTo, parkingHeight };
}
