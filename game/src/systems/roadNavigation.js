// Lane geometry, traffic signal timing and A* routing over the street graph, shared by traffic,
// police pursuit and the GPS route on the minimap.
import { ROAD_HALF } from '../world/cityLayout.js';

export const SIGNAL_CYCLE = 24;

/** Signal state for north-south and east-west approaches at time t. */
export function signalStates(t) {
  const p = t % SIGNAL_CYCLE;
  if (p < 9) return { ns: 'green', ew: 'red' };
  if (p < 11) return { ns: 'yellow', ew: 'red' };
  if (p < 12) return { ns: 'red', ew: 'red' };
  if (p < 21) return { ns: 'red', ew: 'green' };
  if (p < 23) return { ns: 'red', ew: 'yellow' };
  return { ns: 'red', ew: 'red' };
}

/** Unit direction from node a to node b. */
export function direction(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return { x: dx / len, z: dz / len, len };
}

/** A point on the right-hand lane going from `from` to `to`, `t` metres from `from`. */
export function lanePoint(from, to, t, lane) {
  const d = direction(from, to);
  // Right of travel direction (dx, dz) is (-dz, dx).
  return { x: from.x + d.x * t - d.z * lane, z: from.z + d.z * t + d.x * lane };
}

/** Pick where to go after reaching `node` coming from `prev`: avoid U-turns unless a dead end. */
export function chooseNextNode(node, prev, rng) {
  const options = node.neighbors.filter((n) => n !== prev);
  if (options.length === 0) return prev;
  // Prefer going straight a little more often than turning.
  if (prev) {
    const din = direction(prev, node);
    const straight = options.find((n) => {
      const d = direction(node, n);
      return d.x * din.x + d.z * din.z > 0.9;
    });
    if (straight && rng.next() < 0.45) return straight;
  }
  return options[Math.floor(rng.next() * options.length)];
}

/** Distance from `node` at which arriving cars stop for a red light. */
export const STOP_DISTANCE = ROAD_HALF + 6.5;

/** A* shortest path between two intersections; returns the list of nodes (inclusive) or null. */
export function findRoute(network, start, goal) {
  if (!start || !goal) return null;
  if (start === goal) return [start];
  const open = new Map([[start.id, start]]);
  const came = new Map();
  const g = new Map([[start.id, 0]]);
  const f = new Map([[start.id, Math.hypot(goal.x - start.x, goal.z - start.z)]]);
  let guard = 0;
  while (open.size > 0 && guard < 2000) {
    guard += 1;
    let current = null;
    let best = Infinity;
    for (const node of open.values()) {
      const score = f.get(node.id);
      if (score < best) {
        best = score;
        current = node;
      }
    }
    if (current === goal) {
      const path = [current];
      while (came.has(current.id)) {
        current = came.get(current.id);
        path.unshift(current);
      }
      return path;
    }
    open.delete(current.id);
    for (const next of current.neighbors) {
      const tentative = g.get(current.id) + Math.hypot(next.x - current.x, next.z - current.z);
      if (tentative < (g.get(next.id) ?? Infinity)) {
        came.set(next.id, current);
        g.set(next.id, tentative);
        f.set(next.id, tentative + Math.hypot(goal.x - next.x, goal.z - next.z));
        open.set(next.id, next);
      }
    }
  }
  return null;
}
