// The day cycle: keyframed palettes (noon, golden hour, sunset, dusk, night) drive the sun, the
// sky, the fog and a `night` factor that switches on windows, street lamps and headlights.
import * as THREE from 'three';
import { clamp, mixColor, lerp } from '../core/mathUtils.js';

const KEYS = [
  { h: 0, top: 0x050918, horizon: 0x1a1f3e, sun: 0x8090c0, sunI: 0.35, hemiSky: 0x2a3a66, hemiGround: 0x14121c, hemiI: 0.77, fog: 0x161b33, night: 1 },
  { h: 5.2, top: 0x0b1230, horizon: 0x2d2c55, sun: 0x8090c0, sunI: 0.3, hemiSky: 0x2a3a66, hemiGround: 0x14121c, hemiI: 0.77, fog: 0x1d2140, night: 1 },
  { h: 6.3, top: 0x35477e, horizon: 0xf5a77a, sun: 0xffb27a, sunI: 1.2, hemiSky: 0x8fa6d0, hemiGround: 0x6a4a3a, hemiI: 1.12, fog: 0xe5ad8c, night: 0.3 },
  { h: 8, top: 0x4a90e0, horizon: 0xf3dcbc, sun: 0xffe2b8, sunI: 2.4, hemiSky: 0xb5d4f5, hemiGround: 0x9a8064, hemiI: 1.40, fog: 0xe6dccb, night: 0 },
  { h: 12.5, top: 0x3a82d6, horizon: 0xcde5f4, sun: 0xfff4e2, sunI: 3.0, hemiSky: 0xbfdcf8, hemiGround: 0xa0896a, hemiI: 1.47, fog: 0xd3e2ec, night: 0 },
  { h: 16.5, top: 0x4d8bd4, horizon: 0xf7d7a6, sun: 0xffd496, sunI: 2.7, hemiSky: 0xbcd4ee, hemiGround: 0xa38160, hemiI: 1.40, fog: 0xf0d6ad, night: 0 },
  { h: 18.2, top: 0x5677bd, horizon: 0xffb066, sun: 0xffa24e, sunI: 2.4, hemiSky: 0xa9b8e0, hemiGround: 0x9a6a48, hemiI: 1.33, fog: 0xf2b07a, night: 0.05 },
  { h: 19.2, top: 0x3a3e86, horizon: 0xff7e48, sun: 0xff6a34, sunI: 1.5, hemiSky: 0x8a86c8, hemiGround: 0x7a4a40, hemiI: 1.19, fog: 0xdc8064, night: 0.45 },
  { h: 20.1, top: 0x1b2158, horizon: 0xc0566e, sun: 0xff5a48, sunI: 0.6, hemiSky: 0x5a5c9e, hemiGround: 0x3a2a36, hemiI: 0.98, fog: 0x6a3e5a, night: 0.85 },
  { h: 21.3, top: 0x070c26, horizon: 0x262650, sun: 0x8090c0, sunI: 0.35, hemiSky: 0x2a3a66, hemiGround: 0x14121c, hemiI: 0.77, fog: 0x1a1d3a, night: 1 },
  { h: 24, top: 0x050918, horizon: 0x1a1f3e, sun: 0x8090c0, sunI: 0.35, hemiSky: 0x2a3a66, hemiGround: 0x14121c, hemiI: 0.77, fog: 0x161b33, night: 1 },
];

/** Interpolated palette for an hour in [0, 24). */
export function paletteAt(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i += 1;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
  return {
    top: mixColor(a.top, b.top, t),
    horizon: mixColor(a.horizon, b.horizon, t),
    sun: mixColor(a.sun, b.sun, t),
    sunI: lerp(a.sunI, b.sunI, t),
    hemiSky: mixColor(a.hemiSky, b.hemiSky, t),
    hemiGround: mixColor(a.hemiGround, b.hemiGround, t),
    hemiI: lerp(a.hemiI, b.hemiI, t),
    fog: mixColor(a.fog, b.fog, t),
    night: lerp(a.night, b.night, t),
  };
}

/** Direction toward the sun (or the moon at night) for an hour. */
export function sunDirectionAt(hour, out = new THREE.Vector3()) {
  const rise = 6;
  const set = 19.9;
  if (hour > rise - 0.5 && hour < set + 0.5) {
    const s = ((hour - rise) / (set - rise)) * Math.PI;
    out.set(Math.cos(s), Math.sin(s) * 0.95, 0.42);
  } else {
    // Moon: high in the south-east sky.
    out.set(0.35, 0.75, 0.45);
  }
  return out.normalize();
}

export function createTimeOfDay(scene, sky) {
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const cam = sunLight.shadow.camera;
  cam.left = -95;
  cam.right = 95;
  cam.top = 95;
  cam.bottom = -95;
  cam.near = 1;
  cam.far = 700;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.12;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemi = new THREE.HemisphereLight(0xbfdcf8, 0xa0896a, 1);
  scene.add(hemi);

  const state = { hour: 18.4, night: 0, sunDir: new THREE.Vector3(), speed: 24 / (30 * 60) };
  const lightDir = new THREE.Vector3();

  function apply(focus) {
    const p = paletteAt(state.hour);
    sunDirectionAt(state.hour, state.sunDir);
    state.night = p.night;
    lightDir.copy(state.sunDir);
    if (lightDir.y < 0.12) {
      lightDir.y = 0.12;
      lightDir.normalize();
    }
    sunLight.color.set(p.sun);
    sunLight.intensity = p.sunI;
    sunLight.position.set(focus.x + lightDir.x * 300, lightDir.y * 300, focus.z + lightDir.z * 300);
    sunLight.target.position.set(focus.x, 0, focus.z);
    hemi.color.set(p.hemiSky);
    hemi.groundColor.set(p.hemiGround);
    hemi.intensity = p.hemiI;
    scene.fog.color.set(p.fog);
    scene.fog.near = lerp(160, 90, p.night);
    scene.fog.far = lerp(1100, 700, p.night);
    sky.uniforms.topColor.value.set(p.top);
    sky.uniforms.horizonColor.value.set(p.horizon);
    sky.uniforms.sunColor.value.set(p.sun);
    sky.uniforms.sunDir.value.copy(state.sunDir);
    sky.uniforms.night.value = p.night;
  }

  return {
    state,
    sunLight,
    hemi,
    /** Advance the clock by dt real seconds (a full day takes 30 minutes) and relight the scene around `focus`. */
    update(dt, focus, frozen) {
      if (!frozen) state.hour = (state.hour + dt * state.speed) % 24;
      sky.uniforms.time.value += dt;
      apply(focus);
    },
    setHour(hour, focus) {
      state.hour = hour;
      apply(focus);
    },
  };
}
