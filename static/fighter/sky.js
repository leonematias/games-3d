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
    // Disc, corona and a wide warm glow near the horizon.
    col += uSunColor * (smoothstep(0.9993, 0.9997, s) * 1.1);
    col += uSunColor * pow(s, 420.0) * 0.6;
    col += uSunColor * pow(s, 24.0) * 0.18 * uHaze;
    col += uSunColor * pow(s, 5.0) * 0.06 * uHaze;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PRESETS = {
  desert: {
    sunDir: [0.42, 0.5, -0.76],
    zenith: 0x1f55bd, horizon: 0xa8c0d8, ground: 0x8c7357,
    sun: 0xfff2d0, sunIntensity: 2.7, hemiSky: 0xbfd6f2, hemiGround: 0x8a5a3a, hemi: 0.7,
    fog: 0xb4c4d4, fogNear: 450, fogFar: 4600, haze: 0.6, flare: 0xffe6b0, exposure: 1.0,
    cloud: 0xffffff, cloudOpacity: 0.5
  },
  alpine: {
    sunDir: [-0.5, 0.52, -0.69],
    zenith: 0x1f52b4, horizon: 0xbfd0e4, ground: 0x7d8792,
    sun: 0xfff8ea, sunIntensity: 2.9, hemiSky: 0xc8dcf5, hemiGround: 0x5c6a60, hemi: 0.75,
    fog: 0xc4d2e2, fogNear: 450, fogFar: 4800, haze: 0.6, flare: 0xeaf4ff, exposure: 1.02,
    cloud: 0xffffff, cloudOpacity: 0.6
  },
  sunset: {
    sunDir: [0.78, 0.12, -0.61],
    zenith: 0x4a3d77, horizon: 0xf2a25a, ground: 0x4a2c33,
    sun: 0xffb060, sunIntensity: 2.3, hemiSky: 0xe8a070, hemiGround: 0x3a2a3a, hemi: 0.7,
    fog: 0xe0a06c, fogNear: 350, fogFar: 3800, haze: 0.65, flare: 0xffb070, exposure: 0.96,
    cloud: 0xffc9a0, cloudOpacity: 0.7
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

export function createSky(scene, renderer, { preset = 'desert', worldSize = 6000, cloudBase = 700 } = {}) {
  const p = PRESETS[preset] || PRESETS.desert;
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
    new THREE.SphereGeometry(9000, 32, 20),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi * 1.4);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const sun = new THREE.DirectionalLight(p.sun, p.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 2600;
  const box = 420;
  sun.shadow.camera.left = -box;
  sun.shadow.camera.right = box;
  sun.shadow.camera.top = box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // Lens flare: a bright core at the sun and a handful of ghosts along the axis.
  const flare = new Lensflare();
  const core = flareTexture(256, 'rgba(255,255,255,0.8)', 'rgba(255,235,190,0.18)', false);
  const ghost = flareTexture(128, 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.45)', true);
  const spot = flareTexture(128, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.1)', false);
  const fc = new THREE.Color(p.flare);
  flare.addElement(new LensflareElement(core, 240, 0, fc));
  flare.addElement(new LensflareElement(spot, 90, 0.4, fc));
  flare.addElement(new LensflareElement(ghost, 140, 0.6, new THREE.Color(0x9fd4ff)));
  flare.addElement(new LensflareElement(spot, 60, 0.8, fc));
  flare.addElement(new LensflareElement(ghost, 220, 1.05, new THREE.Color(0xffd0a0)));
  flare.addElement(new LensflareElement(spot, 40, 1.3, new THREE.Color(0xa0ffd0)));
  const flareHolder = new THREE.Object3D();
  flareHolder.add(flare);
  scene.add(flareHolder);

  // Cloud layer: big soft sprites drifting above the action.
  const clouds = new THREE.Group();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: p.cloudOpacity, color: p.cloud, fog: true });
  for (let i = 0; i < 26; i++) {
    const sprite = new THREE.Sprite(cloudMat);
    sprite.position.set((Math.random() - 0.5) * worldSize * 1.6, cloudBase + 300 + Math.random() * 700, (Math.random() - 0.5) * worldSize * 1.6);
    const s = 700 + Math.random() * 1100;
    sprite.scale.set(s, s * 0.42, 1);
    sprite.userData.speed = 4 + Math.random() * 6;
    clouds.add(sprite);
  }
  scene.add(clouds);

  const sunOffset = sunDir.clone().multiplyScalar(1500);
  function update(target, dt) {
    sun.position.copy(target).add(sunOffset);
    sun.target.position.copy(target);
    dome.position.copy(target);
    flareHolder.position.copy(target).addScaledVector(sunDir, 8000);
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > worldSize * 0.75) cloud.position.x = -worldSize * 0.75;
    }
  }
  return { update, sun, hemi, sunDir, preset: p, clouds };
}
