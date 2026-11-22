// Small primitive models of each gun, held in a character's right hand, with the muzzle position
// used for flashes and tracers.
import * as THREE from 'three';
import { box, cylinder, mergeGeometries } from '../render/geometryUtils.js';
import { vertexColorMaterial } from '../render/cityMaterials.js';

const builders = {
  pistol: () => mergeGeometries([box(0.05, 0.08, 0.22, 0x2b2b2b, 0, 0, 0.08), box(0.045, 0.14, 0.06, 0x3a2a1a, 0, -0.08, 0)]),
  smg: () => mergeGeometries([box(0.06, 0.1, 0.36, 0x262626, 0, 0, 0.12), box(0.045, 0.18, 0.05, 0x1a1a1a, 0, -0.1, 0.12), box(0.05, 0.1, 0.06, 0x262626, 0, -0.08, 0), cylinder(0.02, 0.02, 0.12, 0x111111, 0, 0, 0, 6).rotateX(Math.PI / 2).translate(0, 0.01, 0.34)]),
  shotgun: () => mergeGeometries([box(0.06, 0.08, 0.7, 0x3a3a3a, 0, 0.02, 0.25), box(0.07, 0.12, 0.3, 0x6b4426, 0, -0.03, -0.15), box(0.06, 0.06, 0.25, 0x6b4426, 0, -0.04, 0.3)]),
  rifle: () => mergeGeometries([box(0.06, 0.1, 0.8, 0x2f3a2f, 0, 0.02, 0.25), box(0.05, 0.16, 0.05, 0x222222, 0, -0.1, 0.18), box(0.06, 0.12, 0.25, 0x2f3a2f, 0, -0.02, -0.18), box(0.03, 0.05, 0.2, 0x111111, 0, 0.1, 0.2)]),
};

const MUZZLE = { pistol: 0.22, smg: 0.42, shotgun: 0.62, rifle: 0.68 };
const cache = new Map();

/** A mesh for weapon `id` (null for fists) to attach to a hand group. */
export function createWeaponMesh(id) {
  if (!builders[id]) return null;
  if (!cache.has(id)) cache.set(id, builders[id]());
  const mesh = new THREE.Mesh(cache.get(id), vertexColorMaterial);
  // The hand points down the arm; turn the gun to point along the forearm's forward.
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.userData.muzzle = MUZZLE[id];
  return mesh;
}
