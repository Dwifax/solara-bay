// Glowing markers in the world: translucent light columns for mission starts, shops and
// destinations, ring checkpoints for races, and spinning pickups, each with a floating icon.
import * as THREE from 'three';

const iconCache = new Map();

function iconTexture(text, color) {
  const key = `${text}-${color}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${text.length > 1 ? 44 : 70}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(key, t);
  return t;
}

function columnTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function createMarkers(scene) {
  const columnTex = columnTexture();
  const columnGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  columnGeo.translate(0, 0.5, 0);
  const ringGeo = new THREE.TorusGeometry(1, 0.08, 8, 40);
  const discGeo = new THREE.CircleGeometry(1, 32);
  discGeo.rotateX(-Math.PI / 2);
  const list = new Set();
  let time = 0;

  function add({ x, z, y = 0, color = '#ffd23f', radius = 2, height = 3, icon = null, kind = 'column', visible = true }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const col = new THREE.Color(color);
    if (kind === 'column' || kind === 'checkpoint') {
      const mat = new THREE.MeshBasicMaterial({ color: col, map: columnTex, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const column = new THREE.Mesh(columnGeo, mat);
      column.scale.set(radius, kind === 'checkpoint' ? 12 : height, radius);
      group.add(column);
      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
      disc.scale.setScalar(radius);
      disc.position.y = 0.25;
      group.add(disc);
    }
    if (kind === 'checkpoint') {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, fog: false }));
      ring.scale.setScalar(radius * 0.8);
      ring.position.y = radius * 0.8 + 0.5;
      group.add(ring);
      group.userData.ring = ring;
    }
    if (kind === 'pickup') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
      gem.position.y = 1;
      group.add(gem);
      group.userData.spin = gem;
    }
    if (icon) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(icon, color), depthTest: false, transparent: true, fog: false }));
      sprite.scale.setScalar(1.5);
      sprite.position.y = (kind === 'checkpoint' ? radius * 1.8 : height) + 1.2;
      sprite.renderOrder = 10;
      group.add(sprite);
      group.userData.icon = sprite;
    }
    group.visible = visible;
    scene.add(group);
    const marker = {
      group,
      x,
      z,
      radius,
      remove() {
        scene.remove(group);
        list.delete(marker);
      },
      setPosition(nx, nz) {
        marker.x = nx;
        marker.z = nz;
        group.position.x = nx;
        group.position.z = nz;
      },
      setVisible(v) {
        group.visible = v;
      },
    };
    list.add(marker);
    return marker;
  }

  function update(dt, camera) {
    time += dt;
    for (const m of list) {
      const g = m.group;
      if (g.userData.spin) {
        g.userData.spin.rotation.y += dt * 2.2;
        g.userData.spin.position.y = 1 + Math.sin(time * 3) * 0.2;
      }
      if (g.userData.icon) g.userData.icon.position.y += Math.sin(time * 2.5) * 0.004;
      if (g.userData.ring) g.userData.ring.lookAt(camera.position.x, g.userData.ring.getWorldPosition(new THREE.Vector3()).y, camera.position.z);
    }
  }

  return { add, update };
}
