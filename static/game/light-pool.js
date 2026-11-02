import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// A fixed pool of point lights handed to the emitters nearest the tank (torches, lamps, lava, gates,
// turrets). The pool size never changes, so materials compile once.

export function createLightPool(scene, count = 6) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 6, 2);
    light.castShadow = false;
    light.position.set(0, -50, 0);
    scene.add(light);
    lights.push(light);
  }
  let emitters = [];
  let assigned = [];
  let sinceRepick = 1;
  let time = 0;

  function setEmitters(list) {
    emitters = list.filter(Boolean);
    sinceRepick = 1;
  }

  function addEmitter(emitter) {
    emitters.push(emitter);
    sinceRepick = 1;
    return emitter;
  }

  function removeEmitter(emitter) {
    emitters = emitters.filter((entry) => entry !== emitter);
    sinceRepick = 1;
  }

  function repick(focus) {
    const scored = [];
    for (const emitter of emitters) {
      if (emitter.disabled) continue;
      const dx = emitter.x - focus.x;
      const dz = emitter.z - focus.z;
      scored.push({ emitter, d: dx * dx + dz * dz });
    }
    scored.sort((a, b) => a.d - b.d);
    assigned = scored.slice(0, lights.length).map((entry) => entry.emitter);
  }

  function update(delta, focus) {
    time += delta;
    sinceRepick += delta;
    if (focus && sinceRepick >= 0.2) {
      sinceRepick = 0;
      repick(focus);
    }
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const emitter = assigned[i];
      if (!emitter) {
        light.intensity = 0;
        continue;
      }
      light.position.set(emitter.x, emitter.y, emitter.z);
      light.color.setHex(emitter.color);
      light.distance = emitter.distance || 6;
      let scale = 1;
      if (emitter.flicker) {
        const phase = emitter.phase || 0;
        scale = 0.78 + 0.14 * Math.sin(time * 19 + phase) + 0.08 * Math.sin(time * 7.3 + phase * 1.7) + (Math.random() - 0.5) * 0.08;
      } else if (emitter.pulse) {
        scale = 0.8 + 0.2 * Math.sin(time * emitter.pulse + (emitter.phase || 0));
      }
      light.intensity = emitter.intensity * scale;
    }
  }

  function dispose() {
    for (const light of lights) scene.remove(light);
  }

  return { setEmitters, addEmitter, removeEmitter, update, dispose, count: () => emitters.length };
}
