// The circular radar: the pre-rendered city map turned so the camera's view points up, zooming
// out with speed, with the GPS route to the current objective, the police search circle,
// blips (clamped to the rim when important) and the player arrow.
import { MAP_ORIGIN, drawBlip } from './mapRenderer.js';
import { collectBlips } from './blips.js';
import { findRoute } from '../systems/roadNavigation.js';
import { nearestNode } from '../world/cityLayout.js';

const EDGE_TYPES = new Set(['mission', 'destination', 'checkpoint', 'target-car', 'enemy-car', 'friend', 'friend-car', 'waypoint', 'heli']);

export function createMinimap(game, canvas, baseMap) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const R = size / 2;
  let mpp = 0.9;
  let route = null;
  let routeTimer = 0;
  let routeKey = '';

  function updateRoute(dt, px, pz) {
    routeTimer -= dt;
    const target = game.gps ?? game.waypoint;
    if (!target) {
      route = null;
      return;
    }
    const key = `${Math.round(target.x / 5)},${Math.round(target.z / 5)}`;
    if (routeTimer > 0 && key === routeKey) return;
    routeTimer = 0.6;
    routeKey = key;
    const net = game.city.network;
    const path = findRoute(net, nearestNode(net, px, pz), nearestNode(net, target.x, target.z));
    route = path ? [{ x: px, z: pz }, ...path.map((n) => ({ x: n.x, z: n.z })), { x: target.x, z: target.z }] : null;
    // Skip a first node that lies behind us.
    if (route && route.length > 3) {
      const a = route[1];
      const b = route[2];
      const ab = Math.hypot(b.x - a.x, b.z - a.z);
      const pb = Math.hypot(b.x - px, b.z - pz);
      if (pb < ab) route.splice(1, 1);
    }
  }

  function draw(dt) {
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const yaw = game.cameraCtl.state.yaw;
    const speed = game.player.vehicle ? game.player.vehicle.speed : 0;
    const want = 0.75 + Math.min(1, speed / 35) * 0.9;
    mpp += (want - mpp) * Math.min(1, dt * 2);
    updateRoute(dt, p.x, p.z);

    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    const project = (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return [R + (dx * rx + dz * rz) / mpp, R - (dx * fx + dz * fz) / mpp];
    };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw - Math.PI);
    ctx.scale(1 / mpp, 1 / mpp);
    ctx.translate(-(p.x - MAP_ORIGIN.x), -(p.z - MAP_ORIGIN.z));
    ctx.drawImage(baseMap, 0, 0);
    ctx.restore();

    // Police search circle.
    const w = game.wanted.state;
    if (w.level > 0 && !w.seen) {
      const [cx, cy] = project(w.lastSeenX, w.lastSeenZ);
      const flash = Math.floor(game.worldTime * 3) % 2 === 0;
      ctx.beginPath();
      ctx.arc(cx, cy, w.searchRadius / mpp, 0, Math.PI * 2);
      ctx.fillStyle = flash ? 'rgba(255,40,40,0.22)' : 'rgba(40,90,255,0.22)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = flash ? 'rgba(255,60,60,0.8)' : 'rgba(60,110,255,0.8)';
      ctx.stroke();
    }

    // GPS route.
    if (route) {
      ctx.beginPath();
      route.forEach((pt, i) => {
        const [sx, sy] = project(pt.x, pt.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(20,20,20,0.5)';
      ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = game.gps ? '#ffd23f' : '#c36bff';
      ctx.stroke();
    }

    // Blips.
    const blips = collectBlips(game);
    for (const b of blips) {
      let [sx, sy] = project(b.x, b.z);
      const dx = sx - R;
      const dy = sy - R;
      const d = Math.hypot(dx, dy);
      const limit = R - 12;
      if (d > limit) {
        if (!EDGE_TYPES.has(b.type) && !(b.type === 'police' && d < R * 1.6)) continue;
        sx = R + (dx / d) * limit;
        sy = R + (dy / d) * limit;
      }
      drawBlip(ctx, b.type, sx, sy, b.fixed ? 0.95 : 1, b);
    }
    ctx.restore();

    // Rim, north marker and player arrow.
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,12,20,0.85)';
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
    const [nx, ny] = project(p.x, p.z - 10000);
    const nd = Math.hypot(nx - R, ny - R);
    const nX = R + ((nx - R) / nd) * (R - 11);
    const nY = R + ((ny - R) / nd) * (R - 11);
    ctx.fillStyle = 'rgba(10,12,20,0.85)';
    ctx.beginPath();
    ctx.arc(nX, nY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nX, nY + 0.5);

    const heading = game.player.vehicle ? game.player.vehicle.heading : game.player.heading;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(yaw - heading);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
