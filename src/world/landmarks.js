// The landmarks that make the skyline: the cable-stayed Solara Bay Bridge, the Port Causeway, the
// Sunset Pier with its lit ferris wheel, the Calloway lighthouse, dock cranes, lifeguard towers
// and beach umbrellas, and the fountain in Bayfront Park.
import * as THREE from 'three';
import { box, cylinder, mergeGeometries, paint } from '../render/geometryUtils.js';
import { vertexColorMaterial, createNightGlowMaterial } from '../render/cityMaterials.js';
import { BLOCK, BRIDGE_ROWS, CHANNEL, ROAD_HALF, PIER, BEACH } from './cityLayout.js';

/** A thin beam between two points (for cables and trusses). */
function beam(ax, ay, az, bx, by, bz, radius, color) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const g = paint(new THREE.CylinderGeometry(radius, radius, len, 5), color);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const mid = a.add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function addBridges(scene, collision, parts, glows) {
  const x0 = CHANNEL.minX - 4;
  const x1 = CHANNEL.maxX + 4;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  BRIDGE_ROWS.forEach((j, index) => {
    const z = j * BLOCK;
    const half = ROAD_HALF + 2.5;
    parts.push(box(len, 1.6, half * 2, 0x9a9a96, cx, -0.8, z));
    // Railings (also solid so cars stay on the deck).
    for (const s of [-1, 1]) {
      parts.push(box(len, 1.1, 0.4, 0xd8d8d2, cx, 0.55, z + s * (half - 0.4)));
      collision.addBox(x0, x1, z + s * (half - 0.4) - 0.3, z + s * (half - 0.4) + 0.3, 1.2, -1, 'rail');
    }
    // Piers into the water.
    for (let x = x0 + 16; x < x1 - 8; x += 24) parts.push(box(3, 8, half * 1.6, 0x8d8a84, x, -5, z));
    if (index === 0) {
      // Cable-stayed main span: two pylons with fans of cables.
      for (const px of [CHANNEL.minX + 24, CHANNEL.maxX - 24]) {
        for (const s of [-1, 1]) parts.push(box(1.8, 52, 1.8, 0xe9e6df, px, 25, z + s * (half + 0.9)));
        parts.push(box(1.6, 2, half * 2 + 3.6, 0xe9e6df, px, 50, z));
        parts.push(box(1.6, 1.6, half * 2 + 3.6, 0xe9e6df, px, 30, z));
        glows.push(box(0.6, 0.6, 0.6, 0xff3020, px, 51.4, z + half + 0.9));
        glows.push(box(0.6, 0.6, 0.6, 0xff3020, px, 51.4, z - half - 0.9));
        for (const s of [-1, 1]) {
          for (let k = 1; k <= 5; k += 1) {
            for (const dir of [-1, 1]) {
              const tx = px + dir * k * 7;
              if (tx < x0 + 1 || tx > x1 - 1) continue;
              parts.push(beam(px, 48 - k * 2.4, z + s * (half + 0.9), tx, 0.6, z + s * (half - 0.4), 0.08, 0xf2f2f2));
            }
          }
        }
      }
    } else {
      // Port Causeway: steel arch trusses.
      for (const s of [-1, 1]) {
        let prev = null;
        for (let k = 0; k <= 12; k += 1) {
          const t = k / 12;
          const x = x0 + 6 + (len - 12) * t;
          const y = 1 + Math.sin(t * Math.PI) * 14;
          const zz = z + s * (half - 0.3);
          if (prev) parts.push(beam(prev[0], prev[1], zz, x, y, zz, 0.35, 0x2f6f8f));
          if (k > 0 && k < 12) parts.push(beam(x, y, zz, x, 1, zz, 0.12, 0x2f6f8f));
          prev = [x, y];
        }
      }
    }
  });
}

function addFerrisWheel(scene, glowsAnimated) {
  const group = new THREE.Group();
  const cx = (PIER.minX + PIER.maxX) / 2;
  const cz = PIER.maxZ - 22;
  group.position.set(cx, 22, cz);
  const wheel = new THREE.Group();
  const parts = [];
  const R = 17;
  const spokes = 16;
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2;
    const b2 = ((i + 1) / spokes) * Math.PI * 2;
    parts.push(beam(0, 0, 0.8, Math.cos(a) * R, Math.sin(a) * R, 0.8, 0.12, 0xf4f4f4));
    parts.push(beam(0, 0, -0.8, Math.cos(a) * R, Math.sin(a) * R, -0.8, 0.12, 0xf4f4f4));
    parts.push(beam(Math.cos(a) * R, Math.sin(a) * R, 0.8, Math.cos(b2) * R, Math.sin(b2) * R, 0.8, 0.22, 0xffffff));
    parts.push(beam(Math.cos(a) * R, Math.sin(a) * R, -0.8, Math.cos(b2) * R, Math.sin(b2) * R, -0.8, 0.22, 0xffffff));
  }
  parts.push(cylinder(0.8, 0.8, 2.4, 0xcccccc, 0, 0, 0, 10).rotateX(Math.PI / 2));
  wheel.add(new THREE.Mesh(mergeGeometries(parts), vertexColorMaterial));
  // Rim lights.
  const lightParts = [];
  const colors = [0xff4fa0, 0x3ff0ff, 0xffd23f, 0x9d6bff];
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    lightParts.push(paint(new THREE.SphereGeometry(0.28, 5, 4), colors[i % 4]).translate(Math.cos(a) * R, Math.sin(a) * R, 1.0));
    lightParts.push(paint(new THREE.SphereGeometry(0.28, 5, 4), colors[(i + 2) % 4]).translate(Math.cos(a) * R, Math.sin(a) * R, -1.0));
  }
  const lightMat = createNightGlowMaterial(0xffffff, { dayLevel: 0.3 });
  lightMat.vertexColors = true;
  wheel.add(new THREE.Mesh(mergeGeometries(lightParts), lightMat));
  group.add(wheel);
  // Gondolas hang from the rim and stay level.
  const gondolas = [];
  const gondolaGeo = mergeGeometries([box(1.8, 1.6, 1.4, 0xe74c3c, 0, -1.2, 0), box(2, 0.2, 1.6, 0xffffff, 0, -0.3, 0)]);
  for (let i = 0; i < 8; i += 1) {
    const g = new THREE.Mesh(gondolaGeo, vertexColorMaterial);
    gondolas.push({ mesh: g, angle: (i / 8) * Math.PI * 2 });
    group.add(g);
  }
  // A-frame supports.
  const support = [];
  for (const s of [-1, 1]) {
    support.push(beam(-9, -22, s * 3, 0, 0, s * 1.4, 0.4, 0xdddddd));
    support.push(beam(9, -22, s * 3, 0, 0, s * 1.4, 0.4, 0xdddddd));
  }
  group.add(new THREE.Mesh(mergeGeometries(support), vertexColorMaterial));
  group.rotation.y = Math.PI / 2;
  scene.add(group);
  glowsAnimated.push((dt) => {
    wheel.rotation.z += dt * 0.08;
    for (const g of gondolas) {
      const a = g.angle + wheel.rotation.z;
      g.mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    }
  });
}

function addPier(parts, collision) {
  const w = PIER.maxX - PIER.minX;
  const len = PIER.maxZ - PIER.minZ;
  const cx = (PIER.minX + PIER.maxX) / 2;
  parts.push(box(w, 0.5, len, 0x9b7653, cx, 0.15, PIER.minZ + len / 2));
  for (let z = PIER.minZ + 10; z < PIER.maxZ; z += 10) {
    for (const s of [-1, 1]) parts.push(cylinder(0.35, 0.35, 8, 0x5d4632, cx + s * (w / 2 - 1), -3.6, z, 6));
  }
  for (const s of [-1, 1]) {
    parts.push(box(0.2, 1, len, 0xf2efe6, cx + s * (w / 2 - 0.1), 0.9, PIER.minZ + len / 2));
    collision.addBox(cx + s * (w / 2) - 0.3, cx + s * (w / 2) + 0.3, PIER.minZ + 4, PIER.maxZ, 1.3, -1, 'rail');
  }
  collision.addBox(PIER.minX, PIER.maxX, PIER.maxZ - 0.3, PIER.maxZ + 0.3, 1.3, -1, 'rail');
  // Snack kiosks.
  parts.push(box(6, 3.2, 5, 0x3fb8c9, cx - 5, 2, PIER.minZ + 40));
  parts.push(box(6.6, 0.4, 5.6, 0xffffff, cx - 5, 3.8, PIER.minZ + 40));
  parts.push(box(6, 3.2, 5, 0xf27d72, cx + 5, 2, PIER.minZ + 70));
  parts.push(box(6.6, 0.4, 5.6, 0xffffff, cx + 5, 3.8, PIER.minZ + 70));
  collision.addBox(cx - 8, cx - 2, PIER.minZ + 37.5, PIER.minZ + 42.5, 4, -1);
  collision.addBox(cx + 2, cx + 8, PIER.minZ + 67.5, PIER.minZ + 72.5, 4, -1);
}

function addLighthouse(parts, glows, collision, animated, scene) {
  const x = 668;
  const z = 246;
  for (let i = 0; i < 6; i += 1) parts.push(cylinder(2.6 - i * 0.18, 2.8 - i * 0.18, 4.4, i % 2 ? 0xd23a2c : 0xf6f3ec, x, 2.2 + i * 4.4, z, 14));
  parts.push(cylinder(2.2, 2.2, 0.5, 0x333333, x, 26.8, z, 14));
  parts.push(cylinder(0.4, 1.6, 2, 0x333333, x, 30.5, z, 10));
  glows.push(cylinder(1.3, 1.3, 2.4, 0xfff2b0, x, 28.3, z, 10));
  collision.addBox(x - 2.8, x + 2.8, z - 2.8, z + 2.8, 30, -1);
  // Rotating beam (night only).
  const beamMat = createNightGlowMaterial(0xfff2b0, { additive: true, opacity: 0.22 });
  const beamGeo = new THREE.ConeGeometry(5, 90, 16, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate(45, 0, 0);
  const pivot = new THREE.Group();
  pivot.position.set(x, 28.3, z);
  pivot.add(new THREE.Mesh(beamGeo, beamMat));
  scene.add(pivot);
  animated.push((dt) => {
    pivot.rotation.y += dt * 0.9;
  });
}

function addCranes(parts, collision) {
  for (const z of [-260, -160, -40, 120]) {
    const x = 662;
    for (const sx of [-4, 4]) {
      for (const sz of [-5, 5]) {
        parts.push(box(1.2, 30, 1.2, 0xd9542b, x + sx, 15, z + sz));
        collision.addBox(x + sx - 0.8, x + sx + 0.8, z + sz - 0.8, z + sz + 0.8, 30, -1);
      }
    }
    parts.push(box(10, 3, 12, 0xd9542b, x, 31, z));
    parts.push(box(52, 1.8, 2.4, 0xe8e8e8, x + 12, 34, z));
    parts.push(box(4, 3.2, 4, 0xf4f4f4, x - 2, 35.5, z));
    parts.push(beam(x - 2, 40, z, x + 34, 34.8, z, 0.12, 0x555555));
    parts.push(beam(x - 2, 40, z, x - 12, 34.8, z, 0.12, 0x555555));
  }
}

function addBeachProps(parts, rng, collision, glows) {
  // Lifeguard towers.
  for (const x of [-420, -260, 20, 180, 300]) {
    const z = BEACH.minZ + 46;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylinder(0.12, 0.12, 3, 0xffffff, x + sx * 1.2, 1.2 - 0.6, z + sz * 1.2, 5));
    parts.push(box(3.2, 2.2, 3.2, rng.pick([0xf5b7c5, 0x8fd8e8, 0xffd36e, 0xb7e4a8]), x, 3.6, z));
    parts.push(box(3.8, 0.3, 3.8, 0xff5c4a, x, 4.9, z));
    parts.push(box(1.2, 0.1, 4, 0xdddddd, x, 1.2, z + 3));
    collision.addBox(x - 1.8, x + 1.8, z - 1.8, z + 1.8, 5, -1);
  }
  // Umbrellas and towels.
  const colors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0xffffff];
  for (let i = 0; i < 70; i += 1) {
    const x = rng.range(-520, 330);
    const z = rng.range(BEACH.minZ + 12, BEACH.shoreZ - 16);
    if (x > PIER.minX - 6 && x < PIER.maxX + 6) continue;
    const y = -((z - BEACH.minZ) / (BEACH.shoreZ - BEACH.minZ)) * 1.2;
    const c = rng.pick(colors);
    parts.push(cylinder(0.05, 0.05, 2.6, 0xeeeeee, x, y + 1.3, z, 4));
    parts.push(paint(new THREE.ConeGeometry(1.6, 0.6, 8), c).translate(x, y + 2.6, z));
    parts.push(box(1, 0.04, 2, rng.pick(colors), x + 1.4, y + 0.04, z + 0.6, rng.range(0, 3)));
  }
  // Promenade benches along Halcyon Strand's beach side.
  for (let x = -500; x < 340; x += 24) {
    parts.push(box(2.2, 0.15, 0.6, 0x8a5a3a, x + 12, 0.65, BEACH.minZ - 3));
    parts.push(box(2.2, 0.6, 0.1, 0x8a5a3a, x + 12, 0.95, BEACH.minZ - 2.7));
  }
  return glows;
}

function addFountain(parts, block) {
  if (!block) return;
  const x = block.cx;
  const z = block.cz;
  parts.push(cylinder(7, 7.4, 0.8, 0xe8e2d6, x, 0.6, z, 20));
  parts.push(cylinder(6.4, 6.4, 0.2, 0x3fb6cc, x, 0.95, z, 20));
  parts.push(cylinder(1, 1.4, 2.8, 0xe8e2d6, x, 1.6, z, 10));
  parts.push(cylinder(2.4, 2, 0.3, 0xe8e2d6, x, 3, z, 14));
  parts.push(cylinder(0.25, 0.6, 2.6, 0xbfeaf5, x, 4.2, z, 8));
  // Paths crossing the park.
  parts.push(box(78, 0.06, 4, 0xe2d8c3, x, 0.24, z));
  parts.push(box(4, 0.06, 78, 0xe2d8c3, x, 0.24, z));
}

export function buildLandmarks(scene, collision, rng, blocks) {
  const parts = [];
  const glows = [];
  const animated = [];
  addBridges(scene, collision, parts, glows);
  addPier(parts, collision);
  addLighthouse(parts, glows, collision, animated, scene);
  addCranes(parts, collision);
  addBeachProps(parts, rng, collision, glows);
  addFountain(parts, blocks.find((b) => b.special === 'bayfrontPark'));
  addFountain(parts, blocks.find((b) => b.special === 'hillsPark'));
  const mesh = new THREE.Mesh(mergeGeometries(parts), vertexColorMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const glowMat = createNightGlowMaterial(0xffffff, { dayLevel: 0.5 });
  glowMat.vertexColors = true;
  scene.add(new THREE.Mesh(mergeGeometries(glows), glowMat));
  addFerrisWheel(scene, animated);
  // Castellane Tower's aviation light.
  const tower = blocks.find((b) => b.special === 'castellaneTower');
  if (tower) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), createNightGlowMaterial(0xff2a20, { dayLevel: 0.6 }));
    light.position.set(tower.cx, 212.5, tower.cz);
    scene.add(light);
  }
  return {
    update(dt) {
      for (const fn of animated) fn(dt);
    },
  };
}

