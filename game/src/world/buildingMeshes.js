// Turns generated building boxes into a handful of instanced meshes (one draw call per facade
// style), adds pitched roofs, pools, neon strips and painted signs, and registers collision.
import * as THREE from 'three';
import { createFacadeMaterial, createNightGlowMaterial, standardMaterial } from '../render/cityMaterials.js';
import { roofPrism } from '../render/geometryUtils.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0, 0.5, 0);

function instancedBoxes(scene, list, material, castShadow = true) {
  if (list.length === 0) return null;
  const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  list.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d);
    m.setPosition(b.x, b.y, b.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.set(b.color));
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

/** A canvas texture with centred text, for shop and landmark signs. */
export function makeSignTexture(text, color, bg, width = 512, height = 96) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.floor(height * 0.58)}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = Math.floor(height * 0.58);
  while (ctx.measureText(text).width > width * 0.92 && size > 10) {
    size -= 2;
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildBuildingMeshes(scene, generated, collision) {
  const glassMat = createFacadeMaterial({ cell: [2.6, 3.6], frame: [0.06, 0.12], glass: 0.92, glassColor: 0x4f7593, litShare: 0.5, ground: 5, roughness: 0.35, metalness: 0.25 });
  const stuccoMat = createFacadeMaterial({ cell: [3.4, 3.4], frame: [0.24, 0.24], glass: 0.85, glassColor: 0x50677a, litShare: 0.4, ground: 3.6 });
  const industrialMat = createFacadeMaterial({ cell: [8, 5], frame: [0.15, 0.35], glass: 0.4, glassColor: 0x6a7c88, litShare: 0.2, ground: 6, roughness: 0.9 });
  const plainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });

  const meshes = [
    instancedBoxes(scene, generated.glass, glassMat),
    instancedBoxes(scene, generated.stucco, stuccoMat),
    instancedBoxes(scene, generated.industrial, industrialMat),
    instancedBoxes(scene, generated.plain, plainMat),
  ];

  for (const list of [generated.glass, generated.stucco, generated.industrial, generated.plain]) {
    for (const b of list) {
      if (!b.solid) continue;
      collision.addBox(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, b.y + b.h, b.y - 0.5);
    }
  }

  // Pitched roofs: one instanced prism, scaled per house.
  if (generated.roofs.length) {
    const prism = roofPrism(1, 1, 1, 0xffffff);
    const roofMesh = new THREE.InstancedMesh(prism, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), generated.roofs.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    generated.roofs.forEach((r, i) => {
      m.makeScale(r.w, r.h, r.d);
      m.setPosition(r.x, r.y, r.z);
      roofMesh.setMatrixAt(i, m);
      roofMesh.setColorAt(i, c.set(r.color));
    });
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    scene.add(roofMesh);
  }

  // Pools: turquoise water in a white rim.
  const poolWater = new THREE.MeshStandardMaterial({ color: 0x3fc6d8, roughness: 0.15, metalness: 0.1, emissive: 0x0a3a44 });
  const poolRim = standardMaterial(0xf4f1ea);
  for (const p of generated.pools) {
    const rim = new THREE.Mesh(unitBox, poolRim);
    rim.scale.set(p.w + 1.2, 0.3, p.d + 1.2);
    rim.position.set(p.x, 0.15, p.z);
    rim.receiveShadow = true;
    scene.add(rim);
    const water = new THREE.Mesh(unitBox, poolWater);
    water.scale.set(p.w, 0.05, p.d);
    water.position.set(p.x, 0.42, p.z);
    scene.add(water);
  }

  // Neon strips that glow after sunset.
  const neonByColor = new Map();
  for (const n of generated.neon) {
    if (!neonByColor.has(n.color)) neonByColor.set(n.color, createNightGlowMaterial(n.color, { dayLevel: 0.35 }));
    const mesh = new THREE.Mesh(unitBox, neonByColor.get(n.color));
    if (n.axis === 'x') mesh.scale.set(n.w, n.h, 0.25);
    else mesh.scale.set(0.25, n.h, n.w);
    mesh.position.set(n.x, n.y, n.z);
    scene.add(mesh);
  }

  // Painted signs for named places, glowing neon names on the hotels.
  for (const s of generated.signs) addSign(scene, s);
  for (const s of generated.neonSigns) addNeonSign(scene, s);
  return meshes;
}

/** A neon script sign: glowing outlined letters that brighten after sunset. */
function addNeonSign(scene, s) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.font = 'italic bold 70px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 70;
  while (ctx.measureText(s.text).width > 480 && size > 20) {
    size -= 4;
    ctx.font = `italic bold ${size}px Georgia, "Times New Roman", serif`;
  }
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 5;
  ctx.strokeStyle = s.color;
  ctx.strokeText(s.text, 256, 58);
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(s.text, 256, 58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = createNightGlowMaterial(0xffffff, { dayLevel: 0.75 });
  material.map = texture;
  material.transparent = true;
  material.depthWrite = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.w * (112 / 512)), material);
  mesh.position.set(s.x, s.y, s.z);
  mesh.rotation.y = s.rotY;
  scene.add(mesh);
}

/** A flat sign board with text, facing rotY (0 = facing +z). */
export function addSign(scene, s) {
  const texture = makeSignTexture(s.text, s.color, s.bg);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.25 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), material);
  mesh.position.set(s.x, s.y, s.z);
  mesh.rotation.y = s.rotY ?? 0;
  scene.add(mesh);
  return mesh;
}
