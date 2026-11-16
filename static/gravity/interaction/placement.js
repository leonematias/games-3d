/** Place, then launch. Camera gestures do not create a body until Confirm. */

import { circularSpeed } from '../physics/gravity.js';
import { buildGroup, defaultGroupParams } from '../physics/groups.js';
import { hitPlacementPlane } from './plane.js';

export class PlacementTool {
  constructor() {
    this.active = false;
    this.phase = 'idle';
    this.height = 0;
    this.position = [0, 0, 0];
    this.velocity = [0, 0, 0];
    this.scale = 1.5;
    this.mass = 1;
    this.radius = 0.35;
    this.color = [0.49, 0.71, 1];
    this.dragging = false;
    this.available = false;
    this.wasPlaying = false;
    this.pauseWhilePlacing = true;
    this.kind = 'single';
    this.seed = 1;
    this.dropCluster = 0;
    this.params = {
      cloud: defaultGroupParams('cloud'),
      disk: defaultGroupParams('disk'),
      solar: defaultGroupParams('solar'),
      binary: defaultGroupParams('binary'),
    };
    this.localBodies = null;
    this.extent = 0;
    this.shapeKey = '';
    this.shapeError = '';
    this.seenPointer = false;
  }

  begin(wasPlaying) {
    this.active = true;
    this.phase = 'hover';
    this.dragging = false;
    this.available = false;
    this.wasPlaying = wasPlaying;
    this.velocity = [0, 0, 0];
    this.position[1] = this.height;
    this.seenPointer = false;
    this.dropCluster = (this.dropCluster % 6) + 1;
  }

  cancel() {
    const wasPlaying = this.wasPlaying;
    this.active = false;
    this.phase = 'idle';
    this.dragging = false;
    this.wasPlaying = false;
    return wasPlaying;
  }

  setHeight(height) {
    this.height = height;
    this.position[1] = height;
  }

  /**
   * @param {{origin:number[], direction:number[]}} ray
   * @param {'move'|'down'|'up'} kind
   */
  pointer(ray, kind) {
    if (!this.active) return;
    this.seenPointer = true;
    const hit = hitPlacementPlane(ray.origin, ray.direction, this.height);
    this.available = Boolean(hit);
    if (kind === 'down') {
      if (!hit) return;
      if (this.phase !== 'locked') {
        this.position = [hit[0], this.height, hit[2]];
        this.phase = 'locked';
        this.velocity = [0, this.velocity[1], 0];
      }
      this.dragging = true;
      return;
    }
    if (kind === 'move' && this.phase !== 'locked') {
      if (hit) this.position = [hit[0], this.height, hit[2]];
      return;
    }
    if (kind === 'move' && this.dragging && this.phase === 'locked' && hit) {
      this.velocity[0] = (hit[0] - this.position[0]) * this.scale;
      this.velocity[2] = (hit[2] - this.position[2]) * this.scale;
      return;
    }
    if (kind === 'up') this.dragging = false;
  }

  /**
   * Softened circular speed around the selected body only, plus that body's current velocity.
   * For a group this is the shared velocity. Motion inside the group is left alone.
   * Other masses are ignored. The tangent lies in the XZ plane: at +X the added speed is +Z.
   */
  orbitAround(selected, G, epsilon) {
    if (!selected || this.phase !== 'locked') return false;
    const dx = this.position[0] - selected.position[0];
    const dy = this.position[1] - selected.position[1];
    const dz = this.position[2] - selected.position[2];
    const radius = Math.hypot(dx, dy, dz);
    const planar = Math.hypot(dx, dz);
    if (radius < 1e-3 || planar < 1e-3) return false;
    const speed = circularSpeed(G, selected.mass, radius, epsilon);
    this.velocity = [
      selected.velocity[0] + (-dz / planar) * speed,
      selected.velocity[1],
      selected.velocity[2] + (dx / planar) * speed,
    ];
    return true;
  }

  payload() {
    return {
      position: this.position.slice(),
      velocity: this.velocity.slice(),
      mass: this.mass,
      radius: this.radius,
      color: this.color.slice(),
      cluster: 7,
    };
  }

  /** Rebuild the local group only when the shape inputs change. Hovering does not rebuild it. */
  ensureShape(physics = {}) {
    if (this.kind === 'single') {
      this.localBodies = null;
      this.extent = this.radius;
      this.shapeError = '';
      this.shapeKey = 'single';
      return;
    }
    const G = Number.isFinite(Number(physics.G)) ? Number(physics.G) : 1;
    const epsilon = Number.isFinite(Number(physics.epsilon)) ? Number(physics.epsilon) : 0.45;
    const key = `${this.kind}|${this.seed}|${G}|${epsilon}|${this.color.join(',')}|${JSON.stringify(this.params[this.kind])}`;
    if (key === this.shapeKey) return;
    this.shapeKey = key;
    try {
      const built = buildGroup(this.kind, this.params[this.kind], this.seed, { G, epsilon, color: this.color });
      this.localBodies = built.bodies;
      this.extent = built.extent;
      this.shapeError = '';
    } catch (error) {
      this.localBodies = null;
      this.extent = 0;
      this.shapeError = error.message || 'This group cannot be built';
    }
  }

  /**
   * World-space bodies. Internal motion stays, and the locked velocity is added to every body.
   * Positions are the local shape plus the locked center.
   */
  placedBodies(physics) {
    this.ensureShape(physics);
    if (!this.localBodies) return [];
    const cluster = this.dropCluster || 1;
    return this.localBodies.map((body) => ({
      position: [
        body.position[0] + this.position[0],
        body.position[1] + this.position[1],
        body.position[2] + this.position[2],
      ],
      velocity: [
        body.velocity[0] + this.velocity[0],
        body.velocity[1] + this.velocity[1],
        body.velocity[2] + this.velocity[2],
      ],
      mass: body.mass,
      radius: body.radius,
      color: body.color.slice(),
      cluster,
    }));
  }

  payloads(physics) {
    const bodies = this.placedBodies(physics);
    if (this.shapeError) throw new Error(this.shapeError);
    if (!bodies.length) throw new Error('This group has no bodies');
    return bodies;
  }
}
