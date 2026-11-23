import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { TgcLoader } from '../meshviewer/tgc-loader.js';

// MeshCreator models for the game. Every prop, plant and creature that comes
// from backend/models (the library the mesh viewer at /meshes shows)
// goes through loadModel(), which fetches the TGC scene once per folder and
// hands back the mesh's geometry and materials. Two helpers build from it:
// cloneModel() for a single placed object and instancedModel() for many
// copies in one draw call. Models are in centimetres with the base on y = 0,
// so callers pass a `scale` that turns them into metres.
//
// Wind: materials passed to windSway() bend their vertices with height, in
// world space, driven by the shared `wind` uniforms (updateWind each frame).

const MODEL_ROOT = '/games-3d/meshes/files/';
const tgc = new TgcLoader({ fileRoot: MODEL_ROOT, anisotropy: 4 });
const cache = new Map();

export const wind = {
  uniforms: { uWindTime: { value: 0 }, uWindStrength: { value: 0.5 }, uWindDir: { value: new THREE.Vector2(0.7, 0.7) } },
  strength: 0.5,
  dirDeg: 45
};
export function updateWind(delta) {
  wind.uniforms.uWindTime.value += delta;
  wind.uniforms.uWindStrength.value += (wind.strength - wind.uniforms.uWindStrength.value) * Math.min(1, delta * 0.5);
  const a = THREE.MathUtils.degToRad(wind.dirDeg);
  wind.uniforms.uWindDir.value.set(Math.sin(a), -Math.cos(a));
}

// Bend `material` with the wind. `height` is the model's height in its own
// units so the sway is scaled to the plant (tops move, roots stay put).
export function windSway(material, height) {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (mat.userData.windSway) continue;
    mat.userData.windSway = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = wind.uniforms.uWindTime;
      shader.uniforms.uWindStrength = wind.uniforms.uWindStrength;
      shader.uniforms.uWindDir = wind.uniforms.uWindDir;
      shader.uniforms.uHeight = { value: Math.max(1, height) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uWindTime, uWindStrength, uHeight;
uniform vec2 uWindDir;`)
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
{
  float hN = clamp(transformed.y / uHeight, 0.0, 1.0);
  vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float ph = ipos.x * 0.21 + ipos.z * 0.17;
  float gust = sin(uWindTime * 1.1 + ph) * 0.7 + sin(uWindTime * 2.6 + ph * 1.9) * 0.3;
  mat3 im = mat3(instanceMatrix);
  float isc = max(0.0001, length(im[0]));
  vec3 localDir = transpose(im) * normalize(vec3(uWindDir.x, 0.0, uWindDir.y)) / isc;
  float amount = hN * hN * uHeight * (0.02 + 0.06 * uWindStrength) * (0.55 + 0.45 * gust + 0.35 * uWindStrength);
  transformed += localDir * amount;
}
#endif`);
    };
    mat.needsUpdate = true;
  }
}

// Load a TGC scene folder (relative to backend/models). Resolves to
// { geometry, material, height, size, source }. The result is cached.
export function loadModel(folder, { file = null } = {}) {
  const key = `${folder}/${file ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  const name = folder.split('/').pop();
  const p = (async () => {
    const res = await fetch(`${MODEL_ROOT}${folder}/${file ?? `${name}-TgcScene.xml`}`);
    if (!res.ok) throw new Error(`model ${name}: ${res.status}`);
    const { object, stats } = await tgc.load(await res.text(), { xmlDir: folder, anisotropy: 4 });
    if (stats.missing.length) console.warn(`model ${name}: missing textures`, stats.missing);
    let source = null;
    object.traverse((n) => { if (n.isMesh && !source) source = n; });
    if (!source) throw new Error(`model ${name}: no mesh`);
    source.geometry.computeBoundingBox();
    const box = source.geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    return { geometry: source.geometry, material: source.material, height: box.max.y, size, box, source };
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

// One placed copy, in metres: the mesh is scaled and ready to add to a parent.
export function cloneModel(model, scale = 0.01, material = null) {
  const mesh = new THREE.Mesh(model.geometry, material ?? model.material);
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Many copies in one draw call. `place(i, matrix)` fills each instance matrix.
export function instancedModel(model, count, place, { shadow = true, sway = false } = {}) {
  if (sway) windSway(model.material, model.height);
  const mesh = new THREE.InstancedMesh(model.geometry, model.material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) { place(i, m); mesh.setMatrixAt(i, m); }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
