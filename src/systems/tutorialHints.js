// One-time help for new players: each hint appears the first time its situation comes up
// (near a car, first drive, first gun, first wanted level, first wasted...) and never again in
// that game.

const HINTS = {
  car: 'Press <b>F</b> near a car to get in. If someone is driving, you pull them out.',
  drive: 'Drive with <b>W A S D</b>, <b>Space</b> for the handbrake, <b>H</b> to honk. <b>Q / E</b> change the radio station.',
  gun: 'Hold <b>right mouse</b> to aim, <b>left mouse</b> to fire, <b>R</b> to reload. Hold <b>Tab</b> for the weapon wheel.',
  wanted: 'The cops are on you. Break line of sight and get out of the <span class="hl">search circle</span> on the radar to lose them.',
  stars3: 'Three stars: expect <span class="hl">roadblocks</span>. Four brings the helicopter.',
  map: 'Press <b>M</b> for the map. Click it to set a waypoint and the radar will route you there.',
  shop: 'Earn respect to unlock guns at <span class="hl">Bayline Arms</span> and cars at <span class="hl">Coastline Motors</span>.',
  fire: 'Wrecked cars catch fire. Bail out with <b>F</b> before they blow!',
};

export function createTutorialHints(game) {
  const shown = new Set();
  let cooldown = 0;
  const queue = [];

  function hint(id) {
    if (shown.has(id) || queue.includes(id)) return;
    queue.push(id);
  }

  game.events.on('enteredVehicle', () => hint('drive'));
  game.events.on('weaponSwitched', ({ id }) => {
    if (id !== 'fists') hint('gun');
  });
  game.events.on('wantedChanged', ({ level }) => {
    if (level >= 1) hint('wanted');
    if (level >= 3) hint('stars3');
  });
  game.events.on('missionPassed', () => {
    hint('map');
    hint('shop');
  });

  return {
    reset() {
      shown.clear();
      queue.length = 0;
      cooldown = 6;
    },
    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      const p = game.player;
      if (!p.vehicle && !shown.has('car')) {
        for (const v of game.vehicles) {
          const dx = v.position.x - p.position.x;
          const dz = v.position.z - p.position.z;
          if (dx * dx + dz * dz < 36) {
            hint('car');
            break;
          }
        }
      }
      if (p.vehicle && p.vehicle.fireTimer > 0) hint('fire');
      if (cooldown > 0 || queue.length === 0 || game.ui.dialogue.active) return;
      const id = queue.shift();
      shown.add(id);
      game.ui.notify(HINTS[id], 7);
      cooldown = 9;
    },
  };
}
