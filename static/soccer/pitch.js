import * as THREE from 'three';
import { PITCH } from './logic.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

const GRASS_URLS = [
  '/games-3d/static/soccer/textures/grass-bright.jpg',
  '/games-3d/static/soccer/textures/grass-dark.jpg',
  '/games-3d/static/soccer/textures/grass-worn.jpg',
];
const GRASS_FALLBACK = ['#3ea84c', '#1d6a32', '#6d7a3e'];
const grassMaps = new Map();
const grassWaiters = [[], [], []];

function grassTexture(variant) {
  if (grassMaps.has(variant)) return grassMaps.get(variant);
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    tex.image = img;
    tex.needsUpdate = true;
    tex.userData.loaded = true;
    const waiters = grassWaiters[variant];
    grassWaiters[variant] = [];
    for (const fn of waiters) fn(tex);
    const ready = [0, 1, 2].filter((i) => grassMaps.get(i)?.userData.loaded).length;
    window.__grassReady = ready;
  };
  img.src = GRASS_URLS[variant] || GRASS_URLS[0];
  grassMaps.set(variant, tex);
  return tex;
}

function bindGrass(variant, repeatX, repeatY, onMap) {
  const tex = grassTexture(variant);
  const apply = (source) => {
    const map = source.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatX, repeatY);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    onMap(map);
  };
  if (tex.userData.loaded) apply(tex);
  else grassWaiters[variant].push(apply);
}

function grassMaterial(variant, repeatX, repeatY) {
  const mat = new THREE.MeshStandardMaterial({
    color: GRASS_FALLBACK[variant] || GRASS_FALLBACK[0],
    roughness: 0.94,
    metalness: 0,
  });
  bindGrass(variant, repeatX, repeatY, (map) => {
    mat.map = map;
    mat.color.set('#ffffff');
    mat.needsUpdate = true;
  });
  return mat;
}

function wearAlpha() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 30, 128, 128, 124);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.62, '#c8c8c8');
  grd.addColorStop(1, '#000000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function adTexture(words, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.fillRect(0, 0, 14, 128);
  g.fillRect(498, 0, 14, 128);
  g.font = '800 64px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(words, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function netTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(236, 240, 244, 0.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let chalkStroke = null;
let chalkFill = null;

function hash01(x, y) {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
}

function chalkStrokeTexture() {
  if (chalkStroke) return chalkStroke;
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const img = canvas.getContext('2d').createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash01(x, y);
      const n2 = hash01(x * 0.37 + 3, y * 0.2);
      const across = y / (h - 1);
      const edge = Math.pow(Math.sin(across * Math.PI), 0.35);
      const chunk = hash01(Math.floor(x / 22), 2) > 0.8 ? 0.05 : 1;
      const nibble = hash01(Math.floor(x / 9), Math.floor(y / 5)) > 0.84 ? 0.2 : 1;
      const worn = n > 0.93 ? 0.15 : 1;
      const grain = 0.82 + n2 * 0.18;
      const a = Math.max(0, Math.min(1, edge * grain * worn * chunk * nibble));
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 251;
      data[i + 2] = 242;
      data[i + 3] = Math.floor(a * 225);
    }
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
  chalkStroke = new THREE.CanvasTexture(canvas);
  chalkStroke.colorSpace = THREE.SRGBColorSpace;
  chalkStroke.wrapS = THREE.RepeatWrapping;
  chalkStroke.wrapT = THREE.ClampToEdgeWrapping;
  return chalkStroke;
}

function chalkFillTexture() {
  if (chalkFill) return chalkFill;
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const img = canvas.getContext('2d').createImageData(s, s);
  const data = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = hash01(x * 1.7, y * 1.3 + 4);
      const n2 = hash01(x * 0.4 + 9, y * 0.55);
      const hole = hash01(Math.floor(x / 16), Math.floor(y / 16)) > 0.72 ? 0.08 : 1;
      const a = (0.75 + n2 * 0.25) * hole * (n > 0.96 ? 0.2 : 1);
      const i = (y * s + x) * 4;
      data[i] = 255;
      data[i + 1] = 250;
      data[i + 2] = 240;
      data[i + 3] = Math.floor(Math.max(0, Math.min(1, a)) * 200);
    }
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
  chalkFill = new THREE.CanvasTexture(canvas);
  chalkFill.colorSpace = THREE.SRGBColorSpace;
  chalkFill.wrapS = THREE.RepeatWrapping;
  chalkFill.wrapT = THREE.RepeatWrapping;
  return chalkFill;
}

function chalkMaterial(along, opacity) {
  const map = chalkStrokeTexture().clone();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.repeat.set(Math.max(along / 3.2, 0.4), 1);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    color: '#f4f1e6',
    transparent: true,
    opacity,
    roughness: 0.94,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function chalkFillMaterial(repeat, opacity) {
  const map = chalkFillTexture().clone();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    color: '#f4f1e6',
    transparent: true,
    opacity,
    roughness: 0.96,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// Flat off-white, same family as the centre chalk, without the worn gaps that
// break a line up when the follow camera is looking down the pitch.
function areaChalkMaterial() {
  return new THREE.MeshBasicMaterial({
    color: '#f6f3ea',
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

// w is the world X size, d the world Z size. The chalk grain runs along local X.
// PlaneGeometry lies in XY. Yaw around Y first (order YXZ), then tilt with rotX
// -90, so the plane stays flat: local X is the long chalk axis and local +Z
// (the plane normal) becomes world +Y. Default XYZ applies that yaw after the
// tilt, around the now-horizontal axis, and stands the line up on edge.
function addLine(group, x, z, w, d, mat) {
  const alongX = w >= d;
  const geo = new THREE.PlaneGeometry(alongX ? w : d, alongX ? d : w);
  const mesh = new THREE.Mesh(geo, mat || chalkMaterial(Math.max(w, d), 0.92));
  mesh.rotation.order = 'YXZ';
  mesh.rotation.set(-Math.PI / 2, alongX ? 0 : Math.PI / 2, 0);
  mesh.position.set(x, mat ? 0.032 : 0.022, z);
  mesh.receiveShadow = true;
  mesh.renderOrder = mat ? 2 : 1;
  group.add(mesh);
}

// Same chalk weight as the halfway line and the centre circle.
export const MARKS = {
  boxDepth: 10,
  boxHalf: 8.2,
  sixDepth: 4.2,
  sixHalf: 4.1,
  spot: 8,
  arc: 5.2,
};

function addBoxLines(group, zSign) {
  const line = zSign * PITCH.halfL;
  const boxZ = line - zSign * MARKS.boxDepth;
  const sixZ = line - zSign * MARKS.sixDepth;
  const spotZ = line - zSign * MARKS.spot;
  const penW = MARKS.boxHalf * 2;
  const sixW = MARKS.sixHalf * 2;
  const chalk = () => areaChalkMaterial();
  addLine(group, 0, boxZ, penW, 0.22, chalk());
  addLine(group, -MARKS.boxHalf, (line + boxZ) / 2, 0.22, Math.abs(line - boxZ), chalk());
  addLine(group, MARKS.boxHalf, (line + boxZ) / 2, 0.22, Math.abs(line - boxZ), chalk());
  addLine(group, 0, sixZ, sixW, 0.18, chalk());
  addLine(group, -MARKS.sixHalf, (line + sixZ) / 2, 0.18, Math.abs(line - sixZ), chalk());
  addLine(group, MARKS.sixHalf, (line + sixZ) / 2, 0.18, Math.abs(line - sixZ), chalk());
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), areaChalkMaterial());
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.03, spotZ);
  spot.renderOrder = 2;
  group.add(spot);
  // The D, same chalk ring as the centre circle. RingGeometry lives in XY;
  // rotX -90 maps angle 0 to +X and -sin(angle) onto Z, so -PI/2 bulges toward
  // +Z (the far goal's field side) and +PI/2 bulges toward -Z.
  const gap = MARKS.boxDepth - MARKS.spot;
  const alpha = Math.acos(Math.min(1, gap / MARKS.arc));
  const mid = zSign < 0 ? -Math.PI / 2 : Math.PI / 2;
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(MARKS.arc - 0.18, MARKS.arc + 0.18, 40, 1, mid - alpha, alpha * 2),
    areaChalkMaterial(),
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.03, spotZ);
  arc.renderOrder = 2;
  group.add(arc);
}

function addGoal(group, zSign, netMat) {
  const z = zSign * PITCH.halfL;
  const white = new THREE.MeshLambertMaterial({ color: '#f7f8fa' });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, PITCH.goalH, 8);
  for (const x of [-PITCH.goalHalf, PITCH.goalHalf]) {
    const post = new THREE.Mesh(postGeo, white);
    post.position.set(x, PITCH.goalH / 2, z);
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, PITCH.goalHalf * 2, 8), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, PITCH.goalH, z);
  bar.castShadow = true;
  group.add(bar);
  const depth = 1.7;
  const backZ = z + zSign * depth;
  for (const x of [-PITCH.goalHalf, PITCH.goalHalf]) {
    const backPost = new THREE.Mesh(postGeo, white);
    backPost.position.set(x, PITCH.goalH / 2, backZ);
    backPost.castShadow = true;
    group.add(backPost);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, depth, 6), white);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, PITCH.goalH, z + zSign * depth / 2);
    rail.castShadow = true;
    group.add(rail);
  }
  const rearBar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, PITCH.goalHalf * 2, 6), white);
  rearBar.rotation.z = Math.PI / 2;
  rearBar.position.set(0, PITCH.goalH, backZ);
  rearBar.castShadow = true;
  group.add(rearBar);
  const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, depth, 6), white);
  stay.rotation.x = Math.PI / 2;
  stay.position.set(0, PITCH.goalH, z + zSign * depth / 2);
  stay.castShadow = true;
  group.add(stay);
  for (const x of [-PITCH.goalHalf, PITCH.goalHalf]) {
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, depth, 6), white);
    ground.rotation.x = Math.PI / 2;
    ground.position.set(x + Math.sign(x) * 0.04, 0.06, z + zSign * depth / 2);
    ground.castShadow = true;
    group.add(ground);
  }
  const geo = new THREE.PlaneGeometry(PITCH.goalHalf * 2, PITCH.goalH, 16, 12);
  const back = new THREE.Mesh(geo, netMat);
  back.position.set(0, PITCH.goalH / 2, backZ);
  back.name = 'goalNet';
  back.frustumCulled = false;
  const attr = geo.attributes.position;
  const base = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) base.set(attr.array.subarray(i * 3, i * 3 + 3), i * 3);
  back.userData.base = base;
  back.userData.zSign = zSign;
  back.userData.hit = null;
  group.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.goalHalf * 2, depth), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, PITCH.goalH, z + zSign * depth / 2);
  group.add(top);
  for (const x of [-PITCH.goalHalf, PITCH.goalHalf]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, PITCH.goalH), netMat);
    side.position.set(x, PITCH.goalH / 2, z + zSign * depth / 2);
    side.rotation.y = Math.PI / 2;
    group.add(side);
  }
  return back;
}

const CROWD_SKINS = ['#f0c2a0', '#e0aa88', '#c6865a', '#d7a574', '#8d5a3c', '#f3c7a4', '#a56b45'];
const CROWD_HAIR = ['#1a1a1f', '#3a2a22', '#6b3a22', '#c46a22', '#2a3558', '#4a4038', '#c5ced8'];
const crowdShirtGeo = new THREE.BoxGeometry(0.5, 1.05, 0.26);
const crowdHeadGeo = new THREE.SphereGeometry(0.26, 10, 8);
const crowdHairGeo = new THREE.SphereGeometry(0.27, 8, 6);
const _crowdDummy = new THREE.Object3D();
const _crowdColor = new THREE.Color();

function crowd(parent, colors, width, zFront, zBack, yFront, yBack, rows) {
  const spacing = 0.48;
  const cols = Math.max(8, Math.round(width / spacing));
  const count = cols * rows;
  const shirt = new THREE.InstancedMesh(crowdShirtGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), count);
  const head = new THREE.InstancedMesh(crowdHeadGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), count);
  const hair = new THREE.InstancedMesh(crowdHairGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), count);
  shirt.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hair.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shirt.receiveShadow = true;
  shirt.castShadow = false;
  const people = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitter = (hash01(c, r) - 0.5) * 0.1;
      const t = rows === 1 ? 0 : r / (rows - 1);
      const x = -width / 2 + (c + 0.5) * (width / cols) + ((r % 2) - 0.5) * 0.08 + jitter;
      const y = yFront + (yBack - yFront) * t;
      const z = zFront + (zBack - zFront) * t;
      const sy = 0.92 + hash01(c + 2, r) * 0.14;
      people.push({
        x,
        z,
        phase: hash01(c, r + 5) * Math.PI * 2,
        yaw: (hash01(c + 4, r) - 0.5) * 0.4,
        sx: 0.94 + hash01(c, r + 1) * 0.12,
        sy,
        sz: 0.94 + hash01(c + 1, r) * 0.1,
        shirtY: y + 0.52 * sy,
        headY: y + 1.05 * sy + 0.18,
        hairY: y + 1.05 * sy + 0.34,
        yRank: r,
      });
      _crowdColor.set(colors[(c + r * 3) % colors.length]);
      shirt.setColorAt(n, _crowdColor);
      _crowdColor.set(CROWD_SKINS[(c * 3 + r) % CROWD_SKINS.length]);
      head.setColorAt(n, _crowdColor);
      _crowdColor.set(CROWD_HAIR[(c + r * 2) % CROWD_HAIR.length]);
      hair.setColorAt(n, _crowdColor);
      n += 1;
    }
  }
  shirt.instanceColor.needsUpdate = true;
  head.instanceColor.needsUpdate = true;
  hair.instanceColor.needsUpdate = true;
  parent.add(shirt, head, hair);
  const record = { shirt, head, hair, people, jumpT: -1, scarves: null, goal: 0 };
  poseCrowd(record, 0);
  return record;
}

function addScarves(parent, record, color) {
  const scarves = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.34),
      new THREE.MeshBasicMaterial({ color: i % 2 ? color : '#f7f4ea', side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.visible = false;
    mesh.renderOrder = 5;
    parent.add(mesh);
    scarves.push({ mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 9 });
  }
  record.scarves = scarves;
}

function throwScarves(record) {
  if (!record.scarves) return;
  const front = record.people.filter((p) => p.yRank === 0);
  const picks = front.length ? front : record.people;
  record.scarves.forEach((scarf, i) => {
    const p = picks[Math.floor((i + 0.5) * picks.length / record.scarves.length) % picks.length];
    scarf.x = p.x + (hash01(i, 3) - 0.5) * 0.4;
    scarf.y = p.headY + 0.15;
    scarf.z = p.z;
    scarf.vx = (hash01(i, 8) - 0.5) * 2.2;
    scarf.vy = 5.4 + hash01(i, 9) * 2.4;
    scarf.vz = (hash01(i, 2) - 0.5) * 1.4;
    scarf.age = 0;
    scarf.mesh.visible = true;
    scarf.mesh.position.set(scarf.x, scarf.y, scarf.z);
  });
}

function stepScarves(record, dt) {
  if (!record.scarves) return;
  for (const scarf of record.scarves) {
    if (scarf.age > 1.4) {
      scarf.mesh.visible = false;
      continue;
    }
    scarf.age += dt;
    scarf.vy -= 8 * dt;
    scarf.x += scarf.vx * dt;
    scarf.y += scarf.vy * dt;
    scarf.z += scarf.vz * dt;
    scarf.mesh.visible = scarf.y > 1.1;
    scarf.mesh.position.set(scarf.x, scarf.y, scarf.z);
    scarf.mesh.rotation.set(scarf.age * 2.4, scarf.age * 1.2, scarf.age * 7);
  }
}

function poseCrowd(record, time) {
  const { shirt, head, hair, people } = record;
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const bob = Math.sin(time * 2.1 + p.phase) * 0.028;
    let hop = 0;
    if (record.jumpT >= 0) {
      const local = record.jumpT - (p.phase % 1) * 0.12;
      if (local > 0 && local < 1) hop = Math.sin(local * Math.PI) * 0.58;
    }
    _crowdDummy.position.set(p.x, p.shirtY + bob + hop, p.z);
    _crowdDummy.rotation.set(0, p.yaw, 0);
    _crowdDummy.scale.set(p.sx, p.sy, p.sz);
    _crowdDummy.updateMatrix();
    shirt.setMatrixAt(i, _crowdDummy.matrix);
    _crowdDummy.position.set(p.x, p.headY + bob + hop, p.z);
    _crowdDummy.rotation.set(0, p.yaw * 0.4, 0);
    _crowdDummy.scale.set(1, 1, 1);
    _crowdDummy.updateMatrix();
    head.setMatrixAt(i, _crowdDummy.matrix);
    _crowdDummy.position.set(p.x, p.hairY + bob + hop, p.z);
    _crowdDummy.scale.set(1.05, 0.52, 1.05);
    _crowdDummy.updateMatrix();
    hair.setMatrixAt(i, _crowdDummy.matrix);
  }
  shirt.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;
  hair.instanceMatrix.needsUpdate = true;
}

// sign -1 is the west sideline, +1 the east. Steps rise away from the pitch.
function sideTerrace(parent, sign, side) {
  const mat = lambert('#243044');
  const lipMat = lambert('#1a2433');
  for (let r = 0; r < side.rows; r++) {
    const near = sign * (side.lip + side.tread * r);
    const far = sign * (side.lip + side.tread * (r + 1));
    const top = side.base + side.rise * (r + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(side.tread, top, side.length), mat);
    step.position.set((near + far) / 2, top / 2, 0);
    step.castShadow = true;
    step.receiveShadow = true;
    parent.add(step);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(side.tread + 0.06, 0.1, side.length + 0.15), lipMat);
    lip.position.set((near + far) / 2, top + 0.04, 0);
    parent.add(lip);
  }
  const wallX = sign * (side.lip + side.tread * side.rows + 0.5);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.1, side.length), mat);
  wall.position.set(wallX, 2.05, 0);
  wall.castShadow = true;
  wall.receiveShadow = true;
  parent.add(wall);
  // A low lip over the steps. The pitch side is the opposite of sign.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, side.length + 0.4), lipMat);
  roof.position.set(wallX - sign * 0.55, 4.18, 0);
  parent.add(roof);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, side.length + 0.4), lambert('#f4f7fb'));
  edge.position.set(wallX - sign * 1.18, 4.02, 0);
  parent.add(edge);
}

function marginMaterial(repeatX, repeatY) {
  const mat = new THREE.MeshStandardMaterial({ color: '#6a7348', roughness: 1, metalness: 0 });
  bindGrass(2, repeatX, repeatY, (map) => {
    mat.map = map;
    mat.color.set('#8a9160');
    mat.needsUpdate = true;
  });
  return mat;
}

// Quarter ring inside the pitch. rotX -90 maps angle 0 to +X and -sin(angle) onto Z.
function addCornerArc(group, xSign, zSign) {
  let start = 0;
  if (xSign < 0 && zSign < 0) start = -Math.PI / 2;
  else if (xSign > 0 && zSign < 0) start = Math.PI;
  else if (xSign < 0 && zSign > 0) start = 0;
  else start = Math.PI / 2;
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.4, 16, 1, start, Math.PI / 2),
    areaChalkMaterial(),
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(xSign * PITCH.halfW, 0.032, zSign * PITCH.halfL);
  arc.renderOrder = 2;
  group.add(arc);
}

function addCornerFlag(group, xSign, zSign) {
  const x = xSign * (PITCH.halfW + 0.34);
  const z = zSign * (PITCH.halfL + 0.34);
  const poleColor = zSign > 0 ? '#1a4fbf' : '#d21f2a';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 1.6, 6), lambert(poleColor));
  pole.position.set(x, 0.8, z);
  pole.castShadow = true;
  group.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.3),
    new THREE.MeshBasicMaterial({ color: '#f7f4ea', side: THREE.DoubleSide })
  );
  cloth.position.set(x - xSign * 0.32, 1.46, z);
  cloth.rotation.y = -zSign * 0.35;
  cloth.userData.baseRot = cloth.rotation.y;
  cloth.userData.phase = xSign * 1.7 + zSign;
  group.add(cloth);
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.3),
    new THREE.MeshBasicMaterial({ color: poleColor, side: THREE.DoubleSide })
  );
  band.position.set(x - xSign * 0.08, 1.46, z);
  band.rotation.y = cloth.rotation.y;
  group.add(band);
  return cloth;
}

function placeAd(group, spec, x, z, rotY) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(spec[3] || 5.85, 0.72),
    new THREE.MeshBasicMaterial({ map: adTexture(spec[0], spec[1], spec[2]), side: THREE.DoubleSide })
  );
  mesh.position.set(x, 0.58, z);
  mesh.rotation.y = rotY;
  group.add(mesh);
}

function goalRoof(group, zSign, color) {
  const face = zSign * 34.55;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(47, 2.7, 0.22), lambert(color));
  fascia.position.set(0, 4.95, face);
  group.add(fascia);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(47.6, 0.16, 1.9), lambert('#1a2433'));
  lip.position.set(0, 6.28, face - zSign * 0.85);
  group.add(lip);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(47.6, 0.22, 0.1), lambert('#f4f7fb'));
  edge.position.set(0, 6.16, face - zSign * 1.74);
  group.add(edge);
  return fascia;
}

function stand(parent, x, y, z, w, h, d, rot) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert('#243044'));
  mesh.position.set(x, y, z);
  mesh.rotation.y = rot;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.28, d + 0.3), lambert('#1a2433'));
  lip.position.set(x, y + h / 2 + 0.1, z);
  lip.rotation.y = rot;
  parent.add(lip);
  return mesh;
}

export function createPitch() {
  const group = new THREE.Group();
  const tile = 3.4;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(150, 130), grassMaterial(1, 150 / tile, 130 / tile));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.03;
  apron.receiveShadow = true;
  group.add(apron);

  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    const depth = PITCH.length / stripes;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.width, depth),
      grassMaterial(i % 2, PITCH.width / tile, depth / tile)
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, -PITCH.halfL + depth * (i + 0.5));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const alpha = wearAlpha();
  const worn = [[-8, 6, 2.4], [11, -4, 1.8], [-4, -14, 2.1], [6, 16, 2.6], [-12, -18, 1.7], [2, 22, 1.9], [14, 10, 1.5]];
  for (const [x, z, radius] of worn) {
    const mat = new THREE.MeshStandardMaterial({
      color: GRASS_FALLBACK[2],
      alphaMap: alpha,
      transparent: true,
      depthWrite: false,
      roughness: 0.96,
      metalness: 0,
    });
    const diameter = radius * 2;
    bindGrass(2, diameter / tile, diameter / tile, (map) => {
      mat.map = map;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    });
    const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.015, z);
    patch.receiveShadow = true;
    group.add(patch);
  }

  addLine(group, 0, 0, PITCH.width, 0.16);
  addLine(group, -PITCH.halfW, 0, 0.14, PITCH.length);
  addLine(group, PITCH.halfW, 0, 0.14, PITCH.length);
  addLine(group, 0, -PITCH.halfL, PITCH.width, 0.14);
  addLine(group, 0, PITCH.halfL, PITCH.width, 0.14);
  addBoxLines(group, -1);
  addBoxLines(group, 1);
  const circle = new THREE.Mesh(new THREE.RingGeometry(6.02, 6.4, 80), chalkFillMaterial(4, 0.88));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.023;
  circle.renderOrder = 1;
  group.add(circle);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), chalkFillMaterial(1, 0.8));
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.024;
  dot.renderOrder = 1;
  group.add(dot);

  const netMat = new THREE.MeshBasicMaterial({
    map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9,
  });
  const nets = [addGoal(group, -1, netMat), addGoal(group, 1, netMat)];

  const margin = 1.45;
  const boardH = PITCH.boardH;
  const boardMat = lambert('#12305f');
  const sideStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(margin - 0.08, PITCH.length),
    marginMaterial((margin) / 3.4, PITCH.length / 3.4)
  );
  sideStrip.rotation.x = -Math.PI / 2;
  sideStrip.position.set(-(PITCH.halfW + margin / 2), 0.012, 0);
  group.add(sideStrip);
  const sideStrip2 = sideStrip.clone();
  sideStrip2.position.x = PITCH.halfW + margin / 2;
  group.add(sideStrip2);
  const endDepth = margin - 0.08;
  const endStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH.width + margin * 2, endDepth),
    marginMaterial((PITCH.width + margin * 2) / 3.4, endDepth / 3.4)
  );
  endStrip.rotation.x = -Math.PI / 2;
  endStrip.position.set(0, 0.012, PITCH.halfL + 0.1 + endDepth / 2);
  group.add(endStrip);
  const endStrip2 = endStrip.clone();
  endStrip2.position.z = -(PITCH.halfL + 0.1 + endDepth / 2);
  group.add(endStrip2);

  const sideBoardLen = PITCH.length + margin * 2;
  const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.18, boardH, sideBoardLen), boardMat);
  sideBoard.position.set(-(PITCH.halfW + margin + 0.09), boardH / 2, 0);
  sideBoard.castShadow = true;
  group.add(sideBoard);
  const sideBoard2 = sideBoard.clone();
  sideBoard2.position.x = PITCH.halfW + margin + 0.09;
  group.add(sideBoard2);
  const endRun = (PITCH.halfW + margin) - (PITCH.goalHalf + 0.2);
  for (const zSign of [-1, 1]) {
    for (const xSign of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(endRun, boardH, 0.18), boardMat);
      const center = xSign * ((PITCH.goalHalf + 0.2) + endRun / 2);
      end.position.set(center, boardH / 2, zSign * (PITCH.halfL + margin + 0.09));
      end.castShadow = true;
      group.add(end);
    }
  }

  const ads = [
    ['AOZORA', '#1a4fbf', '#f4f7fb', 5.85],
    ['DRIVE', '#ff7a18', '#2a1206', 5.85],
    ['SKY CUP', '#14305a', '#f4f7fb', 5.85],
    ['ONE TWO', '#f4f7fb', '#1a4fbf', 5.85],
    ['AKAGANE', '#d21f2a', '#fff4f2', 5.85],
    ['KICK', '#14305a', '#ffd23a', 5.85],
  ];
  const sideCount = 8;
  const sideSpan = 50;
  for (const sideX of [-1, 1]) {
    for (let i = 0; i < sideCount; i++) {
      const z = -sideSpan / 2 + (sideSpan / sideCount) * (i + 0.5);
      placeAd(group, ads[(i + (sideX < 0 ? 0 : 3)) % ads.length], sideX * (PITCH.halfW + margin - 0.02), z, sideX * -Math.PI / 2);
    }
  }
  for (const zSign of [-1, 1]) {
    for (const xSign of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const width = 6.3;
        const inner = PITCH.goalHalf + 0.55 + width / 2;
        const x = xSign * (inner + i * (width + 0.45));
        const spec = ads[(i + (zSign < 0 ? 2 : 4) + (xSign < 0 ? 1 : 0)) % ads.length];
        placeAd(group, [spec[0], spec[1], spec[2], width], x, zSign * (PITCH.halfL + margin - 0.02), zSign > 0 ? Math.PI : 0);
      }
    }
  }

  const flags = [];
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      addCornerArc(group, xSign, zSign);
      flags.push(addCornerFlag(group, xSign, zSign));
    }
  }

  stand(group, 0, 1.7, 38.5, 46, 3.4, 8, 0);
  stand(group, 0, 1.7, -38.5, 46, 3.4, 8, 0);
  const homeRoof = goalRoof(group, 1, '#1a4fbf');
  const awayRoof = goalRoof(group, -1, '#d21f2a');
  const roundCanvas = document.createElement('canvas');
  roundCanvas.width = 1024;
  roundCanvas.height = 128;
  const roundTexture = new THREE.CanvasTexture(roundCanvas);
  roundTexture.colorSpace = THREE.SRGBColorSpace;
  for (const sign of [-1, 1]) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(19, 1.1),
      new THREE.MeshBasicMaterial({ map: roundTexture, side: THREE.DoubleSide })
    );
    banner.position.set(0, 4.9, sign * 33.7);
    group.add(banner);
  }
  const homeColors = ['#1a4fbf', '#f4f7fb', '#16398a', '#ffd23a', '#2a62d0'];
  const awayColors = ['#d21f2a', '#f4f7fb', '#8d1420', '#2a303c', '#e35a4a'];
  const mix = ['#1a4fbf', '#d21f2a', '#f4f7fb', '#ffd23a', '#243044'];
  // Behind the goals the rows stay on the stand face and step up. That reads as one crowd.
  const homeCrowd = crowd(group, homeColors, 42, 34.2, 34.45, 1.85, 4.05, 4);
  const awayCrowd = crowd(group, awayColors, 42, -34.15, -34.4, 1.85, 4.05, 4);
  homeCrowd.goal = 1;
  awayCrowd.goal = -1;
  addScarves(group, homeCrowd, '#1a4fbf');
  addScarves(group, awayCrowd, '#d21f2a');
  const crowds = [homeCrowd, awayCrowd];
  // Sidelines are close to the camera, so each row sits on its own step, behind
  // the one in front. A flat stack showed three full bodies on top of each other.
  const terrace = { length: 36, tread: 1.05, rise: 0.5, base: 0.45, rows: 3, lip: 24.4, anchor: 27.6 };
  sideTerrace(group, -1, terrace);
  sideTerrace(group, 1, terrace);
  const yFront = terrace.base + terrace.rise + 0.03;
  const yBack = terrace.base + terrace.rise * terrace.rows + 0.03;
  const xFront = terrace.lip + terrace.tread * 0.5;
  const xBack = terrace.lip + terrace.tread * (terrace.rows - 0.5);
  const west = new THREE.Group();
  west.position.set(-terrace.anchor, 0, 0);
  west.rotation.y = Math.PI / 2;
  group.add(west);
  crowds.push(crowd(west, mix, 32, terrace.anchor - xFront, terrace.anchor - xBack, yFront, yBack, terrace.rows));
  const east = new THREE.Group();
  east.position.set(terrace.anchor, 0, 0);
  east.rotation.y = Math.PI / 2;
  group.add(east);
  crowds.push(crowd(east, mix, 32, xFront - terrace.anchor, xBack - terrace.anchor, yFront, yBack, terrace.rows));

  const clouds = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(3.2 + (i % 3), 8, 6), lambert('#ffffff'));
    puff.scale.y = 0.45;
    puff.position.set(-30 + i * 11, 28 + (i % 3) * 2, -18 + (i % 4) * 10);
    clouds.add(puff);
  }
  group.add(clouds);

  const lamps = [];
  for (const [x, z] of [[24, 34], [-24, 34], [24, -34], [-24, -34]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 14, 6), lambert('#d5dbe3'));
    pole.position.set(x, 7, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.7), new THREE.MeshLambertMaterial({ color: '#fff4d2', emissive: '#fff1c2', emissiveIntensity: 0.7 }));
    lamp.position.set(x, 14.1, z);
    group.add(lamp);
    lamps.push(lamp);
  }

  let crowdTime = 0;

  function relaxNets(dt) {
    for (const net of nets) {
      const hit = net.userData.hit;
      if (!hit) continue;
      hit.age += dt;
      const rise = Math.sin(Math.min(hit.age / 0.16, 1) * Math.PI * 0.5);
      const env = rise * Math.exp(-hit.age * 1.35);
      const pos = net.geometry.attributes.position;
      const base = net.userData.base;
      if (hit.age > 1.6 || env < 0.02) {
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
        pos.needsUpdate = true;
        net.userData.hit = null;
        continue;
      }
      const amp = 1.15 * env;
      const sag = 0.62 * env;
      const zSign = net.userData.zSign;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const edge = Math.abs(x) > PITCH.goalHalf - 0.22 || Math.abs(y) > PITCH.goalH / 2 - 0.16;
        const dx = x - hit.x;
        const dy = y - hit.y;
        const g = edge ? 0 : Math.exp(-(dx * dx + dy * dy) / 1.35);
        // The follow camera looks down the pitch, so a pure Z push barely shows.
        // Sag the cloth downward as well. Local z is world z on this unrotated plane.
        pos.setXYZ(i, x, y - sag * g, base[i * 3 + 2] + zSign * amp * g);
      }
      pos.needsUpdate = true;
    }
  }

  return {
    group,
    setAtmosphere(round, mode) {
      const final = round >= 2;
      clouds.visible = !final;
      const label = mode === 'penalties' ? 'PENALTY SHOWDOWN' : ['QUARTER-FINAL', 'SEMI-FINAL', 'WORLD CUP FINAL'][Math.min(2, round)];
      const g = roundCanvas.getContext('2d');
      g.fillStyle = final ? '#071a38' : '#10294a';
      g.fillRect(0, 0, 1024, 128);
      g.fillStyle = final ? '#ffd66d' : '#e9f2ff';
      g.fillRect(0, 0, 1024, 8);
      g.fillRect(0, 120, 1024, 8);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 72px Impact, Arial Black, sans-serif';
      g.fillText(label, 512, 67);
      roundTexture.needsUpdate = true;
      for (const lamp of lamps) {
        lamp.material.emissiveIntensity = final ? 3.5 : round === 1 ? 1.25 : 0.7;
        lamp.material.color.set(final ? '#ffffff' : '#fff4d2');
      }
    },
    // ball.z is already past the line that was scored. x and y are the impact.
    hitNet(ball) {
      const sign = ball.z < 0 ? -1 : 1;
      const net = nets.find((item) => item.userData.zSign === sign);
      if (!net) return;
      net.userData.hit = { x: ball.x, y: ball.y - PITCH.goalH / 2, age: 0 };
    },
    update(dt) {
      clouds.position.x = Math.sin(performance.now() * 0.00003) * 4;
      crowdTime += dt;
      for (const record of crowds) {
        if (record.jumpT >= 0) {
          record.jumpT += dt;
          if (record.jumpT > 1.2) record.jumpT = -1;
        }
        poseCrowd(record, crowdTime);
        stepScarves(record, dt);
      }
      for (const flag of flags) {
        flag.rotation.y = flag.userData.baseRot + Math.sin(crowdTime * 2.4 + flag.userData.phase) * 0.22;
      }
      relaxNets(dt);
    },
    cheer(zSign) {
      const record = crowds.find((item) => item.goal === zSign);
      if (!record) return;
      record.jumpT = 0;
      throwScarves(record);
    },
    setEnds(homeKit, awayKit) {
      const colorsOf = (kit) => [kit.shirt, kit.stripe || kit.short, '#f7f4ea', kit.short, kit.sock];
      const paintShirts = (record, colors) => {
        record.people.forEach((_, i) => {
          _crowdColor.set(colors[i % colors.length]);
          record.shirt.setColorAt(i, _crowdColor);
        });
        record.shirt.instanceColor.needsUpdate = true;
      };
      const paintScarves = (record, color) => {
        if (!record.scarves) return;
        record.scarves.forEach((scarf, i) => scarf.mesh.material.color.set(i % 2 ? color : '#f7f4ea'));
      };
      const homeColors = colorsOf(homeKit);
      const awayColors = colorsOf(awayKit);
      const mix = [homeKit.shirt, awayKit.shirt, '#f7f4ea', homeKit.short, awayKit.short];
      for (const record of crowds) {
        if (record.goal === 1) {
          paintShirts(record, homeColors);
          paintScarves(record, homeKit.shirt);
        } else if (record.goal === -1) {
          paintShirts(record, awayColors);
          paintScarves(record, awayKit.shirt);
        } else paintShirts(record, mix);
      }
      homeRoof.material.color.set(homeKit.shirt);
      awayRoof.material.color.set(awayKit.shirt);
    },
  };
}
