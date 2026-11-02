import * as THREE from 'three';
import { fallbackProp, loadProp } from './models.js';

// Trees, rocks and bushes from the MeshCreator library, drawn as instanced
// meshes (one draw call per model part) and registered as obstacles.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export async function createScenery({ scene, terrain, fort, level }) {
  const props = level.props || [];
  const byModel = new Map();
  for (const p of props) {
    const key = `${p.kind}:${p.model}`;
    if (!byModel.has(key)) byModel.set(key, { kind: p.kind, model: p.model, list: [] });
    byModel.get(key).list.push(p);
  }
  const loaded = await Promise.all([...byModel.values()].map(async (entry) => ({ entry, prop: (await loadProp(entry.kind, entry.model)) || fallbackProp(entry.kind) })));
  const group = new THREE.Group();
  scene.add(group);
  let count = 0;
  for (const { entry, prop } of loaded) {
    const template = prop.make();
    template.updateMatrixWorld(true);
    const meshes = [];
    template.traverse((n) => { if (n.isMesh) meshes.push(n); });
    const n = entry.list.length;
    const instanced = meshes.map((mesh) => {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, n);
      im.castShadow = entry.kind !== 'bush';
      im.receiveShadow = true;
      group.add(im);
      return { im, local: mesh.matrixWorld.clone() };
    });
    entry.list.forEach((p, i) => {
      const y = terrain.groundAt(p.x, p.z) - (entry.kind === 'rock' ? 0.3 : 0.1);
      _p.set(p.x, y, p.z);
      _q.setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(p.yawDeg || 0), 0));
      _s.setScalar(p.scale || 1);
      _m.compose(_p, _q, _s);
      for (const { im, local } of instanced) im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(_m, local));
      if (entry.kind === 'tree') fort.addObstacle(p.x, p.z, 1.4 * (p.scale || 1));   // trunk, not the canopy
      else if (entry.kind === 'rock') fort.addObstacle(p.x, p.z, Math.max(0.8, prop.radius * (p.scale || 1) * 0.8));
      count++;
    });
    for (const { im } of instanced) im.instanceMatrix.needsUpdate = true;
  }
  return { group, count };
}
