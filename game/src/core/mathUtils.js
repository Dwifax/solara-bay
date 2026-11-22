// Small math helpers shared by physics, AI and UI code.

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing factor for a rate in 1/seconds. */
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/** Shortest signed difference from angle a to angle b. */
export function angleDelta(a, b) {
  return wrapAngle(b - a);
}

/** Heading (radians, 0 = +z, PI/2 = +x) that looks from (x0, z0) toward (x1, z1). */
export function headingTo(x0, z0, x1, z1) {
  return Math.atan2(x1 - x0, z1 - z0);
}

export function dist2d(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Linear interpolation between two hex colours, returned as a hex number. */
export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

/** Format a money amount as $1,234,567. */
export function formatMoney(value) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
