/** Periodic full checkpoints. Rewind reconstructs forward from the nearest earlier checkpoint. */

import { HISTORY_BUDGET_BYTES } from './constants.js';
import { cloneLineage } from './body-store.js';

export function measureCheckpoint(snapshot) {
  const n = snapshot.count;
  let lineage = 0;
  const pairs = snapshot.lineage instanceof Map ? [...snapshot.lineage.values()] : (snapshot.lineage || []).map((pair) => pair[1]);
  for (const ids of pairs) lineage += 16 + ids.length * 4;
  // ids i32, pos f64*3, vel f64*3, mass f64, radius f64, color f32*3, cluster i32, plus a fixed header.
  return n * (4 + 24 + 24 + 8 + 8 + 12 + 4) + lineage + 128;
}

export class HistoryStore {
  constructor(budget = HISTORY_BUDGET_BYTES) {
    this.budget = budget;
    this.checkpoints = [];
    this.bytes = 0;
    this.head = 0;
    this.oldest = 0;
  }

  clear() {
    this.checkpoints.length = 0;
    this.bytes = 0;
    this.head = 0;
    this.oldest = 0;
  }

  put(snapshot) {
    const cp = {
      tick: snapshot.tick,
      nextId: snapshot.nextId,
      count: snapshot.count,
      ids: snapshot.ids,
      pos: snapshot.pos,
      vel: snapshot.vel,
      mass: snapshot.mass,
      radius: snapshot.radius,
      color: snapshot.color,
      cluster: snapshot.cluster,
      lineage: cloneLineage(snapshot.lineage),
    };
    cp.bytes = measureCheckpoint(cp);
    const index = this._lower(cp.tick);
    if (index < this.checkpoints.length && this.checkpoints[index].tick === cp.tick) {
      this.bytes -= this.checkpoints[index].bytes;
      this.checkpoints[index] = cp;
      this.bytes += cp.bytes;
    } else {
      this.checkpoints.splice(index, 0, cp);
      this.bytes += cp.bytes;
    }
    if (cp.tick > this.head) this.head = cp.tick;
    this._evict();
    this.oldest = this.checkpoints[0].tick;
  }

  truncateAfter(tick) {
    while (this.checkpoints.length && this.checkpoints[this.checkpoints.length - 1].tick > tick) {
      const dropped = this.checkpoints.pop();
      this.bytes -= dropped.bytes;
    }
    this.head = tick;
    this.oldest = this.checkpoints.length ? this.checkpoints[0].tick : tick;
  }

  nearestAtOrBefore(tick) {
    if (!this.checkpoints.length) return null;
    let index = this._lower(tick);
    if (index < this.checkpoints.length && this.checkpoints[index].tick === tick) return this.checkpoints[index];
    if (index === 0) return null;
    return this.checkpoints[index - 1];
  }

  contains(tick) {
    return tick >= this.oldest && tick <= this.head && this.nearestAtOrBefore(tick) !== null;
  }

  _evict() {
    while (this.checkpoints.length > 1 && this.bytes > this.budget) {
      const dropped = this.checkpoints.shift();
      this.bytes -= dropped.bytes;
    }
  }

  _lower(tick) {
    let lo = 0;
    let hi = this.checkpoints.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.checkpoints[mid].tick < tick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

export function copyCheckpoint(snapshot) {
  return {
    tick: snapshot.tick,
    nextId: snapshot.nextId,
    count: snapshot.count,
    ids: snapshot.ids.slice(0, snapshot.count),
    pos: snapshot.pos.slice(0, snapshot.count * 3),
    vel: snapshot.vel.slice(0, snapshot.count * 3),
    mass: snapshot.mass.slice(0, snapshot.count),
    radius: snapshot.radius.slice(0, snapshot.count),
    color: snapshot.color.slice(0, snapshot.count * 3),
    cluster: snapshot.cluster.slice(0, snapshot.count),
    lineage: cloneLineage(snapshot.lineage),
    bytes: snapshot.bytes,
  };
}
