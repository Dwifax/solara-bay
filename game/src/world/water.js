// The sea and the channel: one large plane with a shader that sums moving waves for its normals,
// reflects the sky by Fresnel, throws a sun glitter path and draws surf foam along the beach.
import * as THREE from 'three';
import { WATER_LEVEL, BEACH, CHANNEL } from './cityLayout.js';

const vertexShader = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <fog_pars_fragment>
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform float night;
uniform float shoreZ;
uniform float channelX;
varying vec3 vWorld;

vec2 waveGrad(vec2 p, vec2 dir, float freq, float speed, float amp) {
  float ph = dot(p, dir) * freq + time * speed;
  return dir * cos(ph) * freq * amp;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 g = vec2(0.0);
  g += waveGrad(p, normalize(vec2(0.3, 1.0)), 0.06, 1.1, 0.9);
  g += waveGrad(p, normalize(vec2(-0.8, 0.6)), 0.11, 1.7, 0.45);
  g += waveGrad(p, normalize(vec2(0.9, 0.2)), 0.23, 2.3, 0.22);
  g += waveGrad(p, normalize(vec2(-0.2, -1.0)), 0.47, 3.1, 0.1);
  g += waveGrad(p, normalize(vec2(0.6, -0.7)), 0.93, 4.3, 0.05);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 base = mix(shallowColor, deepColor, smoothstep(0.2, 0.9, 1.0 - v.y));
  vec3 col = mix(base, skyColor, clamp(fres * 1.15, 0.0, 1.0));
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(sunDir)), 0.0), 220.0);
  float sunUp = smoothstep(-0.05, 0.1, sunDir.y);
  col += sunColor * spec * 6.0 * mix(sunUp, 0.25, night);
  col += sunColor * pow(max(dot(r, normalize(sunDir)), 0.0), 18.0) * 0.18 * sunUp;
  // Surf foam along the beach.
  if (vWorld.x < channelX) {
    float shore = shoreZ + 3.0 * sin(vWorld.x * 0.05 + time * 0.6) + 1.5 * sin(vWorld.x * 0.17 - time * 0.9);
    float d = vWorld.z - shore;
    float foam = smoothstep(7.0, 0.0, d) * step(-2.0, d);
    foam *= 0.55 + 0.45 * sin(d * 1.6 - time * 2.4);
    col = mix(col, vec3(0.95, 0.97, 1.0) * mix(1.0, 0.35, night), clamp(foam, 0.0, 1.0) * 0.8);
  }
  col *= mix(1.0, 0.55, night);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWater(scene) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xffffff) },
      skyColor: { value: new THREE.Color(0x88bbee) },
      deepColor: { value: new THREE.Color(0x0b4f6c) },
      shallowColor: { value: new THREE.Color(0x1d8fa0) },
      night: { value: 0 },
      shoreZ: { value: BEACH.shoreZ },
      channelX: { value: CHANNEL.minX },
    },
  ]);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(100, WATER_LEVEL, 200);
  scene.add(mesh);
  return {
    mesh,
    update(dt, sunDir, sunHex, horizonHex, night) {
      uniforms.time.value += dt;
      uniforms.sunDir.value.copy(sunDir);
      uniforms.sunColor.value.set(sunHex);
      uniforms.skyColor.value.set(horizonHex);
      uniforms.night.value = night;
    },
  };
}
