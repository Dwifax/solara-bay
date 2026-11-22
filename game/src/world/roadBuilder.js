// Road surfaces: asphalt for every street and bridge deck, painted markings (centre lines, lane
// dashes, crosswalks, stop lines), raised sidewalks around each block and the lot ground inside.
import * as THREE from 'three';
import { mergeGeometries, paint } from '../render/geometryUtils.js';
import { vertexColorMaterial } from '../render/cityMaterials.js';
import { BLOCK, ROAD_HALF } from './cityLayout.js';

const ASPHALT = 0x4a4d53;
const SIDEWALK = 0xcfc8bc;
const YELLOW = 0xe8c440;
const WHITE = 0xeeeeea;

/** A flat quad on the ground spanning [x0, x1] × [z0, z1] at height y. */
function flatQuad(x0, x1, z0, z1, y, color) {
  const g = paint(new THREE.PlaneGeometry(x1 - x0, z1 - z0), color);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

/** A painted stripe along an edge direction: centre (cx, cz), length along the road and width across. */
function stripe(edge, cx, cz, length, width, y, color) {
  return edge.horizontal ? flatQuad(cx - length / 2, cx + length / 2, cz - width / 2, cz + width / 2, y, color) : flatQuad(cx - width / 2, cx + width / 2, cz - length / 2, cz + length / 2, y, color);
}

export function buildRoads(scene, network, blocks) {
  const asphalt = [];
  const marks = [];
  for (const edge of network.edges) {
    const { a, b } = edge;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z);
    const maxZ = Math.max(a.z, b.z);
    if (edge.horizontal) asphalt.push(flatQuad(minX - ROAD_HALF, maxX + ROAD_HALF, minZ - ROAD_HALF, maxZ + ROAD_HALF, 0.02, ASPHALT));
    else asphalt.push(flatQuad(minX - ROAD_HALF, maxX + ROAD_HALF, minZ - ROAD_HALF, maxZ + ROAD_HALF, 0.02, ASPHALT));
    // Markings stop short of the intersections.
    const start = ROAD_HALF + 4;
    const end = edge.length - ROAD_HALF - 4;
    const len = end - start;
    const ox = edge.horizontal ? 0 : 1;
    const oz = edge.horizontal ? 1 : 0;
    const midT = (start + end) / 2;
    const mx = a.x + edge.dirX * midT;
    const mz = a.z + edge.dirZ * midT;
    marks.push(stripe(edge, mx + ox * 0.18, mz + oz * 0.18, len, 0.15, 0.04, YELLOW));
    marks.push(stripe(edge, mx - ox * 0.18, mz - oz * 0.18, len, 0.15, 0.04, YELLOW));
    for (let t = start + 1.5; t < end - 2; t += 7) {
      const px = a.x + edge.dirX * (t + 1.5);
      const pz = a.z + edge.dirZ * (t + 1.5);
      marks.push(stripe(edge, px + ox * 3.5, pz + oz * 3.5, 3, 0.14, 0.04, WHITE));
      marks.push(stripe(edge, px - ox * 3.5, pz - oz * 3.5, 3, 0.14, 0.04, WHITE));
    }
    // Stop lines and crosswalks at both ends.
    for (const [node, sign] of [
      [a, 1],
      [b, -1],
    ]) {
      if (edge.bridge && node.neighbors.length < 2) continue;
      const sx = node.x + edge.dirX * sign * (ROAD_HALF + 3.6);
      const sz = node.z + edge.dirZ * sign * (ROAD_HALF + 3.6);
      for (let k = -6; k <= 6; k += 1.5) {
        marks.push(stripe(edge, sx + ox * k, sz + oz * k, 3.2, 0.7, 0.045, WHITE));
      }
      // Stop line across the lanes arriving at this node (right-hand traffic).
      const tx = -edge.dirX * sign;
      const tz = -edge.dirZ * sign;
      const lx = node.x - tx * (ROAD_HALF + 6.2) - tz * 3.5;
      const lz = node.z - tz * (ROAD_HALF + 6.2) + tx * 3.5;
      marks.push(stripe(edge, lx, lz, 0.5, 6.8, 0.045, WHITE));
    }
  }
  const asphaltMesh = new THREE.Mesh(mergeGeometries(asphalt), vertexColorMaterial);
  asphaltMesh.receiveShadow = true;
  scene.add(asphaltMesh);
  const markMesh = new THREE.Mesh(mergeGeometries(marks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  markMesh.receiveShadow = true;
  scene.add(markMesh);

  // Sidewalk slabs around each block, then the lot ground inside them.
  const slabs = [];
  for (const block of blocks) {
    const x0 = block.bi * BLOCK + ROAD_HALF;
    const z0 = block.bj * BLOCK + ROAD_HALF;
    const g = paint(new THREE.BoxGeometry(BLOCK - ROAD_HALF * 2, 0.18, BLOCK - ROAD_HALF * 2), SIDEWALK);
    g.translate(x0 + (BLOCK - ROAD_HALF * 2) / 2, 0.09, z0 + (BLOCK - ROAD_HALF * 2) / 2);
    slabs.push(g);
    if (block.groundColor) {
      const lot = block.lot;
      slabs.push(flatQuad(lot.minX - 1, lot.maxX + 1, lot.minZ - 1, lot.maxZ + 1, 0.2, block.groundColor));
    }
  }
  const slabMesh = new THREE.Mesh(mergeGeometries(slabs), vertexColorMaterial);
  slabMesh.receiveShadow = true;
  scene.add(slabMesh);
  return { asphaltMesh, markMesh, slabMesh };
}
