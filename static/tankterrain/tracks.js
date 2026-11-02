import * as THREE from 'three';

// Track marks: two ribbons of quads stamped on the terrain behind the tracks,
// fading over `life` seconds. A ring buffer keeps the geometry bounded.

const VERT = `
  attribute float aAge;
  varying float vAlpha;
  uniform float uLife;
  void main() {
    vAlpha = clamp(1.0 - aAge / uLife, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = `
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * 0.5);
  }
`;

export function createTrackMarks(scene, terrain, { segments = 400, width = 0.62, life = 28, color = 0x2e2820 } = {}) {
  const geo = new THREE.BufferGeometry();
  const verts = segments * 4;
  const positions = new Float32Array(verts * 3);
  const ages = new Float32Array(verts);
  const index = new Uint32Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const v = i * 4;
    index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAge', new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLife: { value: life }, uColor: { value: new THREE.Color(color) } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  // Start everything fully aged (invisible).
  ages.fill(life + 1);
  geo.attributes.aAge.needsUpdate = true;

  const segAge = new Float32Array(segments).fill(life + 1);
  let head = 0;
  // Last stamped points per track so quads join up.
  const last = [null, null];
  const _l = new THREE.Vector3(), _r = new THREE.Vector3();

  // Stamp a cross-section for one track (0 left, 1 right) at a world point with a heading.
  function stamp(track, x, z, heading) {
    const nx = Math.cos(heading), nz = -Math.sin(heading);  // right-hand side direction
    const y = terrain.heightAt(x, z) + 0.06;
    _l.set(x - nx * width / 2, y, z - nz * width / 2);
    _r.set(x + nx * width / 2, y, z + nz * width / 2);
    const prev = last[track];
    if (prev) {
      const i = head;
      head = (head + 1) % segments;
      const v = i * 4;
      positions.set([prev.l.x, prev.l.y, prev.l.z, prev.r.x, prev.r.y, prev.r.z, _l.x, _l.y, _l.z, _r.x, _r.y, _r.z], v * 3);
      segAge[i] = 0;
      ages[v] = ages[v + 1] = ages[v + 2] = ages[v + 3] = 0;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAge.needsUpdate = true;
    }
    last[track] = { l: _l.clone(), r: _r.clone() };
  }
  function lift(track) { last[track] = null; }

  function update(dt) {
    for (let i = 0; i < segments; i++) {
      if (segAge[i] > life) continue;
      segAge[i] += dt;
      const v = i * 4;
      ages[v] = ages[v + 1] = ages[v + 2] = ages[v + 3] = segAge[i];
    }
    geo.attributes.aAge.needsUpdate = true;
  }

  return { stamp, lift, update, mesh };
}
