// Static collision for the city: every building, wall and big prop is an axis-aligned box kept in
// a spatial hash. Circles (people, cars) are pushed out of boxes, and rays (bullets, the camera,
// police line of sight) are cast against them.

const CELL = 16;

export function createCollisionWorld() {
  const cells = new Map();
  const boxes = [];
  let stamp = 1;

  function cellKey(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  function addBox(minX, maxX, minZ, maxZ, maxY = 50, minY = -10, kind = 'building') {
    const box = { minX, maxX, minZ, maxZ, minY, maxY, kind, mark: 0 };
    boxes.push(box);
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const key = cellKey(cx, cz);
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(box);
      }
    }
    return box;
  }

  /** Boxes whose cells touch the square around (x, z) of half-size r. */
  function nearbyBoxes(x, z, r, out) {
    stamp += 1;
    out.length = 0;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx += 1) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz += 1) {
        const list = cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const box of list) {
          if (box.mark === stamp) continue;
          box.mark = stamp;
          out.push(box);
        }
      }
    }
    return out;
  }

  const scratch = [];
  const result = { x: 0, z: 0, hit: false, nx: 0, nz: 0, depth: 0 };

  /**
   * Push a circle at (x, z) of radius r out of every box it overlaps whose top is above footY.
   * Returns the corrected position with the normal of the deepest contact.
   */
  function resolveCircle(x, z, r, footY = 0) {
    result.hit = false;
    result.nx = 0;
    result.nz = 0;
    result.depth = 0;
    nearbyBoxes(x, z, r + 1, scratch);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const box of scratch) {
        if (box.maxY <= footY + 0.4 || box.minY > footY + 1.6) continue;
        const px = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
        const pz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
        let dx = x - px;
        let dz = z - pz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let depth;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          depth = r - d;
        } else {
          // Centre inside the box: leave by the nearest face.
          const left = x - box.minX;
          const right = box.maxX - x;
          const top = z - box.minZ;
          const bottom = box.maxZ - z;
          const m = Math.min(left, right, top, bottom);
          dx = m === left ? -1 : m === right ? 1 : 0;
          dz = m === top ? -1 : m === bottom ? 1 : 0;
          depth = m + r;
        }
        x += dx * depth;
        z += dz * depth;
        result.hit = true;
        if (depth > result.depth) {
          result.depth = depth;
          result.nx = dx;
          result.nz = dz;
        }
      }
    }
    result.x = x;
    result.z = z;
    return result;
  }

  /** Distance along a ray (unit direction) to the first box, or Infinity within maxDist. */
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = Infinity;
    const step = CELL * 0.5;
    stamp += 1;
    const myStamp = stamp;
    for (let travelled = 0; travelled <= maxDist + step; travelled += step) {
      const sx = ox + dx * Math.min(travelled, maxDist);
      const sz = oz + dz * Math.min(travelled, maxDist);
      const list = cells.get(cellKey(Math.floor(sx / CELL), Math.floor(sz / CELL)));
      if (list) {
        for (const box of list) {
          if (box.mark === myStamp) continue;
          box.mark = myStamp;
          const t = rayBox(ox, oy, oz, dx, dy, dz, box);
          if (t < best) best = t;
        }
      }
      // Check the neighbouring cells the ray may clip at this sample too.
      const cx = Math.floor(sx / CELL);
      const cz = Math.floor(sz / CELL);
      for (let ix = -1; ix <= 1; ix += 1) {
        for (let iz = -1; iz <= 1; iz += 1) {
          if (ix === 0 && iz === 0) continue;
          const other = cells.get(cellKey(cx + ix, cz + iz));
          if (!other) continue;
          for (const box of other) {
            if (box.mark === myStamp) continue;
            box.mark = myStamp;
            const t = rayBox(ox, oy, oz, dx, dy, dz, box);
            if (t < best) best = t;
          }
        }
      }
      if (best <= travelled) break;
    }
    return best <= maxDist ? best : Infinity;
  }

  /** True when nothing solid lies between two points. */
  function lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return raycast(ax, ay, az, dx / len, dy / len, dz / len, len) === Infinity;
  }

  /** True when a point is inside any box (used to keep spawns off buildings). */
  function pointBlocked(x, z, margin = 0) {
    nearbyBoxes(x, z, margin + 1, scratch);
    for (const box of scratch) {
      if (x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin && box.maxY > 0.5) return true;
    }
    return false;
  }

  return { addBox, resolveCircle, raycast, lineClear, pointBlocked, nearbyBoxes, boxes };
}

/** Slab test of a ray against a box; returns entry distance or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
