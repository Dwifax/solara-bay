// Loads the Rust simulation core (rust/solara_core, built to game/wasm/solara_core.wasm) and
// wraps its plain exports for the game: the city plan, static collision, A* routing, the lane
// driving decision, pedestrian steering and batched car physics. Everything goes through one
// shared Float64Array exchange buffer in the module's linear memory. If the file is missing or
// WebAssembly is unavailable (or ?nowasm=1 is in the URL), `wasmCore.ready` stays false and
// every caller runs its JavaScript version instead, so the game always plays.

const WASM_PATH = '../../wasm/solara_core.wasm';
const INTERFACE_VERSION = 3;

let api = null;
let view = null;
let viewPtr = -1;

/** The exchange buffer as a Float64Array of at least `len` values (re-viewed after growth). */
function exchange(len) {
  const ptr = api.io_buffer(len);
  if (!view || view.buffer !== api.memory.buffer || ptr !== viewPtr || view.length < len) {
    view = new Float64Array(api.memory.buffer, ptr, Math.max(len, 64));
    viewPtr = ptr;
  }
  return view;
}

const contact = { x: 0, z: 0, hit: false, nx: 0, nz: 0, depth: 0 };

export const wasmCore = {
  ready: false,
  reason: 'not loaded',
  bytes: 0,

  status() {
    return this.ready ? `wasm v${INTERFACE_VERSION} (${this.bytes} bytes)` : `js fallback (${this.reason})`;
  },

  // ---- city_layout.rs
  /** Street grid: junction rows [i, j, x, z] and road rows [a, b, bridge] (copied out). */
  streetGrid() {
    const nj = api.city_generate_streets();
    const junctions = exchange(nj * 4).slice(0, nj * 4);
    const nr = api.city_road_segments();
    const roads = exchange(nr * 3).slice(0, nr * 3);
    return { junctions, roads };
  },
  /** Block rows [bi, bj, docks, district, cx, cz, lotMinX, lotMaxX, lotMinZ, lotMaxZ]. */
  cityBlocks() {
    const n = api.city_blocks();
    return exchange(n * 10).slice(0, n * 10);
  },
  /** Boulevard palm positions as [x, z] pairs. */
  boulevardPalms() {
    const n = api.city_boulevard_palms();
    return exchange(n * 2).slice(0, n * 2);
  },
  groundHeight: (x, z) => api.city_ground_height(x, z),
  surfaceHeight: (x, z) => api.city_surface_height(x, z),
  districtIndex: (x, z) => api.city_district_at(x, z),

  // ---- collision.rs
  collisionReset: () => api.collision_reset(),
  addBox: (minX, maxX, minZ, maxZ, minY, maxY) => api.collision_add_box(minX, maxX, minZ, maxZ, minY, maxY),
  /** Push a circle out of the city; returns a shared result object (copy what you keep). */
  resolveCircle(x, z, r, footY) {
    contact.hit = api.collision_resolve_circle(x, z, r, footY) === 1;
    const io = exchange(5);
    contact.x = io[0];
    contact.z = io[1];
    contact.nx = io[2];
    contact.nz = io[3];
    contact.depth = io[4];
    return contact;
  },
  raycast: (ox, oy, oz, dx, dy, dz, maxDist) => api.collision_raycast(ox, oy, oz, dx, dy, dz, maxDist),
  lineClear: (ax, ay, az, bx, by, bz) => api.collision_line_clear(ax, ay, az, bx, by, bz) === 1,
  pointBlocked: (x, z, margin) => api.collision_point_blocked(x, z, margin) === 1,

  // ---- pathfinding.rs
  /** A* between junction ids: the ids of the route, or null. */
  findRoute(start, goal) {
    const n = api.route_find(start, goal);
    if (n === 0) return null;
    return Array.from(exchange(n).subarray(0, n));
  },
  nearestJunction: (x, z) => api.route_nearest_junction(x, z),
  /** Nearest point on a road: { edge (index), t, x, z, distance }. */
  nearestRoadPoint(x, z) {
    const edge = api.route_nearest_road_point(x, z);
    const io = exchange(4);
    return { edge, t: io[0], x: io[1], z: io[2], distance: io[3] };
  },
  /** Pursuit route from the junction ahead of a car to the one nearest the goal: { goal, ids }. */
  pursuitRoute(x, z, fx, fz, goalX, goalZ) {
    const n = api.route_pursuit(x, z, fx, fz, goalX, goalZ);
    const io = exchange(n + 1);
    return { goal: io[0], ids: Array.from(io.subarray(1, n + 1)) };
  },

  // ---- traffic.rs
  signalPhase: (t) => api.traffic_signal_phase(t),
  /** Rows to fill with [x, z, halfWidth, kind] before commitObstacles(count). */
  obstacleRows: (count) => exchange(count * 4),
  commitObstacles: (count) => api.traffic_load_obstacles(count),
  /** The lane-drive input row (21 values); call laneDrive() after filling it. */
  laneInput: () => exchange(21),
  /** Runs the decision; returns the exchange buffer holding [advance, throttle, steer, brake, desired, gap, blocker]. */
  laneDrive() {
    api.traffic_lane_drive();
    return exchange(7);
  },
  /** Pedestrian steering step: returns the distance to the target, new [x, z, heading] in crowdResult. */
  walkToward(x, z, heading, tx, tz, speed, dt, radius, footY) {
    const d = api.crowd_walk_toward(x, z, heading, tx, tz, speed, dt, radius, footY);
    const io = exchange(3);
    crowdResult.x = io[0];
    crowdResult.z = io[1];
    crowdResult.heading = io[2];
    return d;
  },

  // ---- vehicle_physics.rs
  VEHICLE_STRIDE: 34,
  CRASH_STRIDE: 7,
  vehicleRows: (count) => exchange(count * 34),
  stepVehicles: (count, dt) => api.vehicles_step(count, dt),
  /** Car-to-car contacts; returns the crash count (rows after the cars in the buffer). */
  collideVehicles: (count) => api.vehicles_collide(count),
  crashRows: (count, crashes) => exchange(count * 34 + crashes * 7),
};

export const crowdResult = { x: 0, z: 0, heading: 0 };

/** Fetch and instantiate the core; resolves either way (check wasmCore.ready). */
export async function loadWasmCore({ disabled = false } = {}) {
  if (disabled) {
    wasmCore.reason = 'disabled by ?nowasm';
  } else {
    try {
      if (typeof WebAssembly !== 'object') throw new Error('WebAssembly unsupported');
      const response = await fetch(new URL(WASM_PATH, import.meta.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      api = instance.exports;
      const version = api.core_version();
      if (version !== INTERFACE_VERSION) throw new Error(`interface v${version}, expected v${INTERFACE_VERSION}`);
      wasmCore.bytes = bytes.byteLength;
      wasmCore.ready = true;
      wasmCore.reason = '';
    } catch (err) {
      api = null;
      wasmCore.reason = err && err.message ? err.message : String(err);
    }
  }
  console.info(
    wasmCore.ready
      ? `[solara-core] Rust/WebAssembly core loaded: ${wasmCore.status()} - city layout, collision, routing, traffic, vehicle physics`
      : `[solara-core] WebAssembly core not used (${wasmCore.reason}); running the JavaScript fallback`,
  );
  return wasmCore;
}
