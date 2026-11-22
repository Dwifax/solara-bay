// Draws the city map once into an offscreen canvas (sea, beach, hills, lots by district,
// building footprints, parks, streets and bridges) and provides the blip icons that the minimap
// and the full-screen map draw on top of it.
import { WORLD_BOUNDS, CHANNEL, DOCKS_LAND, BEACH, PIER, ROAD_HALF, BLOCK } from '../world/cityLayout.js';

export const MAP_ORIGIN = { x: WORLD_BOUNDS.minX - 25, z: WORLD_BOUNDS.minZ - 25 };
export const MAP_SIZE = { w: WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 50, h: WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + 50 };
const SCALE = 1;

const LOT_COLORS = {
  towers: '#c9c4bb',
  deco: '#e9d8bd',
  midrise: '#d6cbb8',
  houses: '#b5cf95',
  villas: '#a9cf8e',
  warehouses: '#b3aea4',
  docks: '#aaa69c',
  park: '#8fc56c',
};

export function renderBaseMap(city) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(MAP_SIZE.w * SCALE);
  canvas.height = Math.ceil(MAP_SIZE.h * SCALE);
  const ctx = canvas.getContext('2d');
  const X = (x) => (x - MAP_ORIGIN.x) * SCALE;
  const Z = (z) => (z - MAP_ORIGIN.z) * SCALE;
  // Sea.
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Mainland and hills.
  ctx.fillStyle = '#d9d2c3';
  ctx.fillRect(0, 0, X(CHANNEL.minX), Z(BEACH.minZ));
  ctx.fillStyle = '#86a965';
  ctx.fillRect(0, 0, canvas.width, Z(WORLD_BOUNDS.minZ));
  ctx.fillRect(0, 0, X(WORLD_BOUNDS.minX), Z(BEACH.shoreZ));
  // Beach.
  const beach = ctx.createLinearGradient(0, Z(BEACH.minZ), 0, Z(BEACH.shoreZ));
  beach.addColorStop(0, '#f3e2b5');
  beach.addColorStop(1, '#e3c98f');
  ctx.fillStyle = beach;
  ctx.fillRect(X(WORLD_BOUNDS.minX), Z(BEACH.minZ), X(CHANNEL.minX) - X(WORLD_BOUNDS.minX), Z(BEACH.shoreZ) - Z(BEACH.minZ));
  // Docks island.
  ctx.fillStyle = '#c3beb3';
  ctx.fillRect(X(DOCKS_LAND.minX), Z(DOCKS_LAND.minZ), X(DOCKS_LAND.maxX) - X(DOCKS_LAND.minX), Z(DOCKS_LAND.maxZ) - Z(DOCKS_LAND.minZ));
  // Blocks: sidewalk then lot colour then buildings.
  for (const b of city.blocks) {
    const x0 = b.bi * BLOCK + ROAD_HALF;
    const z0 = b.bj * BLOCK + ROAD_HALF;
    ctx.fillStyle = '#e8e3da';
    ctx.fillRect(X(x0), Z(z0), (BLOCK - ROAD_HALF * 2) * SCALE, (BLOCK - ROAD_HALF * 2) * SCALE);
    ctx.fillStyle = LOT_COLORS[b.style] ?? '#d6cbb8';
    ctx.fillRect(X(b.lot.minX), Z(b.lot.minZ), (b.lot.maxX - b.lot.minX) * SCALE, (b.lot.maxZ - b.lot.minZ) * SCALE);
  }
  const g = city.generated;
  ctx.fillStyle = 'rgba(70, 70, 80, 0.35)';
  for (const list of [g.glass, g.stucco, g.industrial]) {
    for (const bd of list) ctx.fillRect(X(bd.x - bd.w / 2), Z(bd.z - bd.d / 2), bd.w * SCALE, bd.d * SCALE);
  }
  ctx.fillStyle = 'rgba(140, 80, 60, 0.45)';
  for (const r of g.roofs) ctx.fillRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * SCALE, r.d * SCALE);
  ctx.fillStyle = '#56c3dc';
  for (const p of g.pools) ctx.fillRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * SCALE, p.d * SCALE);
  // Streets.
  ctx.strokeStyle = '#55595f';
  ctx.lineCap = 'square';
  ctx.lineWidth = ROAD_HALF * 2 * SCALE;
  for (const e of city.network.edges) {
    ctx.beginPath();
    ctx.moveTo(X(e.a.x), Z(e.a.z));
    ctx.lineTo(X(e.b.x), Z(e.b.z));
    ctx.stroke();
  }
  ctx.strokeStyle = '#7b7f86';
  ctx.lineWidth = 1.2;
  for (const e of city.network.edges) {
    ctx.beginPath();
    ctx.moveTo(X(e.a.x), Z(e.a.z));
    ctx.lineTo(X(e.b.x), Z(e.b.z));
    ctx.stroke();
  }
  // Pier.
  ctx.fillStyle = '#9b7653';
  ctx.fillRect(X(PIER.minX), Z(PIER.minZ), (PIER.maxX - PIER.minX) * SCALE, (PIER.maxZ - PIER.minZ) * SCALE);
  return canvas;
}

/** Draw a blip of `type` at canvas point (x, y); `s` scales it. */
export function drawBlip(ctx, type, x, y, s = 1, extra = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const circle = (r, fill, stroke = '#111') => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  const label = (text, color = '#111', size = 10) => {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0.5);
  };
  switch (type) {
    case 'mission':
      circle(8, extra.color ?? '#ffd23f');
      label(extra.label ?? '!', '#111', 10);
      break;
    case 'destination':
      circle(6.5, '#ffd23f');
      circle(2.5, '#111', '#111');
      break;
    case 'checkpoint':
      circle(6, '#ffd23f');
      break;
    case 'checkpoint-next':
      circle(4, '#9c8420');
      break;
    case 'enemy':
      circle(3.6, '#ff3b3b', '#400');
      break;
    case 'enemy-car':
    case 'target-car':
      ctx.fillStyle = type === 'target-car' ? '#ffd23f' : '#ff3b3b';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.strokeRect(-4.5, -4.5, 9, 9);
      break;
    case 'friend':
    case 'friend-car':
      circle(4.5, '#4fb3ff');
      break;
    case 'rival':
      circle(4, '#ff7ad9');
      break;
    case 'police':
      circle(4, extra.flash ? '#ff2b2b' : '#2b6bff', '#fff');
      break;
    case 'cop':
      circle(2.6, extra.flash ? '#ff2b2b' : '#2b6bff', '#fff');
      break;
    case 'heli':
      circle(5, '#2b6bff', '#fff');
      label('H', '#fff', 8);
      break;
    case 'gun':
      circle(7, '#ffb347');
      label('A', '#111', 9);
      break;
    case 'car':
      circle(7, '#6ec6ff');
      label('$', '#111', 9);
      break;
    case 'spray':
      circle(7, '#c58cff');
      label('C', '#111', 9);
      break;
    case 'home':
      circle(7, '#7dffb0');
      label('⌂', '#111', 11);
      break;
    case 'hospital':
      circle(7, '#ffffff');
      label('+', '#d01c1c', 13);
      break;
    case 'police-station':
      circle(7, '#2b6bff');
      label('★', '#fff', 9);
      break;
    case 'race':
      circle(7, '#ff5ac8');
      label('R', '#111', 9);
      break;
    case 'job':
      circle(7, '#5ad1ff');
      label('J', '#111', 9);
      break;
    case 'shell':
      circle(3, '#ffcf3f');
      break;
    case 'waypoint':
      circle(6, '#c36bff');
      break;
    default:
      circle(4, '#ffffff');
  }
  ctx.restore();
}
