// Car models: each body style is a side profile (with wheel arches) extruded to the car's width,
// a raked glass cabin with roof and pillars, lamps, trim and wheels. createVehicleModel assembles
// them into a Group with spinning, steering wheels, brake lights, police light bars (with glow)
// and night headlight beams.
import * as THREE from 'three';
import { box, cylinder, mergeGeometries, paint } from '../render/geometryUtils.js';
import { createNightGlowMaterial } from '../render/cityMaterials.js';

const TRIM = 0x1d1f22;
const CHROME = 0xc9ced4;
const GLASS = 0x1f2b36;

/** Extrude a side profile [[forward, up], ...] across the car (width w, centred). */
function extrudeProfile(points, w, color, bevel = 0.05) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, w - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2 - bevel, 0, 0);
  return paint(g, color);
}

/** Points of a wheel arch over an axle at `ax` (front to rear along the bottom edge). */
function arch(ax, bottom, r) {
  const pts = [[ax + r, bottom]];
  for (let k = 1; k < 9; k += 1) {
    const a = (k / 9) * Math.PI;
    pts.push([ax + Math.cos(a) * r, bottom + Math.sin(a) * r * 0.92]);
  }
  pts.push([ax - r, bottom]);
  return pts;
}

/** The lower body outline from rear to front with arches cut over each axle. */
function bodyOutline({ L, bottom, rearH, deckH, beltRear, beltFront, noseH, axles, archR }) {
  const rear = -L / 2;
  const front = L / 2;
  const pts = [
    [rear + 0.08, bottom],
    [rear, bottom + 0.12],
    [rear, rearH],
    [rear + 0.12, deckH],
    [rear + 0.5, beltRear],
    [front - 0.55, beltFront],
    [front - 0.08, noseH],
    [front, noseH - 0.12],
    [front, bottom + 0.12],
    [front - 0.1, bottom],
  ];
  for (const ax of axles.slice().sort((a, b) => b - a)) pts.push(...arch(ax, bottom, archR));
  return pts;
}

/** A thin bar from (z1, y1) to (z2, y2) at side x. */
function slanted(x, z1, y1, z2, y2, color) {
  const len = Math.hypot(z2 - z1, y2 - y1);
  const g = paint(new THREE.BoxGeometry(0.075, len, 0.1), color);
  g.rotateX(Math.atan2(z2 - z1, y2 - y1));
  g.translate(x, (y1 + y2) / 2, (z1 + z2) / 2);
  return g;
}

/** A glass cabin with a raked windscreen, a roof cap and pillars in body colour. */
function cabin(parts, glass, { belt, top, rear, front, rakeRear, rakeFront, w, color }) {
  glass.push(extrudeProfile([[rear, belt], [front, belt], [front - rakeFront, top], [rear + rakeRear, top]], w, GLASS, 0.02));
  parts.push(extrudeProfile([[rear + rakeRear - 0.04, top - 0.02], [front - rakeFront + 0.04, top - 0.02], [front - rakeFront + 0.02, top + 0.07], [rear + rakeRear, top + 0.07]], w + 0.02, color, 0.02));
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.02);
    parts.push(slanted(x, front, belt, front - rakeFront, top, color));
    parts.push(slanted(x, rear, belt, rear + rakeRear, top, color));
    const mid = (front - rakeFront + rear + rakeRear) / 2;
    parts.push(box(0.07, top - belt, 0.09, color, x, (top + belt) / 2, mid));
  }
}

function lamps(L, W, y, frontInset = 0.32, h = 0.13) {
  return {
    head: [box(0.4, h, 0.06, 0xfff4d6, -W / 2 + frontInset, y, L / 2 + 0.005), box(0.4, h, 0.06, 0xfff4d6, W / 2 - frontInset, y, L / 2 + 0.005)],
    tail: [box(0.42, h, 0.06, 0xff2a2a, -W / 2 + 0.3, y + 0.04, -L / 2 - 0.005), box(0.42, h, 0.06, 0xff2a2a, W / 2 - 0.3, y + 0.04, -L / 2 - 0.005)],
  };
}

function bumpers(parts, L, W, y) {
  parts.push(box(W + 0.03, 0.16, 0.2, TRIM, 0, y, L / 2 - 0.06));
  parts.push(box(W + 0.03, 0.16, 0.2, TRIM, 0, y, -L / 2 + 0.06));
  parts.push(box(W * 0.46, 0.12, 0.04, 0x0d0d0d, 0, y + 0.22, L / 2 + 0.01));
}

/** A conventional car from a handful of proportions. */
function threeBox(s, color, o) {
  const L = s.length;
  const W = s.width;
  const axleF = L / 2 - o.wheelInset;
  const axleR = -L / 2 + o.wheelInset;
  const parts = [extrudeProfile(bodyOutline({ L, bottom: o.bottom, rearH: o.rearH, deckH: o.deckH, beltRear: o.belt, beltFront: o.beltFront ?? o.belt - 0.04, noseH: o.noseH, axles: [axleF, axleR], archR: o.wheelR + 0.07 }), W, color, 0.06)];
  const glass = [];
  cabin(parts, glass, { belt: o.belt - 0.02, top: o.top, rear: o.cabinRear, front: o.cabinFront, rakeRear: o.rakeRear, rakeFront: o.rakeFront, w: W - 0.14, color });
  bumpers(parts, L, W, o.bottom + 0.1);
  for (const sx of [-1, 1]) parts.push(box(0.05, 0.08, 0.2, TRIM, sx * (W / 2 + 0.03), o.belt + 0.05, o.cabinFront - 0.05));
  const l = lamps(L, W, (o.noseH + o.bottom) / 2 + 0.08);
  const wx = W / 2 - 0.13;
  return { body: parts, glass, head: l.head, tail: l.tail, wheels: [[-wx, axleF], [wx, axleF], [-wx, axleR], [wx, axleR]], wheelR: o.wheelR, roofY: o.top + 0.07 };
}

const SEDAN = { bottom: 0.3, rearH: 0.86, deckH: 0.98, belt: 1.0, noseH: 0.86, top: 1.5, cabinRear: -1.45, cabinFront: 0.75, rakeRear: 0.5, rakeFront: 0.62, wheelInset: 0.85, wheelR: 0.36 };

function archedOutline(outline, axles, bottom, r) {
  const pts = outline.slice();
  for (const ax of axles.slice().sort((a, b) => b - a)) pts.push(...arch(ax, bottom, r));
  return pts;
}

const STYLES = {
  sedan: (s, c) => threeBox(s, c, SEDAN),
  taxi: (s, c) => {
    const m = threeBox(s, c, SEDAN);
    m.body.push(box(0.75, 0.22, 0.34, 0xffffff, 0, m.roofY + 0.12, -0.35));
    m.body.push(box(0.78, 0.04, 0.36, 0x111111, 0, m.roofY + 0.24, -0.35));
    for (const sx of [-1, 1]) m.body.push(box(0.02, 0.12, s.length * 0.55, 0x111111, sx * (s.width / 2 + 0.005), 0.72, 0));
    return m;
  },
  police: (s, c) => {
    const m = threeBox(s, c, SEDAN);
    for (const sx of [-1, 1]) {
      m.body.push(box(0.02, 0.16, s.length * 0.62, 0x1d4ed8, sx * (s.width / 2 + 0.005), 0.74, -0.1));
      m.body.push(box(0.02, 0.36, 0.9, 0x111827, sx * (s.width / 2 + 0.005), 0.62, s.length / 2 - 0.55));
      m.body.push(box(0.02, 0.36, 0.8, 0x111827, sx * (s.width / 2 + 0.005), 0.62, -s.length / 2 + 0.5));
    }
    m.body.push(box(s.width - 0.2, 0.03, s.length * 0.26, 0x111827, 0, 0.995, s.length * 0.32));
    m.body.push(box(s.width * 0.8, 0.38, 0.12, 0x1a1a1a, 0, 0.55, s.length / 2 + 0.14));
    m.body.push(box(1.15, 0.08, 0.32, 0x222222, 0, m.roofY + 0.04, -0.35));
    m.siren = true;
    m.sirenZ = -0.35;
    return m;
  },
  sports: (s, c) => {
    const m = threeBox(s, c, { bottom: 0.24, rearH: 0.78, deckH: 0.86, belt: 0.86, beltFront: 0.74, noseH: 0.6, top: 1.2, cabinRear: -1.35, cabinFront: 0.45, rakeRear: 0.75, rakeFront: 0.72, wheelInset: 0.8, wheelR: 0.35 });
    m.body.push(box(s.width - 0.1, 0.05, 0.38, TRIM, 0, 1.08, -s.length / 2 + 0.22));
    for (const sx of [-1, 1]) m.body.push(box(0.06, 0.24, 0.08, TRIM, sx * 0.6, 0.95, -s.length / 2 + 0.24));
    m.body.push(box(s.width * 0.5, 0.03, 0.9, 0x111111, 0, 0.75, s.length / 2 - 0.85));
    for (const sx of [-1, 1]) m.body.push(box(0.04, 0.12, 0.6, 0x111111, sx * (s.width / 2 + 0.01), 0.6, -0.25));
    return m;
  },
  muscle: (s, c) => {
    const m = threeBox(s, c, { bottom: 0.3, rearH: 0.88, deckH: 0.96, belt: 0.98, beltFront: 0.96, noseH: 0.9, top: 1.42, cabinRear: -1.65, cabinFront: 0.25, rakeRear: 0.55, rakeFront: 0.55, wheelInset: 0.88, wheelR: 0.38 });
    m.body.push(box(0.7, 0.13, 0.95, TRIM, 0, 1.02, 1.05));
    m.body.push(box(0.22, 0.015, s.length - 0.2, 0xffffff, -0.25, 1.005, 0.3));
    m.body.push(box(0.22, 0.015, s.length - 0.2, 0xffffff, 0.25, 1.005, 0.3));
    return m;
  },
  compact: (s, c) => threeBox(s, c, { bottom: 0.28, rearH: 1.0, deckH: 1.02, belt: 1.02, beltFront: 0.96, noseH: 0.82, top: 1.62, cabinRear: -1.82, cabinFront: 0.55, rakeRear: 0.12, rakeFront: 0.62, wheelInset: 0.62, wheelR: 0.32 }),
  pickup: (s, c) => {
    const L = s.length;
    const W = s.width;
    const m = threeBox(s, c, { bottom: 0.42, rearH: 1.12, deckH: 1.14, belt: 1.16, beltFront: 1.12, noseH: 1.1, top: 1.95, cabinRear: -0.55, cabinFront: 0.95, rakeRear: 0.05, rakeFront: 0.45, wheelInset: 0.95, wheelR: 0.44 });
    for (const sx of [-1, 1]) m.body.push(box(0.1, 0.38, L * 0.4, c, sx * (W / 2 - 0.05), 1.33, -L * 0.29));
    m.body.push(box(W, 0.38, 0.1, c, 0, 1.33, -L / 2 + 0.06));
    m.body.push(box(W - 0.2, 0.04, L * 0.4, 0x2b2b2b, 0, 1.16, -L * 0.29));
    m.body.push(box(W + 0.1, 0.14, 0.2, CHROME, 0, 0.6, L / 2 + 0.02));
    m.body.push(box(W * 0.6, 0.26, 0.05, CHROME, 0, 0.92, L / 2 + 0.01));
    return m;
  },
  van: (s, c) => {
    const L = s.length;
    const W = s.width;
    const axleF = L / 2 - 0.9;
    const axleR = -L / 2 + 1.0;
    const outline = archedOutline([[-L / 2, 0.36], [-L / 2, 2.25], [L / 2 - 1.25, 2.28], [L / 2 - 0.3, 1.25], [L / 2, 1.05], [L / 2, 0.4]], [axleF, axleR], 0.36, 0.46);
    const body = [extrudeProfile(outline, W, c, 0.06)];
    body.push(box(W + 0.02, 0.18, L * 0.62, 0x4a90c2, 0, 1.25, -L * 0.15));
    bumpers(body, L, W, 0.45);
    const glass = [extrudeProfile([[L / 2 - 0.42, 1.3], [L / 2 - 0.26, 1.27], [L / 2 - 1.2, 2.2], [L / 2 - 1.3, 2.22]], W - 0.06, GLASS, 0.01)];
    glass.push(box(W + 0.02, 0.5, L * 0.35, GLASS, 0, 1.78, -0.2));
    const l = lamps(L, W, 0.85, 0.3, 0.16);
    const wx = W / 2 - 0.12;
    return { body, glass, head: l.head, tail: l.tail, wheels: [[-wx, axleF], [wx, axleF], [-wx, axleR], [wx, axleR]], wheelR: 0.38, roofY: 2.3 };
  },
  truck: (s, c) => {
    const L = s.length;
    const W = s.width;
    const axleF = L / 2 - 1.0;
    const axleR = -L / 2 + 1.2;
    const cab = archedOutline([[L / 2 - 1.95, 0.45], [L / 2 - 1.95, 2.25], [L / 2 - 0.55, 2.25], [L / 2, 1.5], [L / 2, 0.45]], [axleF], 0.45, 0.55);
    const body = [
      extrudeProfile(cab, W, 0x2a6f97, 0.06),
      box(W - 0.1, 2.6, L - 2.2, c, 0, 1.95, -1.05),
      box(W + 0.02, 0.5, L - 2.2, 0x1e88e5, 0, 2.6, -1.05),
      box(1.0, 0.7, 0.8, 0x9aa0a6, 0, 3.6, -0.6),
      box(W + 0.04, 0.25, 0.3, TRIM, 0, 0.55, L / 2),
    ];
    const glass = [extrudeProfile([[L / 2 - 0.5, 1.55], [L / 2 - 0.06, 1.55], [L / 2 - 0.52, 2.18], [L / 2 - 0.7, 2.18]], W - 0.08, GLASS, 0.01)];
    const l = lamps(L, W, 0.95, 0.3, 0.18);
    const wx = W / 2 - 0.15;
    return { body, glass, head: l.head, tail: l.tail, wheels: [[-wx, axleF], [wx, axleF], [-wx, axleR], [wx, axleR]], wheelR: 0.46, roofY: 3.3 };
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
const beamMaterial = createNightGlowMaterial(0xfff0c8, { additive: true, opacity: 0.08 });

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

/** A soft round glow for siren flashes. */
const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const redGlow = new THREE.SpriteMaterial({ map: glowTexture, color: 0xff2a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const blueGlow = new THREE.SpriteMaterial({ map: glowTexture, color: 0x2a6aff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

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
      sirenZ: parts.sirenZ ?? -0.2,
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
    red.position.set(-0.3, g.roofY + 0.14, g.sirenZ);
    blue.position.set(0.3, g.roofY + 0.14, g.sirenZ);
    const redHalo = new THREE.Sprite(redGlow);
    const blueHalo = new THREE.Sprite(blueGlow);
    redHalo.scale.setScalar(2.6);
    blueHalo.scale.setScalar(2.6);
    redHalo.position.copy(red.position);
    blueHalo.position.copy(blue.position);
    chassis.add(red, blue, redHalo, blueHalo);
    sirens = { red, blue, redHalo, blueHalo };
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
      model.sirens.redHalo.visible = phase;
      model.sirens.blueHalo.visible = !phase;
    } else {
      model.sirens.red.material = sirenDim;
      model.sirens.blue.material = sirenDim;
      model.sirens.redHalo.visible = false;
      model.sirens.blueHalo.visible = false;
    }
  }
  model.chassis.rotation.z = roll;
  model.chassis.rotation.x = pitch;
  model.beams.visible = headlights;
}
