import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const VERT = `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAG = `
  uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
  uniform float uHaze;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;
    vec3 col;
    if (up >= 0.0) {
      col = mix(uHorizon, uZenith, pow(up, 0.55));
    } else {
      col = mix(uHorizon, uGround, clamp(-up * 6.0, 0.0, 1.0));
    }
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (smoothstep(0.9993, 0.9997, s) * 1.1);
    col += uSunColor * pow(s, 420.0) * 0.6;
    col += uSunColor * pow(s, 24.0) * 0.18 * uHaze;
    col += uSunColor * pow(s, 5.0) * 0.06 * uHaze;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PRESETS = {
  meadow: {
    sunDir: [0.45, 0.62, -0.64],
    zenith: 0x2461c4, horizon: 0xb8d2ea, ground: 0x6e7f52,
    sun: 0xfff6e0, sunIntensity: 2.6, hemiSky: 0xc6dcf4, hemiGround: 0x4f6a36, hemi: 0.75,
    fog: 0xb9cfe2, fogNear: 55, fogFar: 950, haze: 0.45, flare: 0xfff0c0, exposure: 1.0,
    cloud: 0xffffff, cloudOpacity: 0.55, water: 0x2a6f8c, apron: 0x5f7a46
  },
  desert: {
    sunDir: [0.42, 0.5, -0.76],
    zenith: 0x1f55bd, horizon: 0xa8c0d8, ground: 0x8c7357,
    sun: 0xfff2d0, sunIntensity: 2.8, hemiSky: 0xbfd6f2, hemiGround: 0x8a5a3a, hemi: 0.7,
    fog: 0xc8bba0, fogNear: 60, fogFar: 1050, haze: 0.55, flare: 0xffe6b0, exposure: 1.0,
    cloud: 0xffffff, cloudOpacity: 0.4, water: 0x2f8a8c, apron: 0xc0a070
  },
  alpine: {
    sunDir: [-0.5, 0.52, -0.69],
    zenith: 0x1f52b4, horizon: 0xbfd0e4, ground: 0x7d8792,
    sun: 0xfff8ea, sunIntensity: 2.9, hemiSky: 0xc8dcf5, hemiGround: 0x5c6a60, hemi: 0.75,
    fog: 0xbccbdc, fogNear: 50, fogFar: 1000, haze: 0.5, flare: 0xeaf4ff, exposure: 1.02,
    cloud: 0xffffff, cloudOpacity: 0.6, water: 0x2a6f8c, apron: 0x8d9a8e
  },
  volcanic: {
    sunDir: [0.6, 0.34, -0.72],
    zenith: 0x3a3340, horizon: 0xb08a6a, ground: 0x2a2424,
    sun: 0xffb070, sunIntensity: 2.2, hemiSky: 0xa08070, hemiGround: 0x2a2020, hemi: 0.7,
    fog: 0x9a7a66, fogNear: 45, fogFar: 800, haze: 0.7, flare: 0xffb080, exposure: 0.98,
    cloud: 0xd0b0a0, cloudOpacity: 0.55, water: 0x2a3a4a, apron: 0x3a3634
  },
  sunset: {
    sunDir: [0.78, 0.16, -0.61],
    zenith: 0x4a3d77, horizon: 0xf2a25a, ground: 0x4a2c33,
    sun: 0xffb060, sunIntensity: 2.3, hemiSky: 0xe8a070, hemiGround: 0x3a2a3a, hemi: 0.7,
    fog: 0xe0a06c, fogNear: 50, fogFar: 900, haze: 0.55, flare: 0xffb070, exposure: 0.96,
    cloud: 0xffc9a0, cloudOpacity: 0.7, water: 0x3a4a6a, apron: 0x6a5a4a
  },
  // Night: the "sun" is a low moon; the tank's own lights do the rest.
  night: {
    sunDir: [-0.35, 0.5, 0.79],
    zenith: 0x05070f, horizon: 0x101828, ground: 0x04060a,
    sun: 0xbfd0ff, sunIntensity: 0.35, hemiSky: 0x202a44, hemiGround: 0x06080c, hemi: 0.35,
    fog: 0x0a0e18, fogNear: 40, fogFar: 650, haze: 0.2, flare: 0xc0d0ff, exposure: 0.85,
    cloud: 0x303848, cloudOpacity: 0.5, water: 0x0a1420, apron: 0x101410, night: true, stars: true
  }
};

function flareTexture(size, inner, outer, rings) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  if (rings) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = size * 0.04;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 70 + Math.random() * 370;
    const y = 70 + Math.random() * 110;
    const r = 30 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function skyPreset(name) { return PRESETS[name] || PRESETS.meadow; }

export function createSky(scene, renderer, { preset = 'meadow', worldSize = 1200, cloudBase = 300 } = {}) {
  const p = PRESETS[preset] || PRESETS.meadow;
  const sunDir = new THREE.Vector3(...p.sunDir).normalize();
  scene.fog = new THREE.Fog(new THREE.Color(p.fog), p.fogNear, p.fogFar);
  scene.background = new THREE.Color(p.fog);
  renderer.toneMappingExposure = p.exposure;

  const uniforms = {
    uZenith: { value: new THREE.Color(p.zenith) },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uGround: { value: new THREE.Color(p.ground) },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(p.sun) },
    uHaze: { value: p.haze }
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 20),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi * 1.0);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.1));
  const sun = new THREE.DirectionalLight(p.sun, p.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 600;
  const box = 110;
  sun.shadow.camera.left = -box;
  sun.shadow.camera.right = box;
  sun.shadow.camera.top = box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.25;
  scene.add(sun, sun.target);

  const flare = new Lensflare();
  const core = flareTexture(256, 'rgba(255,255,255,0.8)', 'rgba(255,235,190,0.18)', false);
  const ghost = flareTexture(128, 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.45)', true);
  const spot = flareTexture(128, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.1)', false);
  const fc = new THREE.Color(p.flare);
  // Only the core: ghost elements along the sun line land on the tank at ground level.
  flare.addElement(new LensflareElement(core, p.night ? 90 : 200, 0, fc));
  void spot; void ghost;
  const flareHolder = new THREE.Object3D();
  flareHolder.add(flare);
  scene.add(flareHolder);

  // Stars at night: a few thousand points on the dome.
  if (p.stars) {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.asin(Math.random() * 0.95 + 0.05);
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 3800;
      pos[i * 3 + 1] = Math.sin(e) * 3800;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 3800;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    dome.add(stars);
  }

  const clouds = new THREE.Group();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: p.cloudOpacity, color: p.cloud, fog: true });
  for (let i = 0; i < 22; i++) {
    const sprite = new THREE.Sprite(cloudMat);
    sprite.position.set((Math.random() - 0.5) * worldSize * 1.8, cloudBase + 200 + Math.random() * 300, (Math.random() - 0.5) * worldSize * 1.8);
    const s = 300 + Math.random() * 500;
    sprite.scale.set(s, s * 0.42, 1);
    sprite.userData.speed = 2 + Math.random() * 4;
    clouds.add(sprite);
  }
  scene.add(clouds);

  const sunOffset = sunDir.clone().multiplyScalar(300);
  function update(target, dt) {
    sun.position.copy(target).add(sunOffset);
    sun.target.position.copy(target);
    dome.position.copy(target);
    flareHolder.position.copy(target).addScaledVector(sunDir, 3500);
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > worldSize * 0.9) cloud.position.x = -worldSize * 0.9;
    }
  }
  return { update, sun, hemi, sunDir, preset: p, clouds };
}
