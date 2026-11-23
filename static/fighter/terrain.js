import * as THREE from 'three';

export async function loadHeightmap(url) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
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

function noiseCanvas(size, lo, hi) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = lo + Math.random() * (hi - lo);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function detailTexture() {
  const tex = new THREE.CanvasTexture(noiseCanvas(256, 120, 200));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70);
  return tex;
}

// Smooth multi-octave noise used as a close-up colour detail layer.
function smoothNoiseTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (const [cells, amp] of [[8, 60], [32, 40], [128, 28]]) {
    const small = noiseCanvas(cells, 0, amp);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Tile the small canvas 2x2 before scaling so the result wraps cleanly.
    ctx.globalAlpha = 1;
    ctx.drawImage(small, 0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Water normal map: blurred noise bumps, scrolled twice in the shader.
function waterNormals() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const nx = 128 + (Math.random() - 0.5) * 70;
    const ny = 128 + (Math.random() - 0.5) * 70;
    g.addColorStop(0, `rgba(${nx | 0}, ${ny | 0}, 255, 0.55)`);
    g.addColorStop(1, 'rgba(128,128,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Heightmap columns run along world x, rows along world z. Row 0 is z = -size/2.
export function createTerrain({ heightmap, size, maxHeight, colorTexture, waterLevel, waterColor = 0x2a6f8c }) {
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
    metalness: 0,
    bumpMap: detailTexture(),
    bumpScale: 2.4
  });
  const detail = smoothNoiseTexture();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying float vSlope;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSlope = 1.0 - normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec3 vWorldPos;\nvarying float vSlope;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float dist = length(vWorldPos - cameraPosition);
  float fade = clamp(1.0 - dist / 1500.0, 0.0, 1.0);
  float d1 = texture2D(detailMap, vWorldPos.xz * 0.004).r;
  float d2 = texture2D(detailMap, vWorldPos.xz * 0.03).r;
  float d3 = texture2D(detailMap, vWorldPos.xz * 0.15).r;
  float d4 = texture2D(detailMap, vWorldPos.xz * 0.6).r;
  float detailMul = (0.55 + d1 * 0.9) * (0.62 + d2 * 0.76) * (0.78 + d3 * 0.44) * (0.9 + d4 * 0.2);
  diffuseColor.rgb *= mix(1.0, detailMul, fade);
  diffuseColor.rgb *= 1.0 - clamp(vSlope * 1.6, 0.0, 0.42);
}`);
  };
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
  const group = new THREE.Group();
  group.add(mesh);

  // A wide apron so the horizon never shows the edge of the map.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 6, size * 6),
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = waterLevel != null ? waterLevel - 0.5 : -2;
  group.add(apron);

  let water = null;
  if (waterLevel != null) {
    const normals = waterNormals();
    const waterMat = new THREE.MeshPhongMaterial({
      color: waterColor,
      specular: 0xffffff,
      shininess: 160,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.92
    });
    normals.repeat.set(size / 60, size / 60);
    water = new THREE.Mesh(new THREE.PlaneGeometry(size * 6, size * 6, 1, 1), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = waterLevel;
    water.receiveShadow = true;
    group.add(water);
    apron.visible = false;
  }

  const sample = (px, py) => heights[Math.min(h - 1, Math.max(0, py)) * w + Math.min(w - 1, Math.max(0, px))] * maxHeight;
  function heightAt(x, z) {
    const u = (x / size + 0.5) * (w - 1);
    const v = (z / size + 0.5) * (h - 1);
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const top = sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx;
    const bottom = sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx;
    const ground = top * (1 - fy) + bottom * fy;
    return waterLevel != null ? Math.max(ground, waterLevel) : ground;
  }
  function groundAt(x, z) {
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
  const isWater = (x, z) => waterLevel != null && groundAt(x, z) < waterLevel - 0.5;

  function update(dt) {
    if (water) {
      const n = water.material.normalMap;
      n.offset.x += dt * 0.012;
      n.offset.y += dt * 0.007;
    }
  }

  return { group, mesh, water, heightAt, groundAt, isWater, update, size, half, maxHeight, waterLevel };
}
