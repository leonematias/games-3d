/**
 * Point renderer, orbit camera, trails, and the placement preview.
 * Y is up. The orbit camera is free: it does not write physical coordinates.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GROUP_DROP_MAX, placementRing } from '../physics/groups.js';

const CLUSTER_COLORS = [
  [0.98, 0.84, 0.48],
  [0.45, 0.74, 1],
  [1, 0.48, 0.32],
  [0.52, 0.95, 0.78],
  [0.78, 0.56, 1],
  [1, 0.66, 0.78],
  [0.95, 0.95, 0.92],
  [0.62, 0.78, 0.95],
];

const VERT = `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    // Grow with distance, then stop. The cap follows the point-size setting and stays under 48 pixels.
    float size = aSize * (280.0 / max(1.0, -view.z));
    gl_PointSize = clamp(size, 1.0, min(48.0, aSize * 4.6));
  }
`;

const FRAG_CORE = `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 0.55) discard;
    float alpha = 1.0 - smoothstep(0.2, 0.5, r);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const FRAG_HALO = `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float rim = smoothstep(0.22, 0.48, r) * (1.0 - smoothstep(0.48, 0.92, r));
    gl_FragColor = vec4(vColor * rim * 0.55, 1.0);
  }
`;

export class SimulationRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.lost = false;
    this.follow = 'none';
    this.followAnchor = null;
    this._follow = new THREE.Vector3();
    this._followDelta = new THREE.Vector3();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x07090f, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);
    this.camera.position.set(16, 22, 36);
    this.camera.up.set(0, 1, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 8000;
    this.controls.zoomSpeed = 0.9;
    this.controls.update();

    this.capacity = 1024;
    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(this.capacity), 1);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.haloMaterial = spriteMaterial(FRAG_HALO, THREE.AdditiveBlending);
    this.coreMaterial = spriteMaterial(FRAG_CORE, THREE.NormalBlending);
    this.halos = new THREE.Points(this.geometry, this.haloMaterial);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 2;
    this.points = new THREE.Points(this.geometry, this.coreMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.scene.add(this.halos);
    this.scene.add(this.points);

    this.grid = new THREE.GridHelper(80, 40, 0x3d5c73, 0x1a2836);
    this.grid.position.y = 0;
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.selection = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0xd5ecff, wireframe: true, transparent: true, opacity: 0.85 }),
    );
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.radii = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.08, depthWrite: false }),
      this.capacity,
    );
    this.radii.count = 0;
    this.radii.frustumCulled = false;
    this.scene.add(this.radii);
    this.radiusDummy = new THREE.Object3D();

    this.preview = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x9fd0ff, wireframe: true, transparent: true, opacity: 0.7 }),
    );
    this.preview.visible = false;
    this.scene.add(this.preview);

    this.arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      1,
      0xf0c36a,
      0.35,
      0.22,
    );
    this.arrow.visible = false;
    this.scene.add(this.arrow);

    this.previewCapacity = GROUP_DROP_MAX;
    this.previewPositions = new Float32Array(this.previewCapacity * 3);
    this.previewColors = new Float32Array(this.previewCapacity * 3);
    this.previewSizes = new Float32Array(this.previewCapacity);
    this.previewGeometry = new THREE.BufferGeometry();
    this.previewGeometry.setAttribute('position', new THREE.BufferAttribute(this.previewPositions, 3));
    this.previewGeometry.setAttribute('color', new THREE.BufferAttribute(this.previewColors, 3));
    this.previewGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.previewSizes, 1));
    this.previewGeometry.setDrawRange(0, 0);
    this.previewGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.previewHalos = new THREE.Points(this.previewGeometry, this.haloMaterial);
    this.previewHalos.frustumCulled = false;
    this.previewHalos.renderOrder = 4;
    this.previewHalos.visible = false;
    this.previewPoints = new THREE.Points(this.previewGeometry, this.coreMaterial);
    this.previewPoints.frustumCulled = false;
    this.previewPoints.renderOrder = 5;
    this.previewPoints.visible = false;
    this.scene.add(this.previewHalos);
    this.scene.add(this.previewPoints);

    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.BufferAttribute(placementRing(64), 3));
    this.previewRing = new THREE.LineLoop(
      ringGeometry,
      new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.7 }),
    );
    this.previewRing.frustumCulled = false;
    this.previewRing.visible = false;
    this.scene.add(this.previewRing);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(48 * 240 * 2 * 3);
    this.trailColors = new Float32Array(48 * 240 * 2 * 3);
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    this.trailGeometry.setDrawRange(0, 0);
    this.trails = new THREE.LineSegments(
      this.trailGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }),
    );
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);
    this.trailSamples = new Map();
    this.trailTick = -1;

    this.pixelRatioCap = 1.5;
    this.quality = 'full';
    this._matrix = new THREE.Matrix4();
    this._onLost = (event) => {
      event.preventDefault();
      this.lost = true;
    };
    this._onRestored = () => {
      this.lost = false;
    };
    canvas.addEventListener('webglcontextlost', this._onLost);
    canvas.addEventListener('webglcontextrestored', this._onRestored);
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const ratio = this.quality === 'reduced' ? 1 : Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setVisual(settings) {
    this.pixelRatioCap = settings.pixelRatioMax;
    this.quality = settings.quality;
    this.follow = settings.follow;
    if (this.follow === 'none') this.followAnchor = null;
  }

  setCameraEnabled(enabled) {
    this.controls.enabled = enabled;
  }

  setRotateEnabled(enabled) {
    this.controls.enableRotate = enabled;
  }

  /**
   * Top view looks down -Y. camera.up is world -Z, so the top of the screen is world -Z.
   * Screen-right is world +X. Orbit view puts camera.up back on +Y.
   */
  setTopView() {
    const target = this.controls.target;
    const dist = Math.max(12, this.camera.position.distanceTo(target));
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(target.x, target.y + dist, target.z);
    this.camera.lookAt(target);
    this.controls.update();
    this.followAnchor = null;
  }

  setOrbitView() {
    const target = this.controls.target.clone();
    const dist = Math.max(12, this.camera.position.distanceTo(target));
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(target.x + dist * 0.35, target.y + dist * 0.42, target.z + dist * 0.8);
    this.camera.lookAt(target);
    this.controls.update();
    this.followAnchor = null;
  }

  frame(snapshot) {
    if (!snapshot || snapshot.count < 1) return;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < snapshot.count; i++) {
      const k = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        const value = snapshot.positions[k + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(1.5, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    this.camera.up.set(0, 1, 0);
    this.controls.target.set(center[0], center[1], center[2]);
    const dist = (radius / Math.tan((this.camera.fov * Math.PI / 180) / 2)) * 1.15;
    this.camera.position.set(center[0] + dist * 0.28, center[1] + dist * 0.42, center[2] + dist);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.followAnchor = null;
  }

  viewBasis() {
    this.camera.updateMatrixWorld(true);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    return { right, up, forward };
  }

  clearTrails() {
    this.trailSamples.clear();
    this.trailTick = -1;
    this.trailGeometry.setDrawRange(0, 0);
  }

  updateBodies(snapshot, settings) {
    const count = snapshot.count;
    const selected = settings.selectedId;
    let massMin = Infinity;
    let massMax = 0;
    let speedMax = 0.001;
    for (let i = 0; i < count; i++) {
      const mass = snapshot.masses[i];
      if (mass < massMin) massMin = mass;
      if (mass > massMax) massMax = mass;
      const k = i * 3;
      const speed = Math.hypot(snapshot.velocities[k], snapshot.velocities[k + 1], snapshot.velocities[k + 2]);
      if (speed > speedMax) speedMax = speed;
    }
    if (!Number.isFinite(massMin) || massMin <= 0) massMin = 1e-6;
    if (massMax <= massMin) massMax = massMin * 1.001;
    const pointScale = settings.quality === 'reduced' ? settings.pointScale * 0.75 : settings.pointScale;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      this.positionAttr.array[k] = snapshot.positions[k];
      this.positionAttr.array[k + 1] = snapshot.positions[k + 1];
      this.positionAttr.array[k + 2] = snapshot.positions[k + 2];
      const rgb = displayColor(settings.colorMode, snapshot, i, massMin, massMax, speedMax);
      const selectedBody = snapshot.ids[i] === selected;
      this.colorAttr.array[k] = selectedBody ? Math.min(1, rgb[0] + 0.35) : rgb[0];
      this.colorAttr.array[k + 1] = selectedBody ? Math.min(1, rgb[1] + 0.35) : rgb[1];
      this.colorAttr.array[k + 2] = selectedBody ? Math.min(1, rgb[2] + 0.35) : rgb[2];
      this.sizeAttr.array[i] = pointScale * (selectedBody ? 1.8 : 1);
      if (selectedBody) {
        this.selection.visible = true;
        this.selection.position.set(snapshot.positions[k], snapshot.positions[k + 1], snapshot.positions[k + 2]);
        const radius = Math.max(0.02, snapshot.radii[i]);
        this.selection.scale.setScalar(radius);
      }
    }
    if (selected == null || snapshot.indexOf(selected) < 0) this.selection.visible = false;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
    this.updateRadii(snapshot, settings.showRadii);
    this.updateTrails(snapshot, settings);
  }

  updateRadii(snapshot, show) {
    if (!show || snapshot.count < 1) {
      this.radii.count = 0;
      return;
    }
    const count = Math.min(snapshot.count, this.capacity);
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const radius = Math.max(0.02, snapshot.radii[i]);
      this.radiusDummy.position.set(snapshot.positions[k], snapshot.positions[k + 1], snapshot.positions[k + 2]);
      this.radiusDummy.scale.setScalar(radius);
      this.radiusDummy.updateMatrix();
      this.radii.setMatrixAt(i, this.radiusDummy.matrix);
    }
    this.radii.count = count;
    this.radii.instanceMatrix.needsUpdate = true;
  }

  updateTrails(snapshot, settings) {
    const enabled = settings.trails && settings.quality !== 'reduced';
    if (!enabled) {
      this.trailGeometry.setDrawRange(0, 0);
      return;
    }
    if (snapshot.generation !== this.trailGeneration) {
      this.trailSamples.clear();
    } else if (snapshot.futureReplaced || snapshot.tick < this.trailTick) {
      this.truncateTrails(snapshot.tick);
    }
    this.trailGeneration = snapshot.generation;
    this.trailTick = snapshot.tick;
    const tracked = trailIds(snapshot, settings);
    const keep = new Set(tracked);
    for (const id of this.trailSamples.keys()) {
      if (!keep.has(id)) this.trailSamples.delete(id);
    }
    for (const id of tracked) {
      const index = snapshot.indexOf(id);
      if (index < 0) {
        this.trailSamples.delete(id);
        continue;
      }
      let samples = this.trailSamples.get(id);
      if (!samples) this.trailSamples.set(id, samples = []);
      const k = index * 3;
      const point = {
        tick: snapshot.tick,
        x: snapshot.positions[k],
        y: snapshot.positions[k + 1],
        z: snapshot.positions[k + 2],
      };
      const last = samples[samples.length - 1];
      if (!last || last.tick < point.tick) samples.push(point);
      else if (last.tick > point.tick) {
        while (samples.length && samples[samples.length - 1].tick > point.tick) samples.pop();
        samples.push(point);
      } else if (snapshot.futureReplaced) {
        samples[samples.length - 1] = point;
      }
      while (samples.length > settings.trailLength) samples.shift();
    }
    this.writeTrailLines(snapshot, settings);
  }

  truncateTrails(tick) {
    for (const samples of this.trailSamples.values()) {
      while (samples.length && samples[samples.length - 1].tick > tick) samples.pop();
    }
  }

  writeTrailLines(snapshot, settings) {
    let vertex = 0;
    const maxVertices = this.trailPositions.length / 3;
    for (const [id, samples] of this.trailSamples) {
      const index = snapshot.indexOf(id);
      if (index < 0 || samples.length < 2) continue;
      const rgb = displayColor(settings.colorMode, snapshot, index, snapshot._massMin || 1e-6, snapshot._massMax || 1, snapshot._speedMax || 1);
      for (let i = 1; i < samples.length; i++) {
        if (vertex + 2 > maxVertices) break;
        const a = samples[i - 1];
        const b = samples[i];
        const fade = i / samples.length;
        writeVertex(this.trailPositions, this.trailColors, vertex, a, rgb, fade * 0.35);
        vertex += 1;
        writeVertex(this.trailPositions, this.trailColors, vertex, b, rgb, fade);
        vertex += 1;
      }
    }
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, vertex);
  }

  setPreview(preview) {
    this.grid.visible = preview.active;
    this.grid.position.y = preview.height;
    const show = Boolean(preview.active && preview.available);
    const bodies = show && preview.group && preview.group.bodies;
    const hasGroup = Boolean(bodies && bodies.length);
    this.preview.visible = show && !hasGroup;
    this.previewHalos.visible = hasGroup;
    this.previewPoints.visible = hasGroup;
    this.previewRing.visible = hasGroup;
    if (!show) {
      this.arrow.visible = false;
      return;
    }
    if (hasGroup) {
      this.writePreviewGroup(bodies);
      const extent = Math.max(0.05, preview.group.extent || 0.05);
      this.previewRing.scale.set(extent, extent, extent);
      // A hair above the grid so the guide line does not z-fight the helper.
      this.previewRing.position.set(preview.position[0], preview.position[1] + 0.02, preview.position[2]);
    } else {
      this.preview.position.set(preview.position[0], preview.position[1], preview.position[2]);
      this.preview.scale.setScalar(Math.max(0.05, preview.radius));
    }
    const speed = Math.hypot(preview.velocity[0], preview.velocity[1], preview.velocity[2]);
    if (speed < 1e-4) {
      this.arrow.visible = false;
      return;
    }
    this.arrow.visible = true;
    this.arrow.position.set(preview.position[0], preview.position[1], preview.position[2]);
    this.arrow.setDirection(new THREE.Vector3(
      preview.velocity[0] / speed,
      preview.velocity[1] / speed,
      preview.velocity[2] / speed,
    ));
    const length = Math.max(0.4, Math.min(40, speed / Math.max(0.05, preview.scale)));
    this.arrow.setLength(length, Math.min(0.8, length * 0.25), Math.min(0.45, length * 0.16));
  }

  /** Body positions are already in world space. The ring stays a unit circle in XZ, scaled by the extent. */
  writePreviewGroup(bodies) {
    const n = Math.min(bodies.length, this.previewCapacity);
    const pos = this.previewPositions;
    const col = this.previewColors;
    const size = this.previewSizes;
    let heaviest = 0;
    for (let i = 1; i < n; i++) if (bodies[i].mass > bodies[heaviest].mass) heaviest = i;
    for (let i = 0; i < n; i++) {
      const body = bodies[i];
      const k = i * 3;
      pos[k] = body.position[0];
      pos[k + 1] = body.position[1];
      pos[k + 2] = body.position[2];
      col[k] = body.color[0];
      col[k + 1] = body.color[1];
      col[k + 2] = body.color[2];
      const gain = i === heaviest ? 9 : 4.2;
      size[i] = gain;
    }
    this.previewGeometry.setDrawRange(0, n);
    this.previewGeometry.attributes.position.needsUpdate = true;
    this.previewGeometry.attributes.color.needsUpdate = true;
    this.previewGeometry.attributes.aSize.needsUpdate = true;
  }

  followTarget(point) {
    if (!point || this.follow === 'none') return;
    this._follow.set(point.x, point.y, point.z);
    if (!this.followAnchor) {
      this.followAnchor = this._follow.clone();
      return;
    }
    this._followDelta.copy(this._follow).sub(this.followAnchor);
    this.camera.position.add(this._followDelta);
    this.controls.target.add(this._followDelta);
    this.followAnchor.copy(this._follow);
  }

  render(snapshot, settings, preview, followPoint) {
    if (this.lost) return;
    if (snapshot) this.updateBodies(snapshot, settings);
    this.setPreview(preview);
    this.follow = settings.follow;
    this.followTarget(followPoint);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.controls.dispose();
    this.geometry.dispose();
    this.haloMaterial.dispose();
    this.coreMaterial.dispose();
    this.trailGeometry.dispose();
    this.trails.material.dispose();
    this.selection.geometry.dispose();
    this.selection.material.dispose();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.previewGeometry.dispose();
    this.previewRing.geometry.dispose();
    this.previewRing.material.dispose();
    this.radii.geometry.dispose();
    this.radii.material.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.renderer.dispose();
  }
}

function spriteMaterial(fragmentShader, blending) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
    vertexColors: true,
  });
}

function displayColor(mode, snapshot, index, massMin, massMax, speedMax) {
  snapshot._massMin = massMin;
  snapshot._massMax = massMax;
  snapshot._speedMax = speedMax;
  if (mode === 'mass') {
    const t = Math.log(Math.max(snapshot.masses[index], 1e-8) / massMin) / Math.log(massMax / massMin);
    return lerp([0.28, 0.48, 0.95], [0.98, 0.78, 0.35], clamp01(t));
  }
  if (mode === 'speed') {
    const k = index * 3;
    const speed = Math.hypot(snapshot.velocities[k], snapshot.velocities[k + 1], snapshot.velocities[k + 2]);
    return lerp([0.18, 0.28, 0.55], [1, 0.93, 0.82], clamp01(speed / speedMax));
  }
  return CLUSTER_COLORS[Math.abs(snapshot.clusters[index]) % CLUSTER_COLORS.length];
}

function trailIds(snapshot, settings) {
  if (settings.trailMode === 'sample') {
    const ranked = [];
    for (let i = 0; i < snapshot.count; i++) ranked.push([snapshot.masses[i], snapshot.ids[i]]);
    ranked.sort((a, b) => b[0] - a[0]);
    return ranked.slice(0, 32).map((row) => row[1]);
  }
  return settings.selectedId == null ? [] : [settings.selectedId];
}

function writeVertex(positions, colors, vertex, point, rgb, fade) {
  const k = vertex * 3;
  positions[k] = point.x;
  positions[k + 1] = point.y;
  positions[k + 2] = point.z;
  colors[k] = rgb[0] * fade;
  colors[k + 1] = rgb[1] * fade;
  colors[k + 2] = rgb[2] * fade;
}

function lerp(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function pointerRay(camera, canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const origin = new THREE.Vector3();
  const end = new THREE.Vector3(ndcX, ndcY, 0.5);
  origin.setFromMatrixPosition(camera.matrixWorld);
  end.unproject(camera);
  const direction = end.sub(origin).normalize();
  return {
    origin: [origin.x, origin.y, origin.z],
    direction: [direction.x, direction.y, direction.z],
  };
}

export function pickBody(camera, canvas, event, snapshot, pixelRadius = 16) {
  if (!snapshot || snapshot.count < 1) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const point = new THREE.Vector3();
  let best = null;
  let bestD = pixelRadius * pixelRadius;
  let bestDepth = Infinity;
  for (let i = 0; i < snapshot.count; i++) {
    const k = i * 3;
    point.set(snapshot.positions[k], snapshot.positions[k + 1], snapshot.positions[k + 2]).project(camera);
    if (point.z < -1 || point.z > 1) continue;
    const sx = (point.x * 0.5 + 0.5) * rect.width;
    const sy = (-point.y * 0.5 + 0.5) * rect.height;
    const dx = sx - x;
    const dy = sy - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD && point.z < bestDepth) {
      bestD = d2;
      bestDepth = point.z;
      best = snapshot.ids[i];
    }
  }
  return best;
}
