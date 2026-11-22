// People built from boxes: a body (torso, head, hair, optional cap) and four limbs on pivots, with
// walk/run cycles, an aiming pose, a punch, sitting and a fall when killed. Geometries are cached
// per outfit so a crowd of identical outfits shares buffers.
import * as THREE from 'three';
import { box, mergeGeometries } from '../render/geometryUtils.js';
import { vertexColorMaterial } from '../render/cityMaterials.js';

const geometryCache = new Map();

function cached(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}

export const SKIN_TONES = [0xf1c9a5, 0xe0ac84, 0xc68a5e, 0x9c6644, 0x7a4b2e, 0x5a3825];
export const HAIR_COLORS = [0x1c1410, 0x3b2616, 0x6b4423, 0xb98b4e, 0x111111, 0x8a8a8a];
export const SHIRT_COLORS = [0xffffff, 0xf26d5b, 0x3e92cc, 0xffc857, 0x2a9d8f, 0xe76f9a, 0x9b5de5, 0x00bbf9, 0xf4a261, 0x80ed99, 0x222222];
export const PANTS_COLORS = [0x2b3a55, 0x3d3d3d, 0xc9b38a, 0x5a6d7c, 0x1d1d1d, 0xe9e2d0, 0x6b4f3a];

/**
 * Build a person. outfit: { skin, hair, shirt, pants, shoes, cap, vest, hairStyle: 'short'|'long'|'bald' }.
 */
export function createHumanoid(outfit) {
  const o = { shoes: 0x222222, hairStyle: 'short', ...outfit };
  const key = `${o.skin}-${o.hair}-${o.shirt}-${o.pants}-${o.shoes}-${o.cap ?? 'n'}-${o.vest ?? 'n'}-${o.hairStyle}`;
  const body = cached(`body-${key}`, () => {
    const parts = [
      box(0.5, 0.62, 0.28, o.shirt, 0, 1.24, 0),
      box(0.46, 0.16, 0.26, o.pants, 0, 0.88, 0),
      box(0.12, 0.1, 0.12, o.skin, 0, 1.6, 0),
      box(0.24, 0.27, 0.25, o.skin, 0, 1.77, 0),
      box(0.05, 0.03, 0.02, 0x222222, -0.06, 1.8, 0.13),
      box(0.05, 0.03, 0.02, 0x222222, 0.06, 1.8, 0.13),
    ];
    if (o.hairStyle !== 'bald') parts.push(box(0.26, 0.09, 0.27, o.hair, 0, 1.92, -0.01));
    if (o.hairStyle === 'long') parts.push(box(0.26, 0.3, 0.07, o.hair, 0, 1.74, -0.13));
    if (o.hairStyle !== 'bald') parts.push(box(0.26, 0.14, 0.05, o.hair, 0, 1.84, -0.12));
    if (o.cap) {
      parts.push(box(0.27, 0.08, 0.28, o.cap, 0, 1.95, 0));
      parts.push(box(0.24, 0.03, 0.14, o.cap, 0, 1.92, 0.18));
    }
    if (o.vest) parts.push(box(0.52, 0.42, 0.3, o.vest, 0, 1.3, 0));
    return mergeGeometries(parts);
  });
  const arm = cached(`arm-${o.shirt}-${o.skin}`, () => mergeGeometries([box(0.13, 0.3, 0.14, o.shirt, 0, -0.14, 0), box(0.11, 0.3, 0.12, o.skin, 0, -0.43, 0), box(0.11, 0.1, 0.12, o.skin, 0, -0.62, 0.01)]));
  const leg = cached(`leg-${o.pants}-${o.shoes}`, () => mergeGeometries([box(0.17, 0.82, 0.18, o.pants, 0, -0.42, 0), box(0.17, 0.1, 0.28, o.shoes, 0, -0.86, 0.05)]));

  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const bodyMesh = new THREE.Mesh(body, vertexColorMaterial);
  bodyMesh.castShadow = true;
  root.add(bodyMesh);
  function limb(geometry, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(geometry, vertexColorMaterial);
    mesh.castShadow = true;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  }
  const armL = limb(arm, -0.32, 1.5);
  const armR = limb(arm, 0.32, 1.5);
  const legL = limb(leg, -0.12, 0.9);
  const legR = limb(leg, 0.12, 0.9);
  const hand = new THREE.Group();
  hand.position.set(0, -0.64, 0.05);
  armR.add(hand);
  return { group, root, armL, armR, legL, legR, hand, phase: 0, punch: 0 };
}

/**
 * Pose a humanoid for this frame.
 * state: 'idle' | 'walk' | 'run' | 'dead' | 'sit' | 'swim'; speed in m/s; aim: 0..1; punch: 0..1 progress.
 */
export function animateHumanoid(model, dt, state, speed, aim = 0, punch = 0) {
  const { root, armL, armR, legL, legR } = model;
  if (state === 'dead') {
    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, -Math.PI / 2, Math.min(1, dt * 8));
    root.position.y = THREE.MathUtils.lerp(root.position.y, 0.15, Math.min(1, dt * 8));
    armL.rotation.set(-0.2, 0, -1.2);
    armR.rotation.set(-0.2, 0, 1.2);
    legL.rotation.set(0, 0, -0.15);
    legR.rotation.set(0, 0, 0.15);
    return;
  }
  root.rotation.x = 0;
  root.position.y = 0;
  if (state === 'sit') {
    legL.rotation.set(-1.45, 0, 0);
    legR.rotation.set(-1.45, 0, 0);
    armL.rotation.set(-0.9, 0, 0);
    armR.rotation.set(-0.9, 0, 0);
    return;
  }
  const stride = state === 'run' ? 1.0 : state === 'walk' ? 0.55 : state === 'swim' ? 0.4 : 0;
  model.phase += dt * (state === 'idle' ? 1.2 : speed * (state === 'run' ? 1.45 : 2.1));
  const s = Math.sin(model.phase);
  if (stride > 0) {
    legL.rotation.set(s * stride, 0, 0);
    legR.rotation.set(-s * stride, 0, 0);
    armL.rotation.set(-s * stride * 0.9, 0, -0.05);
    armR.rotation.set(s * stride * 0.9, 0, 0.05);
    root.position.y = Math.abs(Math.cos(model.phase)) * (state === 'run' ? 0.07 : 0.03);
    root.rotation.x = state === 'run' ? 0.12 : 0.03;
  } else {
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    armL.rotation.set(s * 0.03, 0, -0.06);
    armR.rotation.set(-s * 0.03, 0, 0.06);
  }
  if (state === 'swim') {
    root.rotation.x = 1.2;
    armL.rotation.set(-Math.PI + s * 1.2, 0, 0);
    armR.rotation.set(-Math.PI - s * 1.2, 0, 0);
  }
  if (aim > 0) {
    armR.rotation.set(-Math.PI / 2 * aim + armR.rotation.x * (1 - aim), 0, 0);
    armL.rotation.set(-Math.PI / 2.3 * aim + armL.rotation.x * (1 - aim), 0, 0.5 * aim);
  }
  if (punch > 0) {
    const p = Math.sin(punch * Math.PI);
    armR.rotation.set(-Math.PI / 2 * p - 0.2, 0, 0);
    root.rotation.y = -0.3 * p;
  } else {
    root.rotation.y = 0;
  }
}
