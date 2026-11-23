/** Packed authoritative body state. IDs are stable and independent of packed indices. */

import { MAX_BODIES } from './constants.js';

export class BodyStore {
  constructor(capacity = 64) {
    this.count = 0;
    this.nextId = 1;
    this.capacity = 0;
    this.ids = new Int32Array(0);
    this.pos = new Float64Array(0);
    this.vel = new Float64Array(0);
    this.mass = new Float64Array(0);
    this.radius = new Float64Array(0);
    this.color = new Float32Array(0);
    this.cluster = new Int32Array(0);
    this.indexById = new Map();
    this.lineage = new Map();
    this._rollback = null;
    this.ensure(capacity);
  }

  ensure(capacity) {
    const next = Math.max(capacity, this.count);
    if (next <= this.capacity) return;
    const grow = (ArrayType, old, width) => {
      const fresh = new ArrayType(next * width);
      if (old && this.count) fresh.set(old.subarray(0, this.count * width));
      return fresh;
    };
    this.ids = grow(Int32Array, this.ids, 1);
    this.pos = grow(Float64Array, this.pos, 3);
    this.vel = grow(Float64Array, this.vel, 3);
    this.mass = grow(Float64Array, this.mass, 1);
    this.radius = grow(Float64Array, this.radius, 1);
    this.color = grow(Float32Array, this.color, 3);
    this.cluster = grow(Int32Array, this.cluster, 1);
    this.capacity = next;
  }

  clear() {
    this.count = 0;
    this.nextId = 1;
    this.indexById.clear();
    this.lineage.clear();
  }

  indexOf(id) {
    const index = this.indexById.get(id);
    return index === undefined ? -1 : index;
  }

  /**
   * @param {object} body
   * @param {{keepId?: boolean, maxBodies?: number}} [options]
   */
  add(body, options = {}) {
    const maxBodies = options.maxBodies ?? MAX_BODIES;
    if (this.count >= maxBodies) {
      throw new Error(`Body count is limited to ${maxBodies}`);
    }
    const id = options.keepId ? body.id : this.nextId;
    if (!Number.isInteger(id) || id < 1) throw new Error('Body id must be a positive integer');
    if (this.indexById.has(id)) throw new Error(`Duplicate body id ${id}`);
    this.ensure(this.count + 1);
    const i = this.count;
    const k = i * 3;
    this.ids[i] = id;
    this.pos[k] = body.position[0];
    this.pos[k + 1] = body.position[1];
    this.pos[k + 2] = body.position[2];
    this.vel[k] = body.velocity[0];
    this.vel[k + 1] = body.velocity[1];
    this.vel[k + 2] = body.velocity[2];
    this.mass[i] = body.mass;
    this.radius[i] = body.radius;
    const color = body.color || [1, 1, 1];
    this.color[k] = color[0];
    this.color[k + 1] = color[1];
    this.color[k + 2] = color[2];
    this.cluster[i] = body.cluster | 0;
    this.indexById.set(id, i);
    this.count += 1;
    if (id >= this.nextId) this.nextId = id + 1;
    return id;
  }

  removeAt(index) {
    const last = this.count - 1;
    if (index < 0 || index > last) return;
    const removedId = this.ids[index];
    this.indexById.delete(removedId);
    this.lineage.delete(removedId);
    if (index !== last) {
      const k = index * 3;
      const j = last * 3;
      this.ids[index] = this.ids[last];
      this.pos[k] = this.pos[j];
      this.pos[k + 1] = this.pos[j + 1];
      this.pos[k + 2] = this.pos[j + 2];
      this.vel[k] = this.vel[j];
      this.vel[k + 1] = this.vel[j + 1];
      this.vel[k + 2] = this.vel[j + 2];
      this.mass[index] = this.mass[last];
      this.radius[index] = this.radius[last];
      this.color[k] = this.color[j];
      this.color[k + 1] = this.color[j + 1];
      this.color[k + 2] = this.color[j + 2];
      this.cluster[index] = this.cluster[last];
      this.indexById.set(this.ids[index], index);
    }
    this.count = last;
  }

  removeId(id) {
    const index = this.indexOf(id);
    if (index < 0) return false;
    this.removeAt(index);
    return true;
  }

  get(id) {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const k = i * 3;
    return {
      id,
      position: [this.pos[k], this.pos[k + 1], this.pos[k + 2]],
      velocity: [this.vel[k], this.vel[k + 1], this.vel[k + 2]],
      mass: this.mass[i],
      radius: this.radius[i],
      color: [this.color[k], this.color[k + 1], this.color[k + 2]],
      cluster: this.cluster[i],
      absorbed: (this.lineage.get(id) || []).slice(),
    };
  }

  write(id, fields) {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`No body ${id}`);
    const k = i * 3;
    if (fields.position) {
      this.pos[k] = fields.position[0];
      this.pos[k + 1] = fields.position[1];
      this.pos[k + 2] = fields.position[2];
    }
    if (fields.velocity) {
      this.vel[k] = fields.velocity[0];
      this.vel[k + 1] = fields.velocity[1];
      this.vel[k + 2] = fields.velocity[2];
    }
    if (fields.mass !== undefined) this.mass[i] = fields.mass;
    if (fields.radius !== undefined) this.radius[i] = fields.radius;
    if (fields.color) {
      this.color[k] = fields.color[0];
      this.color[k + 1] = fields.color[1];
      this.color[k + 2] = fields.color[2];
    }
    if (fields.cluster !== undefined) this.cluster[i] = fields.cluster | 0;
  }

  saveRollback() {
    const n = this.count;
    if (!this._rollback || this._rollback.capacity < n) {
      this._rollback = {
        capacity: Math.max(n, 16),
        ids: new Int32Array(Math.max(n, 16)),
        pos: new Float64Array(Math.max(n, 16) * 3),
        vel: new Float64Array(Math.max(n, 16) * 3),
        mass: new Float64Array(Math.max(n, 16)),
        radius: new Float64Array(Math.max(n, 16)),
        color: new Float32Array(Math.max(n, 16) * 3),
        cluster: new Int32Array(Math.max(n, 16)),
      };
    }
    const rb = this._rollback;
    rb.count = n;
    rb.nextId = this.nextId;
    rb.ids.set(this.ids.subarray(0, n));
    rb.pos.set(this.pos.subarray(0, n * 3));
    rb.vel.set(this.vel.subarray(0, n * 3));
    rb.mass.set(this.mass.subarray(0, n));
    rb.radius.set(this.radius.subarray(0, n));
    rb.color.set(this.color.subarray(0, n * 3));
    rb.cluster.set(this.cluster.subarray(0, n));
    rb.lineage = cloneLineage(this.lineage);
  }

  restoreRollback() {
    const rb = this._rollback;
    if (!rb) return;
    this.ensure(rb.count);
    this.count = rb.count;
    this.nextId = rb.nextId;
    this.ids.set(rb.ids.subarray(0, rb.count));
    this.pos.set(rb.pos.subarray(0, rb.count * 3));
    this.vel.set(rb.vel.subarray(0, rb.count * 3));
    this.mass.set(rb.mass.subarray(0, rb.count));
    this.radius.set(rb.radius.subarray(0, rb.count));
    this.color.set(rb.color.subarray(0, rb.count * 3));
    this.cluster.set(rb.cluster.subarray(0, rb.count));
    this.lineage = cloneLineage(rb.lineage);
    this.rebuildIndex();
  }

  restore(snapshot) {
    const n = snapshot.count;
    this.ensure(n);
    this.count = n;
    this.nextId = snapshot.nextId;
    this.ids.set(snapshot.ids.subarray(0, n));
    this.pos.set(snapshot.pos.subarray(0, n * 3));
    this.vel.set(snapshot.vel.subarray(0, n * 3));
    this.mass.set(snapshot.mass.subarray(0, n));
    this.radius.set(snapshot.radius.subarray(0, n));
    this.color.set(snapshot.color.subarray(0, n * 3));
    this.cluster.set(snapshot.cluster.subarray(0, n));
    this.lineage = cloneLineage(snapshot.lineage);
    this.rebuildIndex();
  }

  rebuildIndex() {
    this.indexById.clear();
    for (let i = 0; i < this.count; i++) this.indexById.set(this.ids[i], i);
  }

  absorb(survivorId, removedIds) {
    const list = (this.lineage.get(survivorId) || []).slice();
    for (const id of removedIds) {
      list.push(id);
      const nested = this.lineage.get(id);
      if (nested) {
        for (const child of nested) list.push(child);
        this.lineage.delete(id);
      }
    }
    this.lineage.set(survivorId, list);
  }

  nonfiniteIds() {
    const bad = [];
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      if (!finite3(this.pos, k) || !finite3(this.vel, k) || !Number.isFinite(this.mass[i]) || !Number.isFinite(this.radius[i])) {
        bad.push(this.ids[i]);
      }
    }
    return bad;
  }
}

function finite3(array, offset) {
  return Number.isFinite(array[offset]) && Number.isFinite(array[offset + 1]) && Number.isFinite(array[offset + 2]);
}

export function cloneLineage(lineage) {
  if (lineage instanceof Map) {
    const copy = new Map();
    for (const [id, ids] of lineage) copy.set(id, ids.slice());
    return copy;
  }
  const copy = new Map();
  if (Array.isArray(lineage)) {
    for (const pair of lineage) copy.set(pair[0], pair[1].slice());
  }
  return copy;
}
