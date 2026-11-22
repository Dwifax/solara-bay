// Turns keyboard and mouse into the player's actions: walking relative to the camera, entering,
// carjacking and leaving cars (F), driving (WASD, Space handbrake, H horn) and weapon choice.
import { WEAPON_ORDER } from '../data/weapons.js';
import { dist2d } from '../core/mathUtils.js';

const ENTER_RANGE = 2.6;

export function createPlayerController(game) {
  const { input, events } = game;
  let entering = null;

  /** The closest usable car within reach of the player. */
  function findEnterableVehicle() {
    const p = game.player.position;
    let best = null;
    let bestD = ENTER_RANGE;
    for (const v of game.vehicles) {
      if (v.destroyed || v.sunk) continue;
      const d = dist2d(p.x, p.z, v.position.x, v.position.z) - v.spec.length * 0.5;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  function enterVehicle(vehicle) {
    const player = game.player;
    if (vehicle.driver && vehicle.driver !== 'player') {
      const victim = vehicle.driver;
      vehicle.driver = null;
      events.emit('carjack', { vehicle, victim, x: vehicle.position.x, z: vehicle.position.z });
    }
    vehicle.driver = 'player';
    vehicle.persistent = true;
    player.vehicle = vehicle;
    player.group.visible = false;
    player.aiming = false;
    game.cameraCtl.state.idleTime = 2;
    events.emit('enteredVehicle', { vehicle });
  }

  function exitVehicle(force) {
    const player = game.player;
    const vehicle = player.vehicle;
    if (!vehicle) return;
    const fast = vehicle.speed > 7;
    if (fast && !force) {
      // Bail out of a moving car.
      player.takeDamage(Math.min(25, vehicle.speed * 1.2));
    }
    const door = vehicle.doorPosition();
    let x = door.x;
    let z = door.z;
    if (game.city.collision.pointBlocked(x, z, 0.3)) {
      const f = vehicle.forward();
      x = vehicle.position.x + -f.z * (vehicle.spec.width / 2 + 0.8);
      z = vehicle.position.z + f.x * (vehicle.spec.width / 2 + 0.8);
    }
    vehicle.driver = null;
    vehicle.controls.throttle = 0;
    vehicle.controls.steer = 0;
    vehicle.controls.brake = !fast;
    vehicle.controls.handbrake = false;
    player.vehicle = null;
    player.position.set(x, vehicle.position.y, z);
    player.heading = vehicle.heading;
    player.moveX = 0;
    player.moveZ = 0;
    player.group.visible = true;
    events.emit('exitedVehicle', { vehicle });
  }

  function handleWeaponKeys() {
    const player = game.player;
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`) && player.hasWeapon(WEAPON_ORDER[i])) {
        player.selectWeapon(WEAPON_ORDER[i]);
        events.emit('weaponSwitched', { id: WEAPON_ORDER[i] });
      }
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) {
      const owned = WEAPON_ORDER.filter((id) => player.hasWeapon(id));
      const idx = owned.indexOf(player.current);
      const next = owned[(idx + (wheel > 0 ? 1 : -1) + owned.length) % owned.length];
      player.selectWeapon(next);
      events.emit('weaponSwitched', { id: next });
    }
  }

  function update(dt) {
    const player = game.player;
    const cam = game.cameraCtl;
    const look = input.takeLook();
    cam.look(look.x, look.y);
    if (player.dead) {
      player.updateOnFoot(dt, { x: 0, z: 0 }, false, false, 0, game.city.collision);
      return;
    }

    if (entering) {
      entering.time -= dt;
      const v = entering.vehicle;
      const door = v.doorPosition();
      player.position.x += (door.x - player.position.x) * Math.min(1, dt * 10);
      player.position.z += (door.z - player.position.z) * Math.min(1, dt * 10);
      player.syncTransform();
      if (entering.time <= 0) {
        if (!v.destroyed && dist2d(player.position.x, player.position.z, v.position.x, v.position.z) < 6) enterVehicle(v);
        entering = null;
      }
      return;
    }

    if (player.vehicle) {
      const v = player.vehicle;
      v.controls.throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
      v.controls.steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
      v.controls.handbrake = input.isDown('Space');
      v.controls.brake = false;
      if (input.isDown('KeyH')) events.emit('horn', { vehicle: v });
      if (input.wasPressed('KeyF')) exitVehicle(false);
      player.position.copy(v.position);
      if (v.sunk) exitVehicle(true);
      return;
    }

    handleWeaponKeys();
    const yaw = cam.forwardYaw();
    const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const strafe = (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) - (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    const move = { x: fx * fwd + rx * strafe, z: fz * fwd + rz * strafe };
    player.aiming = input.mouseDown(2) && player.current !== 'fists';
    const step = player.updateOnFoot(dt, move, input.isDown('ShiftLeft') || input.isDown('ShiftRight'), input.wasPressed('Space'), yaw, game.city.collision);
    if (step) events.emit('footstep', { x: player.position.x, z: player.position.z, run: player.speed > 6.5 });

    if (input.wasPressed('KeyF')) {
      const v = findEnterableVehicle();
      if (v) {
        entering = { vehicle: v, time: v.driver && v.driver !== 'player' ? 0.7 : 0.35 };
        if (v.driver && v.driver !== 'player') {
          v.controls.throttle = 0;
          v.controls.brake = true;
        }
      }
    }
  }

  return {
    update,
    enterVehicle,
    exitVehicle,
    findEnterableVehicle,
    get entering() {
      return entering;
    },
    cancelEntering() {
      entering = null;
    },
  };
}
