// The full-screen map: the whole of Solara Bay with district names, every blip and a legend.
// Scroll to zoom, drag to pan, click to place a waypoint (the GPS then routes to it), right
// click to clear it.
import { MAP_ORIGIN, MAP_SIZE, drawBlip } from './mapRenderer.js';
import { collectBlips } from './blips.js';
import { DISTRICTS } from '../data/districts.js';
import { GOLDEN_SHELLS } from '../data/activities.js';

const LABELS = [
  ['meridian', -50, -300],
  ['oceanDrive', -150, 250],
  ['littleCoral', 50, 40],
  ['palmetto', -400, -200],
  ['vistaHills', -150, -460],
  ['riverside', 230, -280],
  ['portCalloway', 570, -50],
  ['beach', -350, 360],
];

const LEGEND = [
  ['home', "Sol's Place (save)"],
  ['mission', 'Story mission'],
  ['gun', 'Bayline Arms'],
  ['car', 'Coastline Motors'],
  ['spray', 'Sunset Customs'],
  ['hospital', 'Hospital'],
  ['police-station', 'Police'],
  ['race', 'Street races'],
  ['job', 'Courier jobs'],
  ['shell', 'Golden Shell'],
  ['waypoint', 'Waypoint'],
];

export function createMapScreen(game, root, baseMap) {
  const wrap = document.createElement('div');
  wrap.className = 'map-screen hidden';
  root.appendChild(wrap);
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const side = document.createElement('div');
  side.className = 'map-legend';
  wrap.appendChild(side);
  const ctx = canvas.getContext('2d');
  const view = { zoom: 1, cx: MAP_ORIGIN.x + MAP_SIZE.w / 2, cz: MAP_ORIGIN.z + MAP_SIZE.h / 2 };
  let drag = null;
  let open = false;

  function fitScale() {
    return Math.min(canvas.width / MAP_SIZE.w, canvas.height / MAP_SIZE.h) * 0.95 * view.zoom;
  }
  function toScreen(x, z) {
    const s = fitScale();
    return [canvas.width / 2 + (x - view.cx) * s, canvas.height / 2 + (z - view.cz) * s];
  }
  function toWorld(sx, sy) {
    const s = fitScale();
    return [view.cx + (sx - canvas.width / 2) / s, view.cz + (sy - canvas.height / 2) / s];
  }

  function draw() {
    if (!open) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = fitScale();
    const [ox, oy] = toScreen(MAP_ORIGIN.x, MAP_ORIGIN.z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baseMap, ox, oy, MAP_SIZE.w * s, MAP_SIZE.h * s);
    // District names.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [id, x, z] of LABELS) {
      const [sx, sy] = toScreen(x, z);
      ctx.font = `bold ${Math.round(13 + 4 * view.zoom)}px "Trebuchet MS", Arial`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(DISTRICTS[id].name.toUpperCase(), sx, sy);
      ctx.fillStyle = '#fff6e0';
      ctx.fillText(DISTRICTS[id].name.toUpperCase(), sx, sy);
    }
    // Search area.
    const wanted = game.wanted.state;
    if (wanted.level > 0) {
      const [cx, cy] = toScreen(wanted.lastSeenX, wanted.lastSeenZ);
      ctx.beginPath();
      ctx.arc(cx, cy, wanted.searchRadius * s, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,50,50,0.2)';
      ctx.fill();
    }
    // Shells found are hidden; the rest show only when the story is done.
    const blipScale = Math.min(1.6, 0.9 + view.zoom * 0.3);
    if (game.missions.nextMission() === null) {
      GOLDEN_SHELLS.forEach(([x, z], i) => {
        if (game.activities.state.shellsFound.includes(i)) return;
        const [sx, sy] = toScreen(x, z);
        drawBlip(ctx, 'shell', sx, sy, blipScale);
      });
    }
    for (const b of collectBlips(game)) {
      const [sx, sy] = toScreen(b.x, b.z);
      drawBlip(ctx, b.type, sx, sy, blipScale * 1.1, b);
    }
    // Player.
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const heading = game.player.vehicle ? game.player.vehicle.heading : game.player.heading;
    const [px, py] = toScreen(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.restore();
  }

  function buildLegend() {
    const next = game.missions.nextMission();
    const done = game.missions.progress.completed.length;
    side.innerHTML = `<h2>SOLARA BAY</h2><p class="story">${next ? `Next mission: <b>${next.title}</b>` : 'Story complete'}<br>${done} / ${game.missions.list.length} story missions</p><ul>${LEGEND.map(([type, label]) => `<li><canvas data-type="${type}" width="22" height="22"></canvas>${label}</li>`).join('')}</ul><p class="tip">Scroll: zoom · Drag: pan<br>Click: set waypoint · Right click: clear<br>M / Esc: close</p>`;
    for (const c of side.querySelectorAll('canvas')) {
      const g = c.getContext('2d');
      drawBlip(g, c.dataset.type, 11, 11, 1, { label: 'B', color: '#ffd166' });
    }
  }

  canvas.addEventListener('wheel', (e) => {
    if (!open) return;
    const [wx, wz] = toWorld(e.offsetX, e.offsetY);
    view.zoom = Math.min(5, Math.max(0.8, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const [nx, nz] = toWorld(e.offsetX, e.offsetY);
    view.cx += wx - nx;
    view.cz += wz - nz;
    draw();
  });
  canvas.addEventListener('mousedown', (e) => {
    drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cz: view.cz, moved: false, button: e.button };
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const s = fitScale();
    const dx = e.offsetX - drag.x;
    const dy = e.offsetY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.cx = drag.cx - dx / s;
    view.cz = drag.cz - dy / s;
    draw();
  });
  canvas.addEventListener('mouseup', (e) => {
    if (drag && !drag.moved) {
      if (drag.button === 2) game.waypoint = null;
      else {
        const [x, z] = toWorld(e.offsetX, e.offsetY);
        game.waypoint = { x, z };
        game.events.emit('uiSelect', {});
      }
      draw();
    }
    drag = null;
  });

  return {
    open() {
      open = true;
      wrap.classList.remove('hidden');
      const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
      view.zoom = 1.6;
      view.cx = p.x;
      view.cz = p.z;
      buildLegend();
      draw();
    },
    close() {
      open = false;
      wrap.classList.add('hidden');
    },
    get isOpen() {
      return open;
    },
    draw,
    /** Show the whole map at a given zoom and centre (screenshots). */
    frame(cx, cz, zoom) {
      view.cx = cx;
      view.cz = cz;
      view.zoom = zoom;
      draw();
    },
  };
}
