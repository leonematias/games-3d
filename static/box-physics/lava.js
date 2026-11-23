import * as THREE from 'three';

export function createLava(scene, areas = [{x:0,z:30.1,top:0,width:11.5,depth:3.3}]) {
  const uniforms = { time: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      uniform float time;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += 0.018 * sin(uv.x * 27.0 + time * 0.55) * sin(uv.y * 14.0 - time * 0.3);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float n = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { n += a * noise(p); p = p * 2.03 + 7.13; a *= 0.5; }
        return n;
      }
      void main() {
        vec2 p = vUv * vec2(17.0, 4.9);
        vec2 drift = vec2(time * 0.10, -time * 0.055);
        vec2 warp = vec2(fbm(p * 0.54 + drift), fbm(p * 0.61 - drift)) - 0.5;
        float field = fbm(p + warp * 3.8 + drift);
        float crust = fbm(p * 1.8 - drift * 0.6);
        float fissure = smoothstep(0.49, 0.58, field + (crust - 0.5) * 0.16);
        float core = smoothstep(0.61, 0.75, field + (crust - 0.5) * 0.16);
        vec3 rock = mix(vec3(0.075, 0.012, 0.008), vec3(0.24, 0.025, 0.008), crust);
        vec3 ember = vec3(0.95, 0.15, 0.016);
        vec3 glow = vec3(1.0, 0.68, 0.10);
        vec3 color = mix(rock, ember, fissure);
        color = mix(color, glow, core * 0.84);
        color *= 0.91 + 0.09 * sin(time * 0.75 + field * 11.0);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
  for (const area of areas) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(area.width, area.depth, 24, 12), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(area.x, area.top + 0.035, area.z);
    scene.add(mesh);
  }
  return { update(seconds) { uniforms.time.value = seconds; } };
}
