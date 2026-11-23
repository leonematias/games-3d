import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// One male body for every player. Ren's height slider is a uniform scale on
// the ~1.78 m mesh. It is not the old 1.4 procedural enlargement.
const HEIGHT = 1.08;

const KITS = {
  blue: { shirt: '#1d4eae', sleeve: '#163e8c', short: '#f3f5f8', sock: '#1a468f', boot: '#1a1c22', trim: '#f4f1ea' },
  yellow: { shirt: '#f0c42a', sleeve: '#d7a514', short: '#2a3342', sock: '#e2b422', boot: '#1a1c22', trim: '#1c2430' },
  red: { shirt: '#c41d28', sleeve: '#8e1520', short: '#f3f5f8', sock: '#b41a24', boot: '#1a1c22', trim: '#f4f1ea' },
  black: { shirt: '#2c323c', sleeve: '#1a1e26', short: '#232830', sock: '#e07018', boot: '#12141a', trim: '#eceae4' },
};

const HAIR = {
  black: '#1a1a1f',
  brown: '#6b3a22',
  orange: '#c46a22',
  silver: '#c5ced8',
  navy: '#2a3558',
  teal: '#1a7c78',
  rust: '#8c3420',
};

const SKIN_MATS = new Set(['skin_head', 'skin_torso', 'skin_arms', 'skin_hands', 'skin_legs', 'skin_feet']);
const KIT_MATS = new Set(['kit_shirt', 'kit_shorts', 'kit_socks', 'kit_number']);

const GLB_URL = '/games-3d/character/api/characters/ren-kisaragi/glb';

let template = null;
// Measured from the toe bones, not the nose. The nose stays the self-test oracle.
const assetFront = new THREE.Vector3(0, 0, 1);
let footLift = 0;

function findNamed(root, tail) {
  const plain = `mixamorig${tail}`;
  const colon = `mixamorig:${tail}`;
  return root.getObjectByName(plain) || root.getObjectByName(colon) || root.getObjectByName(tail);
}

function toeDirection(root, side, target) {
  const foot = findNamed(root, `${side}Foot`);
  const toe = findNamed(root, `${side}ToeBase`);
  if (!foot || !toe) return false;
  const at = new THREE.Vector3();
  const from = new THREE.Vector3();
  toe.getWorldPosition(at);
  foot.getWorldPosition(from);
  target.copy(at).sub(from);
  target.y = 0;
  return target.lengthSq() > 1e-8;
}

export function loadPlayers() {
  const loader = new GLTFLoader();
  return loader.loadAsync(GLB_URL).then((gltf) => {
    template = gltf;
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const hasLeft = toeDirection(scene, 'Left', left);
    const hasRight = toeDirection(scene, 'Right', right);
    if (hasLeft || hasRight) {
      assetFront.set(0, 0, 0);
      if (hasLeft) assetFront.add(left.normalize());
      if (hasRight) assetFront.add(right.normalize());
      assetFront.y = 0;
      if (assetFront.lengthSq() > 1e-8) assetFront.normalize();
      else assetFront.set(0, 0, 1);
    }
    const box = new THREE.Box3().setFromObject(scene);
    footLift = -box.min.y;
    const names = gltf.animations.map((clip) => clip.name).join(' ');
    if (!names.includes('jog') || !names.includes('diveR')) {
      throw new Error('Ren is missing the soccer clips');
    }
  });
}

function numberTexture(n, ink) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = '800 92px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 16;
  const dark = ink !== '#f7f4ee';
  g.strokeStyle = dark ? '#f7f4ee' : '#1a1c22';
  g.strokeText(String(n), 64, 70);
  g.fillStyle = ink || '#f7f4ee';
  g.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // The patch keeps the glTF layout: v = 0 is the top of the back.
  // A canvas upload flips that by default, which stands the digits upside down.
  tex.flipY = false;
  return tex;
}

function resolveKit(spec) {
  if (spec.kit && typeof spec.kit === 'object') return spec.kit;
  return KITS[spec.kit] || KITS.blue;
}

// Shirt UVs run around the body. u = 0.5 is the chest (+Z, the asset front)
// and u = 0 is the back, so a sash or side bar lands on the cloth the camera sees.
function assignShirtUv(mesh, model) {
  const geo = mesh.geometry;
  if (geo.userData.kitUv) return;
  model.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(local);
    const angle = Math.atan2(v.x, v.z);
    uv[i * 2] = 0.5 + angle / (Math.PI * 2);
    uv[i * 2 + 1] = v.y;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.userData.kitUv = true;
}

function paintBand(g, u, colors) {
  const stripe = 8;
  let x = u * 256 - (stripe * colors.length) / 2;
  for (const color of colors) {
    g.fillStyle = color;
    for (const shift of [-256, 0, 256]) {
      const left = Math.max(0, x + shift);
      const right = Math.min(256, x + shift + stripe);
      if (right > left) g.fillRect(left, 0, right - left, 32);
    }
    x += stripe;
  }
}

function shirtTexture(kit) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = kit.shirt;
  g.fillRect(0, 0, 256, 32);
  if (kit.pattern === 'stripes') {
    g.fillStyle = kit.stripe;
    const band = 256 / 10;
    for (let i = 0; i < 10; i += 2) g.fillRect(i * band, 0, band, 32);
  } else if (kit.pattern === 'sash') {
    const colors = [kit.stripe, kit.stripe2, kit.stripe3];
    paintBand(g, 0.5, colors);
    paintBand(g, 0, colors);
  } else if (kit.pattern === 'sides') {
    const colors = [kit.stripe, kit.stripe2, kit.stripe3];
    paintBand(g, 0.25, colors);
    paintBand(g, 0.75, colors);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function dressShirt(mesh, mat, kit, model) {
  if (mat.map && mat.userData.ownedMap) mat.map.dispose();
  if (kit.pattern) {
    assignShirtUv(mesh, model);
    mat.map = shirtTexture(kit);
    mat.userData.ownedMap = true;
    mat.color.set('#ffffff');
  } else {
    mat.map = null;
    mat.userData.ownedMap = false;
    mat.color.set(kit.shirt);
  }
  mat.needsUpdate = true;
}

function materialsOf(mesh) {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function paint(model, spec) {
  const kit = resolveKit(spec);
  const skin = spec.skin || '#f0c2a0';
  const hair = HAIR[spec.hair] || HAIR.black;
  const ink = kit.ink || '#f7f4ee';
  let shirtMat = null;
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
    if (!node.userData.kitUnique) {
      const source = materialsOf(node);
      const cloned = source.map((mat) => {
        if (mat.name !== 'kit_number') {
          const copy = mat.clone();
          copy.name = mat.name;
          return copy;
        }
        return new THREE.MeshBasicMaterial({
          name: 'kit_number',
          transparent: true,
          alphaTest: 0.25,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      });
      node.material = Array.isArray(node.material) ? cloned : cloned[0];
      node.userData.kitUnique = true;
    }
    for (const mat of materialsOf(node)) {
      if (SKIN_MATS.has(mat.name)) mat.color.set(skin);
      else if (mat.name === 'kit_shirt') dressShirt(node, mat, kit, model);
      else if (mat.name === 'kit_shorts') mat.color.set(kit.short);
      else if (mat.name === 'kit_socks') mat.color.set(kit.sock);
      else if (mat.name === 'cloth_boots_low') mat.color.set(kit.boot);
      else if (mat.name === 'cloth_hair_short') mat.color.set(hair);
      else if (mat.name === 'kit_number') {
        if (mat.map) mat.map.dispose();
        mat.map = numberTexture(spec.number, ink);
        mat.needsUpdate = true;
      }
      if (KIT_MATS.has(mat.name)) mat.side = THREE.DoubleSide;
      if (mat.name === 'kit_shirt') {
        shirtMat = mat;
        if (!mat.emissive) mat.emissive = new THREE.Color('#ff3a2a');
        mat.emissiveIntensity = 0;
      }
    }
  });
  return shirtMat;
}

export function buildPlayer(spec) {
  if (!template) throw new Error('loadPlayers() has not finished');
  const model = SkeletonUtils.clone(template.scene);
  const shirtMat = paint(model, spec);
  const bulk = (spec.keeper ? 1.04 : spec.id === 'kai' ? 1.03 : spec.lane ? 0.98 : 1) * HEIGHT;
  const mount = new THREE.Group();
  mount.name = 'mount';
  // Toe bones face assetFront. Map that onto the parent's -Z. Yaw stays on root.
  mount.quaternion.setFromUnitVectors(assetFront.clone(), new THREE.Vector3(0, 0, -1));
  mount.scale.setScalar(bulk);
  mount.position.y = footLift * bulk;
  mount.add(model);

  const spin = new THREE.Group();
  spin.name = 'spin';
  spin.add(mount);
  const root = new THREE.Group();
  root.name = spec.id;
  root.add(spin);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of template.animations) actions[clip.name] = mixer.clipAction(clip);
  // Same start as a medieval soldier: play idle, then skip ahead so the eight men are not in step.
  const idle = actions.idle;
  if (idle) {
    idle.fadeIn(0).play();
    mixer.update(Math.random() * 2);
  }

  return {
    root,
    spin,
    model,
    nose: model.getObjectByName('nose'),
    head: findNamed(model, 'Head'),
    footL: model.getObjectByName('footL'),
    footR: model.getObjectByName('footR'),
    shirtMat,
    spec,
    mixer,
    actions,
    clipName: idle ? 'idle' : '',
    clip: idle || null,
    gameAction: null,
    shotScale: 1,
  };
}

export function repaintPlayer(view, spec) {
  view.spec = spec;
  view.shirtMat = paint(view.model, spec);
}

function clipSpec(player) {
  const action = player.action;
  const name = action?.name;
  if (name === 'dive') {
    return { name: (action.dir || 1) < 0 ? 'diveR' : 'dive', once: true, from: 0, to: 1 };
  }
  if (name === 'tackle' || name === 'slide') return { name: 'tackle', once: true, from: 0, to: 1 };
  if (name === 'elastico' || name === 'giro') return { name: 'jog', once: false, speed: name === 'giro' ? 1.25 : 1.1 };
  if (name === 'kick') {
    if (action.pass) return { name: 'pass', once: true, from: 0.52, to: 1 };
    return { name: 'kick', once: true, from: 0.67, to: 1 };
  }
  if (name === 'charge') return { name: 'charge', once: false, speed: 1 };
  if (player.keeper && (player.speed || 0) < 0.45) return { name: 'ready', once: false, speed: 1 };
  if ((player.speed || 0) > 0.35) {
    const speed = Math.min(1.7, Math.max(0.45, player.speed / 5.2));
    return { name: 'jog', once: false, speed };
  }
  return { name: 'idle', once: false, speed: 1 };
}

// Medieval's rig.play: start a clip when the name changes, then leave it to the mixer.
function playClip(view, name, { fade = 0.16, once = false, speed = 1, restart = false, time = null } = {}) {
  const action = view.actions[name] || view.actions.idle;
  if (!action) return null;
  if (action === view.clip && !restart) {
    action.timeScale = speed;
    action.paused = false;
    return action;
  }
  action.reset();
  action.enabled = true;
  action.paused = false;
  action.timeScale = speed;
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.setEffectiveWeight(1);
  if (view.clip && fade > 0) {
    view.clip.crossFadeTo(action, fade, false);
    action.play();
  } else {
    if (view.clip) view.clip.stop();
    action.fadeIn(0).play();
  }
  if (time != null) action.time = time;
  view.clip = action;
  view.clipName = name;
  return action;
}

export function posePlayer(view, player, time, dt = 0) {
  view.root.position.set(player.x, 0, player.z);
  view.root.rotation.set(0, player.yaw, 0);
  if (view.spin) view.spin.rotation.y = player.action?.visual || 0;
  const spec = clipSpec(player);
  const restart = !!spec.once && view.gameAction !== player.action;
  let speed = spec.speed || 1;
  let at = null;
  if (spec.once) {
    const action = view.actions[spec.name] || view.actions.idle;
    const dur = action ? action.getClip().duration : 1;
    if (restart) {
      const span = Math.max(1 / 60, (spec.to - spec.from) * dur);
      const gameDur = player.action && player.action.dur > 0 ? player.action.dur : span;
      speed = span / gameDur;
      at = spec.from * dur;
      view.shotScale = speed;
    } else {
      speed = view.shotScale || 1;
    }
  }
  playClip(view, spec.name, { once: !!spec.once, speed, fade: spec.once ? 0.06 : 0.16, restart, time: at });
  view.gameAction = spec.once ? player.action : null;
  const step = Math.min(0.05, dt > 0 ? dt : 0);
  view.mixer.update(step);
  if (view.shirtMat) {
    const hot = player.id === 'kai' && player.action?.name === 'charge';
    view.shirtMat.emissiveIntensity = hot ? 0.35 + Math.sin(time * 22) * 0.2 : 0;
  }
}

export function buildBall() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f6f8';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1c1f27';
  const spots = [[40, 40], [120, 30], [190, 55], [70, 90], [150, 88], [220, 100], [20, 70]];
  for (const [x, y] of spots) {
    g.beginPath();
    g.moveTo(x, y - 14);
    g.lineTo(x + 12, y - 4);
    g.lineTo(x + 8, y + 12);
    g.lineTo(x - 8, y + 12);
    g.lineTo(x - 12, y - 4);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.02 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), mat);
  mesh.castShadow = true;
  mesh.name = 'ball';
  mesh.scale.setScalar(1.35);
  return mesh;
}
