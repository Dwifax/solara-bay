// Helpers to build models from primitives: colour a geometry per vertex, place it, and merge many
// pieces into one BufferGeometry so a whole car or palm draws in a single call.
import * as THREE from 'three';

const tmpColor = new THREE.Color();

/** Return a non-indexed copy of `geometry` with every vertex coloured `color` (hex). */
export function paint(geometry, color, emissiveBoost = 1) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  tmpColor.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tmpColor.r * emissiveBoost;
    colors[i * 3 + 1] = tmpColor.g * emissiveBoost;
    colors[i * 3 + 2] = tmpColor.b * emissiveBoost;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** A coloured box centred at (x, y, z), optionally turned about y. */
export function box(w, h, d, color, x = 0, y = 0, z = 0, rotY = 0) {
  const g = paint(new THREE.BoxGeometry(w, h, d), color);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** A coloured cylinder (axis along y) centred at (x, y, z). */
export function cylinder(rTop, rBottom, h, color, x = 0, y = 0, z = 0, segments = 8) {
  const g = paint(new THREE.CylinderGeometry(rTop, rBottom, h, segments), color);
  g.translate(x, y, z);
  return g;
}

/** Join coloured geometries (position, normal, color) into one. */
export function mergeGeometries(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let offset = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    position.set(g.attributes.position.array, offset * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    normal.set(g.attributes.normal.array, offset * 3);
    if (g.attributes.color) color.set(g.attributes.color.array, offset * 3);
    else color.fill(1, offset * 3, (offset + n) * 3);
    offset += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** A triangular prism roof (ridge along x) of width w (x), depth d (z) and height h, base at y = 0. */
export function roofPrism(w, h, d, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-w / 2, 0, 0);
  return paint(g, color);
}
