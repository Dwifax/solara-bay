// The sky: a camera-centred dome with a horizon gradient, sun disc and glow, drifting procedural
// clouds lit by the sun, and stars that come out at night.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float night;
uniform float time;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(horizonColor, topColor, t);
  // Below the horizon: fade toward a hazy sea-level tone.
  if (h < 0.0) col = mix(horizonColor, horizonColor * 0.55, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(dir, normalize(sunDir)), 0.0);
  float sunUp = smoothstep(-0.15, 0.05, sunDir.y);
  col += sunColor * pow(sd, 6.0) * 0.45 * sunUp;
  col += sunColor * pow(sd, 64.0) * 0.8 * sunUp;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 2.5 * sunUp;
  // Clouds on a virtual plane above the city.
  if (h > 0.01) {
    vec2 uv = dir.xz / (h + 0.08) * 1.6 + vec2(time * 0.004, time * 0.0015);
    float c = fbm(uv);
    float cover = smoothstep(0.5, 0.8, c) * smoothstep(0.01, 0.2, h);
    vec3 lit = mix(vec3(1.0), sunColor * 1.2 + vec3(0.15), 0.55 + 0.45 * pow(sd, 3.0));
    vec3 cloudCol = mix(lit, horizonColor * 0.6 + vec3(0.05, 0.05, 0.1), night * 0.85);
    col = mix(col, cloudCol, cover * 0.8);
  }
  // Stars.
  if (night > 0.01 && h > 0.0) {
    vec2 sp = dir.xz / (h + 0.3) * 220.0;
    float star = step(0.9975, hash(floor(sp)));
    col += vec3(star) * night * smoothstep(0.0, 0.3, h) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyDome(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x3d86d8) },
    horizonColor: { value: new THREE.Color(0xffc890) },
    sunColor: { value: new THREE.Color(0xffa860) },
    sunDir: { value: new THREE.Vector3(0.5, 0.3, 0.5) },
    night: { value: 0 },
    time: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    uniforms,
    follow(camera) {
      mesh.position.copy(camera.position);
    },
  };
}
