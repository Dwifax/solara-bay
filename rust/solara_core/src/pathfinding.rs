//! Routing on the street graph: A* over intersections with a binary heap, the nearest junction
//! and nearest point on any road to a position, and the police pursuit planner that routes from
//! the junction ahead of a cruiser (never one behind it) to the junction nearest its goal.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::city_layout::{Junction, RoadSegment};
use crate::{Shared, io};

struct Edge {
    a: u32,
    b: u32,
    length: f64,
    dir_x: f64,
    dir_z: f64,
}

pub struct RoadGraph {
    xs: Vec<f64>,
    zs: Vec<f64>,
    neighbors: Vec<Vec<u32>>,
    edges: Vec<Edge>,
    // A* scratch, reused between searches.
    g: Vec<f64>,
    came: Vec<u32>,
    closed: Vec<bool>,
    heap: BinaryHeap<Open>,
}

const NONE: u32 = u32::MAX;

/// A heap entry ordered so the smallest f score (then the lowest id, for determinism) pops first.
#[derive(PartialEq)]
struct Open {
    f: f64,
    id: u32,
}

impl Eq for Open {}

impl Ord for Open {
    fn cmp(&self, other: &Self) -> Ordering {
        other.f.partial_cmp(&self.f).unwrap_or(Ordering::Equal).then_with(|| other.id.cmp(&self.id))
    }
}

impl PartialOrd for Open {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Nearest point on a road centre line.
#[derive(Clone, Copy, Debug)]
pub struct RoadPoint {
    pub edge: u32,
    pub t: f64,
    pub x: f64,
    pub z: f64,
    pub distance: f64,
}

impl RoadGraph {
    pub const fn new() -> Self {
        RoadGraph {
            xs: Vec::new(),
            zs: Vec::new(),
            neighbors: Vec::new(),
            edges: Vec::new(),
            g: Vec::new(),
            came: Vec::new(),
            closed: Vec::new(),
            heap: BinaryHeap::new(),
        }
    }

    pub fn load(&mut self, junctions: &[Junction], roads: &[RoadSegment]) {
        self.xs = junctions.iter().map(|n| n.x).collect();
        self.zs = junctions.iter().map(|n| n.z).collect();
        self.neighbors = vec![Vec::new(); junctions.len()];
        self.edges.clear();
        for r in roads {
            let (a, b) = (r.a as usize, r.b as usize);
            let (dx, dz) = (self.xs[b] - self.xs[a], self.zs[b] - self.zs[a]);
            let length = dx.hypot(dz);
            self.edges.push(Edge { a: r.a, b: r.b, length, dir_x: dx / length, dir_z: dz / length });
            self.neighbors[a].push(r.b);
            self.neighbors[b].push(r.a);
        }
        let n = junctions.len();
        self.g = vec![f64::INFINITY; n];
        self.came = vec![NONE; n];
        self.closed = vec![false; n];
    }

    fn dist(&self, a: u32, b: u32) -> f64 {
        (self.xs[b as usize] - self.xs[a as usize]).hypot(self.zs[b as usize] - self.zs[a as usize])
    }

    /// A* shortest path from start to goal; the junction ids (inclusive) go into `out`.
    pub fn find_route(&mut self, start: u32, goal: u32, out: &mut Vec<u32>) -> bool {
        out.clear();
        let n = self.xs.len() as u32;
        if start >= n || goal >= n {
            return false;
        }
        if start == goal {
            out.push(start);
            return true;
        }
        self.g.iter_mut().for_each(|v| *v = f64::INFINITY);
        self.came.iter_mut().for_each(|v| *v = NONE);
        self.closed.iter_mut().for_each(|v| *v = false);
        self.heap.clear();
        self.g[start as usize] = 0.0;
        self.heap.push(Open { f: self.dist(start, goal), id: start });
        while let Some(Open { id: current, .. }) = self.heap.pop() {
            if current == goal {
                let mut node = goal;
                out.push(node);
                while self.came[node as usize] != NONE {
                    node = self.came[node as usize];
                    out.push(node);
                }
                out.reverse();
                return true;
            }
            if self.closed[current as usize] {
                continue;
            }
            self.closed[current as usize] = true;
            for k in 0..self.neighbors[current as usize].len() {
                let next = self.neighbors[current as usize][k];
                if self.closed[next as usize] {
                    continue;
                }
                let tentative = self.g[current as usize] + self.dist(current, next);
                if tentative < self.g[next as usize] {
                    self.g[next as usize] = tentative;
                    self.came[next as usize] = current;
                    self.heap.push(Open { f: tentative + self.dist(next, goal), id: next });
                }
            }
        }
        false
    }

    pub fn nearest_junction(&self, x: f64, z: f64) -> u32 {
        let mut best = 0;
        let mut best_d = f64::INFINITY;
        for k in 0..self.xs.len() {
            let d = (self.xs[k] - x).powi(2) + (self.zs[k] - z).powi(2);
            if d < best_d {
                best_d = d;
                best = k as u32;
            }
        }
        best
    }

    pub fn nearest_road_point(&self, x: f64, z: f64) -> Option<RoadPoint> {
        let mut best: Option<RoadPoint> = None;
        for (k, e) in self.edges.iter().enumerate() {
            let (ax, az) = (self.xs[e.a as usize], self.zs[e.a as usize]);
            let t = ((x - ax) * e.dir_x + (z - az) * e.dir_z).clamp(0.0, e.length);
            let (px, pz) = (ax + e.dir_x * t, az + e.dir_z * t);
            let distance = (px - x).hypot(pz - z);
            if best.is_none_or(|b| distance < b.distance) {
                best = Some(RoadPoint { edge: k as u32, t, x: px, z: pz, distance });
            }
        }
        best
    }

    /// Route for a car at (x, z) facing (fx, fz) toward a goal: start from whichever end of the
    /// road it is on lies ahead, finish at the junction nearest the goal. Returns the goal junction.
    pub fn pursuit_route(&mut self, x: f64, z: f64, fx: f64, fz: f64, goal_x: f64, goal_z: f64, out: &mut Vec<u32>) -> u32 {
        let goal = self.nearest_junction(goal_x, goal_z);
        let Some(road) = self.nearest_road_point(x, z) else {
            out.clear();
            return goal;
        };
        let e = &self.edges[road.edge as usize];
        let (a, b) = (e.a, e.b);
        let ahead_b = (self.xs[b as usize] - x) * fx + (self.zs[b as usize] - z) * fz;
        let start = if ahead_b > 0.0 { b } else { a };
        self.find_route(start, goal, out);
        goal
    }
}

impl Default for RoadGraph {
    fn default() -> Self {
        Self::new()
    }
}

static GRAPH: Shared<RoadGraph> = Shared::new(RoadGraph::new());
static ROUTE: Shared<Vec<u32>> = Shared::new(Vec::new());

pub(crate) fn load_graph(junctions: &[Junction], roads: &[RoadSegment]) {
    GRAPH.get().load(junctions, roads);
}

fn write_route(route: &[u32], offset: usize) {
    let out = io(offset + route.len());
    for (k, &id) in route.iter().enumerate() {
        out[offset + k] = f64::from(id);
    }
}

// ---- exports ---------------------------------------------------------------------------------

/// A* between two junction ids; writes the route ids to the exchange buffer and returns its
/// length (0 when there is none).
#[unsafe(no_mangle)]
pub extern "C" fn route_find(start: u32, goal: u32) -> u32 {
    let route = ROUTE.get();
    if !GRAPH.get().find_route(start, goal, route) {
        return 0;
    }
    write_route(route, 0);
    route.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn route_nearest_junction(x: f64, z: f64) -> u32 {
    GRAPH.get().nearest_junction(x, z)
}

/// Nearest point on any road: writes [t, x, z, distance] and returns the road index.
#[unsafe(no_mangle)]
pub extern "C" fn route_nearest_road_point(x: f64, z: f64) -> u32 {
    let Some(p) = GRAPH.get().nearest_road_point(x, z) else {
        return u32::MAX;
    };
    let out = io(4);
    out[0] = p.t;
    out[1] = p.x;
    out[2] = p.z;
    out[3] = p.distance;
    p.edge
}

/// Police pursuit route: writes [goal junction, route ids...] and returns the route length.
#[unsafe(no_mangle)]
pub extern "C" fn route_pursuit(x: f64, z: f64, fx: f64, fz: f64, goal_x: f64, goal_z: f64) -> u32 {
    let route = ROUTE.get();
    let goal = GRAPH.get().pursuit_route(x, z, fx, fz, goal_x, goal_z, route);
    io(1)[0] = f64::from(goal);
    write_route(route, 1);
    route.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::city_layout::generate_street_grid;

    #[test]
    fn routes_cross_the_city_and_the_bridge() {
        let (junctions, roads) = generate_street_grid();
        let mut g = RoadGraph::new();
        g.load(&junctions, &roads);
        let start = g.nearest_junction(-500.0, -500.0);
        let goal = g.nearest_junction(600.0, 200.0);
        let mut route = Vec::new();
        assert!(g.find_route(start, goal, &mut route));
        assert_eq!(route[0], start);
        assert_eq!(*route.last().unwrap(), goal);
        // From (-5,-5) to (6,2): 8 blocks east, the bridge (one 200 m road), 1 more east, 7 south.
        assert_eq!(route.len(), 18);
        let p = g.nearest_road_point(50.0, 3.0).unwrap();
        assert!((p.distance - 3.0).abs() < 1e-9);
    }
}
