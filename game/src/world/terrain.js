// Land masses: the mainland and docks slabs with quay walls, the sloping sand beach, and the green
// hills that frame the city to the north and west (with scattered hillside houses that light up
// at night). Invisible walls keep the player inside the playable map.
import * as THREE from 'three';
import { mergeGeometries, box } from '../render/geometryUtils.js';
import { vertexColorMaterial, createNightGlowMaterial } from '../render/cityMaterials.js';
import { BEACH, CHANNEL, DOCKS_LAND, WORLD_BOUNDS, groundHeight, BRIDGE_ROWS, BLOCK, ROAD_HALF } from './cityLayout.js';
import { mixColor, smoothstep } from '../core/mathUtils.js';

/** Height of the hills outside the playable city at (x, z); 0 inside. */
export function hillHeight(x, z) {
  const north = Math.max(0, -545 - z);
  const west = Math.max(0, -545 - x);
  const d = Math.max(north, west);
  if (d <= 0) return 0;
  const n = Math.sin(x * 0.011) * 0.5 + Math.sin(z * 0.013 + 1.3) * 0.35 + Math.sin((x + z) * 0.021) * 0.25 + Math.sin(x * 0.043 - z * 0.03) * 0.12;
  return smoothstep(0, 140, d) * (45 + 70 * (0.5 + 0.5 * n)) + smoothstep(150, 500, d) * 90;
}

export function buildTerrain(scene, collision, rng) {
  const parts = [];
  // Mainland slab (top at y = 0) and its quay walls along the channel.
  parts.push(box(1702, 4, 1512, 0xc9bfae, -499, -2.05, -444));
  // Docks island.
  const dw = DOCKS_LAND.maxX - DOCKS_LAND.minX;
  const dd = DOCKS_LAND.maxZ - DOCKS_LAND.minZ;
  parts.push(box(dw, 4, dd, 0xa8a49c, (DOCKS_LAND.minX + DOCKS_LAND.maxX) / 2, -2.05, (DOCKS_LAND.minZ + DOCKS_LAND.maxZ) / 2));
  // Bridge abutment pads over the channel edges.
  for (const j of BRIDGE_ROWS) parts.push(box(6, 3.6, ROAD_HALF * 2 + 6, 0xb0aaa0, CHANNEL.minX + 2, -1.8, j * BLOCK));
  const slab = new THREE.Mesh(mergeGeometries(parts), vertexColorMaterial);
  slab.receiveShadow = true;
  scene.add(slab);

  // The beach: a strip that slopes from the promenade down under the sea.
  const beachGeo = new THREE.PlaneGeometry(CHANNEL.minX + 1200, BEACH.seaZ - BEACH.minZ + 60, 8, 40);
  beachGeo.rotateX(-Math.PI / 2);
  beachGeo.translate((CHANNEL.minX - 1200) / 2, 0, (BEACH.minZ + BEACH.seaZ + 60) / 2);
  const pos = beachGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(Math.min(x, CHANNEL.minX - 1), z) + 0.02;
    pos.setY(i, y);
    const wet = smoothstep(BEACH.shoreZ - 18, BEACH.shoreZ - 2, z);
    c.set(mixColor(0xf1dfb6, 0xc9ad7f, wet));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  beachGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  beachGeo.deleteAttribute('uv');
  beachGeo.computeVertexNormals();
  const beach = new THREE.Mesh(beachGeo, vertexColorMaterial);
  beach.receiveShadow = true;
  scene.add(beach);

  // Hills to the north and west.
  const hills = new THREE.PlaneGeometry(2600, 2600, 120, 120);
  hills.rotateX(-Math.PI / 2);
  hills.translate(-700, 0, -900);
  const hp = hills.attributes.position;
  const hc = new Float32Array(hp.count * 3);
  for (let i = 0; i < hp.count; i += 1) {
    const x = hp.getX(i);
    const z = hp.getZ(i);
    const inCity = x > -545 && z > -545;
    const y = inCity ? -5 : hillHeight(x, z) - 0.3;
    hp.setY(i, y);
    const t = smoothstep(0, 160, y) * 0.8 + 0.2 * Math.abs(Math.sin(x * 0.07 + z * 0.05));
    c.set(mixColor(mixColor(0x7ea24f, 0x5c7f3c, t), 0xa48a62, smoothstep(120, 200, y) * 0.6));
    hc[i * 3] = c.r;
    hc[i * 3 + 1] = c.g;
    hc[i * 3 + 2] = c.b;
  }
  hills.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  hills.deleteAttribute('uv');
  hills.computeVertexNormals();
  const hillMesh = new THREE.Mesh(hills, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  hillMesh.receiveShadow = true;
  scene.add(hillMesh);

  // Hillside houses with windows that glow at night.
  const houseParts = [];
  const windowParts = [];
  for (let i = 0; i < 90; i += 1) {
    const onNorth = rng.chance(0.6);
    const x = onNorth ? rng.range(-560, 300) : rng.range(-760, -580);
    const z = onNorth ? rng.range(-760, -585) : rng.range(-560, 250);
    const y = hillHeight(x, z);
    if (y > 150) continue;
    const w = rng.range(6, 12);
    const d = rng.range(6, 10);
    const h = rng.range(3.5, 6);
    houseParts.push(box(w, h + 3, d, rng.pick([0xf6efe2, 0xf1e1c6, 0xe8efe9, 0xf3d6c6]), x, y + h / 2 - 1, z));
    houseParts.push(box(w + 0.6, 0.5, d + 0.6, 0xb0573b, x, y + h + 0.6, z));
    windowParts.push(box(w * 0.6, 1.1, 0.1, 0xffd28a, x, y + h * 0.55, z + d / 2 + 0.06));
  }
  const houses = new THREE.Mesh(mergeGeometries(houseParts), vertexColorMaterial);
  houses.castShadow = false;
  scene.add(houses);
  const windows = new THREE.Mesh(mergeGeometries(windowParts), createNightGlowMaterial(0xffffff, { dayLevel: 0.08 }));
  windows.material.vertexColors = true;
  scene.add(windows);

  // Invisible walls at the edge of the playable map (hills and open sea).
  const b = WORLD_BOUNDS;
  collision.addBox(b.minX - 50, b.minX, b.minZ - 50, b.maxZ + 50, 200, -20, 'wall');
  collision.addBox(b.maxX, b.maxX + 50, b.minZ - 50, b.maxZ + 50, 200, -20, 'wall');
  collision.addBox(b.minX - 50, b.maxX + 50, b.minZ - 50, b.minZ, 200, -20, 'wall');
  collision.addBox(b.minX - 50, b.maxX + 50, b.maxZ, b.maxZ + 50, 200, -20, 'wall');
  return { hillMesh };
}

