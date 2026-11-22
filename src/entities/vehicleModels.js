// Car models built from boxes: each body style returns painted body parts, glass, head and tail
// lamps and wheel positions. createVehicleModel assembles them into a Group with spinning,
// steering wheels, brake lights, police light bars and night headlight beams.
import * as THREE from 'three';
import { box, cylinder, mergeGeometries } from '../render/geometryUtils.js';
import { createNightGlowMaterial } from '../render/cityMaterials.js';

const TRIM = 0x1d1f22;
const CHROME = 0xb8bec4;
const GLASS = 0x22303c;

function sedanLike(L, W, color, opts = {}) {
  const lowH = opts.lowH ?? 0.58;
  const base = opts.base ?? 0.32;
  const cabinLen = opts.cabinLen ?? L * 0.46;
  const cabinZ = opts.cabinZ ?? -0.15;
  const cabinH = opts.cabinH ?? 0.52;
  const top = base + lowH;
  const body = [
    box(W, lowH, L, color, 0, base + lowH / 2, 0),
    box(W - 0.1, 0.08, L * 0.3, color, 0, top + 0.02, L * 0.33),
    box(W + 0.04, 0.2, 0.25, TRIM, 0, base + 0.12, L / 2 - 0.05),
    box(W + 0.04, 0.2, 0.25, TRIM, 0, base + 0.12, -L / 2 + 0.05),
    box(W * 0.5, 0.16, 0.05, 0x101010, 0, base + lowH * 0.55, L / 2 + 0.01),
    box(0.08, 0.06, 0.18, TRIM, W / 2 + 0.06, top + 0.25, cabinZ + cabinLen / 2 - 0.1),
    box(0.08, 0.06, 0.18, TRIM, -W / 2 - 0.06, top + 0.25, cabinZ + cabinLen / 2 - 0.1),
  ];
  const roofW = W - 0.22;
  body.push(box(roofW, 0.08, cabinLen * 0.82, color, 0, top + cabinH, cabinZ - cabinLen * 0.04));
  for (const sx of [-1, 1]) {
    body.push(box(0.08, cabinH, 0.1, color, sx * (roofW / 2 - 0.02), top + cabinH / 2, cabinZ + cabinLen / 2 - 0.08));
    body.push(box(0.08, cabinH, 0.14, color, sx * (roofW / 2 - 0.02), top + cabinH / 2, cabinZ - cabinLen / 2 + 0.1));
    body.push(box(0.08, cabinH, 0.08, color, sx * (roofW / 2 - 0.02), top + cabinH / 2, cabinZ));
  }
  const glass = [box(roofW - 0.04, cabinH - 0.04, cabinLen - 0.06, GLASS, 0, top + cabinH / 2, cabinZ)];
  const head = [box(0.42, 0.14, 0.06, 0xfff4d6, -W / 2 + 0.32, base + lowH * 0.7, L / 2 + 0.01), box(0.42, 0.14, 0.06, 0xfff4d6, W / 2 - 0.32, base + lowH * 0.7, L / 2 + 0.01)];
  const tail = [box(0.4, 0.13, 0.06, 0xff2a2a, -W / 2 + 0.3, base + lowH * 0.75, -L / 2 - 0.01), box(0.4, 0.13, 0.06, 0xff2a2a, W / 2 - 0.3, base + lowH * 0.75, -L / 2 - 0.01)];
  const wx = W / 2 - 0.12;
  const wz = L / 2 - (opts.wheelInset ?? 0.85);
  return { body, glass, head, tail, wheels: [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]], wheelR: opts.wheelR ?? 0.36, roofY: top + cabinH };
}

const STYLES = {
  sedan: (s, c) => sedanLike(s.length, s.width, c),
  taxi: (s, c) => {
    const m = sedanLike(s.length, s.width, c);
    m.body.push(box(0.7, 0.22, 0.32, 0xffffff, 0, m.roofY + 0.15, -0.2));
    m.body.push(box(s.width + 0.02, 0.1, s.length * 0.5, 0x111111, 0, 0.62, 0));
    return m;
  },
  police: (s, c) => {
    const m = sedanLike(s.length, s.width, c);
    m.body.push(box(s.width + 0.03, 0.42, s.length * 0.42, 0xf4f4f4, 0, 0.62, -0.1));
    m.body.push(box(s.width * 0.8, 0.35, 0.12, 0x222222, 0, 0.5, s.length / 2 + 0.12));
    m.body.push(box(1.1, 0.08, 0.3, 0x222222, 0, m.roofY + 0.06, -0.2));
    m.siren = true;
    return m;
  },
  sports: (s, c) => {
    const m = sedanLike(s.length, s.width, c, { lowH: 0.42, base: 0.26, cabinLen: s.length * 0.38, cabinZ: -0.35, cabinH: 0.42, wheelR: 0.34, wheelInset: 0.8 });
    m.body.push(box(s.width - 0.1, 0.05, 0.35, TRIM, 0, 1.08, -s.length / 2 + 0.2));
    for (const sx of [-1, 1]) m.body.push(box(0.06, 0.26, 0.08, TRIM, sx * 0.6, 0.92, -s.length / 2 + 0.22));
    m.body.push(box(s.width * 0.7, 0.04, 1.0, 0x111111, 0, 0.7, s.length / 2 - 0.8));
    return m;
  },
  muscle: (s, c) => {
    const m = sedanLike(s.length, s.width, c, { lowH: 0.56, cabinLen: s.length * 0.36, cabinZ: -0.55, cabinH: 0.46 });
    m.body.push(box(0.7, 0.14, 0.9, TRIM, 0, 0.95, 0.9));
    m.body.push(box(0.22, 0.02, s.length + 0.01, 0xffffff, -0.25, 0.91, 0));
    m.body.push(box(0.22, 0.02, s.length + 0.01, 0xffffff, 0.25, 0.91, 0));
    return m;
  },
  compact: (s, c) => {
    const m = sedanLike(s.length, s.width, c, { lowH: 0.56, cabinLen: s.length * 0.62, cabinZ: -0.25, cabinH: 0.62, wheelInset: 0.62, wheelR: 0.32 });
    return m;
  },
  pickup: (s, c) => {
    const L = s.length;
    const W = s.width;
    const m = sedanLike(L, W, c, { lowH: 0.62, base: 0.45, cabinLen: L * 0.3, cabinZ: L * 0.08, cabinH: 0.62, wheelR: 0.44, wheelInset: 0.95 });
    for (const sx of [-1, 1]) m.body.push(box(0.1, 0.42, L * 0.42, c, sx * (W / 2 - 0.05), 1.28, -L * 0.27));
    m.body.push(box(W, 0.42, 0.1, c, 0, 1.28, -L / 2 + 0.05));
    m.body.push(box(W - 0.2, 0.04, L * 0.42, 0x2b2b2b, 0, 1.08, -L * 0.27));
    m.body.push(box(W + 0.1, 0.12, 0.2, CHROME, 0, 0.62, L / 2 + 0.02));
    return m;
  },
  van: (s, c) => {
    const L = s.length;
    const W = s.width;
    const body = [
      box(W, 1.9, L * 0.78, c, 0, 1.33, -L * 0.11),
      box(W, 1.05, L * 0.22, c, 0, 0.9, L * 0.39),
      box(W + 0.04, 0.2, 0.25, TRIM, 0, 0.42, L / 2 - 0.05),
      box(W + 0.04, 0.2, 0.25, TRIM, 0, 0.42, -L / 2 + 0.05),
      box(W + 0.02, 0.2, L * 0.6, 0x4a90c2, 0, 1.4, -L * 0.15),
    ];
    const glass = [box(W - 0.1, 0.7, 0.08, GLASS, 0, 1.75, L * 0.28 + 0.01), box(W + 0.02, 0.6, 0.9, GLASS, 0, 1.75, L * 0.18)];
    const head = [box(0.4, 0.16, 0.06, 0xfff4d6, -W / 2 + 0.3, 0.95, L / 2 + 0.01), box(0.4, 0.16, 0.06, 0xfff4d6, W / 2 - 0.3, 0.95, L / 2 + 0.01)];
    const tail = [box(0.2, 0.4, 0.06, 0xff2a2a, -W / 2 + 0.15, 1.0, -L / 2 - 0.01), box(0.2, 0.4, 0.06, 0xff2a2a, W / 2 - 0.15, 1.0, -L / 2 - 0.01)];
    const wx = W / 2 - 0.12;
    return { body, glass, head, tail, wheels: [[-wx, L / 2 - 0.9], [wx, L / 2 - 0.9], [-wx, -L / 2 + 1.0], [wx, -L / 2 + 1.0]], wheelR: 0.38, roofY: 2.3 };
  },
  truck: (s, c) => {
    const L = s.length;
    const W = s.width;
    const body = [
      box(W, 1.6, 1.9, 0x2a6f97, 0, 1.4, L / 2 - 0.95),
      box(W - 0.1, 2.6, L - 2.2, c, 0, 1.95, -1.05),
      box(W + 0.02, 0.5, L - 2.2, 0x1e88e5, 0, 2.6, -1.05),
      box(1.0, 0.7, 0.8, 0x9aa0a6, 0, 3.6, 0.3),
      box(W + 0.04, 0.25, 0.3, TRIM, 0, 0.5, L / 2),
    ];
    const glass = [box(W - 0.1, 0.65, 0.06, GLASS, 0, 1.85, L / 2 + 0.01)];
    const head = [box(0.36, 0.18, 0.06, 0xfff4d6, -W / 2 + 0.3, 0.95, L / 2 + 0.03), box(0.36, 0.18, 0.06, 0xfff4d6, W / 2 - 0.3, 0.95, L / 2 + 0.03)];
    const tail = [box(0.25, 0.3, 0.06, 0xff2a2a, -W / 2 + 0.2, 0.9, -L / 2 + 0.04), box(0.25, 0.3, 0.06, 0xff2a2a, W / 2 - 0.2, 0.9, -L / 2 + 0.04)];
    const wx = W / 2 - 0.15;
    return { body, glass, head, tail, wheels: [[-wx, L / 2 - 1.0], [wx, L / 2 - 1.0], [-wx, -L / 2 + 1.2], [wx, -L / 2 + 1.2]], wheelR: 0.46, roofY: 3.3 };
  },
};

const geoCache = new Map();
const paintMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35 });
const glassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.75 });
const headMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
const tailOff = new THREE.MeshBasicMaterial({ color: 0x8a1010 });
const tailOn = new THREE.MeshBasicMaterial({ color: 0xff3030 });
const sirenRed = new THREE.MeshBasicMaterial({ color: 0xff2030 });
const sirenBlue = new THREE.MeshBasicMaterial({ color: 0x2050ff });
const sirenDim = new THREE.MeshBasicMaterial({ color: 0x331a22 });
const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const beamMaterial = createNightGlowMaterial(0xfff0c8, { additive: true, opacity: 0.16 });

function wheelGeometry(r) {
  const key = `wheel-${r}`;
  if (!geoCache.has(key)) {
    const tire = cylinder(r, r, 0.26, 0x151515, 0, 0, 0, 14);
    const hub = cylinder(r * 0.6, r * 0.6, 0.27, 0xc7ccd1, 0, 0, 0, 10);
    const g = mergeGeometries([tire, hub]);
    g.rotateZ(Math.PI / 2);
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

const beamGeometry = (() => {
  const g = new THREE.ConeGeometry(2.4, 16, 12, 1, true);
  g.translate(0, -8, 0);
  g.rotateX(-Math.PI / 2);
  return g;
})();

/** Assemble a car of `spec` (from data/vehicles.js) painted `color`. */
export function createVehicleModel(spec, color) {
  const key = `${spec.model}-${color}`;
  if (!geoCache.has(key)) {
    const parts = STYLES[spec.model](spec, color);
    geoCache.set(key, {
      body: mergeGeometries(parts.body),
      glass: mergeGeometries(parts.glass),
      head: mergeGeometries(parts.head),
      tail: mergeGeometries(parts.tail),
      wheels: parts.wheels,
      wheelR: parts.wheelR,
      roofY: parts.roofY,
      siren: !!parts.siren,
    });
  }
  const g = geoCache.get(key);
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const body = new THREE.Mesh(g.body, paintMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  chassis.add(body);
  chassis.add(new THREE.Mesh(g.glass, glassMaterial));
  chassis.add(new THREE.Mesh(g.head, headMaterial));
  const tail = new THREE.Mesh(g.tail, tailOff);
  chassis.add(tail);
  const wheels = g.wheels.map(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, g.wheelR, z);
    const w = new THREE.Mesh(wheelGeometry(g.wheelR), wheelMaterial);
    w.castShadow = true;
    pivot.add(w);
    group.add(pivot);
    return { pivot, mesh: w, front: i < 2 };
  });
  let sirens = null;
  if (g.siren) {
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.26), sirenDim);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.26), sirenDim);
    red.position.set(-0.3, g.roofY + 0.16, -0.2);
    blue.position.set(0.3, g.roofY + 0.16, -0.2);
    chassis.add(red, blue);
    sirens = { red, blue };
  }
  const beams = new THREE.Group();
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(sx * (spec.width / 2 - 0.35), 0.8, spec.length / 2 + 0.1);
    beam.rotation.x = 0.06;
    beams.add(beam);
  }
  chassis.add(beams);
  return { group, chassis, wheels, wheelR: g.wheelR, tail, sirens, beams, roofY: g.roofY };
}

/** Per-frame visual state: wheel spin and steer, brake lights, siren flash, body roll and pitch. */
export function animateVehicleModel(model, dt, { speed, steer, braking, sirenOn, time, roll, pitch, headlights }) {
  for (const w of model.wheels) {
    w.mesh.rotation.x += (speed / model.wheelR) * dt;
    if (w.front) w.pivot.rotation.y = steer;
  }
  model.tail.material = braking ? tailOn : tailOff;
  if (model.sirens) {
    if (sirenOn) {
      const phase = Math.floor(time * 6) % 2 === 0;
      model.sirens.red.material = phase ? sirenRed : sirenDim;
      model.sirens.blue.material = phase ? sirenDim : sirenBlue;
    } else {
      model.sirens.red.material = sirenDim;
      model.sirens.blue.material = sirenDim;
    }
  }
  model.chassis.rotation.z = roll;
  model.chassis.rotation.x = pitch;
  model.beams.visible = headlights;
}
