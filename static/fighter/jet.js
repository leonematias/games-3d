import * as THREE from 'three';
import { TgcLoader } from '../meshviewer/tgc-loader.js';

// The player's jet is built from primitives in the F-16 silhouette: a lathe
// fuselage with a chin intake, a bubble canopy, strakes blending into a
// trapezoid wing, stabilators, a tall single fin and an afterburner. The
// nose points along local -Z, up is +Y, right is +X. Lengths in metres.

const MODEL_ROOT = '/games-3d/meshes/files/Meshes/';
const tgc = new TgcLoader({ fileRoot: MODEL_ROOT, anisotropy: 4 });
const modelCache = new Map();

export const MATERIALS = {
  skin: new THREE.MeshStandardMaterial({ color: 0xa3adb8, roughness: 0.55, metalness: 0.25 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2f343b, roughness: 0.6, metalness: 0.5 }),
  radome: new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.7, metalness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1d2b3f, roughness: 0.08, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.86 }),
  nozzle: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.9 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.5, metalness: 0.3 }),
  missile: new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.45, metalness: 0.3 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  flameCore: new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  pilot: new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.8 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }),
  navRed: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  navGreen: new THREE.MeshBasicMaterial({ color: 0x20ff40 }),
  navWhite: new THREE.MeshBasicMaterial({ color: 0xffffff })
};

function shadow(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Flat wing-like panel from an outline in the (x, z) plane, `thick` metres.
function panel(points, thick, material) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.04, bevelSegments: 1 });
  geo.rotateX(Math.PI / 2);          // (x, y=z) -> lies flat, extruded along -y
  geo.translate(0, thick / 2, 0);
  return shadow(new THREE.Mesh(geo, material));
}

// Vertical panel from an outline in the (z, y) plane.
function finPanel(points, thick, material) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 });
  geo.rotateY(-Math.PI / 2);         // (x=z, y) -> plane in z/y, extruded along x
  geo.translate(thick / 2, 0, 0);
  return shadow(new THREE.Mesh(geo, material));
}

function missileMesh(length = 2.9, radius = 0.13) {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), MATERIALS.missile));
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, 0.5, 10), MATERIALS.missile);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -length / 2 - 0.25;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, 0.2, 10), MATERIALS.stripe);
  band.rotation.x = Math.PI / 2;
  band.position.z = -length * 0.25;
  g.add(body, nose, band);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.45), MATERIALS.dark);
    fin.position.z = length / 2 - 0.3;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.x = Math.cos((i * Math.PI) / 2) * 0.2;
    fin.position.y = Math.sin((i * Math.PI) / 2) * 0.2;
    g.add(fin);
  }
  return g;
}

export function buildF16() {
  const root = new THREE.Group();
  const parts = {};

  // Fuselage lathe (profile radius vs z from the nose).
  const profile = [
    [0.0, -7.6], [0.22, -7.1], [0.42, -6.2], [0.6, -5.0], [0.74, -3.6], [0.82, -2.0], [0.86, 0.0],
    [0.86, 2.0], [0.82, 4.0], [0.74, 5.6], [0.62, 6.8], [0.5, 7.4], [0.44, 7.6]
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const fuse = new THREE.LatheGeometry(profile, 28);
  fuse.rotateX(Math.PI / 2);
  fuse.scale(1, 0.9, 1);
  const fuselage = shadow(new THREE.Mesh(fuse, MATERIALS.skin));
  root.add(fuselage);

  // Radome: darker nose cone over the lathe tip.
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.9, 24), MATERIALS.radome);
  radome.rotation.x = -Math.PI / 2;
  radome.position.z = -6.7;
  root.add(shadow(radome));

  // Spine fairing behind the canopy.
  const spine = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 7.2, 14, 1), MATERIALS.skin));
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 0.52, 2.6);
  spine.scale.set(1.3, 0.8, 1);
  root.add(spine);

  // Chin intake with a dark throat.
  const intake = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 3.6, 1, 1, 1), MATERIALS.skin));
  intake.position.set(0, -0.78, 0.1);
  root.add(intake);
  const throat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.6, 0.3), MATERIALS.nozzle);
  throat.position.set(0, -0.78, -1.75);
  root.add(throat);
  const lip = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.5), MATERIALS.dark));
  lip.position.set(0, -0.42, -1.75);
  root.add(lip);

  // Bubble canopy with the pilot inside.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), MATERIALS.glass);
  canopy.scale.set(0.66, 0.78, 2.05);
  canopy.position.set(0, 0.42, -3.1);
  canopy.castShadow = true;
  root.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 6, 24, Math.PI), MATERIALS.dark);
  frame.position.set(0, 0.42, -2.5);
  root.add(frame);
  const pilotBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 8), MATERIALS.pilot);
  pilotBody.position.set(0, 0.62, -3.0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), MATERIALS.helmet);
  helmet.position.set(0, 1.05, -3.25);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MATERIALS.nozzle);
  visor.rotation.x = -Math.PI / 2;
  visor.position.set(0, 1.0, -3.3);
  root.add(pilotBody, helmet, visor);
  parts.canopy = canopy;
  parts.pilot = [pilotBody, helmet, visor];

  // Wings with leading-edge strakes.
  const wingR = [[0.5, -4.6], [1.05, -1.6], [4.9, 2.2], [4.9, 3.5], [0.6, 4.1], [0.5, 4.1]];
  const wingL = wingR.map(([x, z]) => [-x, z]).reverse();
  const rightWing = panel(wingR, 0.14, MATERIALS.skin);
  const leftWing = panel(wingL, 0.14, MATERIALS.skin);
  rightWing.position.y = -0.12;
  leftWing.position.y = -0.12;
  root.add(rightWing, leftWing);

  // Stabilators.
  const stabR = [[0.4, 5.0], [2.9, 6.2], [2.9, 7.0], [0.5, 7.4]];
  const stabL = stabR.map(([x, z]) => [-x, z]).reverse();
  const rightStab = panel(stabR, 0.1, MATERIALS.skin);
  const leftStab = panel(stabL, 0.1, MATERIALS.skin);
  rightStab.position.y = -0.05;
  leftStab.position.y = -0.05;
  root.add(rightStab, leftStab);
  parts.stabs = [rightStab, leftStab];

  // Vertical fin with a red tail band and the ventral strakes.
  const fin = finPanel([[3.2, 0.5], [6.1, 3.2], [7.3, 3.3], [7.6, 0.9], [7.6, 0.5]], 0.12, MATERIALS.skin);
  root.add(fin);
  const band = finPanel([[6.2, 2.5], [6.7, 2.95], [7.28, 3.0], [7.3, 2.5]], 0.14, MATERIALS.stripe);
  root.add(band);
  const ventR = finPanel([[4.6, -0.55], [6.5, -1.15], [6.6, -0.6]], 0.08, MATERIALS.skin);
  const ventL = ventR.clone();
  ventR.position.x = 0.45;
  ventL.position.x = -0.45;
  root.add(ventR, ventL);

  // Engine nozzle and afterburner.
  const nozzle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 20, 1, true), MATERIALS.nozzle));
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 7.9;
  root.add(nozzle);
  const nozzleInner = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0xff6a20 }));
  nozzleInner.position.z = 7.7;
  root.add(nozzleInner);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 16, 1, true), MATERIALS.flame);
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = 8.3 + 1.6;
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.2, 12, 1, true), MATERIALS.flameCore);
  flameCore.rotation.x = -Math.PI / 2;
  flameCore.position.z = 8.3 + 1.1;
  const flameGroup = new THREE.Group();
  flameGroup.add(flame, flameCore);
  root.add(flameGroup);
  parts.flame = flameGroup;
  parts.flameCone = flame;
  parts.flameCore = flameCore;
  const glow = new THREE.PointLight(0xff8a30, 0, 30, 2);
  glow.position.z = 9.5;
  root.add(glow);
  parts.glow = glow;

  // Wingtip rails and pylons with missiles. Hidden as they are fired.
  parts.missiles = [];
  const slots = [[5.0, -0.05, 2.9], [-5.0, -0.05, 2.9], [3.3, -0.55, 2.3], [-3.3, -0.55, 2.3]];
  for (const [x, y, z] of slots) {
    const m = missileMesh();
    m.position.set(x, y, z);
    root.add(m);
    parts.missiles.push(m);
    if (Math.abs(x) < 4) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 1.4), MATERIALS.dark);
      pylon.position.set(x, y + 0.3, z);
      root.add(pylon);
    }
  }
  // Bombs on inner pylons.
  parts.bombs = [];
  for (const x of [1.9, -1.9]) {
    const bomb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.6, 4, 10), MATERIALS.dark);
    body.rotation.x = Math.PI / 2;
    bomb.add(body);
    bomb.position.set(x, -0.62, 1.9);
    root.add(bomb);
    parts.bombs.push(bomb);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 1.2), MATERIALS.dark);
    pylon.position.set(x, -0.35, 1.9);
    root.add(pylon);
  }

  // Navigation lights.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MATERIALS.navRed);
  navL.position.set(-4.95, 0.05, 3.3);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MATERIALS.navGreen);
  navR.position.set(4.95, 0.05, 3.3);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MATERIALS.navWhite);
  strobe.position.set(0, 3.35, 7.2);
  root.add(navL, navR, strobe);
  parts.strobe = strobe;

  // Gun port on the left strake and the wingtips for contrails.
  parts.gun = [new THREE.Vector3(-0.75, 0.15, -3.4), new THREE.Vector3(0.75, 0.15, -3.4)];
  parts.wingtips = [new THREE.Vector3(-4.9, -0.1, 3.6), new THREE.Vector3(4.9, -0.1, 3.6)];
  parts.tail = new THREE.Vector3(0, 0, 8.6);
  parts.length = 15.2;
  parts.span = 10;
  return { root, parts };
}

// Afterburner length and glow follow the throttle (0 idle, 1 boost).
export function setAfterburner(parts, throttle, t) {
  const flicker = 0.9 + Math.sin(t * 61) * 0.06 + Math.sin(t * 23) * 0.04;
  const len = (0.35 + throttle * 1.4) * flicker;
  parts.flame.scale.set(0.7 + throttle * 0.5, 0.7 + throttle * 0.5, len);
  parts.flame.position.z = 0;
  parts.glow.intensity = (8 + throttle * 60) * flicker;
  parts.flameCone.material.opacity = 0.55 + throttle * 0.4;
  parts.strobe.visible = Math.sin(t * 9) > 0.6;
}

// MeshCreator library models used for the enemies and the bases.
export function loadModel(folder, { file = null } = {}) {
  const key = `${folder}/${file ?? ''}`;
  if (modelCache.has(key)) return modelCache.get(key);
  const name = folder.split('/').pop();
  const p = (async () => {
    const res = await fetch(`${MODEL_ROOT}${folder}/${file ?? `${name}-TgcScene.xml`}`);
    if (!res.ok) throw new Error(`model ${name}: ${res.status}`);
    const { object, stats } = await tgc.load(await res.text(), { xmlDir: folder, anisotropy: 4 });
    if (stats.missing.length) console.warn(`model ${name}: missing textures`, stats.missing);
    object.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = true;
      const mats = [].concat(n.material);
      n.material = mats.map((m) => {
        const std = new THREE.MeshStandardMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, roughness: 0.6, metalness: 0.3 });
        return std;
      });
      if (n.material.length === 1) n.material = n.material[0];
    });
    const box = new THREE.Box3().setFromObject(object);
    return { object, box, size: box.getSize(new THREE.Vector3()) };
  })();
  modelCache.set(key, p);
  p.catch(() => modelCache.delete(key));
  return p;
}

// Enemy jet: the library's delta-wing fighter, nose along -Z, scaled to 16 m.
export async function loadEnemyJet() {
  const model = await loadModel('Vehicles/AvionCaza');
  const scale = 16 / model.size.z;
  return {
    make() {
      const g = new THREE.Group();
      const body = model.object.clone();
      body.scale.setScalar(scale);
      g.add(body);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.6, 12, 1, true), MATERIALS.flame.clone());
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(0, -0.9, 8.2 + 1.8);
      g.add(flame);
      const glow = new THREE.PointLight(0xff8040, 10, 25, 2);
      glow.position.set(0, -0.9, 9);
      g.add(glow);
      return { root: g, flame, glow };
    },
    length: 16,
    tail: new THREE.Vector3(0, -0.9, 8.6)
  };
}
