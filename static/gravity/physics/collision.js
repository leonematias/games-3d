/**
 * Discrete sphere overlaps at the end of a completed tick.
 * A connected component merges in one step, so the result does not depend on pair order.
 * Overlaps faster than one step can pass through without merging. That is a first-version limit.
 */

export function resolveMerges(store) {
  const n = store.count;
  if (n < 2) return [];
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (a) => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== root) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  };

  const pos = store.pos;
  const rad = store.radius;
  for (let i = 0; i < n; i++) {
    const ix = i * 3;
    const ri = rad[i];
    for (let j = i + 1; j < n; j++) {
      const reach = ri + rad[j];
      const jx = j * 3;
      const dx = pos[jx] - pos[ix];
      const dy = pos[jx + 1] - pos[ix + 1];
      const dz = pos[jx + 2] - pos[ix + 2];
      if (dx * dx + dy * dy + dz * dz < reach * reach) {
        const pa = find(i);
        const pb = find(j);
        if (pa !== pb) parent[pb] = pa;
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let members = groups.get(root);
    if (!members) groups.set(root, members = []);
    members.push(i);
  }

  const merges = [];
  const remove = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let survivor = members[0];
    let survivorId = store.ids[survivor];
    for (const index of members) {
      const id = store.ids[index];
      if (id < survivorId) {
        survivor = index;
        survivorId = id;
      }
    }

    let mass = 0;
    let volume = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    const removedIds = [];
    for (const index of members) {
      const m = store.mass[index];
      const k = index * 3;
      mass += m;
      volume += store.radius[index] ** 3;
      px += m * pos[k];
      py += m * pos[k + 1];
      pz += m * pos[k + 2];
      mx += m * store.vel[k];
      my += m * store.vel[k + 1];
      mz += m * store.vel[k + 2];
      cr += m * store.color[k];
      cg += m * store.color[k + 1];
      cb += m * store.color[k + 2];
      if (index !== survivor) removedIds.push(store.ids[index]);
    }

    const sk = survivor * 3;
    store.mass[survivor] = mass;
    store.radius[survivor] = Math.cbrt(volume);
    store.pos[sk] = px / mass;
    store.pos[sk + 1] = py / mass;
    store.pos[sk + 2] = pz / mass;
    store.vel[sk] = mx / mass;
    store.vel[sk + 1] = my / mass;
    store.vel[sk + 2] = mz / mass;
    store.color[sk] = cr / mass;
    store.color[sk + 1] = cg / mass;
    store.color[sk + 2] = cb / mass;
    store.absorb(survivorId, removedIds);
    for (const index of members) {
      if (index !== survivor) remove.push(index);
    }
    merges.push({ survivorId, removedIds, mass });
  }

  remove.sort((a, b) => b - a);
  for (const index of remove) store.removeAt(index);
  return merges;
}
