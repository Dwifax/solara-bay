// People built from rounded primitives: a tapered torso and hips, neck, a rounded head with a
// face and one of several hair styles (or a cap), and four capsule limbs on pivots with hands and
// shoes, animated with walk/run cycles, an aiming pose, a punch, sitting and a fall when killed.
// Geometries are cached per outfit so a crowd of identical outfits shares buffers.
import * as THREE from 'three';
import { box, mergeGeometries, paint } from '../render/geometryUtils.js';
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

/** A vertical capsule of radius r and total length len, top at y = 0 hanging down. */
function capsule(r, len, color, y = 0, sx = 1, sz = 1) {
  const g = paint(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 3, 8), color);
  g.scale(sx, 1, sz);
  g.translate(0, y - len / 2, 0);
  return g;
}

/** A tapered oval section (torso / hips) between y0 and y1. */
function oval(rTop, rBottom, y0, y1, depth, color) {
  const g = paint(new THREE.CylinderGeometry(rTop, rBottom, y1 - y0, 10, 1), color);
  g.scale(1, 1, depth);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

function sphere(r, color, x, y, z, sx = 1, sy = 1, sz = 1) {
  const g = paint(new THREE.SphereGeometry(r, 12, 9), color);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

function hairParts(o) {
  const parts = [];
  if (o.cap) {
    parts.push(sphere(0.145, o.cap, 0, 1.87, -0.005, 1.02, 0.62, 1.05));
    parts.push(box(0.22, 0.025, 0.14, o.cap, 0, 1.86, 0.15));
    if (o.hairStyle === 'long') parts.push(box(0.2, 0.26, 0.06, o.hair, 0, 1.66, -0.12));
    return parts;
  }
  if (o.hairStyle === 'bald') return parts;
  parts.push(sphere(0.15, o.hair, 0, 1.84, -0.015, 1.0, 0.78, 1.04));
  if (o.hairStyle === 'long') {
    parts.push(box(0.26, 0.34, 0.08, o.hair, 0, 1.66, -0.1));
    parts.push(sphere(0.06, o.hair, 0, 1.58, -0.15, 1, 1.8, 1));
  } else if (o.hairStyle === 'bun') {
    parts.push(sphere(0.075, o.hair, 0, 1.92, -0.1));
  } else if (o.hairStyle === 'mohawk') {
    parts.push(box(0.05, 0.12, 0.26, o.hair, 0, 1.95, 0));
  }
  return parts;
}

/**
 * Build a person. outfit: { skin, hair, shirt, pants, shoes, cap, vest, jacket,
 * hairStyle: 'short' | 'long' | 'bun' | 'mohawk' | 'bald' }.
 */
export function createHumanoid(outfit) {
  const o = { shoes: 0x222222, hairStyle: 'short', ...outfit };
  const key = `${o.skin}-${o.hair}-${o.shirt}-${o.pants}-${o.shoes}-${o.cap ?? 'n'}-${o.vest ?? 'n'}-${o.jacket ?? 'n'}-${o.hairStyle}`;
  const body = cached(`body-${key}`, () => {
    const parts = [
      oval(0.25, 0.19, 1.05, 1.5, 0.62, o.jacket ?? o.shirt),
      oval(0.2, 0.2, 0.88, 1.06, 0.66, o.pants),
      sphere(0.25, o.jacket ?? o.shirt, 0, 1.47, 0, 1, 0.32, 0.6),
      oval(0.055, 0.06, 1.5, 1.64, 1, o.skin),
      sphere(0.125, o.skin, 0, 1.76, 0, 1, 1.13, 1.05),
      box(0.03, 0.05, 0.04, o.skin, 0, 1.74, 0.135),
      box(0.04, 0.022, 0.01, 0x1a1a1a, -0.045, 1.785, 0.122),
      box(0.04, 0.022, 0.01, 0x1a1a1a, 0.045, 1.785, 0.122),
      box(0.05, 0.012, 0.01, 0x7a3b33, 0, 1.69, 0.121),
      box(0.4, 0.04, 0.27, 0x2a2420, 0, 1.06, 0),
      ...hairParts(o),
    ];
    if (o.jacket) parts.push(oval(0.15, 0.13, 1.1, 1.48, 0.62, o.shirt).translate(0, 0, 0.055));
    if (o.vest) parts.push(oval(0.27, 0.23, 1.12, 1.48, 0.68, o.vest));
    return mergeGeometries(parts);
  });
  const sleeve = o.jacket ?? o.shirt;
  const arm = cached(`arm-${sleeve}-${o.skin}-${o.jacket ? 'j' : 's'}`, () => mergeGeometries([
    capsule(0.068, o.jacket ? 0.56 : 0.3, sleeve, 0.04),
    capsule(0.056, 0.36, o.skin, o.jacket ? -0.48 : -0.24),
    sphere(0.055, o.skin, 0, -0.62, 0.01, 0.9, 1.1, 1),
  ]));
  const leg = cached(`leg-${o.pants}-${o.shoes}`, () => mergeGeometries([
    capsule(0.088, 0.5, o.pants, 0.02),
    capsule(0.074, 0.42, o.pants, -0.42),
    box(0.13, 0.09, 0.27, o.shoes, 0, -0.86, 0.05),
  ]));

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
  const armL = limb(arm, -0.29, 1.47);
  const armR = limb(arm, 0.29, 1.47);
  const legL = limb(leg, -0.1, 0.9);
  const legR = limb(leg, 0.1, 0.9);
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0.04);
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
