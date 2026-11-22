// Street furniture: lamp posts along every street (with bulbs and pools of light that fade in
// after sunset) and traffic signals at every junction, whose lamps follow the signal phase.
import * as THREE from 'three';
import { box, cylinder, mergeGeometries } from '../render/geometryUtils.js';
import { vertexColorMaterial, createNightGlowMaterial } from '../render/cityMaterials.js';
import { ROAD_HALF } from './cityLayout.js';

function lampPostGeometry() {
  return mergeGeometries([
    cylinder(0.09, 0.13, 7.5, 0x3c4045, 0, 3.75, 0, 6),
    box(0.12, 0.12, 2.4, 0x3c4045, 0, 7.4, 1.1),
    box(0.5, 0.18, 0.9, 0x2c2f33, 0, 7.35, 2.2),
  ]);
}

function placeInstances(mesh, items) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot);
    p.set(it.x, it.y ?? 0, it.z);
    s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Lamp posts every ~32 m along both sides of each street; returns the lamp positions. */
export function buildStreetLights(scene, network) {
  const posts = [];
  for (const edge of network.edges) {
    const nx = -edge.dirZ;
    const nz = edge.dirX;
    let side = 1;
    for (let t = 16; t < edge.length - 10; t += 32) {
      if (edge.bridge && t > 30 && t < edge.length - 30) {
        // Bridges get lamps on both rails.
      }
      const off = ROAD_HALF + 1.2;
      const x = edge.a.x + edge.dirX * t + nx * off * side;
      const z = edge.a.z + edge.dirZ * t + nz * off * side;
      // The arm points back across the road.
      const rot = Math.atan2(-nx * side, -nz * side);
      posts.push({ x, z, rot, y: 0.18 });
      side = -side;
    }
  }
  const postMesh = new THREE.InstancedMesh(lampPostGeometry(), vertexColorMaterial, posts.length);
  placeInstances(postMesh, posts);
  postMesh.castShadow = true;
  scene.add(postMesh);

  const bulbGeo = new THREE.BoxGeometry(0.42, 0.08, 0.8);
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, createNightGlowMaterial(0xffe2a8, { dayLevel: 0.15 }), posts.length);
  placeInstances(
    bulbMesh,
    posts.map((p) => ({ x: p.x + Math.sin(p.rot) * 2.2, y: 7.22, z: p.z + Math.cos(p.rot) * 2.2, rot: p.rot })),
  );
  scene.add(bulbMesh);

  // Soft pools of light on the road, additive, night only.
  const poolTex = makeRadialTexture();
  const poolMat = createNightGlowMaterial(0xffc98a, { additive: true, opacity: 0.55 });
  poolMat.map = poolTex;
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, posts.length);
  placeInstances(
    poolMesh,
    posts.map((p) => ({ x: p.x + Math.sin(p.rot) * 3.2, y: 0.08, z: p.z + Math.cos(p.rot) * 3.2, rot: 0, sx: 15, sz: 15 })),
  );
  poolMesh.renderOrder = 2;
  scene.add(poolMesh);
  return posts;
}

/** A soft white radial gradient used for light pools and glows. */
export function makeRadialTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIGNAL_COLORS = { red: new THREE.Color(0xff2a1a), yellow: new THREE.Color(0xffb020), green: new THREE.Color(0x32ff6a), off: new THREE.Color(0x1a1a1a) };

/** Signal heads at every junction of three or more streets. Returns an updater for the phase. */
export function buildTrafficLights(scene, network) {
  const heads = [];
  for (const node of network.nodeList) {
    if (node.neighbors.length < 3) continue;
    for (const other of node.neighbors) {
      // A car arriving from `other` travels toward node; its signal stands at the near-right corner.
      const dx = Math.sign(node.x - other.x);
      const dz = Math.sign(node.z - other.z);
      const rx = -dz;
      const rz = dx;
      const R = ROAD_HALF + 1.4;
      heads.push({ x: node.x - dx * R + rx * R, z: node.z - dz * R + rz * R, rot: Math.atan2(-dx, -dz), vertical: dz !== 0 });
    }
  }
  const poleGeo = mergeGeometries([cylinder(0.1, 0.12, 4.6, 0x2e3236, 0, 2.3, 0, 6), box(0.5, 1.5, 0.4, 0x24272a, 0, 4.1, 0.25)]);
  const poles = new THREE.InstancedMesh(poleGeo, vertexColorMaterial, heads.length);
  placeInstances(poles, heads.map((h) => ({ ...h, y: 0.18 })));
  poles.castShadow = true;
  scene.add(poles);

  const lampGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, heads.length * 3);
  const lampItems = [];
  for (const h of heads) {
    for (let k = 0; k < 3; k += 1) {
      const lx = h.x + Math.sin(h.rot) * 0.47;
      const lz = h.z + Math.cos(h.rot) * 0.47;
      lampItems.push({ x: lx, y: 0.18 + 4.55 - k * 0.45, z: lz, rot: h.rot });
    }
  }
  placeInstances(lamps, lampItems);
  for (let i = 0; i < lampItems.length; i += 1) lamps.setColorAt(i, SIGNAL_COLORS.off);
  scene.add(lamps);

  let lastKey = '';
  return {
    /** Show the signal state: ns/ew are each 'green' | 'yellow' | 'red'. */
    update(ns, ew) {
      const key = `${ns}-${ew}`;
      if (key === lastKey) return;
      lastKey = key;
      heads.forEach((h, i) => {
        const state = h.vertical ? ns : ew;
        lamps.setColorAt(i * 3, state === 'red' ? SIGNAL_COLORS.red : SIGNAL_COLORS.off);
        lamps.setColorAt(i * 3 + 1, state === 'yellow' ? SIGNAL_COLORS.yellow : SIGNAL_COLORS.off);
        lamps.setColorAt(i * 3 + 2, state === 'green' ? SIGNAL_COLORS.green : SIGNAL_COLORS.off);
      });
      lamps.instanceColor.needsUpdate = true;
    },
  };
}
