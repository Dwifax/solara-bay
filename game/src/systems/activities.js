// Things to do between story missions: street races from the Ocean Drive start line (cycling
// through three circuits), timed courier deliveries from Bayline Couriers, and 24 Golden Shells
// hidden around the city that pay out when found.
import { STREET_RACES, RACE_RIVALS, RACE_GRID, GOLDEN_SHELLS, SHELL_REWARD } from '../data/activities.js';
import { LOCATIONS } from '../data/locations.js';
import { DISTRICTS } from '../data/districts.js';
import { dist2d } from '../core/mathUtils.js';

export function createActivities(game) {
  const state = { shellsFound: [], raceIndex: 0, jobsDone: 0, racesWon: 0 };
  const shellMarkers = new Map();
  let prompt = null;

  function placeShells() {
    for (const m of shellMarkers.values()) m.remove();
    shellMarkers.clear();
    GOLDEN_SHELLS.forEach(([x, z], i) => {
      if (state.shellsFound.includes(i)) return;
      const y = z > 312 && x < 352 && !(x > -160 && x < -136) ? -((z - 312) / 80) * 1.2 : x > -160 && x < -136 && z > 312 ? 0.4 : 0.2;
      shellMarkers.set(i, game.markers.add({ x, z, y, radius: 0.6, color: '#ffcf3f', kind: 'pickup' }));
    });
  }

  function collectShells() {
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    for (const [i, marker] of shellMarkers) {
      if (dist2d(p.x, p.z, marker.x, marker.z) < (game.player.vehicle ? 3.5 : 1.6)) {
        marker.remove();
        shellMarkers.delete(i);
        state.shellsFound.push(i);
        game.stats.shellsFound = state.shellsFound.length;
        game.economy.addMoney(SHELL_REWARD.money);
        game.economy.addRespect(SHELL_REWARD.respect);
        game.events.emit('pickup', {});
        game.ui?.notify(`Golden Shell ${state.shellsFound.length} of ${GOLDEN_SHELLS.length} found.`);
        if (state.shellsFound.length === GOLDEN_SHELLS.length) {
          game.economy.addMoney(SHELL_REWARD.allBonus);
          game.ui?.banner('ALL GOLDEN SHELLS', `+$${SHELL_REWARD.allBonus.toLocaleString('en-US')}`, 4, 'level');
        }
      }
    }
  }

  function startRace() {
    const race = STREET_RACES[state.raceIndex % STREET_RACES.length];
    const ok = game.missions.startSide({
      id: `race-${race.id}`,
      title: race.title,
      kind: 'STREET RACE',
      reward: race.reward,
      passText: 'RACE WON',
      onPass: () => {
        state.racesWon += 1;
        game.stats.racesWon = state.racesWon;
        state.raceIndex += 1;
      },
      steps: [{ type: 'race', grid: RACE_GRID, countdown: 3, rivals: RACE_RIVALS, checkpoints: race.checkpoints, text: `Street race: ${race.title}. Finish ~first~.` }],
    });
    if (!ok) game.ui?.notify('Finish what you are doing first.');
  }

  /** A random sidewalk address in a district (block side midpoint). */
  function randomAddress(minFrom, from) {
    const blocks = game.city.blocks.filter((b) => !b.special);
    for (let i = 0; i < 40; i += 1) {
      const b = blocks[Math.floor(game.rng.next() * blocks.length)];
      const side = Math.floor(game.rng.next() * 4);
      const off = 41;
      const x = b.cx + (side === 1 ? off : side === 3 ? -off : 0);
      const z = b.cz + (side === 0 ? -off - 0.5 : side === 2 ? off + 0.5 : 0);
      if (from && dist2d(x, z, from.x, from.z) < minFrom) continue;
      if (game.city.collision.pointBlocked(x, z, 0.5)) continue;
      return { x, z, name: DISTRICTS[b.district]?.name ?? 'Solara Bay' };
    }
    return { x: 0, z: 9, name: 'Little Coral' };
  }

  function startCourier() {
    const pickup = randomAddress(120, LOCATIONS.courier);
    const drop = randomAddress(260, pickup);
    const dist = dist2d(pickup.x, pickup.z, drop.x, drop.z);
    const pay = Math.round(300 + dist * 1.4);
    const ok = game.missions.startSide({
      id: 'courier',
      title: 'Courier Run',
      kind: 'BAYLINE COURIERS',
      reward: { money: pay, respect: 60 },
      passText: 'DELIVERED',
      onPass: () => {
        state.jobsDone += 1;
        game.stats.jobsDone = state.jobsDone;
      },
      steps: [
        { type: 'getVehicle', text: 'Get a ~vehicle~ for the run.' },
        { type: 'goto', x: pickup.x, z: pickup.z, radius: 5, text: `Collect the parcel in ~${pickup.name}~.` },
        { type: 'goto', x: drop.x, z: drop.z, radius: 5, timeLimit: Math.round(dist / 8.5 + 30), text: `Deliver the parcel to ~${drop.name}~ before time runs out.` },
      ],
    });
    if (!ok) game.ui?.notify('Finish what you are doing first.');
  }

  function update() {
    collectShells();
    prompt = null;
    if (game.missions.active) return;
    const p = game.player;
    const pos = p.vehicle ? p.vehicle.position : p.position;
    const race = LOCATIONS.raceStart;
    if (p.vehicle && dist2d(pos.x, pos.z, race.x, race.z) < 12 && p.vehicle.speed < 5) {
      prompt = `Press <b>G</b> to enter the street race: ${STREET_RACES[state.raceIndex % STREET_RACES.length].title}`;
      if (game.input.wasPressed('KeyG')) startRace();
    }
    const courier = LOCATIONS.courier;
    if (dist2d(pos.x, pos.z, courier.x, courier.z) < (p.vehicle ? 8 : 2.6) && (!p.vehicle || p.vehicle.speed < 5)) {
      prompt = `Press <b>${p.vehicle ? 'G' : 'E'}</b> to take a Bayline Couriers job`;
      if (game.input.wasPressed(p.vehicle ? 'KeyG' : 'KeyE')) startCourier();
    }
    if (prompt) game.ui?.setPrompt(prompt);
  }

  function addMarkers() {
    game.markers.add({ x: LOCATIONS.raceStart.x, z: LOCATIONS.raceStart.z + 10, radius: 4, color: '#ff5ac8', height: 1.5 });
    game.markers.add({ x: LOCATIONS.courier.x, z: LOCATIONS.courier.z, radius: 1.2, color: '#5ad1ff', height: 1.6 });
    placeShells();
  }

  return {
    state,
    update,
    addMarkers,
    busy: () => false,
    blips() {
      return [
        { x: LOCATIONS.raceStart.x, z: LOCATIONS.raceStart.z, type: 'race' },
        { x: LOCATIONS.courier.x, z: LOCATIONS.courier.z, type: 'job' },
      ];
    },
    load(data) {
      state.shellsFound = data?.shellsFound ?? [];
      state.raceIndex = data?.raceIndex ?? 0;
      state.jobsDone = data?.jobsDone ?? 0;
      state.racesWon = data?.racesWon ?? 0;
      placeShells();
    },
  };
}
