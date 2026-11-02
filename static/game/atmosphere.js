import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Sky, fog, lights, tone mapping and the environment map, all driven by a theme look (themes.js).

function hex(color) {
  return `#${new THREE.Color(color).getHexString()}`;
}

// A vertical gradient with a soft sun disc, used both as the visible sky and (through PMREM) as the
// reflection environment for metal.
function makeSkyCanvas(sky) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, hex(sky.top));
  grad.addColorStop(0.46, hex(sky.horizon));
  grad.addColorStop(0.52, hex(sky.horizon));
  grad.addColorStop(1, hex(sky.ground));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (sky.sun) {
    const [u, v] = sky.sunPos || [0.5, 0.35];
    const x = u * canvas.width;
    const y = v * canvas.height * 0.92;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 70);
    const sun = new THREE.Color(sky.sun);
    glow.addColorStop(0, `rgba(${Math.round(sun.r * 255)}, ${Math.round(sun.g * 255)}, ${Math.round(sun.b * 255)}, 0.95)`);
    glow.addColorStop(0.12, `rgba(${Math.round(sun.r * 255)}, ${Math.round(sun.g * 255)}, ${Math.round(sun.b * 255)}, 0.55)`);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // A few faint stars for dark skies.
  const top = new THREE.Color(sky.top);
  if (top.r + top.g + top.b < 0.5) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    let seed = 7;
    for (let i = 0; i < 90; i++) {
      seed = (seed * 16807) % 2147483647;
      const sx = (seed % canvas.width);
      seed = (seed * 16807) % 2147483647;
      const sy = (seed % Math.floor(canvas.height * 0.42));
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
  return canvas;
}

export function createAtmosphere(scene, renderer, look, { roofed = false } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.exposure ?? 1;

  const skyTex = new THREE.CanvasTexture(makeSkyCanvas(look.sky));
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromEquirectangular(skyTex);
  scene.environment = envTarget.texture;
  scene.background = roofed ? new THREE.Color(look.fog.color) : skyTex;
  scene.fog = new THREE.Fog(look.fog.color, look.fog.near, look.fog.far);

  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
  const sun = new THREE.DirectionalLight(look.sun.color, look.sun.intensity);
  sun.position.set(...look.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);

  // The shadow camera follows the tank so shadows stay sharp on big levels.
  function update(focus) {
    if (!focus) return;
    sun.position.set(focus.x + look.sun.position[0], focus.y + look.sun.position[1], focus.z + look.sun.position[2]);
    sun.target.position.copy(focus);
  }

  function dispose() {
    scene.remove(hemi, sun, sun.target);
    envTarget.dispose();
    pmrem.dispose();
    skyTex.dispose();
  }

  return { update, dispose, hemi, sun };
}

// Thin alpha gradient (opaque at u=0, clear at u=1) laid along wall feet as contact shadow.
let aoTex = null;
export function aoTexture() {
  if (aoTex) return aoTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 4);
  aoTex = new THREE.CanvasTexture(canvas);
  aoTex.wrapS = THREE.ClampToEdgeWrapping;
  aoTex.wrapT = THREE.RepeatWrapping;
  return aoTex;
}

// Soft ripple arcs scrolled over water as a translucent sheen.
let rippleTex = null;
export function rippleTexture() {
  if (rippleTex) return rippleTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineCap = 'round';
  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    const r = 6 + rand() * 16;
    const a = rand() * Math.PI * 2;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, a, a + 0.9 + rand() * 1.2);
    ctx.stroke();
  }
  rippleTex = new THREE.CanvasTexture(canvas);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  return rippleTex;
}
