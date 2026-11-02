import * as THREE from 'three';

// Particles are billboarded quads drawn with one InstancedBufferGeometry per
// pool (fire, smoke, sparks). Each particle has a position, velocity, size
// curve, colour ramp and alpha curve updated on the CPU every frame.

const VERT = `
  attribute vec3 offset;
  attribute float psize;
  attribute float rot;
  attribute vec3 pcolor;
  attribute float palpha;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vColor = pcolor;
    vAlpha = palpha;
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    float c = cos(rot), s = sin(rot);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * psize;
    mv.xy += p;
    gl_Position = projectionMatrix * mv;
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
  }
`;
const FRAG = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    #include <fog_fragment>
  }
`;

function fireTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,230,160,0.9)');
  g.addColorStop(0.55, 'rgba(255,120,30,0.45)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Break the disc with a few dark blotches so overlapping flames look ragged.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = size * (0.28 + Math.random() * 0.2);
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rr = size * (0.06 + Math.random() * 0.1);
    const d = ctx.createRadialGradient(x, y, 0, x, y, rr);
    d.addColorStop(0, 'rgba(0,0,0,0.75)');
    d.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = d;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function smokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * size * 0.26;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rr = size * (0.14 + Math.random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sparkTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Pool {
  constructor(scene, capacity, texture, { additive = true, fog = false } = {}) {
    this.capacity = capacity;
    this.count = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    this.offset = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.InstancedBufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.InstancedBufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.InstancedBufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('palpha', new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]);
    uniforms.map.value = texture;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 24;
    scene.add(this.mesh);
    // Per-particle simulation state.
    this.px = new Float32Array(capacity * 3);
    this.vx = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.c0 = new Float32Array(capacity * 3);
    this.c1 = new Float32Array(capacity * 3);
    this.a0 = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.fadeIn = new Float32Array(capacity);
  }

  emit(p) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.px[i * 3] = p.x; this.px[i * 3 + 1] = p.y; this.px[i * 3 + 2] = p.z;
    this.vx[i * 3] = p.vx || 0; this.vx[i * 3 + 1] = p.vy || 0; this.vx[i * 3 + 2] = p.vz || 0;
    this.age[i] = 0;
    this.life[i] = p.life;
    this.s0[i] = p.size;
    this.s1[i] = p.sizeEnd ?? p.size;
    const c0 = p.color, c1 = p.colorEnd || p.color;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = p.alpha ?? 1;
    this.rot[i] = p.rot ?? Math.random() * Math.PI * 2;
    this.spin[i] = p.spin ?? (Math.random() - 0.5) * 2;
    this.drag[i] = p.drag ?? 0;
    this.grav[i] = p.gravity ?? 0;
    this.fadeIn[i] = p.fadeIn ?? 0.08;
  }

  remove(i) {
    const j = --this.count;
    if (i === j) return;
    for (let k = 0; k < 3; k++) {
      this.px[i * 3 + k] = this.px[j * 3 + k];
      this.vx[i * 3 + k] = this.vx[j * 3 + k];
      this.c0[i * 3 + k] = this.c0[j * 3 + k];
      this.c1[i * 3 + k] = this.c1[j * 3 + k];
    }
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.a0[i] = this.a0[j]; this.rot[i] = this.rot[j]; this.spin[i] = this.spin[j]; this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j]; this.fadeIn[i] = this.fadeIn[j];
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.remove(i); i--; continue; }
      const t = this.age[i] / this.life[i];
      const d = this.drag[i] > 0 ? Math.max(0, 1 - this.drag[i] * dt) : 1;
      this.vx[i * 3 + 1] -= this.grav[i] * dt;
      this.vx[i * 3] *= d; this.vx[i * 3 + 1] *= d; this.vx[i * 3 + 2] *= d;
      this.px[i * 3] += this.vx[i * 3] * dt;
      this.px[i * 3 + 1] += this.vx[i * 3 + 1] * dt;
      this.px[i * 3 + 2] += this.vx[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      this.offset[i * 3] = this.px[i * 3]; this.offset[i * 3 + 1] = this.px[i * 3 + 1]; this.offset[i * 3 + 2] = this.px[i * 3 + 2];
      const ease = 1 - (1 - t) * (1 - t);
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * ease;
      const fi = this.fadeIn[i];
      const fade = t < fi ? t / fi : 1 - (t - fi) / (1 - fi);
      this.alpha[i] = this.a0[i] * Math.max(0, fade);
      for (let k = 0; k < 3; k++) this.color[i * 3 + k] = this.c0[i * 3 + k] + (this.c1[i * 3 + k] - this.c0[i * 3 + k]) * t;
    }
    this.geo.instanceCount = this.count;
    for (const name of ['offset', 'psize', 'rot', 'pcolor', 'palpha']) this.geo.attributes[name].needsUpdate = true;
  }
}

const C = (hex) => new THREE.Color(hex);
const FIRE_HOT = C(0xffd990), FIRE_MID = C(0xff7a18), FIRE_END = C(0x6a1a04);
const SMOKE_DARK = C(0x2a2622), SMOKE_LIGHT = C(0x6c6560), DUST = C(0x9a8364);
const SPARK = C(0xffe29a), SPARK_END = C(0xff5a1a);
const _dir = new THREE.Vector3();

export function createFx(scene) {
  const fire = new Pool(scene, 2400, fireTexture(), { additive: true });
  const smoke = new Pool(scene, 2400, smokeTexture(), { additive: false, fog: true });
  const sparks = new Pool(scene, 1600, sparkTexture(), { additive: true });

  // Shockwave rings.
  const ringGeo = new THREE.RingGeometry(0.7, 1, 48);
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    m.renderOrder = 21;
    scene.add(m);
    rings.push({ mesh: m, age: 0, life: 0, size: 0 });
  }

  // Debris chunks.
  const DEBRIS = 260;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8, metalness: 0.4 }), DEBRIS);
  debris.castShadow = true;
  debris.frustumCulled = false;
  debris.count = 0;
  scene.add(debris);
  const dPos = new Float32Array(DEBRIS * 3), dVel = new Float32Array(DEBRIS * 3), dRot = new Float32Array(DEBRIS * 3), dSpin = new Float32Array(DEBRIS * 3);
  const dAge = new Float32Array(DEBRIS), dLife = new Float32Array(DEBRIS), dSize = new Float32Array(DEBRIS);
  let dCount = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

  // Flash lights.
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const l = new THREE.PointLight(0xffa040, 0, 400, 1.6);
    l.visible = false;
    scene.add(l);
    lights.push({ light: l, age: 0, life: 0, peak: 0 });
  }
  let lightIdx = 0;

  const burners = [];
  let shake = 0;
  let groundAt = () => -1e9;
  // Camera shake falls off with distance from the listener (the player).
  const listener = new THREE.Vector3(0, -1e9, 0);
  function shakeAt(pos, amount, reach = 140) {
    const d = pos.distanceTo(listener);
    const k = Math.max(0, 1 - d / reach);
    shake = Math.min(1.5, shake + amount * k * k);
  }

  // Rubble: chunks that fly, bounce on the ground and stay put (walls, towers).
  const RUBBLE = 500;
  const rubbleGeo = new THREE.BoxGeometry(1, 1, 1);
  const rubble = new THREE.InstancedMesh(rubbleGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), RUBBLE);
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  rubble.frustumCulled = false;
  rubble.count = 0;
  rubble.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RUBBLE * 3), 3);
  scene.add(rubble);
  const rPos = new Float32Array(RUBBLE * 3), rVel = new Float32Array(RUBBLE * 3), rRot = new Float32Array(RUBBLE * 3), rSpin = new Float32Array(RUBBLE * 3), rSize = new Float32Array(RUBBLE * 3);
  const rState = new Uint8Array(RUBBLE); // 0 flying, 1 settled
  const rBounces = new Uint8Array(RUBBLE);
  let rCount = 0;
  let rNext = 0;
  let onSettle = null;
  function rubbleBurst(pos, count, color, size, speed = 10) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      // Reuse the oldest slot when the pool is full.
      const k = rCount < RUBBLE ? rCount++ : (rNext++ % RUBBLE);
      rPos[k * 3] = pos.x + (Math.random() - 0.5) * 2; rPos[k * 3 + 1] = pos.y + Math.random() * 2; rPos[k * 3 + 2] = pos.z + (Math.random() - 0.5) * 2;
      _dir.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      rVel[k * 3] = _dir.x; rVel[k * 3 + 1] = _dir.y; rVel[k * 3 + 2] = _dir.z;
      rRot[k * 3] = Math.random() * 6; rRot[k * 3 + 1] = Math.random() * 6; rRot[k * 3 + 2] = Math.random() * 6;
      rSpin[k * 3] = (Math.random() - 0.5) * 10; rSpin[k * 3 + 1] = (Math.random() - 0.5) * 10; rSpin[k * 3 + 2] = (Math.random() - 0.5) * 10;
      rSize[k * 3] = size * (0.5 + Math.random()); rSize[k * 3 + 1] = size * (0.3 + Math.random() * 0.6); rSize[k * 3 + 2] = size * (0.5 + Math.random());
      rState[k] = 0; rBounces[k] = 0;
      const shade = 0.75 + Math.random() * 0.35;
      rubble.instanceColor.setXYZ(k, c.r * shade, c.g * shade, c.b * shade);
    }
    rubble.instanceColor.needsUpdate = true;
  }

  function flash(pos, { intensity = 400, life = 0.45, color = 0xffa040, distance = 500 } = {}) {
    const slot = lights[lightIdx++ % lights.length];
    slot.light.position.copy(pos);
    slot.light.color.setHex(color);
    slot.light.distance = distance;
    slot.light.visible = true;
    slot.age = 0; slot.life = life; slot.peak = intensity;
  }

  function ring(pos, size, { life = 0.7, color = 0xffd090, flat = false, normal = null } = {}) {
    const slot = rings.find((r) => !r.mesh.visible) || rings[0];
    slot.mesh.position.copy(pos);
    slot.mesh.material.color.setHex(color);
    slot.flat = flat;
    if (flat) slot.mesh.rotation.set(-Math.PI / 2, 0, 0);
    else if (normal) slot.mesh.lookAt(pos.clone().add(normal));
    slot.mesh.visible = true;
    slot.age = 0; slot.life = life; slot.size = size;
  }

  function debrisBurst(pos, count, speed, size) {
    for (let i = 0; i < count && dCount < DEBRIS; i++) {
      const k = dCount++;
      dPos[k * 3] = pos.x; dPos[k * 3 + 1] = pos.y; dPos[k * 3 + 2] = pos.z;
      _dir.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      dVel[k * 3] = _dir.x; dVel[k * 3 + 1] = _dir.y; dVel[k * 3 + 2] = _dir.z;
      dRot[k * 3] = Math.random() * 6; dRot[k * 3 + 1] = Math.random() * 6; dRot[k * 3 + 2] = Math.random() * 6;
      dSpin[k * 3] = (Math.random() - 0.5) * 12; dSpin[k * 3 + 1] = (Math.random() - 0.5) * 12; dSpin[k * 3 + 2] = (Math.random() - 0.5) * 12;
      dAge[k] = 0; dLife[k] = 2.5 + Math.random() * 2.5; dSize[k] = size * (0.5 + Math.random());
    }
  }

  // A fireball with a smoke crown, debris, a shockwave and a flash.
  // `size` is roughly the fireball radius in metres.
  function explosion(pos, { size = 14, ground = false, velocity = null } = {}) {
    fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.22, size: size * 1.2, sizeEnd: size * 2.6, color: C(0xfff4e0), colorEnd: FIRE_HOT, alpha: 0.7, fadeIn: 0.04, spin: 0 });
    fire.emit({ x: pos.x, y: pos.y + size * 0.3, z: pos.z, life: 0.9, size: size * 0.8, sizeEnd: size * 2.2, color: FIRE_HOT, colorEnd: FIRE_END, alpha: 0.5, fadeIn: 0.06, spin: 0.4 });
    const n = Math.round(size * 2.2);
    for (let i = 0; i < n; i++) {
      _dir.set(Math.random() - 0.5, Math.random() - 0.5 + (ground ? 0.45 : 0.05), Math.random() - 0.5).normalize();
      const spd = size * (0.6 + Math.random() * 1.6);
      fire.emit({
        x: pos.x + _dir.x * size * 0.2, y: pos.y + _dir.y * size * 0.2, z: pos.z + _dir.z * size * 0.2,
        vx: _dir.x * spd + (velocity ? velocity.x * 0.3 : 0), vy: _dir.y * spd + (velocity ? velocity.y * 0.3 : 0), vz: _dir.z * spd + (velocity ? velocity.z * 0.3 : 0),
        life: 0.45 + Math.random() * 0.8, size: size * (0.35 + Math.random() * 0.5), sizeEnd: size * (1.1 + Math.random() * 1.2),
        color: Math.random() < 0.3 ? FIRE_HOT : FIRE_MID, colorEnd: FIRE_END, alpha: 0.5, drag: 2.6, fadeIn: 0.04, gravity: -size * 0.8
      });
    }
    const ns = Math.round(size * 1.4);
    for (let i = 0; i < ns; i++) {
      _dir.set(Math.random() - 0.5, Math.random() * 0.7 + (ground ? 0.5 : 0.1), Math.random() - 0.5).normalize();
      const spd = size * (0.5 + Math.random() * 1.2);
      smoke.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: _dir.x * spd, vy: _dir.y * spd + size * 0.3, vz: _dir.z * spd,
        life: 2.4 + Math.random() * 3, size: size * 0.5, sizeEnd: size * (2.4 + Math.random() * 1.8),
        color: ground ? DUST : (Math.random() < 0.5 ? SMOKE_DARK : SMOKE_LIGHT), colorEnd: C(0x1a1816), alpha: ground ? 0.8 : 0.7, drag: 1.6, fadeIn: 0.25, spin: (Math.random() - 0.5) * 1.2
      });
    }
    const nk = Math.round(size * 2.5);
    for (let i = 0; i < nk; i++) {
      _dir.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const spd = size * (2.5 + Math.random() * 4);
      sparks.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: _dir.x * spd, vy: _dir.y * spd, vz: _dir.z * spd,
        life: 0.6 + Math.random() * 0.9, size: 0.6 + Math.random() * 1.2, sizeEnd: 0.1, color: SPARK, colorEnd: SPARK_END, gravity: 45, drag: 0.6, fadeIn: 0.02
      });
    }
    debrisBurst(pos, Math.round(size * 0.5), size * 3.2, size * 0.05);
    ring(pos, size * 1.4, { life: 0.5 + size * 0.01, flat: ground });
    if (ground) ring(pos, size * 0.8, { life: 0.9, color: 0xc8a070, flat: true });
    flash(pos, { intensity: size * 90, life: 0.4 + size * 0.01, distance: size * 40 });
    shakeAt(pos, size * 0.09, 60 + size * 6);
  }

  // Short-lived sparks when a shell hits metal.
  function hitSparks(pos, dir, amount = 10) {
    const n = Math.round(amount * 1.8);
    for (let i = 0; i < n; i++) {
      _dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 16);
      if (dir) _dir.addScaledVector(dir, -6 - Math.random() * 8);
      sparks.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: _dir.x, vy: _dir.y, vz: _dir.z,
        life: 0.3 + Math.random() * 0.5, size: 0.25 + Math.random() * 0.35, sizeEnd: 0.05, color: Math.random() < 0.5 ? C(0xffffff) : SPARK, colorEnd: SPARK_END, gravity: 25, drag: 0.8, fadeIn: 0.02
      });
    }
    fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.14, size: 1.2, sizeEnd: 2.6, color: C(0xfff8e0), colorEnd: FIRE_MID, alpha: 0.85, fadeIn: 0.05 });
    fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.35, size: 0.8, sizeEnd: 1.8, color: FIRE_MID, colorEnd: FIRE_END, alpha: 0.6, fadeIn: 0.1 });
    smoke.emit({ x: pos.x, y: pos.y, z: pos.z, life: 1.2, size: 0.7, sizeEnd: 2.4, color: SMOKE_DARK, colorEnd: SMOKE_DARK, alpha: 0.45 });
    if (Math.random() < 0.4) debrisBurst(pos, 2, 9, 0.18);
    flash(pos, { intensity: 60, life: 0.12, distance: 25 });
  }

  // One puff of a missile exhaust trail.
  function trail(pos, vel, { size = 1.2, life = 1.6, color = SMOKE_LIGHT } = {}) {
    smoke.emit({
      x: pos.x, y: pos.y, z: pos.z, vx: vel ? vel.x * 0.05 + (Math.random() - 0.5) : 0, vy: vel ? vel.y * 0.05 + 0.5 : 0.5, vz: vel ? vel.z * 0.05 + (Math.random() - 0.5) : 0,
      life, size, sizeEnd: size * 4, color, colorEnd: SMOKE_LIGHT, alpha: 0.5, fadeIn: 0.05
    });
  }
  function exhaustFire(pos, size = 1.5) {
    fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.18, size, sizeEnd: size * 0.4, color: FIRE_HOT, colorEnd: FIRE_MID, alpha: 0.8, fadeIn: 0.05 });
  }

  // A smoke trail with embers from a damaged plane.
  function damageSmoke(pos, vel) {
    smoke.emit({
      x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.1, vy: 1 + vel.y * 0.1, vz: vel.z * 0.1,
      life: 2.2, size: 2, sizeEnd: 9, color: SMOKE_DARK, colorEnd: SMOKE_DARK, alpha: 0.6
    });
    if (Math.random() < 0.5) fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.3, size: 2.5, sizeEnd: 0.5, color: FIRE_MID, colorEnd: FIRE_END, alpha: 0.8 });
  }

  // A fire that keeps burning on a wreck for `duration` seconds.
  function burn(pos, { size = 8, duration = 40 } = {}) {
    const b = { pos: pos.clone(), size, left: duration, acc: 0 };
    burners.push(b);
    return b;
  }

  // Dust kicked up along the ground under a low fast plane or a bomb run.
  function dust(pos, amount = 3) {
    for (let i = 0; i < amount; i++) {
      smoke.emit({
        x: pos.x + (Math.random() - 0.5) * 3, y: pos.y + 0.4, z: pos.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 2, vy: 0.6 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 2,
        life: 1.4 + Math.random(), size: 1.2, sizeEnd: 4.5, color: DUST, colorEnd: DUST, alpha: 0.22
      });
    }
  }

  // EMP: a blue-white burst with electric sparks.
  function emp(pos, radius) {
    shell.position.copy(pos);
    shell.visible = true;
    shellAge = 0; shellLife = 1.1; shellSize = radius;
    for (let i = 0; i < 160; i++) {
      _dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(radius * (0.8 + Math.random() * 0.6));
      sparks.emit({ x: pos.x, y: pos.y, z: pos.z, vx: _dir.x, vy: _dir.y, vz: _dir.z, life: 0.8, size: 2, sizeEnd: 0.2, color: C(0xc8f0ff), colorEnd: C(0x3080ff), fadeIn: 0.05 });
    }
    flash(pos, { intensity: 2500, life: 0.6, color: 0x80c0ff, distance: radius * 2 });
    shake = Math.min(1.5, shake + 0.3);
  }

  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  shell.visible = false;
  shell.renderOrder = 22;
  scene.add(shell);
  let shellAge = 0, shellLife = 0, shellSize = 0;

  function update(dt, camera) {
    fire.update(dt);
    smoke.update(dt);
    sparks.update(dt);
    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { r.mesh.visible = false; continue; }
      const s = r.size * (0.2 + 0.8 * Math.sqrt(t));
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = (1 - t) * 0.7;
      if (!r.flat && camera) r.mesh.lookAt(camera.position);
    }
    if (shell.visible) {
      shellAge += dt;
      const t = shellAge / shellLife;
      if (t >= 1) shell.visible = false;
      else {
        const s = shellSize * (0.1 + 0.9 * Math.sqrt(t));
        shell.scale.set(s, s, s);
        shell.material.opacity = (1 - t) * 0.28;
      }
    }
    for (const l of lights) {
      if (!l.light.visible) continue;
      l.age += dt;
      const t = l.age / l.life;
      if (t >= 1) { l.light.visible = false; l.light.intensity = 0; continue; }
      l.light.intensity = l.peak * (1 - t) * (1 - t);
    }
    for (let i = 0; i < dCount; i++) {
      dAge[i] += dt;
      const g = groundAt(dPos[i * 3], dPos[i * 3 + 2]);
      if (dAge[i] >= dLife[i] || dPos[i * 3 + 1] < g) {
        if (dPos[i * 3 + 1] < g && Math.random() < 0.6) {
          _p.set(dPos[i * 3], g + 0.5, dPos[i * 3 + 2]);
          dust(_p, 1);
        }
        const j = --dCount;
        for (let k = 0; k < 3; k++) { dPos[i * 3 + k] = dPos[j * 3 + k]; dVel[i * 3 + k] = dVel[j * 3 + k]; dRot[i * 3 + k] = dRot[j * 3 + k]; dSpin[i * 3 + k] = dSpin[j * 3 + k]; }
        dAge[i] = dAge[j]; dLife[i] = dLife[j]; dSize[i] = dSize[j];
        i--;
        continue;
      }
      dVel[i * 3 + 1] -= 30 * dt;
      for (let k = 0; k < 3; k++) { dPos[i * 3 + k] += dVel[i * 3 + k] * dt; dRot[i * 3 + k] += dSpin[i * 3 + k] * dt; }
      if (Math.random() < dt * 6) {
        _p.set(dPos[i * 3], dPos[i * 3 + 1], dPos[i * 3 + 2]);
        smoke.emit({ x: _p.x, y: _p.y, z: _p.z, life: 1.0, size: dSize[i] * 1.2, sizeEnd: dSize[i] * 4, color: SMOKE_DARK, colorEnd: SMOKE_DARK, alpha: 0.4 });
        if (Math.random() < 0.5) fire.emit({ x: _p.x, y: _p.y, z: _p.z, life: 0.3, size: dSize[i] * 1.5, sizeEnd: dSize[i] * 0.4, color: FIRE_MID, colorEnd: FIRE_END, alpha: 0.9 });
      }
      _e.set(dRot[i * 3], dRot[i * 3 + 1], dRot[i * 3 + 2]);
      _q.setFromEuler(_e);
      _s.setScalar(dSize[i]);
      _p.set(dPos[i * 3], dPos[i * 3 + 1], dPos[i * 3 + 2]);
      debris.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    debris.count = dCount;
    debris.instanceMatrix.needsUpdate = true;

    // Rubble: fly, bounce, settle.
    for (let i = 0; i < rCount; i++) {
      if (rState[i] === 1) continue;
      rVel[i * 3 + 1] -= 24 * dt;
      for (let k = 0; k < 3; k++) { rPos[i * 3 + k] += rVel[i * 3 + k] * dt; rRot[i * 3 + k] += rSpin[i * 3 + k] * dt; }
      const g = groundAt(rPos[i * 3], rPos[i * 3 + 2]) + rSize[i * 3 + 1] * 0.5;
      if (rPos[i * 3 + 1] < g) {
        rPos[i * 3 + 1] = g;
        rBounces[i]++;
        const vy = rVel[i * 3 + 1];
        if (rBounces[i] >= 3 || Math.abs(vy) < 2.5) {
          rState[i] = 1;
          rVel[i * 3] = rVel[i * 3 + 1] = rVel[i * 3 + 2] = 0;
          rRot[i * 3] = Math.round(rRot[i * 3] / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3;
          rRot[i * 3 + 2] = Math.round(rRot[i * 3 + 2] / (Math.PI / 2)) * (Math.PI / 2) + (Math.random() - 0.5) * 0.3;
          if (onSettle && rSize[i * 3] > 0.9) onSettle(rPos[i * 3], rPos[i * 3 + 2], Math.max(rSize[i * 3], rSize[i * 3 + 2]) * 0.5);
        } else {
          rVel[i * 3 + 1] = -vy * 0.35;
          rVel[i * 3] *= 0.6; rVel[i * 3 + 2] *= 0.6;
          for (let k = 0; k < 3; k++) rSpin[i * 3 + k] *= 0.5;
          _p.set(rPos[i * 3], g, rPos[i * 3 + 2]);
          if (Math.random() < 0.5) dust(_p, 1);
        }
      }
      _e.set(rRot[i * 3], rRot[i * 3 + 1], rRot[i * 3 + 2]);
      _q.setFromEuler(_e);
      _s.set(rSize[i * 3], rSize[i * 3 + 1], rSize[i * 3 + 2]);
      _p.set(rPos[i * 3], rPos[i * 3 + 1], rPos[i * 3 + 2]);
      rubble.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    rubble.count = rCount;
    rubble.instanceMatrix.needsUpdate = true;

    for (let i = burners.length - 1; i >= 0; i--) {
      const b = burners[i];
      b.left -= dt;
      if (b.left <= 0) { burners.splice(i, 1); continue; }
      b.acc += dt;
      const every = 0.06;
      while (b.acc > every) {
        b.acc -= every;
        const fade = Math.min(1, b.left / 8);
        const s = b.size * fade;
        fire.emit({
          x: b.pos.x + (Math.random() - 0.5) * s, y: b.pos.y + Math.random() * s * 0.3, z: b.pos.z + (Math.random() - 0.5) * s,
          vx: (Math.random() - 0.5) * 2, vy: s * 0.9 + Math.random() * 3, vz: (Math.random() - 0.5) * 2,
          life: 0.5 + Math.random() * 0.5, size: s * 0.5, sizeEnd: s * 0.15, color: Math.random() < 0.3 ? FIRE_HOT : FIRE_MID, colorEnd: FIRE_END, alpha: 0.5, fadeIn: 0.15
        });
        if (Math.random() < 0.6) smoke.emit({
          x: b.pos.x + (Math.random() - 0.5) * s, y: b.pos.y + s * 0.6, z: b.pos.z + (Math.random() - 0.5) * s,
          vx: (Math.random() - 0.5) * 2 + 2, vy: s * 0.6 + 2, vz: (Math.random() - 0.5) * 2,
          life: 3 + Math.random() * 3, size: s * 0.6, sizeEnd: s * 3, color: SMOKE_DARK, colorEnd: SMOKE_DARK, alpha: 0.55 * fade, fadeIn: 0.1
        });
      }
    }
    shake = Math.max(0, shake - dt * 2.2);
  }

  return {
    update, explosion, hitSparks, trail, exhaustFire, damageSmoke, burn, dust, emp, flash, ring, debrisBurst, rubbleBurst, shakeAt,
    get shake() { return shake; },
    addShake(v) { shake = Math.min(1.5, shake + v); },
    setGround(fn) { groundAt = fn; },
    setListener(pos) { listener.copy(pos); },
    onRubbleSettle(fn) { onSettle = fn; },
    pools: { fire, smoke, sparks }
  };
}
