// The wanted level. Crimes the police or bystanders witness add heat; heat sets 1-5 stars. While
// any officer, cruiser or the helicopter can see the player the search centres on them; out of
// sight a search circle shrinks around the last sighting, and staying outside it long enough
// loses the cops. Officers in reach of a slow, unarmed player at one star make an arrest.
import { dist2d } from '../core/mathUtils.js';

const THRESHOLDS = [0.5, 2.2, 5, 9, 14];
const CRIME_HEAT = {
  assault: 0.6,
  gunfire: 0.6,
  carjack: 0.8,
  hitPedestrian: 0.7,
  murder: 1.8,
  copAssault: 2.4,
  copMurder: 3.6,
  policeVehicle: 1.4,
  stealPoliceCar: 2.4,
  explosion: 1.2,
  vandalism: 0.3,
};

export function createWantedSystem(game) {
  const { events } = game;
  const state = {
    level: 0,
    heat: 0,
    seen: false,
    lastSeenX: 0,
    lastSeenZ: 0,
    searchRadius: 0,
    unseenTime: 0,
    escapeProgress: 0,
    arrestProgress: 0,
    frozen: false,
    maxLevel: 5,
    flash: 0,
  };

  function levelForHeat(heat) {
    let level = 0;
    for (let i = 0; i < THRESHOLDS.length; i += 1) if (heat >= THRESHOLDS[i]) level = i + 1;
    return Math.min(level, state.maxLevel);
  }

  function setLevel(level, x, z) {
    const p = game.player.position;
    const before = state.level;
    state.level = Math.min(level, 5);
    state.heat = state.level === 0 ? 0 : Math.max(state.heat, THRESHOLDS[state.level - 1]);
    if (state.level > 0) {
      state.lastSeenX = x ?? p.x;
      state.lastSeenZ = z ?? p.z;
      state.searchRadius = 70 + 25 * state.level;
      state.escapeProgress = 0;
    }
    if (state.level !== before) events.emit('wantedChanged', { level: state.level, before });
  }

  /** Is anyone who would call it in close enough to see (x, z)? */
  function witnessed(x, z) {
    const collision = game.city.collision;
    for (const v of game.vehicles) {
      if (!v.isPolice || !v.driver || v.driver === 'player' || v.destroyed) continue;
      if (dist2d(x, z, v.position.x, v.position.z) < 80 && collision.lineClear(v.position.x, 1.6, v.position.z, x, 1.2, z)) return true;
    }
    for (const ped of game.peds) {
      if (ped.dead) continue;
      const d = dist2d(x, z, ped.position.x, ped.position.z);
      if (ped.role === 'cop' && d < 70) return true;
      if (ped.role === 'civilian' && d < 28) return true;
    }
    return state.level > 0;
  }

  /** Report a crime at (x, z). */
  function report(crime, x, z, force = false) {
    if (state.frozen || game.player.dead) return;
    if (!force && !witnessed(x, z)) return;
    const before = state.level;
    state.heat += CRIME_HEAT[crime] ?? 0.5;
    const level = Math.max(state.level, levelForHeat(state.heat));
    if (level !== before) setLevel(level, x, z);
    else if (state.seen === false) {
      state.lastSeenX = x;
      state.lastSeenZ = z;
    }
    game.stats.crimes = (game.stats.crimes ?? 0) + 1;
  }

  // Crime hooks.
  events.on('pedKilled', ({ ped, attacker }) => {
    if (attacker !== 'player') return;
    const p = ped.position;
    if (ped.role === 'cop') report('copMurder', p.x, p.z, true);
    else if (ped.role === 'civilian') report('murder', p.x, p.z);
    else if ((ped.role === 'gang' || ped.role === 'guard') && !game.missions.suppressGunfireCrime()) report('gunfire', p.x, p.z);
  });
  events.on('pedHurt', ({ ped, attacker }) => {
    if (attacker !== 'player') return;
    if (ped.role === 'cop') report('copAssault', ped.position.x, ped.position.z, true);
    else if (ped.role === 'civilian') report('assault', ped.position.x, ped.position.z);
  });
  events.on('gunshot', ({ x, z, byPlayer }) => {
    if (byPlayer && !game.missions.suppressGunfireCrime()) report('gunfire', x, z);
  });
  events.on('carjack', ({ vehicle, x, z }) => {
    report(vehicle.isPolice ? 'stealPoliceCar' : 'carjack', x, z);
  });
  events.on('enteredVehicle', ({ vehicle }) => {
    if (vehicle.isPolice) report('stealPoliceCar', vehicle.position.x, vehicle.position.z);
  });
  events.on('pedHitByVehicle', ({ ped, attacker }) => {
    if (attacker === 'player') report(ped.role === 'cop' ? 'copAssault' : 'hitPedestrian', ped.position.x, ped.position.z, ped.role === 'cop');
  });
  events.on('vehicleDamaged', ({ vehicle, cause }) => {
    if (vehicle.isPolice && (cause === 'player-shot' || cause === 'player-crash') && vehicle.driver !== 'player') report('policeVehicle', vehicle.position.x, vehicle.position.z, true);
  });
  events.on('vehicleCollision', ({ a, b }) => {
    const playerCar = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
    const other = playerCar === a ? b : a;
    if (playerCar && other.isPolice && other.driver) report('policeVehicle', other.position.x, other.position.z, true);
  });

  /** Called by an officer standing next to the player during an arrest. */
  function arrestContact(dt) {
    state.arrestProgress += dt * 2;
  }

  /** Who can see the player right now. */
  function policeCanSee() {
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const collision = game.city.collision;
    for (const ped of game.peds) {
      if (ped.role !== 'cop' || ped.dead) continue;
      if (dist2d(p.x, p.z, ped.position.x, ped.position.z) < 75 && collision.lineClear(ped.position.x, ped.position.y + 1.6, ped.position.z, p.x, p.y + 1.2, p.z)) return true;
    }
    for (const v of game.vehicles) {
      if (!v.isPolice || !v.driver || v.driver === 'player' || v.destroyed) continue;
      const d = dist2d(p.x, p.z, v.position.x, v.position.z);
      if (d < 22) return true;
      if (d < 95 && collision.lineClear(v.position.x, 1.6, v.position.z, p.x, p.y + 1.2, p.z)) return true;
    }
    if (game.police && game.police.helicopterSees()) return true;
    return false;
  }

  function update(dt) {
    state.flash += dt;
    if (state.level === 0) {
      state.arrestProgress = 0;
      return;
    }
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    state.seen = policeCanSee();
    if (state.seen) {
      state.lastSeenX = p.x;
      state.lastSeenZ = p.z;
      state.unseenTime = 0;
      state.escapeProgress = Math.max(0, state.escapeProgress - dt * 2);
      state.searchRadius = 70 + 25 * state.level;
    } else {
      state.unseenTime += dt;
      state.searchRadius = Math.max(25 + 8 * state.level, state.searchRadius - dt * (2.5 + state.level * 0.4));
      const outside = dist2d(p.x, p.z, state.lastSeenX, state.lastSeenZ) > state.searchRadius;
      const need = 5 + state.level * 2.2;
      state.escapeProgress += dt * (outside ? 1 : 0.15);
      if (state.escapeProgress >= need && !state.frozen) {
        setLevel(0);
        state.heat = 0;
        events.emit('wantedEscaped', {});
        game.stats.escapes = (game.stats.escapes ?? 0) + 1;
      }
    }
    // Arrest when an officer has held the player long enough.
    if (state.arrestProgress > 0) {
      state.arrestProgress -= dt;
      if (state.arrestProgress > 2.2 && !game.player.dead) {
        state.arrestProgress = 0;
        events.emit('cuffed', {});
      }
    }
  }

  return {
    state,
    get level() {
      return state.level;
    },
    report,
    setLevel,
    arrestContact,
    update,
    clear() {
      setLevel(0);
      state.heat = 0;
      state.escapeProgress = 0;
    },
    escapeFraction() {
      return state.level === 0 ? 0 : Math.min(1, state.escapeProgress / (5 + state.level * 2.2));
    },
  };
}
