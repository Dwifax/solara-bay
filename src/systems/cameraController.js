// Third-person camera: mouse orbit around the player on foot (over the shoulder while aiming),
// a chase camera behind cars that recentres itself when the mouse rests and widens its field
// of view with speed, smoothing everywhere, and pulling in when a wall is in the way.
import * as THREE from 'three';
import { clamp, damp, angleDelta, lerp } from '../core/mathUtils.js';

export function createCameraController(camera, collision) {
  const state = {
    yaw: Math.PI,
    pitch: 0.18,
    distance: 4.6,
    idleTime: 0,
    shake: 0,
    fov: 62,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    initialised: false,
    sensitivity: 1,
  };
  const desired = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  /** Apply mouse movement (pixels). */
  function look(dx, dy) {
    const s = 0.0024 * state.sensitivity;
    state.yaw -= dx * s;
    state.pitch = clamp(state.pitch + dy * s, -0.55, 1.2);
    if (Math.abs(dx) + Math.abs(dy) > 0.5) state.idleTime = 0;
  }

  /** The direction the camera faces on the ground plane (heading convention: 0 = +z). */
  function forwardYaw() {
    return state.yaw;
  }

  function update(dt, player, vehicle) {
    state.idleTime += dt;
    let distance;
    let height;
    let side = 0;
    let fov = 62;
    if (vehicle) {
      const len = vehicle.spec.length;
      distance = 4.2 + len * 0.95;
      height = 1.2 + len * 0.18;
      pivot.set(vehicle.position.x, vehicle.position.y + 1.4, vehicle.position.z);
      // Swing behind the car when the mouse is idle and the car is moving.
      if (state.idleTime > 1.2 && Math.abs(vehicle.forwardSpeed) > 3) {
        const behind = vehicle.forwardSpeed >= 0 ? vehicle.heading : vehicle.heading + Math.PI;
        state.yaw += angleDelta(state.yaw, behind) * damp(2.6, dt);
        state.pitch += (0.16 - state.pitch) * damp(2, dt);
      }
      fov = 62 + clamp(vehicle.speed / 40, 0, 1) * 14;
    } else {
      const aim = player.aim;
      distance = lerp(4.4, 3.0, aim);
      height = lerp(1.55, 1.68, aim);
      side = lerp(0, 0.9, aim);
      pivot.set(player.position.x, player.position.y + height, player.position.z);
      fov = lerp(62, 50, aim);
      if (player.swimming) pivot.y = player.position.y + 1.2;
    }
    state.fov += (fov - state.fov) * damp(4, dt);
    if (Math.abs(camera.fov - state.fov) > 0.05) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }
    const cp = Math.cos(state.pitch);
    const dirX = -Math.sin(state.yaw) * cp;
    const dirZ = -Math.cos(state.yaw) * cp;
    const dirY = Math.sin(state.pitch);
    // Shoulder offset: to the right of the view direction.
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);
    pivot.x += rightX * side;
    pivot.z += rightZ * side;
    if (vehicle) pivot.y += 0;
    desired.set(pivot.x + dirX * distance, pivot.y + dirY * distance + (vehicle ? height * 0.35 : 0), pivot.z + dirZ * distance);
    // Pull in when a building is between the pivot and the camera.
    const dx = desired.x - pivot.x;
    const dy = desired.y - pivot.y;
    const dz = desired.z - pivot.z;
    const len = Math.hypot(dx, dy, dz);
    const hit = collision.raycast(pivot.x, pivot.y, pivot.z, dx / len, dy / len, dz / len, len + 0.3);
    let actual = len;
    if (hit !== Infinity) actual = Math.max(0.6, hit - 0.35);
    state.distance += (actual - state.distance) * damp(actual < state.distance ? 30 : 5, dt);
    const d = Math.min(state.distance, len);
    desired.set(pivot.x + (dx / len) * d, pivot.y + (dy / len) * d, pivot.z + (dz / len) * d);
    if (desired.y < 0.4) desired.y = 0.4;
    if (!state.initialised) {
      state.position.copy(desired);
      state.initialised = true;
    } else {
      state.position.lerp(desired, damp(vehicle ? 14 : 22, dt));
    }
    camera.position.copy(state.position);
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - dt * 2.5);
      const s = state.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
    lookAt.set(pivot.x - dirX * 10, pivot.y - dirY * 10 + (vehicle ? 0.6 : 0.25), pivot.z - dirZ * 10);
    camera.lookAt(lookAt);
  }

  return {
    state,
    look,
    update,
    forwardYaw,
    shake(amount) {
      state.shake = Math.min(1.2, state.shake + amount);
    },
    snapBehind(heading) {
      state.yaw = heading;
      state.pitch = 0.2;
      state.initialised = false;
    },
  };
}
