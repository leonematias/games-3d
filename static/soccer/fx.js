import * as THREE from 'three';

export function createFx(scene) {
  const trailGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const trailMat = new THREE.MeshBasicMaterial({ color: '#ffb15a', transparent: true, opacity: 0.85, depthWrite: false });
  const trail = new THREE.InstancedMesh(trailGeo, trailMat, 24);
  trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trail.frustumCulled = false;
  scene.add(trail);
  const lives = new Array(24).fill(0);
  const dummy = new THREE.Object3D();
  let cursor = 0;

  const puffGeo = new THREE.SphereGeometry(0.16, 6, 5);
  const puffMat = new THREE.MeshBasicMaterial({ color: '#dfe8c8', transparent: true, opacity: 0.45, depthWrite: false });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, 16);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.frustumCulled = false;
  scene.add(puffs);
  const puffLife = new Array(16).fill(0);
  let puffCursor = 0;

  const fire = new THREE.PointLight('#ff7a22', 0, 9, 2);
  scene.add(fire);

  // Same throw as Movie Maker's confetti: each scrap is a pure function of the
  // burst age and a seed, so the pieces rise, sway and fall together.
  const CONFETTI = {
    count: 180,
    life: 3.2,
    up: [1.6, 3.6],
    side: 4.8,
    gravity: -5.5,
    size: 0.34,
    sway: 0.7,
    lift: 0.25,
    colors: ['#ff6b9d', '#ffd166', '#5be38a', '#5fb4ff', '#b48bff', '#ff9a4d', '#ffffff'],
  };
  const confettiHash = (i, k) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const confettiCanvas = document.createElement('canvas');
  confettiCanvas.width = confettiCanvas.height = 64;
  const cg = confettiCanvas.getContext('2d');
  const disc = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
  disc.addColorStop(0, 'rgba(255,255,255,1)');
  disc.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  disc.addColorStop(1, 'rgba(255,255,255,0)');
  cg.fillStyle = disc;
  cg.fillRect(0, 0, 64, 64);
  const confettiMap = new THREE.CanvasTexture(confettiCanvas);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: confettiMap, color: '#fff4c5', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.visible = false;
  flash.renderOrder = 8;
  scene.add(flash);
  let flashLife = 0;
  let flashSize = 1;

  const grassCount = 36;
  const grass = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.055, 0.16, 0.025),
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), grassCount
  );
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled = false;
  scene.add(grass);
  const grassPieces = new Array(grassCount).fill(null);
  let grassCursor = 0;
  for (let i = 0; i < grassCount; i++) grass.setColorAt(i, new THREE.Color(i % 3 ? '#75b942' : '#c5cf68'));
  grass.instanceColor.needsUpdate = true;

  function scatterGrass(x, z, count = 10, driftX = 0, driftZ = 0) {
    for (let i = 0; i < count; i++) {
      grassPieces[grassCursor] = {
        x: x + (Math.random() - 0.5) * 0.45, y: 0.08, z: z + (Math.random() - 0.5) * 0.45,
        vx: driftX * 0.24 + (Math.random() - 0.5) * 3,
        vy: 1.3 + Math.random() * 2.1,
        vz: driftZ * 0.24 + (Math.random() - 0.5) * 3,
        age: 0, life: 0.45 + Math.random() * 0.35,
        spin: Math.random() * Math.PI,
      };
      grassCursor = (grassCursor + 1) % grassCount;
    }
  }

  function updateGrass(dt) {
    for (let i = 0; i < grassCount; i++) {
      const piece = grassPieces[i];
      if (!piece || piece.age >= piece.life) {
        dummy.position.set(0, -20, 0);
        dummy.scale.setScalar(0.001);
      } else {
        piece.age += dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.z += piece.vz * dt;
        piece.vy -= 8 * dt;
        dummy.position.set(piece.x, Math.max(0.025, piece.y), piece.z);
        dummy.rotation.set(piece.spin + piece.age * 8, piece.spin, 0);
        dummy.scale.setScalar(Math.max(0.01, 1 - piece.age / piece.life));
      }
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;
  }
  const confettiCount = CONFETTI.count;
  const confettiPos = new Float32Array(confettiCount * 3);
  const confettiColor = new Float32Array(confettiCount * 3);
  const confettiSize = new Float32Array(confettiCount);
  const confettiAlpha = new Float32Array(confettiCount);
  const confettiGeo = new THREE.BufferGeometry();
  confettiGeo.setAttribute('position', new THREE.BufferAttribute(confettiPos, 3));
  confettiGeo.setAttribute('aColor', new THREE.BufferAttribute(confettiColor, 3));
  confettiGeo.setAttribute('aSize', new THREE.BufferAttribute(confettiSize, 1));
  confettiGeo.setAttribute('aAlpha', new THREE.BufferAttribute(confettiAlpha, 1));
  const confettiMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: confettiMap }, uScale: { value: 640 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor; uniform float uScale;
      void main() {
        vAlpha = aAlpha; vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        if (gl_FragColor.a < 0.05) discard;
      }`,
    transparent: true,
    depthWrite: false,
  });
  const confetti = new THREE.Points(confettiGeo, confettiMat);
  confetti.frustumCulled = false;
  confetti.visible = false;
  confetti.renderOrder = 6;
  scene.add(confetti);
  const palette = CONFETTI.colors.map((hex) => new THREE.Color(hex));
  let confettiAge = -1;
  const confettiAt = new THREE.Vector3();

  function placeConfetti() {
    const d = CONFETTI;
    for (let i = 0; i < d.count; i++) {
      const h1 = confettiHash(i, 1);
      const h2 = confettiHash(i, 2);
      const h3 = confettiHash(i, 3);
      const h4 = confettiHash(i, 4);
      const h5 = confettiHash(i, 5);
      const la = confettiAge - h4 * 0.12;
      if (la < 0 || la > d.life) {
        confettiAlpha[i] = 0;
        continue;
      }
      const f = la / d.life;
      const angle = h1 * Math.PI * 2;
      const side = d.side * h2;
      const up = d.up[0] + (d.up[1] - d.up[0]) * h3;
      const x = Math.cos(angle) * side * la + Math.sin(la * 6 + h5 * 10) * d.sway;
      const z = Math.sin(angle) * side * la;
      const y = d.lift + up * la + 0.5 * d.gravity * la * la;
      confettiPos[i * 3] = confettiAt.x + x;
      confettiPos[i * 3 + 1] = confettiAt.y + y;
      confettiPos[i * 3 + 2] = confettiAt.z + z;
      const fadeIn = f < 0.08 ? f / 0.08 : 1;
      const fadeOut = 1 - Math.max(0, (f - 0.62) / 0.38);
      confettiAlpha[i] = Math.max(0, fadeIn * fadeOut);
      confettiSize[i] = d.size * (0.7 + h5 * 0.8);
      const color = palette[Math.floor(h5 * palette.length) % palette.length];
      confettiColor[i * 3] = color.r;
      confettiColor[i * 3 + 1] = color.g;
      confettiColor[i * 3 + 2] = color.b;
    }
    confettiGeo.attributes.position.needsUpdate = true;
    confettiGeo.attributes.aColor.needsUpdate = true;
    confettiGeo.attributes.aSize.needsUpdate = true;
    confettiGeo.attributes.aAlpha.needsUpdate = true;
  }

  function spawn(list, mesh, indexRef, x, y, z, life, scale) {
    const i = indexRef.i;
    list[i] = life;
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    indexRef.i = (i + 1) % list.length;
  }
  const trailIndex = { i: 0 };
  const puffIndex = { i: 0 };

  function fade(list, mesh, dt) {
    for (let i = 0; i < list.length; i++) {
      if (list[i] <= 0) {
        dummy.position.set(0, -20, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      list[i] -= dt;
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const s = Math.max(0.02, dummy.scale.x * (1 - dt * 2.2));
      dummy.scale.setScalar(s);
      dummy.position.y += dt * 0.4;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    fire,
    grass: scatterGrass,
    flash(x, y, z, strong = false) {
      flash.position.set(x, y, z);
      flashSize = strong ? 2.5 : 1.25;
      flash.scale.setScalar(flashSize);
      flash.material.opacity = strong ? 0.8 : 0.55;
      flashLife = strong ? 0.24 : 0.15;
      flash.visible = true;
    },
    drive(x, y, z) { spawn(lives, trail, trailIndex, x, y, z, 0.38, 1); },
    puff(x, z) { spawn(puffLife, puffs, puffIndex, x, 0.15, z, 0.35, 1); },
    burst(x, y, z) {
      for (let i = 0; i < 10; i++) {
        spawn(lives, trail, trailIndex, x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5), 0.5, 1.4);
      }
    },
    confetti(x, y, z) {
      confettiAge = 0;
      confettiAt.set(x, y, z);
      confetti.visible = true;
      placeConfetti();
    },
    update(dt) {
      fade(lives, trail, dt);
      fade(puffLife, puffs, dt);
      updateGrass(dt);
      if (flashLife > 0) {
        flashLife -= dt;
        flash.scale.setScalar(flashSize * (1 + (1 - Math.max(0, flashLife) / 0.24) * 0.9));
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 4.5);
        if (flashLife <= 0) flash.visible = false;
      }
      if (confettiAge >= 0) {
        confettiAge += dt;
        confettiMat.uniforms.uScale.value = Math.max(640, window.innerHeight * 0.9);
        if (confettiAge > CONFETTI.life + 0.15) {
          confettiAge = -1;
          confetti.visible = false;
        } else placeConfetti();
      }
      void cursor;
      void puffCursor;
    },
  };
}
