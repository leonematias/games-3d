// How an item is carried: where the arm that holds it goes, whatever clip plays.
//
// A plain clip knows nothing about what is in the hand. A shield strapped to a
// hanging forearm cuts through the hip, a greatsword is swung in one hand like a
// stick, and a rifle hangs across the thigh. An item's `fit.stance` (written by
// backend/character/blender/item_fit.py into equipment.json) says where the arm
// goes instead, and this class puts it there after every pose:
//
//   - `poses`: named arm poses. A hand pose is `grip` (where the item's grip
//     is), `aim` (where its long axis points) and `top` (where its second axis
//     points; without it the item turns about itself to keep the wrist straight). A forearm pose, for a shield, is `elbow`, `wrist` and `face`.
//     Positions are (out, forward, up) from the middle of the shoulders, in arm
//     lengths, and turn with the chest, so one pose fits every body. `out` is
//     away from the midline on the side of the arm.
//     `gripPoint` optionally locates the physical grip in item axes when it
//     differs from the model origin (for example, a spear carried lower down).
//   - `clips`: which pose each clip takes ("*" for the rest). `null` leaves the
//     clip's own arm, as `attack` does for a sword arm.
//   - `support`: a point on the item, in its own axes, that the other hand is
//     brought onto (two-handed items): in every clip, in `support.clips` only,
//     or in all but `support.except`; `support.elbow` is where that elbow points.
//     Optional `support.palm` is a stable palm-facing direction in item axes.
//     A pose can place the other hand itself with `other`, as a drawn bow does.
//   - `fingers`: holding/support curl angles and an optional thumb angle, in
//     degrees from the bind pose, independent of the selected animation clip.
//   - `wrist: "straight"` keeps the wrist of the holding hand straight in the
//     clips that take no pose (one-handed weapons), and `open` holds that arm
//     so many degrees out from the side.
//   - `bowstring: true`: the string of the item follows the other hand while a
//     pose places it, with the arrow on it. `loose: true` on a pose lets go.
//   - a pose may be `{keys: [[time, pose], ...]}` over the clip's length, for a
//     thrust or a butt stroke. `square: true` on a pose measures it from the way
//     the character faces instead of the chest, which twists in a plain attack.
//
// It only moves arms, so legs, spine and head keep the clip. It travels in the
// exported GLB's config (`stances`), and CharacterLoader rebuilds it. A game that
// attaches items itself gets none of this until it builds an ItemStance too.
//
// Item axes are the authoring ones of generate_equipment.py (+Y along the hand,
// +X forward, +Z toward the body). The glTF export turns them into (x, z, -y).

import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const ARROW_GROW = 100; // the arrow in a bow's model is this much smaller than life
const SMOOTH = 14; // per second: how fast the arm moves to a new pose when the clip changes

// Authoring axes -> the item object's axes in the scene.
function fromItemAxes(v, out = new THREE.Vector3()) {
  return out.set(v[0], v[2], -v[1]);
}

// Turns `bone` in world space by the rotation taking `from` to `to`.
function swing(bone, from, to) {
  _q.setFromUnitVectors(_a.copy(from).normalize(), _b.copy(to).normalize());
  bone.getWorldQuaternion(_p).premultiply(_q);
  setWorldQuaternion(bone, _p);
}

function setWorldQuaternion(bone, world) {
  bone.parent.getWorldQuaternion(_q).invert();
  bone.quaternion.copy(_q.multiply(world)).normalize();
  bone.updateWorldMatrix(false, true);
}

function lerpPose(a, b, t) {
  const out = {};
  for (const key of Object.keys(b)) {
    const from = a[key] || b[key];
    out[key] = Array.isArray(b[key]) ? b[key].map((v, i) => from[i] + (v - from[i]) * t) : b[key];
  }
  return out;
}

export class ItemStance {
  // `holder` is the group under the bone that carries the item, `spec` the
  // item's `fit.stance` plus the side of the arm (`side`: "Right" or "Left").
  constructor(character, holder, spec) {
    this.character = character;
    this.animator = character.animator;
    this.bones = character.bones;
    this.holder = holder;
    this.spec = spec;
    this.side = spec.side || 'Right';
    this.other = this.side === 'Right' ? 'Left' : 'Right';
    this.last = new Map(); // bone -> the quaternion it was given last time
    this.stamp = 0;
    this.pose = null;
    if (!this.animator.itemStances) this.animator.itemStances = [];
    this.animator.itemStances.push(this);
  }

  dispose() {
    const list = this.animator.itemStances || [];
    const index = list.indexOf(this);
    if (index >= 0) list.splice(index, 1);
  }

  arm(side) {
    return ['Arm', 'ForeArm', 'Hand'].map((name) => this.bones.get(side + name));
  }

  // The chest: where the shoulders are and which way they face. `square` keeps
  // the shoulders' place but faces the way the character does, for a strike:
  // the body of a plain attack twists, and a thrust has to go where it looks.
  frame(square = false) {
    const left = this.bones.get('LeftArm').getWorldPosition(new THREE.Vector3());
    const right = this.bones.get('RightArm').getWorldPosition(new THREE.Vector3());
    const low = this.bones.get('Spine').getWorldPosition(new THREE.Vector3());
    const high = this.bones.get('Neck').getWorldPosition(new THREE.Vector3());
    const origin = left.clone().add(right).multiplyScalar(0.5);
    if (square) {
      const turn = this.character.model.getWorldQuaternion(new THREE.Quaternion());
      return { origin, up: new THREE.Vector3(0, 1, 0).applyQuaternion(turn), forward: new THREE.Vector3(0, 0, 1).applyQuaternion(turn), across: new THREE.Vector3(1, 0, 0).applyQuaternion(turn) };
    }
    const up = high.sub(low).normalize();
    const across = left.clone().sub(right);
    across.addScaledVector(up, -across.dot(up)).normalize();
    const forward = new THREE.Vector3().crossVectors(across, up).normalize();
    return { origin, up, forward, across };
  }

  // (out, forward, up) for the arm on `side` -> world. `scale` 0 gives a direction.
  place(frame, side, v, scale) {
    const out = side === 'Left' ? 1 : -1;
    const point = new THREE.Vector3()
      .addScaledVector(frame.across, v[0] * out)
      .addScaledVector(frame.forward, v[1])
      .addScaledVector(frame.up, v[2]);
    return scale ? point.multiplyScalar(scale).add(frame.origin) : point.normalize();
  }

  // The pose the current clip takes, or null to leave the clip's arm.
  current() {
    const name = this.animator.currentName || 'idle';
    const clips = this.spec.clips || {};
    const key = name in clips ? clips[name] : clips['*'];
    const pose = key ? this.spec.poses[key] : null;
    if (!pose || !pose.keys) return pose || null;
    const duration = this.animator.duration() || 1;
    const t = Math.max(0, Math.min(1, this.animator.time / duration));
    let before = pose.keys[0];
    let after = pose.keys[pose.keys.length - 1];
    for (let i = 0; i < pose.keys.length - 1; i++) {
      if (t >= pose.keys[i][0] && t <= pose.keys[i + 1][0]) { before = pose.keys[i]; after = pose.keys[i + 1]; break; }
    }
    const span = after[0] - before[0];
    const mix = span > 0 ? (t - before[0]) / span : 0;
    return lerpPose(before[1], after[1], mix * mix * (3 - 2 * mix));
  }

  settle() {
    const [arm, fore, hand] = this.arm(this.side);
    if (!arm || !fore || !hand || !this.bones.get('Neck') || !this.bones.get('Spine')) return;
    const name = this.animator.currentName || 'idle';
    const pose = this.current();
    const touched = [];
    if (!pose && this.spec.wrist === 'straight') {
      // A one-handed weapon keeps the clip's arm, but the wrist stays straight:
      // bent, as a relaxed or an open hand is, it drives the pommel into the forearm.
      this.character.model.updateMatrixWorld(true);
      if (this.spec.open) {
        // The arm a little out from the side, so a blade that hangs from it clears the thigh.
        const frame = this.frame();
        const turn = new THREE.Quaternion().setFromAxisAngle(frame.forward, THREE.MathUtils.degToRad(this.spec.open) * (this.side === 'Right' ? -1 : 1));
        setWorldQuaternion(arm, arm.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn));
        touched.push(arm);
      }
      const palm = new THREE.Vector3(0, 0, 1).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
      this.straighten(fore, hand, hand.getWorldPosition(new THREE.Vector3()).add(palm));
      touched.push(hand);
    }
    if (pose) {
      this.character.model.updateMatrixWorld(true);
      const frame = this.frame(!!pose.square);
      const length = arm.getWorldPosition(_a).distanceTo(fore.getWorldPosition(_b)) + _b.distanceTo(hand.getWorldPosition(_c));
      if (pose.elbow) this.poseForearm(frame, length, pose, arm, fore);
      else this.poseHand(frame, length, pose, arm, fore, hand);
      touched.push(arm, fore, hand);
    }
    // The other hand: on a point of the item (`support`, in every clip, in
    // `support.clips` or in all but `support.except`), or where the pose puts it.
    const support = this.spec.support;
    const held = support && (support.clips ? support.clips.includes(name) : !(support.except || []).includes(name));
    if (pose && pose.other) {
      this.character.model.updateMatrixWorld(true);
      const frame = this.frame();
      const [arm, fore, hand] = this.arm(this.other);
      const length = arm.getWorldPosition(_a).distanceTo(fore.getWorldPosition(_b)) + _b.distanceTo(hand.getWorldPosition(_c));
      const keep = hand.getWorldQuaternion(new THREE.Quaternion());
      this.solve(frame, this.other, arm, fore, hand, this.place(frame, this.other, pose.other, length), null);
      setWorldQuaternion(hand, keep);
      touched.push(arm, fore, hand);
    } else if (held) {
      this.character.model.updateMatrixWorld(true);
      this.reach(this.other, support.point, support.elbow, support.palm);
      touched.push(...this.arm(this.other));
    }
    if (this.spec.fingers) {
      this.gripFingers(this.side, this.spec.fingers.holding);
      if (held) this.gripFingers(this.other, this.spec.fingers.support);
    }
    this.ease(touched);
    this.pose = pose;
    if (this.spec.bowstring) this.drawString(pose);
  }

  // The string's middle goes to the fingers of the other hand and the arrow lies
  // from there through the grip. The arrow is modelled at 1/100 size inside the grip
  // (ARROW_GROW), so a game that attaches the bow itself shows a plain bow.
  drawString(pose) {
    const parts = this.bowParts();
    if (!parts) return;
    const { string, arrow, rest, middle } = parts;
    const position = string.geometry.getAttribute('position');
    const drawn = pose && pose.other && !pose.loose;
    position.array.set(rest);
    if (drawn) {
      this.character.model.updateMatrixWorld(true);
      const hand = this.bones.get(this.other + 'Hand');
      const size = hand.getWorldScale(_c).y;
      const fingers = new THREE.Vector3(0, 0.07, 0.025).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(size);
      const nock = string.worldToLocal(hand.getWorldPosition(new THREE.Vector3()).add(fingers));
      const shift = nock.clone().sub(parts.nock);
      for (const i of middle) {
        position.array[i * 3] += shift.x;
        position.array[i * 3 + 1] += shift.y;
        position.array[i * 3 + 2] += shift.z;
      }
      const along = nock.clone().negate().normalize();
      arrow.quaternion.setFromUnitVectors(_a.set(1, 0, 0), along);
      arrow.position.copy(nock).sub(_b.copy(parts.arrowNock).applyQuaternion(arrow.quaternion));
      arrow.scale.setScalar(ARROW_GROW);
    } else {
      arrow.position.set(0, 0, 0);
      arrow.quaternion.identity();
      arrow.scale.setScalar(1);
    }
    position.needsUpdate = true;
  }

  // The bow's string and arrow, found by material. Nothing for a model without them.
  bowParts() {
    if (this.bow !== undefined) return this.bow;
    let string = null;
    let arrow = null;
    (this.holder.children[0] || this.holder).traverse((node) => {
      if (!node.isMesh) return;
      if (node.material.name === 'eq_bow_string') string = node;
      if (node.material.name === 'eq_arrow') arrow = node;
    });
    this.bow = null;
    if (!string || !arrow) return null;
    string.geometry = string.geometry.clone(); // a clone of the model shares it with the cache
    const position = string.geometry.getAttribute('position');
    const middle = [];
    const nock = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getZ(i)) > 0.02) continue;
      middle.push(i);
      nock.add(_a.fromBufferAttribute(position, i));
    }
    nock.divideScalar(middle.length || 1);
    arrow.geometry.computeBoundingBox();
    const arrowNock = new THREE.Vector3(arrow.geometry.boundingBox.min.x * ARROW_GROW, 0, 0);
    this.bow = { string, arrow, rest: position.array.slice(), middle, nock, arrowNock };
    return this.bow;
  }

  // The hand that holds the item: the grip goes to `grip`, the item's long axis
  // points along `aim` and its second axis as near `top` as that allows.
  poseHand(frame, length, pose, arm, fore, hand) {
    const item = this.holder.children[0] || this.holder;
    const long = fromItemAxes(this.spec.long || [0, 1, 0]).normalize();
    const second = fromItemAxes(this.spec.top || [1, 0, 0]);
    second.addScaledVector(long, -second.dot(long)).normalize();
    const aim = this.place(frame, this.side, pose.aim, 0);
    const top = this.place(frame, this.side, pose.top || [0, 1, 0], 0);
    top.addScaledVector(aim, -top.dot(aim));
    if (top.lengthSq() < 1e-6) top.copy(frame.up).addScaledVector(aim, -frame.up.dot(aim));
    top.normalize();
    // The rotation that takes the item's two axes to where they should point.
    const wanted = new THREE.Matrix4().makeBasis(aim, top, new THREE.Vector3().crossVectors(aim, top));
    const own = new THREE.Matrix4().makeBasis(long, second, new THREE.Vector3().crossVectors(long, second));
    const itemWorld = new THREE.Quaternion().setFromRotationMatrix(wanted.multiply(own.transpose()));
    // The item sits in the hand as it does now: its rotation and its grip, seen from the hand.
    const handWorld = hand.getWorldQuaternion(new THREE.Quaternion());
    const inHand = handWorld.clone().invert().multiply(item.getWorldQuaternion(new THREE.Quaternion()));
    const grip = item.localToWorld(fromItemAxes(this.spec.gripPoint || [0, 0, 0])).sub(hand.getWorldPosition(new THREE.Vector3())).applyQuaternion(handWorld.clone().invert());
    const newHand = itemWorld.multiply(inHand.invert());
    const at = this.place(frame, this.side, pose.grip, length);
    const wrist = at.clone().sub(grip.clone().applyQuaternion(newHand));
    this.solve(frame, this.side, arm, fore, hand, wrist, pose.elbowHint);
    // A shaft can turn about itself in the fist. With no `top` in the pose, it
    // turns until the hand is as nearly in line with the forearm as it can be,
    // or the forearm would come back across the shaft it holds.
    for (let pass = 0; pass < 3 && !pose.top; pass++) {
      const along = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
      const fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(newHand);
      along.addScaledVector(aim, -along.dot(aim));
      fingers.addScaledVector(aim, -fingers.dot(aim));
      if (along.lengthSq() < 1e-6 || fingers.lengthSq() < 1e-6) break;
      const angle = Math.atan2(new THREE.Vector3().crossVectors(fingers, along).dot(aim), fingers.dot(along));
      newHand.premultiply(new THREE.Quaternion().setFromAxisAngle(aim, angle));
      wrist.copy(at).sub(grip.clone().applyQuaternion(newHand));
      this.solve(frame, this.side, arm, fore, hand, wrist, pose.elbowHint);
    }
    this.orientHand(fore, hand, newHand);
  }

  // A shield arm: the upper arm to `elbow`, the forearm to `wrist`, then the
  // forearm turned about itself until the item faces `face`.
  poseForearm(frame, length, pose, arm, fore) {
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const elbowNow = fore.getWorldPosition(new THREE.Vector3());
    const upper = shoulder.distanceTo(elbowNow);
    const elbow = this.place(frame, this.side, pose.elbow, length).sub(shoulder).setLength(upper).add(shoulder);
    swing(arm, elbowNow.sub(shoulder), elbow.clone().sub(shoulder));
    const hand = this.bones.get(this.side + 'Hand');
    const start = fore.getWorldPosition(new THREE.Vector3());
    const along = this.place(frame, this.side, pose.wrist, length).sub(start).normalize();
    swing(fore, hand.getWorldPosition(new THREE.Vector3()).sub(start), along);
    if (!pose.face) return;
    const item = this.holder.children[0] || this.holder;
    const facing = fromItemAxes(this.spec.faces || [0, 0, 1]).applyQuaternion(item.getWorldQuaternion(new THREE.Quaternion()));
    const want = this.place(frame, this.side, pose.face, 0);
    facing.addScaledVector(along, -facing.dot(along)).normalize();
    want.addScaledVector(along, -want.dot(along)).normalize();
    const angle = Math.atan2(new THREE.Vector3().crossVectors(facing, want).dot(along), facing.dot(want));
    const world = fore.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(along, angle));
    setWorldQuaternion(fore, world);
  }

  // Two bones onto a wrist position, the elbow kept low, back and out.
  solve(frame, side, arm, fore, hand, wrist, hint) {
    const a = arm.getWorldPosition(new THREE.Vector3());
    const b = fore.getWorldPosition(new THREE.Vector3());
    const c = hand.getWorldPosition(new THREE.Vector3());
    const upper = a.distanceTo(b);
    const lower = b.distanceTo(c);
    const reach = Math.max(Math.abs(upper - lower) + 0.01, Math.min(wrist.distanceTo(a), (upper + lower) * 0.999));
    const way = wrist.clone().sub(a).normalize();
    const bend = this.place(frame, side, hint || [0.5, -0.6, -1], 0);
    bend.addScaledVector(way, -bend.dot(way)).normalize();
    const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    const elbow = a.clone().addScaledVector(way, along).addScaledVector(bend, Math.sqrt(Math.max(upper * upper - along * along, 0)));
    swing(arm, b.sub(a), elbow.sub(a));
    const start = fore.getWorldPosition(new THREE.Vector3());
    swing(fore, hand.getWorldPosition(new THREE.Vector3()).sub(start), a.addScaledVector(way, reach).sub(start));
  }

  // The other hand onto a point of the item: the wrist straight, the palm
  // toward the item, the elbow low and out so the forearm comes up to the grip
  // from below and does not cross the item.
  reach(side, point, elbow = [0.7, -0.2, -1], palm = null) {
    const [arm, fore, hand] = this.arm(side);
    if (!arm || !fore || !hand) return;
    const item = this.holder.children[0] || this.holder;
    const target = item.localToWorld(fromItemAxes(point));
    const facing = palm && fromItemAxes(palm).applyQuaternion(item.getWorldQuaternion(new THREE.Quaternion()));
    const frame = this.frame();
    const size = hand.getWorldScale(_c).y;
    const wrist = target.clone();
    for (let pass = 0; pass < 8; pass++) {
      this.solve(frame, side, arm, fore, hand, wrist, elbow);
      // A rifle's underside supplies a stable palm direction. Deriving it
      // from the tiny wrist-to-grip offset made the wrist flip between frames.
      this.straighten(fore, hand, facing ? hand.getWorldPosition(new THREE.Vector3()).add(facing) : target);
      // The middle of the fist sits a little beyond the wrist, on the palm side.
      const fist = new THREE.Vector3(0, 0.07, 0.025).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(size);
      wrist.copy(target).sub(fist);
    }
  }

  // The hand in line with its forearm (bones run along +Y), its palm (+Z) toward `toward`.
  straighten(fore, hand, toward) {
    const from = fore.getWorldPosition(new THREE.Vector3());
    const at = hand.getWorldPosition(new THREE.Vector3());
    const along = at.clone().sub(from).normalize();
    const palm = toward.clone().sub(at);
    palm.addScaledVector(along, -palm.dot(along));
    if (palm.lengthSq() < 1e-8) return;
    palm.normalize();
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(along, palm), along, palm);
    this.orientHand(fore, hand, new THREE.Quaternion().setFromRotationMatrix(basis));
  }

  // Pronation belongs along the forearm, not in a 180-degree twist at the
  // wrist. Transfer the axial part of the hand's rotation to its parent while
  // preserving the wrist position and the requested world-space grip.
  orientHand(fore, hand, world) {
    const name = this.side + 'Hand';
    const side = hand === this.bones.get(name) ? this.side : this.other;
    const rest = this.character.restPose?.get(side + 'Hand');
    if (rest) {
      const foreWorld = fore.getWorldQuaternion(new THREE.Quaternion());
      const delta = foreWorld.clone().invert().multiply(world).multiply(rest.quaternion.clone().invert());
      const axis = hand.position.clone().normalize();
      const projection = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
      const twist = new THREE.Quaternion(axis.x * projection, axis.y * projection, axis.z * projection, delta.w);
      if (twist.lengthSq() > 1e-10) setWorldQuaternion(fore, foreWorld.multiply(twist.normalize()));
    }
    setWorldQuaternion(hand, world);
  }

  // A held grip is independent of walk/talk finger keys and does not require
  // an extra "fist" animation to be included in a character's exported clips.
  gripFingers(side, degrees) {
    if (degrees == null) return;
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      for (let joint = 1; joint <= 3; joint++) {
        const name = `${side}Hand${finger}${joint}`;
        const bone = this.bones.get(name), rest = this.character.restPose?.get(name);
        if (!bone || !rest) continue;
        const angle = (finger === 'Thumb' ? this.spec.fingers.thumb ?? degrees * .45 : degrees) * (joint === 1 ? .8 : 1);
        bone.quaternion.copy(rest.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(angle)));
      }
    }
  }

  // Move to a new pose over a moment when the clip has just changed. A paused or
  // scrubbed clip shows the pose itself.
  ease(bones) {
    const now = performance.now();
    const step = this.animator.paused ? 1 : Math.min(1, ((now - this.stamp) / 1000) * SMOOTH);
    this.stamp = now;
    const seen = new Set(bones);
    for (const bone of seen) {
      const previous = this.last.get(bone);
      if (previous && step < 1) bone.quaternion.copy(previous.slerp(bone.quaternion, step));
      this.last.set(bone, (previous || new THREE.Quaternion()).copy(bone.quaternion));
    }
    for (const bone of [...this.last.keys()]) if (!seen.has(bone)) this.last.delete(bone);
  }
}

// An exported GLB lists its stances with the name of the group that holds each item.
export function itemStancesFromConfig(character) {
  const list = (character.config && character.config.stances) || [];
  const made = [];
  for (const spec of list) {
    let holder = null;
    character.model.traverse((node) => { if (!holder && node.name === spec.holder) holder = node; });
    if (holder) made.push(new ItemStance(character, holder, spec));
  }
  return made;
}
