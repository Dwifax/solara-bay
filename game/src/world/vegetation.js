// Palm trees and leafy trees: one merged model each, drawn as instanced meshes with random
// heading, height and lean, planted along the boulevards, the beach, parks and yards.
import * as THREE from 'three';
import { cylinder, mergeGeometries, paint } from '../render/geometryUtils.js';
import { vertexColorMaterial } from '../render/cityMaterials.js';

/** A curved palm: a segmented trunk leaning in +x and a crown of drooping fronds. */
function buildPalmGeometry() {
  const parts = [];
  const segments = 7;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segments; i += 1) {
    const h = 1.5;
    const r = 0.26 - i * 0.018;
    const seg = cylinder(r * 0.92, r, h, i % 2 ? 0x8b6a48 : 0x7a5c3e, 0, h / 2, 0, 7);
    seg.rotateZ(-0.05 * i);
    seg.translate(x, y, 0);
    parts.push(seg);
    x += Math.sin(0.05 * i) * h;
    y += Math.cos(0.05 * i) * h;
  }
  const topX = x;
  const topY = y;
  parts.push(paint(new THREE.SphereGeometry(0.45, 6, 5), 0x5d4a2c).translate(topX, topY, 0));
  const frondCount = 9;
  for (let i = 0; i < frondCount; i += 1) {
    const angle = (i / frondCount) * Math.PI * 2;
    const frond = new THREE.PlaneGeometry(4.2, 1.1, 4, 1);
    const p = frond.attributes.position;
    for (let k = 0; k < p.count; k += 1) {
      const fx = p.getX(k) + 2.1;
      const width = Math.sin((fx / 4.2) * Math.PI) * 0.9 + 0.1;
      p.setY(k, p.getY(k) * width);
      p.setZ(k, -0.09 * fx * fx);
      p.setX(k, fx);
    }
    frond.rotateX(-Math.PI / 2);
    frond.rotateZ(0.25);
    frond.rotateY(angle);
    frond.translate(topX, topY, 0);
    const shade = i % 3 === 0 ? 0x3f7a2f : i % 3 === 1 ? 0x4b8c35 : 0x376b2a;
    const g = paint(frond, shade);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** A rounded broadleaf tree: trunk and three overlapping canopy blobs. */
function buildTreeGeometry() {
  const parts = [cylinder(0.25, 0.35, 3, 0x6d5135, 0, 1.5, 0, 6)];
  parts.push(paint(new THREE.IcosahedronGeometry(2.2, 0), 0x4f8a3a).translate(0, 4.2, 0));
  parts.push(paint(new THREE.IcosahedronGeometry(1.6, 0), 0x5d9a42).translate(1.1, 3.6, 0.5));
  parts.push(paint(new THREE.IcosahedronGeometry(1.5, 0), 0x467d33).translate(-0.9, 3.8, -0.6));
  return mergeGeometries(parts);
}

/** A small hedge / bush. */
function buildBushGeometry() {
  return mergeGeometries([paint(new THREE.IcosahedronGeometry(1, 0), 0x4a8436).scale(1.2, 0.8, 1.2).translate(0, 0.6, 0)]);
}

function instanced(scene, geometry, list, castShadow) {
  if (!list.length) return null;
  const doubleSided = vertexColorMaterial.clone();
  doubleSided.side = THREE.DoubleSide;
  const mesh = new THREE.InstancedMesh(geometry, doubleSided, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  list.forEach((t, i) => {
    e.set(0, t.rot, t.lean ?? 0);
    q.setFromEuler(e);
    s.setScalar(t.scale);
    p.set(t.x, t.y ?? 0.2, t.z);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

export function buildVegetation(scene, plan, rng, collision) {
  const palms = plan.palms.map((p) => ({ ...p, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.25), lean: rng.range(-0.06, 0.06) }));
  const trees = plan.trees.map((p) => ({ ...p, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.8, 1.3) }));
  const bushes = plan.bushes.map((p) => ({ ...p, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.7, 1.4) }));
  instanced(scene, buildPalmGeometry(), palms, true);
  instanced(scene, buildTreeGeometry(), trees, true);
  instanced(scene, buildBushGeometry(), bushes, false);
  for (const p of palms) if (p.solid) collision.addBox(p.x - 0.35, p.x + 0.35, p.z - 0.35, p.z + 0.35, 9, -1, 'palm');
  return { palmCount: palms.length };
}

