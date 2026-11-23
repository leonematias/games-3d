import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Characters from the Character Creator: a GLB per preset
// (/games-3d/character/api/characters/<id>/glb) with the skeleton, clothes and clips,
// cloned per soldier with SkeletonUtils so the geometry is shared. Weapons
// are the creator's equipment GLBs attached to the same socket bones the
// editor uses. Mounted characters play composite clips: the upper body of
// `attack`, `aim`, `shoot`, `block`, `hit` or `idle` over the seated legs of
// `ride`.

const loader = new GLTFLoader();
const templates = new Map();
const itemFiles = new Map();

export const SOCKETS = {
  rightHandWeapon: { bone: 'RightHand', position: [0, 0.06, 0], rotation: [90, 0, 0] },
  leftHandShield: { bone: 'LeftForeArm', position: [0, 0.15, 0], rotation: [0, 0, 90] },
  back: { bone: 'Spine2', position: [0, 0.05, -0.12], rotation: [90, 30, 0] },
  leftHandTorch: { bone: 'LeftHand', position: [0, 0.06, 0], rotation: [90, 180, 0] }
};
const LOWER = new Set(['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End']);
const UPPER_FOR_RIDE = ['attack', 'aim', 'shoot', 'block', 'hit', 'idle', 'death'];
const DEG = Math.PI / 180;

export function shortName(name) { return String(name || '').replace(/^mixamorig:?/, ''); }
function trackBone(track) { return shortName(track.name.split('.')[0]); }

// Upper body from `upper`, legs and hips frozen at the first frame of `ride`.
function compositeClip(name, upper, ride) {
  const tracks = [];
  for (const t of upper.tracks) if (!LOWER.has(trackBone(t))) tracks.push(t.clone());
  for (const t of ride.tracks) {
    if (!LOWER.has(trackBone(t))) continue;
    const size = t.getValueSize();
    tracks.push(new t.constructor(t.name, [0], Array.from(t.values.slice(0, size))));
  }
  return new THREE.AnimationClip(name, upper.duration, tracks);
}

export function loadTemplate(id) {
  if (!templates.has(id)) {
    templates.set(id, (async () => {
      const gltf = await loader.loadAsync(`/games-3d/character/api/characters/${encodeURIComponent(id)}/glb`);
      const scene = gltf.scene;
      scene.traverse((n) => {
        if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; if (n.isSkinnedMesh) n.frustumCulled = false; }
      });
      const clips = [...gltf.animations];
      const ride = clips.find((c) => c.name === 'ride');
      if (ride) {
        for (const name of UPPER_FOR_RIDE) {
          const c = clips.find((x) => x.name === name);
          if (c) clips.push(compositeClip(`ride_${name}`, c, ride));
        }
      }
      scene.updateMatrixWorld(true);
      let hips = null;
      scene.traverse((n) => { if (n.isBone && shortName(n.name) === 'Hips') hips = n; });
      const hipsHeight = hips ? hips.getWorldPosition(new THREE.Vector3()).y - scene.getWorldPosition(new THREE.Vector3()).y : 0.95;
      const box = new THREE.Box3().setFromObject(scene);
      return { id, scene, clips, hipsHeight, height: box.max.y - box.min.y };
    })());
    templates.get(id).catch(() => templates.delete(id));
  }
  return templates.get(id);
}

export function loadItemFile(id) {
  if (!itemFiles.has(id)) {
    itemFiles.set(id, loader.loadAsync(`/games-3d/character/assets/equipment/${encodeURIComponent(id)}.glb`).then((gltf) => gltf.scene));
    itemFiles.get(id).catch(() => itemFiles.delete(id));
  }
  return itemFiles.get(id);
}

export async function makeItem(id) {
  const scene = await loadItemFile(id);
  const object = scene.clone(true);
  object.traverse((n) => { if (n.isMesh) n.castShadow = true; });
  object.name = `item_${id}`;
  return object;
}

// A playable copy of a template.
export function instantiate(template) {
  const model = SkeletonUtils.clone(template.scene);
  model.traverse((n) => { if (n.isMesh) { n.castShadow = true; if (n.isSkinnedMesh) n.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  for (const clip of template.clips) actions.set(clip.name, mixer.clipAction(clip));
  const bones = new Map();
  model.traverse((n) => { if (n.isBone) bones.set(shortName(n.name), n); });
  const rig = {
    model, mixer, actions, bones, template, hipsHeight: template.hipsHeight,
    current: null, currentName: null, finished: false, aimYaw: 0, lean: 0, items: new Map(),
    has(name) { return actions.has(name); },
    // Play a clip: looping by default; `once` clamps at the last frame and reports `finished`.
    play(name, { fade = 0.18, once = false, speed = 1, restart = false } = {}) {
      const action = actions.get(name);
      if (!action) return null;
      if (action === rig.current && !restart) { action.timeScale = speed; return action; }
      action.reset();
      action.enabled = true;
      action.timeScale = speed;
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      action.setEffectiveWeight(1);
      if (rig.current && fade > 0) { rig.current.crossFadeTo(action, fade, false); action.play(); }
      else { if (rig.current) rig.current.stop(); action.fadeIn(0).play(); }
      rig.current = action;
      rig.currentName = name;
      rig.finished = false;
      return action;
    },
    // Fraction of the current clip played (0..1), for timing a sword swing.
    progress() {
      if (!rig.current) return 0;
      return Math.min(1, rig.current.time / rig.current.getClip().duration);
    },
    setSpeed(speed) { if (rig.current) rig.current.timeScale = speed; },
    update(dt) {
      mixer.update(dt);
      // Twist the chest onto the aim target after the clip has posed it.
      if (rig.aimYaw) {
        const a = bones.get('Spine1'), b = bones.get('Spine2');
        if (a) a.rotateY(rig.aimYaw * 0.5);
        if (b) b.rotateY(rig.aimYaw * 0.5);
      }
      // Bend the back forward (positive radians) over the horse's neck, the head keeps looking up the road.
      if (rig.lean) {
        const s0 = bones.get('Spine'), s1 = bones.get('Spine1'), s2 = bones.get('Spine2'), neck = bones.get('Neck'), head = bones.get('Head');
        if (s0) s0.rotateX(rig.lean * 0.4);
        if (s1) s1.rotateX(rig.lean * 0.35);
        if (s2) s2.rotateX(rig.lean * 0.25);
        if (neck) neck.rotateX(-rig.lean * 0.35);
        if (head) head.rotateX(-rig.lean * 0.35);
      }
    },
    // Attach an equipment object at a socket. Returns the holder group.
    attach(object, socketId, slot = socketId) {
      rig.detach(slot);
      const socket = SOCKETS[socketId];
      const bone = bones.get(socket.bone);
      if (!bone) return null;
      const holder = new THREE.Group();
      holder.name = `socket_${socketId}`;
      holder.position.set(...socket.position);
      holder.rotation.set(socket.rotation[0] * DEG, socket.rotation[1] * DEG, socket.rotation[2] * DEG, 'XYZ');
      holder.add(object);
      object.visible = true;
      bone.add(holder);
      rig.items.set(slot, { holder, object });
      return holder;
    },
    detach(slot) {
      const entry = rig.items.get(slot);
      if (!entry) return;
      entry.holder.removeFromParent();
      rig.items.delete(slot);
    },
    boneWorld(name, out = new THREE.Vector3()) {
      const bone = bones.get(name);
      if (!bone) return out.setFromMatrixPosition(model.matrixWorld);
      return bone.getWorldPosition(out);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); }
  };
  mixer.addEventListener('finished', (e) => { if (e.action === rig.current) rig.finished = true; });
  return rig;
}
