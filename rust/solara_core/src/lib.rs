//! Solara Bay simulation core, compiled to WebAssembly and loaded by game/src/core/wasmCore.js.
//!
//! The game's hot, allocation-free simulation lives here: the deterministic city plan
//! (`city_layout`), the static collision world on a dense spatial hash (`collision`), A* routing
//! on the street graph for police pursuits and the GPS (`pathfinding`), lane following, signal
//! timing, obstacle scanning and pedestrian steering (`traffic`), and the batched arcade car
//! physics with car-to-car crashes (`vehicle_physics`).
//!
//! The interface is plain `extern "C"` functions over linear memory, no bindings generator:
//! scalars go in as arguments, and anything larger goes through one shared `f64` exchange buffer
//! (`io_buffer`) that JavaScript views as a `Float64Array`.

use std::cell::UnsafeCell;

pub mod city_layout;
pub mod collision;
pub mod pathfinding;
pub mod traffic;
pub mod vehicle_physics;

/// Module-level state for a single-threaded WebAssembly instance. JavaScript calls into the core
/// one export at a time, so no two borrows of the same cell are ever alive together.
pub(crate) struct Shared<T>(UnsafeCell<T>);

// SAFETY: the wasm32 build has one thread; native builds only use it from unit tests in one thread.
unsafe impl<T> Sync for Shared<T> {}

impl<T> Shared<T> {
    pub(crate) const fn new(value: T) -> Self {
        Shared(UnsafeCell::new(value))
    }

    #[allow(clippy::mut_from_ref)]
    pub(crate) fn get(&self) -> &mut T {
        // SAFETY: see the Sync note above; callers never hold two borrows of one cell.
        unsafe { &mut *self.0.get() }
    }
}

/// The exchange buffer shared with JavaScript.
static IO: Shared<Vec<f64>> = Shared::new(Vec::new());

/// The exchange buffer, grown to at least `len` values.
pub(crate) fn io(len: usize) -> &'static mut [f64] {
    let buf = IO.get();
    if buf.len() < len {
        buf.resize(len, 0.0);
    }
    &mut buf[..]
}

/// Grow the exchange buffer to `len` values and return its address in linear memory.
/// JavaScript re-creates its `Float64Array` view whenever the address or the memory changes.
#[unsafe(no_mangle)]
pub extern "C" fn io_buffer(len: u32) -> *mut f64 {
    io(len as usize).as_mut_ptr()
}

/// Interface version: bumped whenever an export changes shape, checked by wasmCore.js.
#[unsafe(no_mangle)]
pub extern "C" fn core_version() -> u32 {
    3
}

/// Frame-rate independent smoothing factor for a rate in 1/s (same as mathUtils.damp).
#[inline]
pub(crate) fn damp(rate: f64, dt: f64) -> f64 {
    1.0 - (-rate * dt).exp()
}

#[inline]
pub(crate) fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

/// Wrap an angle to (-PI, PI], matching mathUtils.wrapAngle (JavaScript `%` is a remainder).
#[inline]
pub(crate) fn wrap_angle(a: f64) -> f64 {
    let tau = std::f64::consts::TAU;
    let mut a = a % tau;
    if a > std::f64::consts::PI {
        a -= tau;
    }
    if a <= -std::f64::consts::PI {
        a += tau;
    }
    a
}

/// Heading (0 = +z, PI/2 = +x) looking from (x0, z0) toward (x1, z1).
#[inline]
pub(crate) fn heading_to(x0: f64, z0: f64, x1: f64, z1: f64) -> f64 {
    (x1 - x0).atan2(z1 - z0)
}
