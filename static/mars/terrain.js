import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Loads a grayscale PNG into a Float32Array of 0..1 values.
export async function loadHeightmap(url) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load heightmap: ${url}`));
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const heights = new Float32Array(img.width * img.height);
  for (let i = 0; i < heights.length; i++) heights[i] = data[i * 4] / 255;
  return { width: img.width, height: img.height, heights };
}

function makeDetailTexture() {
  // Small tiled noise used as a bump map so the ground has grain up close.
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  // Two octaves: fine grain plus coarser blotches so the ground reads at any distance.
  const coarse = new Float32Array(32 * 32);
  for (let i = 0; i < coarse.length; i++) coarse[i] = Math.random();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (x / size) * 32;
      const cy = (y / size) * 32;
      const x0 = Math.floor(cx) % 32, y0 = Math.floor(cy) % 32;
      const x1 = (x0 + 1) % 32, y1 = (y0 + 1) % 32;
      const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
      const c = (coarse[y0 * 32 + x0] * (1 - fx) + coarse[y0 * 32 + x1] * fx) * (1 - fy)
        + (coarse[y1 * 32 + x0] * (1 - fx) + coarse[y1 * 32 + x1] * fx) * fy;
      const v = 90 + c * 90 + Math.random() * 60;
      const i = y * size + x;
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
      image.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  return tex;
}

// Builds the terrain mesh from the heightmap and exposes height/normal sampling.
// World x runs along heightmap columns, world z along rows; the image's top row
// is z = -size/2. backend/mars/tools/place_resources.py uses the same mapping.
export function createTerrain({ heightmap, size, maxHeight, colorTexture, rockColor = '#5c3a2b', apronColor = '#9a5236' }) {
  const { width: w, height: h, heights } = heightmap;
  const half = size / 2;

  const positions = new Float32Array(w * h * 3);
  const uvs = new Float32Array(w * h * 2);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      const i = iy * w + ix;
      positions[i * 3] = (ix / (w - 1) - 0.5) * size;
      positions[i * 3 + 1] = heights[i] * maxHeight;
      positions[i * 3 + 2] = (iy / (h - 1) - 0.5) * size;
      uvs[i * 2] = ix / (w - 1);
      uvs[i * 2 + 1] = 1 - iy / (h - 1);
    }
  }
  const indices = [];
  for (let iy = 0; iy < h - 1; iy++) {
    for (let ix = 0; ix < w - 1; ix++) {
      const a = iy * w + ix;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.0,
    bumpMap: makeDetailTexture(),
    bumpScale: 0.7
  });
  if (colorTexture) {
    new THREE.TextureLoader().load(colorTexture, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      material.map = tex;
      material.needsUpdate = true;
    });
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  // A wide apron below the terrain edge so the horizon never shows a hole.
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(size * 2.2, 48),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(apronColor), roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.5;
  apron.receiveShadow = true;

  const group = new THREE.Group();
  group.add(apron);
  group.add(mesh);

  const sample = (px, py) => {
    const cx = Math.min(w - 1, Math.max(0, px));
    const cy = Math.min(h - 1, Math.max(0, py));
    return heights[cy * w + cx] * maxHeight;
  };

  function heightAt(x, z) {
    const u = (x / size + 0.5) * (w - 1);
    const v = (z / size + 0.5) * (h - 1);
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const top = sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx;
    const bottom = sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  }

  const cell = size / (w - 1);
  function normalAt(x, z, target = new THREE.Vector3()) {
    const step = cell * 0.75;
    const dx = heightAt(x + step, z) - heightAt(x - step, z);
    const dz = heightAt(x, z + step) - heightAt(x, z - step);
    return target.set(-dx, 2 * step, -dz).normalize();
  }

  const terrain = { group, mesh, heightAt, normalAt, size, half, maxHeight };
  group.add(createScatterRocks(terrain, 900, 3, rockColor));
  return terrain;
}

// Small non-collectable pebbles scattered over the plain to give the rover a
// sense of scale and speed. One instanced mesh, so it is nearly free to draw.
function createScatterRocks(terrain, count, seed, rockColor) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const geometry = new THREE.IcosahedronGeometry(0.35, 0);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(rockColor), roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * terrain.size * 0.96;
    const z = (rand() - 0.5) * terrain.size * 0.96;
    const scale = 0.4 + rand() * 1.6;
    dummy.position.set(x, terrain.heightAt(x, z) - 0.12 * scale, z);
    dummy.quaternion.setFromUnitVectors(up, terrain.normalAt(x, z, normal));
    dummy.rotateY(rand() * Math.PI * 2);
    dummy.scale.set(scale * (0.8 + rand() * 0.6), scale * (0.5 + rand() * 0.5), scale);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  return rocks;
}
