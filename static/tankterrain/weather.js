import * as THREE from 'three';
import { WEATHER } from './config.js';

// Weather: rain or snow particles that follow the camera, fog that shortens
// lock-on and enemy sight, and night with the tank's own lights. The level
// names a preset; `lock` and `sight(lit)` are the multipliers the game applies.

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

export function createWeather(scene, { preset = 'clear', sky = null } = {}) {
  const def = WEATHER[preset] || WEATHER.clear;
  const night = !!def.night;
  if (def.fog && scene.fog) {
    scene.fog.near = def.fog[0];
    scene.fog.far = def.fog[1];
  }
  if (preset === 'fog') {
    scene.fog.color.setHex(0x8a7a70);
    scene.background = scene.fog.color.clone();
  }

  // Particles: thin boxes for rain streaks, small flakes for snow.
  let drops = null;
  let dropPos = null;
  const COUNT = def.particles === 'rain' ? 1800 : def.particles === 'snow' ? 1400 : 0;
  const BOX = 70;         // the particle volume around the camera (metres)
  const HEIGHT = 40;
  if (COUNT) {
    const rain = def.particles === 'rain';
    const geo = rain ? new THREE.BoxGeometry(0.012, 0.55, 0.012) : new THREE.PlaneGeometry(0.11, 0.11);
    const mat = rain
      ? new THREE.MeshBasicMaterial({ color: night ? 0x8a9db0 : 0xc0d0e0, transparent: true, opacity: 0.32, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    drops = new THREE.InstancedMesh(geo, mat, COUNT);
    drops.frustumCulled = false;
    dropPos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      dropPos[i * 3] = (Math.random() - 0.5) * BOX;
      dropPos[i * 3 + 1] = Math.random() * HEIGHT;
      dropPos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    scene.add(drops);
  }
  const fall = def.particles === 'rain' ? 34 : 2.6;
  const wind = new THREE.Vector3(def.particles === 'rain' ? 3 : 1.2, 0, def.particles === 'rain' ? 1 : 0.6);
  let time = 0;

  // Night: a spotlight and two headlights on the player's hull.
  let lights = null;
  function attachLights(tank) {
    if (!night) return null;
    const spot = new THREE.SpotLight(0xfff2d0, 1200, 160, 0.42, 0.5, 1.6);
    spot.position.set(0, 2.6, 1.5);
    spot.target.position.set(0, 0.6, 60);
    spot.castShadow = false;
    tank.body.add(spot, spot.target);
    const heads = [];
    for (const s of [-1, 1]) {
      const h = new THREE.SpotLight(0xffe8b0, 200, 60, 0.6, 0.6, 1.4);
      h.position.set(s * 0.75, 1.5, 3.6);
      h.target.position.set(s * 2, -0.5, 30);
      tank.body.add(h, h.target);
      heads.push(h);
    }
    lights = { spot, heads, on: true };
    return lights;
  }
  function setLights(on) {
    if (!lights) return;
    lights.on = on;
    lights.spot.visible = on;
    for (const h of lights.heads) h.visible = on;
  }

  function update(dt, camera) {
    if (!drops) return;
    time += dt;
    const c = camera.position;
    const half = BOX / 2;
    const snow = def.particles === 'snow';
    for (let i = 0; i < COUNT; i++) {
      let x = dropPos[i * 3], y = dropPos[i * 3 + 1], z = dropPos[i * 3 + 2];
      y -= fall * dt * (snow ? 0.7 + ((i % 7) / 7) * 0.6 : 1);
      x += wind.x * dt * (snow ? Math.sin(time * 0.7 + i) : 1);
      z += wind.z * dt;
      if (y < 0) { y += HEIGHT; x = (Math.random() - 0.5) * BOX; z = (Math.random() - 0.5) * BOX; }
      if (x > half) x -= BOX; else if (x < -half) x += BOX;
      if (z > half) z -= BOX; else if (z < -half) z += BOX;
      dropPos[i * 3] = x; dropPos[i * 3 + 1] = y; dropPos[i * 3 + 2] = z;
      _p.set(c.x + x, c.y - 12 + y, c.z + z);
      if (snow) _q.setFromAxisAngle(_s.set(0, 1, 0).normalize(), time * 1.5 + i);
      else _q.identity();
      // Drops right next to the lens would fill the screen: shrink them away.
      const near = Math.min(1, (x * x + z * z + (y - 12) * (y - 12)) / (snow ? 90 : 30));
      drops.setMatrixAt(i, _m.compose(_p, _q, _s.set(near, near, near)));
    }
    drops.instanceMatrix.needsUpdate = true;
  }

  return {
    def, night, preset,
    lock: def.lock ?? 1,
    sight(lit) { return night ? (lit && lights?.on !== false ? def.sightLit : def.sight) : (def.sight ?? 1); },
    attachLights, setLights,
    get lightsOn() { return lights ? lights.on : false; },
    update
  };
}
