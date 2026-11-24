//! The fixed, deterministic plan of Solara Bay: a 100 m street grid on the mainland, the Port
//! Calloway docks island across the channel joined by two bridges, the beach and the sea.
//! It generates the street graph (intersections and road segments, in the same order as the
//! JavaScript fallback so node ids agree), the city blocks with their districts, the terrain
//! height of any point, and the rows of palms that line the boulevards.

use crate::io;
use crate::pathfinding;

pub const BLOCK: f64 = 100.0;
pub const ROAD_HALF: f64 = 7.0;
pub const SIDEWALK_OUTER: f64 = 11.0;
pub const WATER_LEVEL: f64 = -1.6;

const MAINLAND_I: (i32, i32) = (-5, 3);
const MAINLAND_J: (i32, i32) = (-5, 3);
const DOCKS_I: (i32, i32) = (5, 6);
const DOCKS_J: (i32, i32) = (-3, 2);
const BRIDGE_ROWS: [i32; 2] = [-1, 2];

struct Rect {
    min_x: f64,
    max_x: f64,
    min_z: f64,
    max_z: f64,
}

impl Rect {
    fn contains(&self, x: f64, z: f64) -> bool {
        x >= self.min_x && x <= self.max_x && z >= self.min_z && z <= self.max_z
    }
}

const CHANNEL_MIN_X: f64 = 352.0;
const CHANNEL_MAX_X: f64 = 448.0;
const DOCKS_LAND: Rect = Rect { min_x: 448.0, max_x: 685.0, min_z: -352.0, max_z: 262.0 };
const PIER: Rect = Rect { min_x: -160.0, max_x: -136.0, min_z: 312.0, max_z: 465.0 };
const BEACH_MIN_Z: f64 = 312.0;
const BEACH_SHORE_Z: f64 = 392.0;

/// Districts in the order of game/src/data/districts.js.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum District {
    Meridian = 0,
    Halcyon = 1,
    LittleCoral = 2,
    Palmetto = 3,
    VistaHills = 4,
    Riverside = 5,
    PortCalloway = 6,
    Beach = 7,
    Bridge = 8,
}

/// Which district a world position lies in.
pub fn district_at(x: f64, z: f64) -> District {
    if x > 445.0 {
        District::PortCalloway
    } else if x > 345.0 {
        District::Bridge
    } else if z > 312.0 {
        District::Beach
    } else if z > 150.0 {
        District::Halcyon
    } else if z < -420.0 {
        District::VistaHills
    } else if x < -250.0 {
        District::Palmetto
    } else if z < -80.0 && x < 150.0 {
        District::Meridian
    } else if z < -80.0 {
        District::Riverside
    } else {
        District::LittleCoral
    }
}

fn node_exists(i: i32, j: i32) -> bool {
    let main = i >= MAINLAND_I.0 && i <= MAINLAND_I.1 && j >= MAINLAND_J.0 && j <= MAINLAND_J.1;
    let docks = i >= DOCKS_I.0 && i <= DOCKS_I.1 && j >= DOCKS_J.0 && j <= DOCKS_J.1;
    main || docks
}

/// An intersection of the street grid.
#[derive(Clone, Copy, Debug)]
pub struct Junction {
    pub i: i32,
    pub j: i32,
    pub x: f64,
    pub z: f64,
}

/// A straight road between two intersections (indices into the junction list).
#[derive(Clone, Copy, Debug)]
pub struct RoadSegment {
    pub a: u32,
    pub b: u32,
    pub bridge: bool,
}

/// Build the street graph: junctions column by column, then east and south roads from each
/// junction, then the two bridges to the docks.
pub fn generate_street_grid() -> (Vec<Junction>, Vec<RoadSegment>) {
    let mut junctions = Vec::new();
    for i in MAINLAND_I.0..=DOCKS_I.1 {
        for j in MAINLAND_J.0..=MAINLAND_J.1 {
            if node_exists(i, j) {
                junctions.push(Junction { i, j, x: f64::from(i) * BLOCK, z: f64::from(j) * BLOCK });
            }
        }
    }
    let find = |list: &[Junction], i: i32, j: i32| list.iter().position(|n| n.i == i && n.j == j);
    let mut roads = Vec::new();
    for (k, n) in junctions.iter().enumerate() {
        if let Some(east) = find(&junctions, n.i + 1, n.j) {
            roads.push(RoadSegment { a: k as u32, b: east as u32, bridge: false });
        }
        if let Some(south) = find(&junctions, n.i, n.j + 1) {
            roads.push(RoadSegment { a: k as u32, b: south as u32, bridge: false });
        }
    }
    for j in BRIDGE_ROWS {
        if let (Some(a), Some(b)) = (find(&junctions, MAINLAND_I.1, j), find(&junctions, DOCKS_I.0, j)) {
            roads.push(RoadSegment { a: a as u32, b: b as u32, bridge: true });
        }
    }
    (junctions, roads)
}

/// True over a bridge deck.
pub fn on_bridge_deck(x: f64, z: f64) -> bool {
    if !(CHANNEL_MIN_X - 2.0..=CHANNEL_MAX_X + 2.0).contains(&x) {
        return false;
    }
    BRIDGE_ROWS.iter().any(|&j| (z - f64::from(j) * BLOCK).abs() <= ROAD_HALF + 2.5)
}

/// Height of the walkable and drivable surface: land at 0, the beach sloping into the sea.
pub fn ground_height(x: f64, z: f64) -> f64 {
    if on_bridge_deck(x, z) || DOCKS_LAND.contains(x, z) {
        return 0.0;
    }
    if PIER.contains(x, z) {
        return 0.4;
    }
    if (CHANNEL_MIN_X..=CHANNEL_MAX_X).contains(&x) || x > DOCKS_LAND.max_x {
        return -6.0;
    }
    if z > BEACH_MIN_Z && x < CHANNEL_MIN_X {
        if z < BEACH_SHORE_Z {
            return -((z - BEACH_MIN_Z) / (BEACH_SHORE_Z - BEACH_MIN_Z)) * 1.2;
        }
        return -1.2 - ((z - BEACH_SHORE_Z) * 0.1).min(5.0);
    }
    0.0
}

/// 1 on a raised block slab (sidewalks and lots), 0 on streets and open ground.
fn on_block_slab(x: f64, z: f64) -> f64 {
    let lx = x.rem_euclid(BLOCK);
    let lz = z.rem_euclid(BLOCK);
    if lx <= ROAD_HALF || lx >= BLOCK - ROAD_HALF || lz <= ROAD_HALF || lz >= BLOCK - ROAD_HALF {
        return 0.0;
    }
    let bi = (x / BLOCK).floor() as i32;
    let bj = (z / BLOCK).floor() as i32;
    let mainland = bi >= MAINLAND_I.0 && bi < MAINLAND_I.1 && bj >= MAINLAND_J.0 && bj < MAINLAND_J.1;
    let docks = bi == DOCKS_I.0 && bj >= DOCKS_J.0 && bj < DOCKS_J.1;
    if mainland || docks { 1.0 } else { 0.0 }
}

/// Ground plus the 18 cm sidewalk slab where there is one.
pub fn surface_height(x: f64, z: f64) -> f64 {
    ground_height(x, z) + on_block_slab(x, z) * 0.18
}

/// A city block: grid index, whether it is on the docks island, its district and its lot.
pub struct CityBlock {
    pub bi: i32,
    pub bj: i32,
    pub docks: bool,
    pub district: District,
    pub cx: f64,
    pub cz: f64,
    pub lot: [f64; 4],
}

fn make_block(bi: i32, bj: i32, docks: bool) -> CityBlock {
    let x0 = f64::from(bi) * BLOCK;
    let z0 = f64::from(bj) * BLOCK;
    let (cx, cz) = (x0 + BLOCK / 2.0, z0 + BLOCK / 2.0);
    CityBlock {
        bi,
        bj,
        docks,
        district: if docks { District::PortCalloway } else { district_at(cx, cz) },
        cx,
        cz,
        lot: [x0 + SIDEWALK_OUTER, x0 + BLOCK - SIDEWALK_OUTER, z0 + SIDEWALK_OUTER, z0 + BLOCK - SIDEWALK_OUTER],
    }
}

/// Every block between four streets: the mainland grid, then the docks column.
pub fn list_blocks() -> Vec<CityBlock> {
    let mut blocks = Vec::new();
    for bi in MAINLAND_I.0..MAINLAND_I.1 {
        for bj in MAINLAND_J.0..MAINLAND_J.1 {
            blocks.push(make_block(bi, bj, false));
        }
    }
    for bj in DOCKS_J.0..DOCKS_J.1 {
        blocks.push(make_block(DOCKS_I.0, bj, true));
    }
    blocks
}

const PALM_ROWS: [i32; 3] = [3, 0, -3];
const PALM_COLUMNS: [i32; 3] = [-1, -4, 2];

/// Palms every 15 m on both sidewalks of the boulevards (three avenues and three cross streets).
pub fn plan_boulevard_palms(junctions: &[Junction], roads: &[RoadSegment]) -> Vec<(f64, f64)> {
    let mut palms = Vec::new();
    for road in roads.iter().filter(|r| !r.bridge) {
        let a = junctions[road.a as usize];
        let b = junctions[road.b as usize];
        let (dx, dz) = (b.x - a.x, b.z - a.z);
        let length = dx.hypot(dz);
        let (dir_x, dir_z) = (dx / length, dz / length);
        let horizontal = dx.abs() > dz.abs();
        let boulevard = if horizontal { PALM_ROWS.contains(&a.j) } else { PALM_COLUMNS.contains(&a.i) };
        if !boulevard {
            continue;
        }
        let (nx, nz) = (-dir_z, dir_x);
        let mut t = 20.0;
        while t < length - 18.0 {
            for s in [-1.0, 1.0] {
                palms.push((a.x + dir_x * t + nx * s * 9.6, a.z + dir_z * t + nz * s * 9.6));
            }
            t += 15.0;
        }
    }
    palms
}

// ---- exports ---------------------------------------------------------------------------------

/// Generate the street graph, load it into the router, and write the junctions to the exchange
/// buffer as [i, j, x, z] rows. Returns the junction count; `city_road_segments` gives the roads.
#[unsafe(no_mangle)]
pub extern "C" fn city_generate_streets() -> u32 {
    let (junctions, roads) = generate_street_grid();
    pathfinding::load_graph(&junctions, &roads);
    let out = io(junctions.len() * 4);
    for (k, n) in junctions.iter().enumerate() {
        out[k * 4] = f64::from(n.i);
        out[k * 4 + 1] = f64::from(n.j);
        out[k * 4 + 2] = n.x;
        out[k * 4 + 3] = n.z;
    }
    junctions.len() as u32
}

/// Write the road segments as [a, b, bridge] rows; returns their count.
#[unsafe(no_mangle)]
pub extern "C" fn city_road_segments() -> u32 {
    let (_, roads) = generate_street_grid();
    let out = io(roads.len() * 3);
    for (k, r) in roads.iter().enumerate() {
        out[k * 3] = f64::from(r.a);
        out[k * 3 + 1] = f64::from(r.b);
        out[k * 3 + 2] = if r.bridge { 1.0 } else { 0.0 };
    }
    roads.len() as u32
}

/// Write the city blocks as [bi, bj, docks, district, cx, cz, lotMinX, lotMaxX, lotMinZ, lotMaxZ].
#[unsafe(no_mangle)]
pub extern "C" fn city_blocks() -> u32 {
    let blocks = list_blocks();
    let out = io(blocks.len() * 10);
    for (k, b) in blocks.iter().enumerate() {
        let row = &mut out[k * 10..k * 10 + 10];
        row[0] = f64::from(b.bi);
        row[1] = f64::from(b.bj);
        row[2] = if b.docks { 1.0 } else { 0.0 };
        row[3] = f64::from(b.district as u32);
        row[4] = b.cx;
        row[5] = b.cz;
        row[6..10].copy_from_slice(&b.lot);
    }
    blocks.len() as u32
}

/// Write the boulevard palm positions as [x, z] pairs; returns their count.
#[unsafe(no_mangle)]
pub extern "C" fn city_boulevard_palms() -> u32 {
    let (junctions, roads) = generate_street_grid();
    let palms = plan_boulevard_palms(&junctions, &roads);
    let out = io(palms.len() * 2);
    for (k, (x, z)) in palms.iter().enumerate() {
        out[k * 2] = *x;
        out[k * 2 + 1] = *z;
    }
    palms.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn city_ground_height(x: f64, z: f64) -> f64 {
    ground_height(x, z)
}

#[unsafe(no_mangle)]
pub extern "C" fn city_surface_height(x: f64, z: f64) -> f64 {
    surface_height(x, z)
}

#[unsafe(no_mangle)]
pub extern "C" fn city_district_at(x: f64, z: f64) -> u32 {
    district_at(x, z) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_matches_the_plan() {
        let (junctions, roads) = generate_street_grid();
        // 9 x 9 mainland junctions plus a 2 x 6 docks grid.
        assert_eq!(junctions.len(), 81 + 12);
        // Mainland: 2 * 9 * 8 roads; docks: 6 + 2 * 5; two bridges.
        assert_eq!(roads.len(), 144 + 16 + 2);
        assert!(roads.iter().filter(|r| r.bridge).count() == 2);
    }

    #[test]
    fn terrain_heights() {
        assert_eq!(ground_height(0.0, 0.0), 0.0);
        assert!(ground_height(400.0, 0.0) < WATER_LEVEL);
        assert_eq!(ground_height(400.0, 200.0), 0.0); // bridge row j = 2
        assert!((surface_height(50.0, 50.0) - 0.18).abs() < 1e-9);
        assert_eq!(district_at(0.0, 250.0), District::Halcyon);
    }
}
