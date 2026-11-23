import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// Animated water surface shared by the island (calm, bright lagoon) and the
// ocean at night (big swell). The vertex shader sums four sine waves in world
// space; waveHeight() mirrors it on the CPU so the canoe can float on them.
const VERT = `
  uniform float uTime;
  uniform vec4 uWaves[4];   // dir.x, dir.z, amplitude, wavelength
  uniform float uSpeed;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vRel;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float h = 0.0;
    float dhx = 0.0;
    float dhz = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 d = uWaves[i].xy;
      float k = 6.2831853 / uWaves[i].w;
      float f = dot(d, wp.xz) * k - uTime * sqrt(9.8 * k) * uSpeed;
      h += uWaves[i].z * sin(f);
      float c = uWaves[i].z * k * cos(f);
      dhx += d.x * c;
      dhz += d.y * c;
    }
    wp.y += h;
    vWorldPos = wp.xyz;
    vNormal = normalize(vec3(-dhx, 1.0, -dhz));
    vRel = h;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAG = `
  uniform vec3 uDeep, uShallow, uSky, uLightDir, uLightColor, uFogColor;
  uniform float uOpacity, uGlint, uFoam, uMaxAmp, uFogNear, uFogFar, uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vRel;
  float ripple(vec2 p) {
    return sin(p.x * 1.7 + uTime * 1.3) * sin(p.y * 1.3 - uTime * 0.9);
  }
  void main() {
    vec3 n = normalize(vNormal);
    // Fine ripples so the surface is not glassy between the big waves.
    float r = ripple(vWorldPos.xz) * 0.06 + ripple(vWorldPos.xz * 2.3 + 7.0) * 0.03;
    n = normalize(n + vec3(r, 0.0, -r));
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    float t = clamp(0.5 + vRel / (2.0 * uMaxAmp), 0.0, 1.0);
    vec3 col = mix(uDeep, uShallow, t);
    col = mix(col, uSky, fres * 0.55);
    vec3 R = reflect(-uLightDir, n);
    float spec = pow(max(dot(R, V), 0.0), uGlint);
    col += uLightColor * spec;
    float crest = smoothstep(0.62, 1.0, t);
    col = mix(col, vec3(0.92, 0.96, 1.0), crest * uFoam);
    float dist = length(cameraPosition - vWorldPos);
    float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function createWater({ level, size = 1400, segments = 160, waves: wavesIn, speed = 1, deep, shallow, sky, lightDir, lightColor, opacity, glint = 90, foam = 0.4, fog }) {
  const base = wavesIn.map((w) => [...w]);
  const waves = wavesIn.map((w) => [...w]);
  const maxAmp = waves.reduce((s, w) => s + w[2], 0);
  const uniforms = {
    uTime: { value: 0 },
    uWaves: { value: waves.map((w) => new THREE.Vector4(w[0], w[1], w[2], w[3])) },
    uSpeed: { value: speed },
    uDeep: { value: new THREE.Color(deep) },
    uShallow: { value: new THREE.Color(shallow) },
    uSky: { value: new THREE.Color(sky) },
    uLightDir: { value: new THREE.Vector3(...lightDir).normalize() },
    uLightColor: { value: new THREE.Color(lightColor) },
    uFogColor: { value: new THREE.Color(fog?.color ?? sky) },
    uFogNear: { value: fog?.near ?? 1e6 },
    uFogFar: { value: fog?.far ?? 2e6 },
    uOpacity: { value: opacity },
    uGlint: { value: glint },
    uFoam: { value: foam },
    uMaxAmp: { value: Math.max(0.01, maxAmp) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: opacity < 1, depthWrite: true
  });
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = level;
  mesh.frustumCulled = false;
  const cell = size / segments;

  function waveHeight(x, z, t = uniforms.uTime.value) {
    let h = 0;
    for (const w of waves) {
      const k = (2 * Math.PI) / w[3];
      const f = (w[0] * x + w[1] * z) * k - t * Math.sqrt(9.8 * k) * speed;
      h += w[2] * Math.sin(f);
    }
    return level + h;
  }

  // Keep the plane centred on the viewer, snapped to the grid so vertices do
  // not swim; the waves are in world space so the move is invisible.
  function follow(x, z) {
    mesh.position.x = Math.round(x / cell) * cell;
    mesh.position.z = Math.round(z / cell) * cell;
  }

  function update(delta) { uniforms.uTime.value += delta; }

  // Weather hooks: scale every amplitude, or turn the whole wave field by an
  // angle (a squall swinging the swell). Both keep the CPU mirror in step.
  let waveScale = 1, swellRot = 0;
  function applyWaves() {
    const c = Math.cos(swellRot), s = Math.sin(swellRot);
    base.forEach((b, i) => {
      const dx = b[0] * c - b[1] * s, dz = b[0] * s + b[1] * c;
      waves[i][0] = dx; waves[i][1] = dz; waves[i][2] = b[2] * waveScale;
      uniforms.uWaves.value[i].set(dx, dz, b[2] * waveScale, b[3]);
    });
  }
  function setWaveScale(k) { waveScale = k; applyWaves(); }
  function setSwellRotation(r) { swellRot = r; applyWaves(); }

  return { mesh, uniforms, waveHeight, follow, update, level, setWaveScale, setSwellRotation, get swellRotation() { return swellRot; }, get waveScale() { return waveScale; } };
}
