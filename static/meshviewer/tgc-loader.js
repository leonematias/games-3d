// TgcLoader turns a MeshCreator TGC scene XML into a Three.js group.
//
//   const loader = new TgcLoader({ fileRoot: '/games-3d/meshes/files/' });
//   const { object, stats } = await loader.load(xmlText, { xmlDir });
//   loader.dispose(object);
//
// TgcLoader.parse(xmlText) returns the materials and meshes without fetching
// textures. fileUrl(rel) is the hook for a different texture host.
//
// The Python reference is backend/meshviewer/tgc.py. Keep the two in step.
//
// DirectX and Three.js are both Y-up here. The exporter already stood the
// models up (a palm's box rests on y = 0), so positions and normals are not
// flipped. Flipping Z would mirror every mesh.
//
// DirectX front faces are clockwise, and Three.js front faces are counter-clockwise.
// Most meshes are clockwise, but some meshes in the same file are already
// counter-clockwise. Each triangle is emitted so its right-handed normal matches
// the stored normal.
//
// Texture V = 0 is the top of the image. Textures are loaded with flipY off.
// The original TgcMeshShader multiplies the texture by the vertex colour and
// ignores the material diffuse, which is black on some leaf materials. This
// loader does the same.
//
// alphaBlendEnable means the diffuse bitmap is also the opacity map, read from
// its alpha channel (MaxScript Utils_materialHasOpacityMapBitmap). The mesh
// visibility attribute is 0 for the same reason. TgcD3dDevice then keeps a
// texel only when its alpha is greater than 100 and blends it with
// source-alpha / one-minus-source-alpha.
//
// Instance quaternions are copied as (x, y, z, w). Three's matrix is the
// transpose of DirectX's because one API uses column vectors, so the same four
// numbers land on the same points.

import * as THREE from 'three';
import { decodeImage } from './image-decode.js';

let nextMeshId = 1;
function meshSerial() {
  const id = `m${nextMeshId}`;
  nextMeshId += 1;
  return id;
}

function child(el, tag) {
  const want = tag.toLowerCase();
  for (const node of el.children) {
    if (node.localName.toLowerCase() === want) return node;
  }
  return null;
}

function childText(el, tag) {
  const node = child(el, tag);
  return node ? node.textContent : '';
}

function floats(text) {
  if (!text) return [];
  const parts = text.trim().split(/\s+/);
  const out = new Float64Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) out[i] = Number(parts[i]);
  return out;
}

function ints(text) {
  if (!text) return [];
  const parts = text.trim().split(/\s+/);
  const out = new Int32Array(parts.length);
  for (let i = 0; i < parts.length; i += 1) out[i] = Number(parts[i]);
  return out;
}

function vec(text) {
  if (!text) return [];
  return text.replace(/[\[\]]/g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
}

function parseStandard(el) {
  const bitmap = child(el, 'bitmap');
  const opacityText = childText(el, 'opacity').trim();
  const opacityPercent = opacityText ? Number(opacityText) : 100;
  return {
    name: el.getAttribute('name') || '',
    type: el.getAttribute('type') || 'Standardmaterial',
    ambient: vec(childText(el, 'ambient')),
    diffuse: vec(childText(el, 'diffuse')),
    specular: vec(childText(el, 'specular')),
    opacity: opacityPercent / 100,
    opacityPercent,
    alphaBlend: childText(el, 'alphaBlendEnable').trim().toLowerCase() === 'true',
    fileName: bitmap ? bitmap.textContent.trim() : '',
    uvTiling: bitmap ? vec(bitmap.getAttribute('uvTiling')) : [1, 1],
    uvOffset: bitmap ? vec(bitmap.getAttribute('uvOffset')) : [0, 0],
  };
}

function parseMaterial(el) {
  const kind = el.getAttribute('type') || '';
  if (kind.toLowerCase() === 'multimaterial') {
    return {
      name: el.getAttribute('name') || '',
      type: kind,
      subMaterials: [...el.children].filter((node) => node.localName.toLowerCase() === 'subm').map(parseStandard),
    };
  }
  return parseStandard(el);
}

function parseMesh(el) {
  const kind = el.getAttribute('type') || 'Original';
  const visibilityText = el.getAttribute('visibility');
  const visibility = visibilityText != null && visibilityText !== '' ? Number(visibilityText) : 1;
  const mesh = {
    name: el.getAttribute('name') || '',
    instanceType: kind,
    materialId: Number(el.getAttribute('matId') ?? -1),
    color: vec(el.getAttribute('color')),
    visibility,
    alphaBlend: Math.abs(visibility - 1) > 1e-4,
    lightmap: el.getAttribute('lightmap') || '',
    layer: el.getAttribute('layer') || '',
    userProperties: {},
  };
  const props = child(el, 'userProps');
  if (props) {
    for (const node of props.children) {
      mesh.userProperties[node.localName] = (node.textContent || '').trim();
    }
  }
  if (kind.toLowerCase() === 'instance') {
    mesh.originalMesh = Number(childText(el, 'originalMesh').trim() || 0);
    const transform = child(el, 'transform');
    mesh.position = transform ? vec(transform.getAttribute('pos')) : [0, 0, 0];
    mesh.rotation = transform ? vec(transform.getAttribute('rotQuat')) : [0, 0, 0, 1];
    mesh.scale = transform ? vec(transform.getAttribute('scale')) : [1, 1, 1];
    return mesh;
  }
  mesh.coordinatesIndices = ints(childText(el, 'coordinatesIdx'));
  mesh.texCoordinatesIndices = ints(childText(el, 'textCoordsIdx'));
  mesh.colorIndices = ints(childText(el, 'colorsIdx'));
  mesh.materialsIds = ints(childText(el, 'matIds'));
  mesh.vertices = floats(childText(el, 'vertices'));
  mesh.normals = floats(childText(el, 'normals'));
  mesh.uvs = floats(childText(el, 'texCoords'));
  mesh.colors = floats(childText(el, 'colors'));
  const lightIdx = child(el, 'textCoordsLightMapIdx');
  if (lightIdx && lightIdx.textContent.trim()) {
    mesh.lightmapIndices = ints(lightIdx.textContent);
    mesh.lightmapUvs = floats(childText(el, 'texCoordsLightMap'));
  }
  return mesh;
}

function parseTgcXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error('The scene XML could not be parsed');
  const root = doc.documentElement;
  const textures = child(root, 'texturesExport');
  const lightmaps = child(root, 'lightmapExport');
  const materials = child(root, 'materials');
  const meshes = child(root, 'meshes');
  return {
    name: childText(root, 'name').trim(),
    texturesDir: (textures && textures.getAttribute('dir')) || 'Textures',
    lightmapsDir: (lightmaps && lightmaps.getAttribute('dir')) || 'LightMaps',
    lightmapsEnabled: !!lightmaps && (lightmaps.getAttribute('enabled') || '').toLowerCase() === 'true',
    materials: materials
      ? [...materials.children].filter((node) => node.localName.toLowerCase() === 'm').map(parseMaterial)
      : [],
    meshes: meshes
      ? [...meshes.children].filter((node) => node.localName.toLowerCase() === 'mesh').map(parseMesh)
      : [],
  };
}

function subMaterialsOf(scene, materialId) {
  if (materialId < 0 || materialId >= scene.materials.length) return [null];
  const material = scene.materials[materialId];
  if (material.subMaterials && material.subMaterials.length) return material.subMaterials;
  return [material];
}

function expandMesh(mesh) {
  const coord = mesh.coordinatesIndices;
  if (!coord || coord.length % 3 !== 0) {
    throw new Error(`${mesh.name || 'mesh'}: triangle indices are not a multiple of 3`);
  }
  const vertices = mesh.vertices;
  const normals = mesh.normals;
  const uvs = mesh.uvs;
  const texIdx = mesh.texCoordinatesIndices.length ? mesh.texCoordinatesIndices : coord;
  const shared = normals.length === vertices.length && normals.length > 0;
  const triCount = coord.length / 3;
  const matIds = mesh.materialsIds;
  const materialOf = (tri) => {
    if (!matIds.length) return 0;
    if (matIds.length === 1) return matIds[0];
    return matIds[tri];
  };

  const positions = new Float32Array(triCount * 9);
  const outNormals = new Float32Array(triCount * 9);
  const outUvs = new Float32Array(triCount * 6);
  const outColors = new Float32Array(triCount * 9);
  let hasNormals = normals.length > 0;
  let colorVaries = false;
  let p = 0;
  let u = 0;
  let c = 0;
  const groups = [];
  const cornerOrder = new Int32Array(triCount * 3);
  let currentMat = null;
  let agreed = 0;
  let checked = 0;

  for (let tri = 0; tri < triCount; tri += 1) {
    const mat = materialOf(tri);
    if (mat !== currentMat) {
      groups.push({ material: mat, start: p / 3, count: 0 });
      currentMat = mat;
    }
    const raw = [tri * 3, tri * 3 + 1, tri * 3 + 2];
    const readPos = (corner) => {
      const vi = coord[corner];
      return [vertices[vi * 3], vertices[vi * 3 + 1], vertices[vi * 3 + 2]];
    };
    const readNrm = (corner) => {
      if (!hasNormals) return [0, 0, 0];
      const ni = shared ? coord[corner] : corner;
      return [normals[ni * 3], normals[ni * 3 + 1], normals[ni * 3 + 2]];
    };
    const pa = readPos(raw[0]);
    const pb = readPos(raw[1]);
    const pc = readPos(raw[2]);
    const na = readNrm(raw[0]);
    const ax0 = pb[0] - pa[0];
    const ay0 = pb[1] - pa[1];
    const az0 = pb[2] - pa[2];
    const bx0 = pc[0] - pa[0];
    const by0 = pc[1] - pa[1];
    const bz0 = pc[2] - pa[2];
    const faceDot = (ay0 * bz0 - az0 * by0) * na[0] + (az0 * bx0 - ax0 * bz0) * na[1] + (ax0 * by0 - ay0 * bx0) * na[2];
    const corners = hasNormals && faceDot < 0 ? [raw[0], raw[2], raw[1]] : raw;
    cornerOrder[tri * 3] = corners[0];
    cornerOrder[tri * 3 + 1] = corners[1];
    cornerOrder[tri * 3 + 2] = corners[2];
    const triPos = [];
    const triNrm = [];
    for (let k = 0; k < 3; k += 1) {
      const corner = corners[k];
      const vi = coord[corner];
      const px = vertices[vi * 3];
      const py = vertices[vi * 3 + 1];
      const pz = vertices[vi * 3 + 2];
      positions[p] = px;
      positions[p + 1] = py;
      positions[p + 2] = pz;
      triPos.push(px, py, pz);
      if (hasNormals) {
        const ni = shared ? vi : corner;
        const nx = normals[ni * 3];
        const ny = normals[ni * 3 + 1];
        const nz = normals[ni * 3 + 2];
        outNormals[p] = nx;
        outNormals[p + 1] = ny;
        outNormals[p + 2] = nz;
        if (k === 0) triNrm.push(nx, ny, nz);
      }
      p += 3;
      const ti = texIdx[corner] || 0;
      outUvs[u] = uvs[ti * 2] || 0;
      outUvs[u + 1] = uvs[ti * 2 + 1] || 0;
      u += 2;
      const ci = mesh.colorIndices.length > corner ? mesh.colorIndices[corner] : 0;
      const r = (mesh.colors[ci * 3] ?? 255) / 255;
      const g = (mesh.colors[ci * 3 + 1] ?? 255) / 255;
      const b = (mesh.colors[ci * 3 + 2] ?? 255) / 255;
      outColors[c] = r;
      outColors[c + 1] = g;
      outColors[c + 2] = b;
      c += 3;
      if (r < 0.98 || g < 0.98 || b < 0.98) colorVaries = true;
    }
    groups[groups.length - 1].count += 3;
    if (hasNormals) {
      const ax = triPos[3] - triPos[0];
      const ay = triPos[4] - triPos[1];
      const az = triPos[5] - triPos[2];
      const bx = triPos[6] - triPos[0];
      const by = triPos[7] - triPos[1];
      const bz = triPos[8] - triPos[2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const face = nx * nx + ny * ny + nz * nz;
      const stored = triNrm[0] * triNrm[0] + triNrm[1] * triNrm[1] + triNrm[2] * triNrm[2];
      if (face > 1e-10 && stored > 1e-10) {
        checked += 1;
        if (nx * triNrm[0] + ny * triNrm[1] + nz * triNrm[2] > 0) agreed += 1;
      }
    }
  }

  return {
    positions,
    normals: hasNormals ? outNormals : null,
    uvs: outUvs,
    colors: colorVaries ? outColors : null,
    groups,
    cornerOrder,
    triangles: triCount,
    agreement: checked ? agreed / checked : 1,
    checked,
  };
}

function textureCandidates(xmlDir, texturesDir, fileName) {
  const clean = fileName.replace(/\\/g, '/').replace(/^\.\//, '');
  const base = clean.split('/').pop();
  const dirs = [];
  for (const dir of [texturesDir, 'Textures', '']) {
    const normalized = (dir || '').replace(/\\/g, '/').replace(/^\/|\/$/g, '');
    if (!dirs.includes(normalized)) dirs.push(normalized);
  }
  const names = clean === base ? [base] : [clean, base];
  const out = [];
  const push = (rel) => {
    const joined = rel.replace(/\/+/g, '/').replace(/^\//, '');
    if (joined && !joined.split('/').includes('..') && !out.includes(joined)) out.push(joined);
  };
  for (const dir of dirs) {
    for (const name of names) push([xmlDir, dir, name].filter(Boolean).join('/'));
  }
  push(`Textures/${base}`);
  return out;
}



// TgcD3dDevice uses AlphaFunction Greater and ReferenceAlpha 100.
// Three discards when alpha < alphaTest, so the cutoff sits just above 100/255.
const ALPHA_TEST = 101 / 255;

function usesTextureAlpha(standard, meshAlpha) {
  return !!(meshAlpha || (standard && standard.alphaBlend));
}

// A mesh whose userProps name a materialMap (Textures/material.png, written
// by the procedural exporter) is drawn with a standard material: green is
// roughness and blue is metalness, cell by cell beside the diffuse palette.
// Sub-materials with their own tiled bitmap get a plain matte standard
// material so the whole mesh shades the same way. Everything else stays
// Lambert, as the original MeshCreator shader was.
function makeMaterial(standard, texture, { alpha, vertexColors, lightMap, materialMap, isPalette }) {
  const opacity = standard && standard.opacity > 0.01 && standard.opacity < 0.999 ? standard.opacity : 1;
  const shared = {
    map: texture || null,
    color: 0xffffff,
    side: alpha ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: alpha ? ALPHA_TEST : 0,
    transparent: alpha || opacity < 1,
    opacity,
    depthWrite: true,
    vertexColors,
    lightMap: lightMap || null,
  };
  const material = materialMap
    ? new THREE.MeshStandardMaterial({
      ...shared,
      roughnessMap: isPalette ? materialMap : null,
      metalnessMap: isPalette ? materialMap : null,
      roughness: isPalette ? 1 : 0.85,
      metalness: isPalette ? 1 : 0,
    })
    : new THREE.MeshLambertMaterial(shared);
  if (!texture && standard && standard.diffuse && standard.diffuse.length >= 3 && !vertexColors) {
    const max = Math.max(standard.diffuse[0], standard.diffuse[1], standard.diffuse[2], 1);
    // Diffuse in the file is 0..255. A black diffuse with no texture would hide the mesh,
    // and the original shader never applied it, so only use it when it is a real tint.
    if (max > 1) {
      material.color.setRGB(standard.diffuse[0] / 255, standard.diffuse[1] / 255, standard.diffuse[2] / 255);
    }
  }
  material.userData.alpha = alpha;
  return material;
}

function buildGeometry(expanded, lightUvs) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(expanded.positions, 3));
  if (expanded.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(expanded.normals, 3));
  else geometry.computeVertexNormals();
  geometry.setAttribute('uv', new THREE.BufferAttribute(expanded.uvs, 2));
  if (expanded.colors) geometry.setAttribute('color', new THREE.BufferAttribute(expanded.colors, 3));
  if (lightUvs) geometry.setAttribute('uv2', new THREE.BufferAttribute(lightUvs, 2));
  for (const group of expanded.groups) geometry.addGroup(group.start, group.count, group.material);
  geometry.computeBoundingSphere();
  return geometry;
}

function cloneTemplate(template) {
  const group = new THREE.Group();
  group.name = template.name;
  for (const childMesh of template.children) {
    if (!childMesh.isMesh) continue;
    const mesh = new THREE.Mesh(childMesh.geometry, childMesh.material);
    mesh.name = childMesh.name;
    mesh.castShadow = childMesh.castShadow;
    mesh.receiveShadow = childMesh.receiveShadow;
    group.add(mesh);
  }
  return group;
}

function applyInstance(object, mesh) {
  const p = mesh.position || [0, 0, 0];
  const q = mesh.rotation || [0, 0, 0, 1];
  const s = mesh.scale || [1, 1, 1];
  object.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
  object.quaternion.set(q[0] || 0, q[1] || 0, q[2] || 0, q.length > 3 ? q[3] : 1);
  object.scale.set(s[0] || 1, s[1] || 1, s[2] || 1);
}

export class TgcLoader {
  constructor({ fileRoot = '/games-3d/meshes/files/', anisotropy = 1, castShadow = true } = {}) {
    this.fileRoot = fileRoot.endsWith('/') ? fileRoot : `${fileRoot}/`;
    this.anisotropy = anisotropy;
    this.castShadow = castShadow;
  }

  static parse(xmlText) {
    return parseTgcXml(xmlText);
  }

  fileUrl(rel) {
    return this.fileRoot + String(rel).split('/').map(encodeURIComponent).join('/');
  }

  dispose(object) {
    TgcLoader.dispose(object);
  }

  static dispose(object) {
    if (!object) return;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      const list = node.material ? [].concat(node.material) : [];
      for (const material of list) {
        materials.add(material);
        for (const key of ['map', 'lightMap', 'emissiveMap', 'alphaMap']) {
          if (material[key]) textures.add(material[key]);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  async #loadTexture(url, { linear = false, anisotropy = 1, cache } = {}) {
    if (cache.has(url)) return cache.get(url);
    const pending = (async () => {
      const ext = url.split('?')[0].split('.').pop().toLowerCase();
      const tex = new THREE.Texture();
      tex.flipY = false;
      tex.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = anisotropy;
      if (ext === 'bmp' || ext === 'tga') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing texture ${url}`);
        tex.image = decodeImage(ext, await response.arrayBuffer());
        tex.needsUpdate = true;
        return tex;
      }
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Missing texture ${url}`));
        img.src = url;
      });
      tex.image = image;
      tex.needsUpdate = true;
      return tex;
    })();
    cache.set(url, pending);
    try {
      return await pending;
    } catch (err) {
      cache.delete(url);
      throw err;
    }
  }

  async #resolveTexture(xmlDir, texturesDir, fileName, options) {
    if (!fileName) return null;
    const candidates = textureCandidates(xmlDir, texturesDir, fileName);
    for (const rel of candidates) {
      const url = this.fileUrl(rel);
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) continue;
        const texture = await this.#loadTexture(url, options);
        texture.userData.fileName = fileName;
        texture.userData.sourceRel = rel;
        return texture;
      } catch {
        /* try the next location */
      }
    }
    return null;
  }

  async load(xmlText, options = {}) {
    const xmlDir = options.xmlDir || '';
    const anisotropy = options.anisotropy ?? this.anisotropy;
    const castShadow = options.castShadow ?? this.castShadow;
    const scene = parseTgcXml(xmlText);
  const textureCache = new Map();
  const root = new THREE.Group();
  root.name = scene.name || 'scene';
  root.userData.texturesDir = scene.texturesDir || 'Textures';
  root.userData.lightmapsDir = scene.lightmapsDir || 'LightMaps';
  const templates = new Array(scene.meshes.length);
  const missing = [];
  let triangles = 0;
  let agreed = 0;
  let checked = 0;
  const materialNames = new Set();
  const alphaNames = new Set();

  const materialFor = async (standard, meshAlpha) => {
    const fileName = standard && standard.fileName ? standard.fileName : '';
    const alpha = usesTextureAlpha(standard, meshAlpha);
    let texture = null;
    if (fileName) {
      texture = await this.#resolveTexture(xmlDir, scene.texturesDir, fileName, { anisotropy, cache: textureCache });
      if (!texture) missing.push(fileName);
    }
    if (standard && standard.name) materialNames.add(standard.name);
    if (alpha && standard && standard.name) alphaNames.add(standard.name);
    if (alpha && (!standard || !standard.name)) alphaNames.add(fileName || 'color');
    return { standard, texture, alpha, fileName };
  }

  for (let i = 0; i < scene.meshes.length; i += 1) {
    const mesh = scene.meshes[i];
    if (mesh.instanceType.toLowerCase() === 'instance') {
      let source = mesh.originalMesh;
      const seen = new Set();
      while (scene.meshes[source] && scene.meshes[source].instanceType.toLowerCase() === 'instance' && !seen.has(source)) {
        seen.add(source);
        source = scene.meshes[source].originalMesh;
      }
      const template = templates[source];
      if (!template) continue;
      const copy = cloneTemplate(template);
      copy.name = mesh.name || template.name;
      applyInstance(copy, mesh);
      const sourceMeta = template.userData.tgc || {};
      copy.userData.tgc = {
        ...sourceMeta,
        id: meshSerial(),
        layer: mesh.layer || sourceMeta.layer || '',
        alphaBlend: !!mesh.alphaBlend,
        lightmap: mesh.lightmap || sourceMeta.lightmap || '',
        userProperties: mesh.userProperties || {},
      };
      const inner = copy.children.find((child) => child.isMesh);
      if (inner) inner.name = copy.name;
      root.add(copy);
      continue;
    }

    const expanded = expandMesh(mesh);
    triangles += expanded.triangles;
    agreed += expanded.agreement * expanded.checked;
    checked += expanded.checked;
    const subs = subMaterialsOf(scene, mesh.materialId);
    const prepared = [];
    for (const standard of subs) {
      prepared.push(await materialFor(standard, mesh.alphaBlend));
    }
    let materialMap = null;
    const materialMapName = mesh.userProperties && mesh.userProperties.materialMap;
    if (materialMapName && options.materialMaps !== false) {
      materialMap = await this.#resolveTexture(xmlDir, scene.texturesDir, materialMapName, { linear: true, anisotropy: 1, cache: textureCache });
      if (materialMap) {
        materialMap.magFilter = THREE.NearestFilter;
        materialMap.minFilter = THREE.NearestFilter;
      }
    }
    let lightMap = null;
    let lightUvs = null;
    if (scene.lightmapsEnabled && mesh.lightmap && mesh.lightmapUvs) {
      lightMap = await this.#resolveTexture(xmlDir, scene.lightmapsDir, mesh.lightmap, { linear: true, anisotropy, cache: textureCache });
      if (mesh.lightmapIndices) {
        lightUvs = new Float32Array(expanded.triangles * 6);
        const idx = mesh.lightmapIndices;
        const src = mesh.lightmapUvs;
        let w = 0;
        for (let i = 0; i < expanded.cornerOrder.length; i += 1) {
          const ti = idx[expanded.cornerOrder[i]] || 0;
          lightUvs[w] = src[ti * 2] || 0;
          lightUvs[w + 1] = src[ti * 2 + 1] || 0;
          w += 2;
        }
      }
    }

    const materials = prepared.map((item, index) => {
      const standard = item.standard;
      const useVertex = !!expanded.colors && !(item.texture);
      let material;
      if (!standard && mesh.materialId < 0) {
        const color = mesh.color && mesh.color.length >= 3 ? mesh.color : [255, 255, 255];
        material = new THREE.MeshLambertMaterial({
          color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
          side: item.alpha ? THREE.DoubleSide : THREE.FrontSide,
          alphaTest: item.alpha ? ALPHA_TEST : 0,
          transparent: item.alpha,
          vertexColors: !!expanded.colors,
        });
        material.userData.alpha = item.alpha;
      } else {
        material = makeMaterial(standard, item.texture, {
          alpha: item.alpha,
          vertexColors: !!expanded.colors,
          lightMap: index === 0 ? lightMap : null,
          materialMap,
          isPalette: !!materialMap && index === 0,
        });
        if (useVertex) material.vertexColors = true;
      }
      if (lightMap && index > 0) material.lightMap = lightMap;
      if (standard) {
        material.userData.tgc = {
          name: standard.name || '',
          type: standard.type || 'Standardmaterial',
          ambient: standard.ambient && standard.ambient.length ? standard.ambient : [255, 255, 255, 255],
          diffuse: standard.diffuse && standard.diffuse.length ? standard.diffuse : [255, 255, 255, 255],
          specular: standard.specular && standard.specular.length ? standard.specular : [0, 0, 0, 255],
          opacity: standard.opacityPercent != null ? standard.opacityPercent : 100,
          alphaBlend: !!standard.alphaBlend,
          fileName: item.fileName || '',
          uvTiling: standard.uvTiling && standard.uvTiling.length >= 2 ? standard.uvTiling : [1, 1],
          uvOffset: standard.uvOffset && standard.uvOffset.length >= 2 ? standard.uvOffset : [0, 0],
        };
      }
      return material;
    });

    // addGroup material indices must match the materials array. A sub-material
    // id of 1 with only one parsed material would be out of range; pad with the last.
    const geometry = buildGeometry(expanded, lightUvs);
    const safe = materials.length ? materials : [new THREE.MeshLambertMaterial({ color: 0xff44aa })];
    for (const group of geometry.groups) {
      if (group.materialIndex >= safe.length) group.materialIndex = safe.length - 1;
    }
    const object = new THREE.Mesh(geometry, safe.length === 1 ? safe[0] : safe);
    object.name = mesh.name || scene.name;
    object.castShadow = castShadow;
    object.receiveShadow = true;
    const holder = new THREE.Group();
    holder.name = object.name;
    holder.userData.tgc = {
      id: meshSerial(),
      layer: mesh.layer || '',
      color: mesh.color && mesh.color.length >= 3 ? mesh.color.slice(0, 3) : [255, 255, 255],
      alphaBlend: !!mesh.alphaBlend,
      lightmap: mesh.lightmap || '',
      userProperties: mesh.userProperties || {},
      triangles: expanded.triangles,
      agreement: expanded.agreement,
      materialName: (scene.materials[mesh.materialId] && scene.materials[mesh.materialId].name) || '',
    };
    holder.add(object);
    templates[i] = holder;
    root.add(holder);
  }

  const instances = scene.meshes.filter((mesh) => mesh.instanceType.toLowerCase() === 'instance').length;
  return {
    object: root,
    stats: {
      name: scene.name,
      meshes: scene.meshes.length - instances,
      instances,
      triangles,
      normalAgreement: checked ? agreed / checked : 1,
      materials: [...materialNames],
      alpha: [...alphaNames],
      missing,
    },
  };
  }
}
