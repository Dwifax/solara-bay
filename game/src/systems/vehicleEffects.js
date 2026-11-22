// Car visuals driven by state: engine smoke as damage grows, fire before a wreck explodes, tyre
// smoke while drifting or burning out, splashes when a car hits the water, and a real headlight
// spotlight on the player's car after dark.
import * as THREE from 'three';
import { dist2d } from '../core/mathUtils.js';

export function createVehicleEffects(game) {
  const { events, effects } = game;
  const headlight = new THREE.SpotLight(0xfff1d0, 0, 60, 0.55, 0.6, 1.3);
  game.scene.add(headlight);
  game.scene.add(headlight.target);
  let smokeTimer = 0;

  events.on('vehicleSunk', ({ vehicle }) => effects.splash(vehicle.position.x, -1.2, vehicle.position.z));
  events.on('vehicleImpact', ({ x, z, impact }) => {
    if (impact > 8) effects.impactSparks(x, 0.8, z);
  });
  events.on('vehicleCollision', ({ x, z, impact }) => {
    if (impact > 6) effects.impactSparks(x, 0.8, z);
  });

  function update(dt) {
    smokeTimer += dt;
    const emit = smokeTimer > 0.05;
    if (emit) smokeTimer = 0;
    const cam = game.camera.position;
    for (const v of game.vehicles) {
      if (!emit) break;
      if (dist2d(v.position.x, v.position.z, cam.x, cam.z) > 140) continue;
      const f = v.forward();
      const hood = { x: v.position.x + f.x * (v.spec.length * 0.35), z: v.position.z + f.z * (v.spec.length * 0.35) };
      const ratio = v.health / v.maxHealth;
      if (v.destroyed) {
        if (Math.random() < 0.5) effects.engineSmoke(v.position.x, v.position.y + 1.2, v.position.z, true);
        if (Math.random() < 0.35) effects.fire(v.position.x, v.position.y + 0.8, v.position.z);
      } else if (v.fireTimer > 0) {
        effects.fire(hood.x, v.position.y + 1.1, hood.z);
        effects.engineSmoke(hood.x, v.position.y + 1.3, hood.z, true);
      } else if (ratio < 0.3) {
        effects.engineSmoke(hood.x, v.position.y + 1.1, hood.z, true);
      } else if (ratio < 0.6 && Math.random() < 0.5) {
        effects.engineSmoke(hood.x, v.position.y + 1.1, hood.z, false);
      }
      const burnout = v.controls.throttle > 0.9 && v.forwardSpeed < 6 && v.forwardSpeed > -1 && v.driver === 'player' && v.controls.brake;
      if ((v.drifting || burnout) && !v.sunk) {
        const rx = -f.z;
        const rz = f.x;
        const back = v.spec.length * 0.35;
        for (const s of [-1, 1]) effects.tyreSmoke(v.position.x - f.x * back + rx * s * 0.8, v.position.z - f.z * back + rz * s * 0.8);
      }
    }
    // Warn when the player's car is about to blow.
    const pv = game.player.vehicle;
    if (pv && pv.fireTimer > 0 && !pv.destroyed && !pv.warned) {
      pv.warned = true;
      game.ui?.notify('Your car is <span class="hl">on fire</span>! Press <b>F</b> to get out!', 4);
    }
    // Player headlights.
    const night = game.tod.state.night;
    if (pv && night > 0.3 && !pv.destroyed) {
      pv.headlights = true;
      const f = pv.forward();
      headlight.position.set(pv.position.x + f.x * 2.2, pv.position.y + 0.9, pv.position.z + f.z * 2.2);
      headlight.target.position.set(pv.position.x + f.x * 20, 0, pv.position.z + f.z * 20);
      headlight.intensity = 260 * night;
    } else {
      headlight.intensity = 0;
      if (pv) pv.headlights = night > 0.3;
    }
  }

  return { update };
}
