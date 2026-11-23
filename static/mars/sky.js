import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Sky with a day/night cycle, parameterised per world via presets. The sun
// travels along a tilted arc; the sky blends between day, dusk and night
// palettes (airless worlds stay black with stars), lights and fog follow, and
// some worlds show a parent planet hanging in the sky.
const SKY_VERTEX = `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform float uHalo;
  uniform float uNight;
  uniform float uHazePower;
  varying vec3 vWorldDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = dir.y;
    float horizonBand = pow(1.0 - clamp(up, 0.0, 1.0), uHazePower);
    vec3 col = mix(uZenith, uHorizon, horizonBand);
    if (up < 0.0) col = mix(uHorizon, uGround, clamp(-up * 3.0, 0.0, 1.0));

    float sunDot = max(dot(dir, uSunDir), 0.0);
    vec3 halo = vec3(0.62, 0.72, 0.9);
    col += halo * pow(sunDot, 24.0) * uHalo;
    col += vec3(1.0, 0.95, 0.85) * pow(sunDot, 400.0) * 1.4 * step(-0.02, uSunDir.y);
    col += uHorizon * pow(sunDot, 4.0) * 0.12;

    if (uNight > 0.01 && up > 0.0) {
      vec3 cell = floor(dir * 160.0);
      float h = hash(cell);
      vec3 f = fract(dir * 160.0) - 0.5;
      float star = smoothstep(0.985, 1.0, h) * smoothstep(0.22, 0.0, length(f));
      col += vec3(star) * uNight * (0.6 + 0.4 * hash(cell + 7.0)) * smoothstep(0.0, 0.25, up);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PRESETS = {
  mars: {
    day: { zenith: 0x8a4d2c, horizon: 0xd9a071, ground: 0x6d3a24, halo: 0.45 },
    dusk: { zenith: 0x2a1c1c, horizon: 0x8c5a44, ground: 0x2e1a14, halo: 1.1 },
    night: { zenith: 0x05040a, horizon: 0x16100f, ground: 0x0a0605, halo: 0.0 },
    fog: [110, 520], hazePower: 3.5, sunScale: 140, sunColor: 0xffe6c8, sunsetColor: 0xff8a4a,
    hemiSky: 0xe8b48a, hemiGround: 0x6a3a26, nightAmbient: 0x8088b8, moon: true
  },
  luna: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 90, sunColor: 0xffffff, sunsetColor: 0xffffff,
    hemiSky: 0x202028, hemiGround: 0x3a3a3e, nightAmbient: 0x3a4060,
    planet: { kind: 'earth', scale: 150, dir: [0.35, 0.55, -0.75] }
  },
  europa: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 60, sunColor: 0xf4f6ff, sunsetColor: 0xf4f6ff,
    hemiSky: 0x303848, hemiGround: 0x5a6676, nightAmbient: 0x4a5a80,
    planet: { kind: 'jupiter', scale: 520, dir: [-0.5, 0.42, 0.75] }
  },
  ceres: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 64, sunColor: 0xfff4e0, sunsetColor: 0xfff4e0,
    hemiSky: 0x24242a, hemiGround: 0x3a3632, nightAmbient: 0x404858
  },
  eros: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 84, sunColor: 0xffffff, sunsetColor: 0xffffff,
    hemiSky: 0x26262c, hemiGround: 0x3e3832, nightAmbient: 0x3a4060,
    planet: { kind: 'earth', scale: 40, dir: [-0.6, 0.35, 0.7], opacity: 0.9 }
  },
  ganymede: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 56, sunColor: 0xf8f6ff, sunsetColor: 0xf8f6ff,
    hemiSky: 0x2a3040, hemiGround: 0x4e5560, nightAmbient: 0x485878,
    planet: { kind: 'jupiter', scale: 330, dir: [0.55, 0.5, -0.65] }
  },
  callisto: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 52, sunColor: 0xf4f2ff, sunsetColor: 0xf4f2ff,
    hemiSky: 0x262a34, hemiGround: 0x3e3a36, nightAmbient: 0x40485c,
    planet: { kind: 'jupiter', scale: 190, dir: [-0.45, 0.4, -0.8] }
  },
  enceladus: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.05 },
    fog: null, hazePower: 1.0, sunScale: 44, sunColor: 0xf6f8ff, sunsetColor: 0xf6f8ff,
    hemiSky: 0x303a4c, hemiGround: 0x6a7482, nightAmbient: 0x586880,
    planet: { kind: 'saturn', scale: 620, dir: [0.2, 0.42, 0.88], opacity: 0.95 }
  },
  pluto: {
    airless: true,
    day: { zenith: 0x000000, horizon: 0x000000, ground: 0x000000, halo: 0.02 },
    fog: null, hazePower: 1.0, sunScale: 22, sunColor: 0xfff8f0, sunsetColor: 0xfff8f0,
    hemiSky: 0x2a2430, hemiGround: 0x3c2c28, nightAmbient: 0x58506a,
    planet: { kind: 'charon', scale: 200, dir: [-0.5, 0.48, -0.72] }
  },
  titan: {
    day: { zenith: 0x9c5a1c, horizon: 0xdca258, ground: 0x6a4420, halo: 0.6 },
    dusk: { zenith: 0x3d2410, horizon: 0x8a5a2a, ground: 0x2c1c0e, halo: 0.5 },
    night: { zenith: 0x0a0704, horizon: 0x1c1208, ground: 0x0a0604, halo: 0.0 },
    fog: [25, 230], hazePower: 2.0, sunScale: 220, sunColor: 0xffd9a0, sunsetColor: 0xff9a50,
    hemiSky: 0xd9a258, hemiGround: 0x6a4420, nightAmbient: 0x6a5a40,
    planet: { kind: 'saturn', scale: 260, dir: [0.6, 0.5, 0.62], opacity: 0.35 }
  }
};

function radialTexture(stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunDiscTexture = () => radialTexture([
  [0, 'rgba(255, 252, 240, 1)'], [0.22, 'rgba(255, 246, 220, 1)'], [0.3, 'rgba(255, 236, 200, 0.55)'],
  [0.6, 'rgba(230, 210, 190, 0.12)'], [1, 'rgba(230, 210, 190, 0)']
]);
const moonTexture = () => radialTexture([
  [0, 'rgba(210, 200, 190, 1)'], [0.35, 'rgba(170, 160, 150, 1)'], [0.42, 'rgba(120, 110, 100, 0.3)'], [1, 'rgba(0, 0, 0, 0)']
]);

// Parent planets drawn on a canvas: a blue marble, a banded gas giant, a ringed one.
function planetTexture(kind) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const r = kind === 'saturn' ? size * 0.22 : size * 0.4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  if (kind === 'earth') {
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#3f9a4a';
    for (const [x, y, w, h] of [[150, 160, 120, 90], [300, 230, 90, 140], [200, 300, 70, 60], [330, 140, 60, 50]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.ellipse(80 + (i * 67) % 380, 90 + (i * 113) % 360, 50, 14, i * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'jupiter') {
    const bands = ['#d8c3a0', '#b8916a', '#e4d2b4', '#a87f5c', '#d9c09a', '#c29a72', '#e8d8bc', '#b48a62'];
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, (i / bands.length) * size, size, size / bands.length + 1);
    }
    ctx.fillStyle = '#c7664a';
    ctx.beginPath();
    ctx.ellipse(330, 330, 58, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'charon') {
    ctx.fillStyle = '#8c8a90';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#6a3a30';
    ctx.beginPath();
    ctx.ellipse(c, c - r * 0.72, r * 0.7, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60, 58, 64, 0.5)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(c + Math.cos(i * 2.1) * r * 0.6, c + Math.sin(i * 1.7) * r * 0.6, 10 + (i * 7) % 20, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#e2cf9c';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(190, 160, 110, 0.5)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, c - r + i * (r / 3), size, 8);
  }
  ctx.restore();
  // Terminator shading
  const shade = ctx.createRadialGradient(c - r * 0.4, c - r * 0.4, r * 0.2, c, c, r);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  if (kind === 'saturn') {
    ctx.strokeStyle = 'rgba(220, 200, 150, 0.85)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.ellipse(c, c, r * 2.1, r * 0.55, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 140, 100, 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(c, c, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(scene, sunConfig = {}) {
  const preset = PRESETS[sunConfig.preset] ?? PRESETS.mars;
  const dayLength = sunConfig.dayLengthSeconds ?? 600;
  const tilt = THREE.MathUtils.degToRad(sunConfig.tiltDeg ?? 35);
  const sunriseAz = THREE.MathUtils.degToRad(sunConfig.sunriseAzimuthDeg ?? sunConfig.azimuthDeg ?? 90);
  const baseIntensity = sunConfig.intensity ?? 2.6;
  let hour = sunConfig.startHour ?? 9;
  let timeScale = 1;

  const east = new THREE.Vector3(Math.sin(sunriseAz), 0, Math.cos(sunriseAz));
  const side = new THREE.Vector3(Math.cos(sunriseAz), 0, -Math.sin(sunriseAz));
  const upTilted = new THREE.Vector3(0, Math.cos(tilt), 0);
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();

  function directionAt(h, target) {
    const theta = ((h - 6) / 24) * Math.PI * 2;
    return target.copy(east).multiplyScalar(Math.cos(theta))
      .addScaledVector(upTilted, Math.sin(theta))
      .addScaledVector(side, Math.sin(theta) * Math.sin(tilt))
      .normalize();
  }

  const uniforms = {
    uSunDir: { value: sunDir },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uHalo: { value: 0.45 },
    uNight: { value: 0 },
    uHazePower: { value: preset.hazePower ?? 3.5 }
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunDiscTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false }));
  sunSprite.scale.setScalar(preset.sunScale ?? 140);
  scene.add(sunSprite);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0 }));
  moonSprite.scale.setScalar(26);
  moonSprite.visible = Boolean(preset.moon);
  scene.add(moonSprite);

  let planetSprite = null;
  let planetDir = null;
  if (preset.planet) {
    planetSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: planetTexture(preset.planet.kind), transparent: true, depthWrite: false, depthTest: false, fog: false,
      opacity: preset.planet.opacity ?? 1
    }));
    planetSprite.scale.setScalar(preset.planet.scale);
    planetDir = new THREE.Vector3(...preset.planet.dir).normalize();
    scene.add(planetSprite);
  }

  const sunLight = new THREE.DirectionalLight(preset.sunColor, baseIntensity);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 220;
  const box = 48;
  sunLight.shadow.camera.left = -box;
  sunLight.shadow.camera.right = box;
  sunLight.shadow.camera.top = box;
  sunLight.shadow.camera.bottom = -box;
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.normalBias = 0.05;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, 0.9);
  scene.add(hemi);
  const nightAmbient = new THREE.AmbientLight(preset.nightAmbient, 0);
  scene.add(nightAmbient);

  scene.fog = preset.fog ? new THREE.Fog(new THREE.Color(preset.day.horizon), preset.fog[0], preset.fog[1]) : null;
  scene.background = null;

  const colorA = new THREE.Color();
  const colorB = new THREE.Color();
  const palette = { zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), halo: 0 };
  const dayColor = new THREE.Color(preset.sunColor);
  const sunsetColor = new THREE.Color(preset.sunsetColor);
  const hemiDayColor = new THREE.Color(preset.hemiSky);
  const state = { hour, daylight: 1, night: 0, sunElevation: 1, airless: Boolean(preset.airless) };

  function blendPalette(a, b, t) {
    palette.zenith.copy(colorA.set(a.zenith)).lerp(colorB.set(b.zenith), t);
    palette.horizon.copy(colorA.set(a.horizon)).lerp(colorB.set(b.horizon), t);
    palette.ground.copy(colorA.set(a.ground)).lerp(colorB.set(b.ground), t);
    palette.halo = THREE.MathUtils.lerp(a.halo, b.halo, t);
  }

  function applyTime() {
    directionAt(hour, sunDir);
    directionAt(hour + 11, moonDir);
    const elev = sunDir.y;
    let daylight;
    let night;
    if (preset.airless) {
      daylight = THREE.MathUtils.smoothstep(elev, -0.02, 0.1);
      night = 1;
      blendPalette(preset.day, preset.day, 0);
    } else {
      daylight = THREE.MathUtils.smoothstep(elev, -0.08, 0.28);
      night = 1 - THREE.MathUtils.smoothstep(elev, -0.22, 0.02);
      if (elev > 0.0) blendPalette(preset.dusk, preset.day, THREE.MathUtils.smoothstep(elev, 0.0, 0.3));
      else blendPalette(preset.night, preset.dusk, THREE.MathUtils.smoothstep(elev, -0.25, 0.0));
    }

    uniforms.uZenith.value.copy(palette.zenith);
    uniforms.uHorizon.value.copy(palette.horizon);
    uniforms.uGround.value.copy(palette.ground);
    uniforms.uHalo.value = palette.halo;
    uniforms.uNight.value = night;
    if (scene.fog) scene.fog.color.copy(palette.horizon).lerp(palette.zenith, 0.15);

    const warmth = preset.airless ? 0 : 1 - THREE.MathUtils.smoothstep(elev, 0.0, 0.25);
    sunLight.color.copy(dayColor).lerp(sunsetColor, warmth);
    sunLight.intensity = baseIntensity * daylight;
    sunLight.castShadow = elev > 0.03;
    hemi.intensity = (preset.airless ? 0.25 : 0.3) + 0.6 * daylight;
    hemi.color.copy(palette.horizon).lerp(hemiDayColor, preset.airless ? 1 : daylight);
    nightAmbient.intensity = preset.airless ? 0.35 + 0.25 * (1 - daylight) : 0.6 * night;

    sunSprite.material.opacity = THREE.MathUtils.smoothstep(elev, -0.06, 0.02);
    sunSprite.material.color.copy(dayColor).lerp(sunsetColor, warmth);
    moonSprite.material.opacity = 0.75 * night * THREE.MathUtils.smoothstep(moonDir.y, 0.0, 0.1);

    state.hour = hour;
    state.daylight = daylight;
    state.night = night;
    state.sunElevation = elev;
  }

  function update(delta) {
    hour = (hour + (delta * timeScale * 24) / dayLength) % 24;
    applyTime();
  }

  function followTarget(position) {
    sunLight.position.copy(position).addScaledVector(sunDir, 120);
    sunLight.target.position.copy(position);
    sunLight.target.updateMatrixWorld();
    skyDome.position.copy(position);
    sunSprite.position.copy(position).addScaledVector(sunDir, 1000);
    moonSprite.position.copy(position).addScaledVector(moonDir, 1000);
    if (planetSprite) planetSprite.position.copy(position).addScaledVector(planetDir, 1000);
  }

  function setTimeScale(scale) { timeScale = scale; }
  function clockText() {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  applyTime();
  return { sunDir, sunLight, state, update, followTarget, setTimeScale, clockText, horizonColor: palette.horizon };
}
