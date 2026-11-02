import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { decalTexture } from './props.js';

// Impact polish: a bright flash sprite, lingering smoke puffs and scorch decals that stay on the floor.

const MAX_SCORCH = 48;

function spriteTexture(key, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  draw(canvas.getContext('2d'));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glowTex = null;
let smokeTex = null;
function textures() {
  if (!glowTex) {
    glowTex = spriteTexture('glow', (ctx) => {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,250,230,1)');
      grad.addColorStop(0.25, 'rgba(255,200,120,0.9)');
      grad.addColorStop(0.6, 'rgba(255,120,40,0.35)');
      grad.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    });
    smokeTex = spriteTexture('smoke', (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      let seed = 3;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 9; i++) {
        const r = 10 + rand() * 12;
        const x = 32 + (rand() - 0.5) * 22;
        const y = 32 + (rand() - 0.5) * 22;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
      }
    });
  }
  return { glowTex, smokeTex };
}

export function createEffects(scene, { floorYAt } = {}) {
  const live = [];
  const scorches = [];
  const scorchMaterial = new THREE.MeshBasicMaterial({
    map: decalTexture('scorch'),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const scorchGeometry = new THREE.PlaneGeometry(1, 1);

  function flash(point, scale = 1) {
    const { glowTex } = textures();
    const material = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3d0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(point.x, point.y + 0.15 * scale, point.z);
    sprite.scale.setScalar(0.6 * scale);
    scene.add(sprite);
    live.push({ sprite, kind: 'flash', age: 0, life: 0.22, from: 0.6 * scale, to: 2.6 * scale, velocity: new THREE.Vector3() });
  }

  function smoke(point, count = 4, scale = 1) {
    const { smokeTex } = textures();
    for (let i = 0; i < count; i++) {
      const shade = 0.25 + Math.random() * 0.25;
      const material = new THREE.SpriteMaterial({ map: smokeTex, color: new THREE.Color(shade, shade, shade), transparent: true, opacity: 0.6, depthWrite: false, rotation: Math.random() * Math.PI * 2 });
      const sprite = new THREE.Sprite(material);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.35 * scale;
      sprite.position.set(point.x + Math.cos(a) * r, point.y + 0.2 + Math.random() * 0.3 * scale, point.z + Math.sin(a) * r);
      const from = (0.35 + Math.random() * 0.3) * scale;
      sprite.scale.setScalar(from);
      scene.add(sprite);
      live.push({
        sprite,
        kind: 'smoke',
        age: -Math.random() * 0.12,
        life: 1.3 + Math.random() * 0.9,
        from,
        to: from * (2.6 + Math.random()),
        spin: (Math.random() - 0.5) * 1.2,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.55 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5)
      });
    }
  }

  function scorch(point, radius = 0.9) {
    const y = (floorYAt ? floorYAt(point.x, point.z) : point.y) + 0.012 + Math.random() * 0.006;
    const mesh = new THREE.Mesh(scorchGeometry, scorchMaterial);
    mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    mesh.position.set(point.x, y, point.z);
    mesh.scale.setScalar(radius * 2);
    mesh.renderOrder = 2;
    scene.add(mesh);
    scorches.push(mesh);
    if (scorches.length > MAX_SCORCH) scene.remove(scorches.shift());
  }

  // One call for the common impact kinds.
  function impact(point, size = 'small') {
    if (size === 'small') {
      flash(point, 0.7);
      smoke(point, 2, 0.55);
    } else if (size === 'medium') {
      flash(point, 1.4);
      smoke(point, 7, 1);
      scorch(point, 0.95);
    } else {
      flash(point, 3.2);
      smoke(point, 16, 2.2);
      scorch(point, 2.6);
    }
  }

  function update(delta) {
    for (let i = live.length - 1; i >= 0; i--) {
      const fx = live[i];
      fx.age += delta;
      if (fx.age < 0) continue;
      const t = Math.min(1, fx.age / fx.life);
      if (fx.kind === 'flash') {
        fx.sprite.scale.setScalar(fx.from + (fx.to - fx.from) * Math.sqrt(t));
        fx.sprite.material.opacity = 1 - t;
      } else {
        fx.sprite.position.addScaledVector(fx.velocity, delta);
        fx.velocity.multiplyScalar(1 - 0.9 * delta);
        fx.sprite.scale.setScalar(fx.from + (fx.to - fx.from) * t);
        fx.sprite.material.rotation += fx.spin * delta;
        fx.sprite.material.opacity = 0.6 * (1 - t) * Math.min(1, fx.age * 8);
      }
      if (t >= 1) {
        scene.remove(fx.sprite);
        fx.sprite.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  function dispose() {
    for (const fx of live) {
      scene.remove(fx.sprite);
      fx.sprite.material.dispose();
    }
    live.length = 0;
    for (const mesh of scorches) scene.remove(mesh);
    scorches.length = 0;
  }

  return { flash, smoke, scorch, impact, update, dispose, active: () => live.length, scorchCount: () => scorches.length };
}
