// Afternoon skybox for the stadium. A box drawn from the inside, parked on
// the camera. Clouds drift on a dome so the view has no seam.

import * as THREE from 'three';

const HORIZON = 0xc9e8f8;
const ZENITH = 0x1a6fce;
const CLOUD = 0xfffdf8;
const SHADE = 0x6a90ae;

const VERT = `
  varying vec3 vDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vDir = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAG = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uCloud;
  uniform vec3 uShade;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    // The third-person camera only sees the first ~12 degrees above the
    // horizon, so the blue and the clouds both live in that low band.
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.09, up));
    col = mix(col, uHorizon, smoothstep(0.0, 0.25, clamp(-d.y, 0.0, 1.0)));

    // Dome projection, then a warp, so the puffs stay round and the view
    // toward -Z has no atan seam.
    vec2 uv = d.xz / (d.y * 0.45 + 0.2);
    uv += vec2(2.6, -0.8);
    uv.x += uTime * 0.01;
    float warp = fbm(uv * 0.33);
    vec2 p = uv * 0.62 + vec2(warp, warp * 0.65) * 1.6;
    float n = fbm(p);
    float puff = smoothstep(0.50, 0.63, n);
    float core = smoothstep(0.57, 0.78, n);
    float inSky = smoothstep(-0.02, 0.03, d.y);
    col = mix(col, uShade, puff * inSky);
    col = mix(col, uCloud, core * inSky);

    float sun = max(dot(d, uSunDir), 0.0);
    col += vec3(1.0, 0.94, 0.78) * pow(sun, 96.0) * 0.16 * (1.0 - core);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(scene) {
  const horizon = new THREE.Color(HORIZON);
  scene.background = horizon;
  if (scene.fog) scene.fog.color.copy(horizon);

  const sky = new THREE.Mesh(
    new THREE.BoxGeometry(320, 320, 320),
    new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(ZENITH) },
        uHorizon: { value: horizon },
        uCloud: { value: new THREE.Color(CLOUD) },
        uShade: { value: new THREE.Color(SHADE) },
        uSunDir: { value: new THREE.Vector3(16, 28, 14).normalize() },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.name = 'sky';
  scene.add(sky);

  return {
    setPalette({ horizon: horizonHex, zenith, cloud, shade, sunDirection }) {
      horizon.set(horizonHex);
      scene.background = horizon;
      if (scene.fog) scene.fog.color.copy(horizon);
      sky.material.uniforms.uZenith.value.set(zenith);
      sky.material.uniforms.uCloud.value.set(cloud);
      sky.material.uniforms.uShade.value.set(shade);
      sky.material.uniforms.uSunDir.value.copy(sunDirection).normalize();
    },
    update(camera, elapsed) {
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = elapsed || 0;
    },
  };
}
