// Visual effects: pooled point-sprite particles (smoke, fire, sparks, dust, blood, water splash),
// bullet tracers, a flash light for muzzle flashes and explosions, and tyre smoke.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (600.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
varying float vAlpha;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vTint, vAlpha * soft);
  #include <fog_fragment>
}`;

function createPool(scene, capacity, additive) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(capacity * 3);
  const tint = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < capacity; i += 1) particles.push({ life: 0 });
  let cursor = 0;
  return {
    emit(p) {
      const slot = particles[cursor];
      cursor = (cursor + 1) % capacity;
      Object.assign(slot, p);
      slot.age = 0;
      slot.c0 = new THREE.Color(p.color);
      slot.c1 = new THREE.Color(p.colorEnd ?? p.color);
    },
    update(dt) {
      const tmp = new THREE.Color();
      for (let i = 0; i < capacity; i += 1) {
        const p = particles[i];
        if (p.life <= 0 || p.age >= p.life) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        p.age += dt;
        const t = Math.min(1, p.age / p.life);
        p.vy -= (p.gravity ?? 0) * dt;
        const drag = p.drag ?? 0;
        p.vx *= 1 - drag * dt;
        p.vy *= 1 - drag * dt;
        p.vz *= 1 - drag * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05 && p.gravity) {
          p.y = 0.05;
          p.vy *= -0.3;
        }
        position[i * 3] = p.x;
        position[i * 3 + 1] = p.y;
        position[i * 3 + 2] = p.z;
        tmp.copy(p.c0).lerp(p.c1, t);
        tint[i * 3] = tmp.r;
        tint[i * 3 + 1] = tmp.g;
        tint[i * 3 + 2] = tmp.b;
        size[i] = p.size + ((p.sizeEnd ?? p.size) - p.size) * t;
        alpha[i] = (p.alpha ?? 1) * (1 - t) * Math.min(1, p.age * 20);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.tint.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.alpha.needsUpdate = true;
    },
  };
}

export function createEffects(scene) {
  const smoke = createPool(scene, 900, false);
  const glow = createPool(scene, 700, true);
  const flashLight = new THREE.PointLight(0xffb060, 0, 18, 2);
  scene.add(flashLight);
  let flashLevel = 0;

  // Tracers: a small pool of line segments.
  const tracerCount = 40;
  const tracerPos = new Float32Array(tracerCount * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(tracerCount);
  let tracerCursor = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    muzzleFlash(x, y, z, dirX, dirY, dirZ, big = false) {
      for (let i = 0; i < (big ? 6 : 3); i += 1) {
        const s = rand(0.2, 0.9);
        glow.emit({ x: x + dirX * s * 0.3, y: y + dirY * s * 0.3, z: z + dirZ * s * 0.3, vx: dirX * rand(2, 6), vy: dirY * rand(2, 6), vz: dirZ * rand(2, 6), life: 0.06, size: big ? 0.9 : 0.55, sizeEnd: 0.1, color: 0xfff0b0, colorEnd: 0xff7020, alpha: 1 });
      }
      smoke.emit({ x, y, z, vx: dirX * 0.6, vy: 0.4, vz: dirZ * 0.6, life: 0.7, size: 0.3, sizeEnd: 1.0, color: 0xcfcfcf, alpha: 0.25, drag: 2 });
      flashLight.position.set(x, y, z);
      flashLevel = big ? 9 : 5;
    },
    tracer(ax, ay, az, bx, by, bz) {
      const i = tracerCursor;
      tracerCursor = (tracerCursor + 1) % tracerCount;
      tracerPos.set([ax, ay, az, bx, by, bz], i * 6);
      tracerLife[i] = 0.06;
    },
    impactSparks(x, y, z, nx = 0, ny = 1, nz = 0) {
      for (let i = 0; i < 6; i += 1) {
        glow.emit({ x, y, z, vx: nx * 3 + rand(-3, 3), vy: ny * 3 + rand(0, 4), vz: nz * 3 + rand(-3, 3), life: rand(0.15, 0.35), size: 0.12, sizeEnd: 0.04, color: 0xffe08a, colorEnd: 0xff6a00, gravity: 14 });
      }
      smoke.emit({ x, y, z, vx: nx, vy: 0.6, vz: nz, life: 0.8, size: 0.25, sizeEnd: 1.1, color: 0xb9ad98, alpha: 0.45, drag: 2 });
    },
    blood(x, y, z) {
      for (let i = 0; i < 7; i += 1) smoke.emit({ x, y, z, vx: rand(-1.5, 1.5), vy: rand(0, 2.5), vz: rand(-1.5, 1.5), life: rand(0.3, 0.6), size: rand(0.1, 0.22), sizeEnd: 0.05, color: 0x8a0a0a, colorEnd: 0x4a0404, alpha: 0.9, gravity: 9 });
    },
    dust(x, y, z) {
      smoke.emit({ x, y, z, vx: rand(-0.5, 0.5), vy: rand(0.2, 0.8), vz: rand(-0.5, 0.5), life: 0.9, size: 0.4, sizeEnd: 1.6, color: 0xc9b99a, alpha: 0.35, drag: 1.5 });
    },
    tyreSmoke(x, z) {
      smoke.emit({ x: x + rand(-0.2, 0.2), y: 0.3, z: z + rand(-0.2, 0.2), vx: rand(-0.6, 0.6), vy: rand(0.3, 0.9), vz: rand(-0.6, 0.6), life: rand(1.0, 1.8), size: 0.6, sizeEnd: 2.6, color: 0xe8e8e8, alpha: 0.35, drag: 1.2 });
    },
    engineSmoke(x, y, z, heavy) {
      smoke.emit({ x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3), vx: rand(-0.3, 0.3), vy: rand(1.2, 2.2), vz: rand(-0.3, 0.3), life: rand(1.4, 2.4), size: heavy ? 0.8 : 0.5, sizeEnd: heavy ? 3.4 : 2.2, color: heavy ? 0x2a2a2a : 0x9a9a9a, alpha: heavy ? 0.6 : 0.35, drag: 0.6 });
    },
    fire(x, y, z) {
      glow.emit({ x: x + rand(-0.5, 0.5), y, z: z + rand(-0.5, 0.5), vx: rand(-0.4, 0.4), vy: rand(1.5, 3), vz: rand(-0.4, 0.4), life: rand(0.35, 0.7), size: rand(0.8, 1.4), sizeEnd: 0.2, color: 0xffd060, colorEnd: 0xff3000, alpha: 0.9 });
    },
    explosion(x, y, z) {
      for (let i = 0; i < 40; i += 1) glow.emit({ x, y, z, vx: rand(-8, 8), vy: rand(1, 10), vz: rand(-8, 8), life: rand(0.4, 0.9), size: rand(1.5, 3), sizeEnd: 0.4, color: 0xffe080, colorEnd: 0xff2a00, alpha: 1, drag: 3 });
      for (let i = 0; i < 30; i += 1) smoke.emit({ x, y, z, vx: rand(-4, 4), vy: rand(1, 6), vz: rand(-4, 4), life: rand(2, 3.5), size: rand(1.5, 3), sizeEnd: rand(5, 8), color: 0x3a3a3a, colorEnd: 0x1a1a1a, alpha: 0.7, drag: 1.5 });
      for (let i = 0; i < 20; i += 1) glow.emit({ x, y, z, vx: rand(-14, 14), vy: rand(4, 14), vz: rand(-14, 14), life: rand(0.6, 1.2), size: 0.2, sizeEnd: 0.05, color: 0xffd080, colorEnd: 0xff5000, gravity: 16 });
      flashLight.position.set(x, y + 2, z);
      flashLevel = 40;
    },
    splash(x, y, z) {
      for (let i = 0; i < 14; i += 1) smoke.emit({ x, y, z, vx: rand(-2, 2), vy: rand(2, 5), vz: rand(-2, 2), life: rand(0.5, 0.9), size: 0.3, sizeEnd: 0.6, color: 0xe8f6ff, alpha: 0.8, gravity: 10 });
    },
    update(dt) {
      smoke.update(dt);
      glow.update(dt);
      flashLevel *= Math.exp(-dt * 30);
      flashLight.intensity = flashLevel;
      for (let i = 0; i < tracerCount; i += 1) {
        if (tracerLife[i] > 0) {
          tracerLife[i] -= dt;
          if (tracerLife[i] <= 0) tracerPos.fill(0, i * 6, i * 6 + 6);
        }
      }
      tracerGeo.attributes.position.needsUpdate = true;
    },
  };
}
