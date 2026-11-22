// Life on the water: yachts and fishing boats that cruise slow loops along the coast and through
// the channel, bobbing on the swell, with cabin lights after dark.
import * as THREE from 'three';
import { box, mergeGeometries, paint } from '../render/geometryUtils.js';
import { vertexColorMaterial, createNightGlowMaterial } from '../render/cityMaterials.js';
import { WATER_LEVEL } from './cityLayout.js';

function hullGeometry(length, width, color, cabinColor, tall) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0.4);
  shape.lineTo(length / 2 - 1.2, 0.4);
  shape.lineTo(length / 2, 1.3);
  shape.lineTo(length / 2 + 0.2, 1.6);
  shape.lineTo(-length / 2, 1.6);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  hull.rotateY(-Math.PI / 2);
  hull.translate(width / 2, 0, 0);
  const parts = [paint(hull, color), box(width + 0.04, 0.12, length - 0.3, 0x2a4d6e, 0, 1.0, -0.15)];
  parts.push(box(width * 0.7, tall ? 1.6 : 1.1, length * 0.35, cabinColor, 0, 2.2, -length * 0.08));
  parts.push(box(width * 0.72, 0.5, length * 0.36, 0x1d2a36, 0, 2.3, -length * 0.08 + 0.02));
  if (tall) parts.push(box(width * 0.5, 0.9, length * 0.2, cabinColor, 0, 3.4, -length * 0.12));
  return mergeGeometries(parts);
}

const ROUTES = [
  { cx: -150, cz: 520, rx: 260, rz: 40, speed: 0.025, phase: 0, len: 12, w: 3.4, color: 0xffffff, cabin: 0xf4f4f4, tall: true },
  { cx: 120, cz: 600, rx: 320, rz: 70, speed: -0.018, phase: 2, len: 16, w: 4.2, color: 0xf6f6f6, cabin: 0xe9eef2, tall: true },
  { cx: -350, cz: 470, rx: 120, rz: 25, speed: 0.04, phase: 4, len: 8, w: 2.6, color: 0x2a6f97, cabin: 0xf4f4f4, tall: false },
  { cx: 400, cz: -340, rx: 14, rz: 195, speed: 0.03, phase: 1, len: 7, w: 2.4, color: 0xd9542b, cabin: 0xffffff, tall: false },
  { cx: 760, cz: -50, rx: 40, rz: 300, speed: 0.02, phase: 3, len: 14, w: 3.8, color: 0x34495e, cabin: 0xffffff, tall: true },
];

export function createBoats(scene) {
  const windowMat = createNightGlowMaterial(0xffd79a, { dayLevel: 0.15 });
  const boats = ROUTES.map((r) => {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry(r.len, r.w, r.color, r.cabin, r.tall), vertexColorMaterial);
    hull.castShadow = true;
    group.add(hull);
    const lights = new THREE.Mesh(new THREE.BoxGeometry(r.w * 0.74, 0.25, r.len * 0.3), windowMat);
    lights.position.set(0, 2.2, -r.len * 0.08);
    group.add(lights);
    scene.add(group);
    return { ...r, group, t: r.phase };
  });
  let time = 0;
  return {
    update(dt) {
      time += dt;
      for (const b of boats) {
        b.t += dt * b.speed;
        const x = b.cx + Math.cos(b.t) * b.rx;
        const z = b.cz + Math.sin(b.t) * b.rz;
        const dx = -Math.sin(b.t) * b.rx * Math.sign(b.speed);
        const dz = Math.cos(b.t) * b.rz * Math.sign(b.speed);
        b.group.position.set(x, WATER_LEVEL - 0.55 + Math.sin(time * 1.3 + b.phase) * 0.12, z);
        b.group.rotation.set(Math.sin(time * 1.1 + b.phase) * 0.03, Math.atan2(dx, dz), Math.cos(time * 0.9 + b.phase) * 0.04);
      }
    },
  };
}
