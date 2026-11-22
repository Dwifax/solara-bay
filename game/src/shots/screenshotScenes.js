// Deterministic screenshot scenes (?shot=name): each sets up a moment of real play with the
// game's own systems (a police chase at dusk, meeting Juno on Ocean Drive, a dockside shootout,
// the map, the title screen), simulates it forward in fixed steps and leaves it for capture.
import { createRandom } from '../core/random.js';
import { LaneDriver } from '../systems/laneDriver.js';

function simulate(game, steps, stepDt) {
  for (let i = 0; i < steps; i += 1) {
    game.step(stepDt);
    if (i % 4 === 0) game.renderFrame(stepDt * 4);
  }
}

function quietStart(game) {
  game.flow.newGame();
  game.ui.hud.clearMessages();
  game.input.releaseLock();
}

/** A car on a lane of Ocean Drive (row j = 3) driving toward node column `toI`. */
function laneCar(game, id, x, lane, westbound, color, cruise) {
  const net = game.city.network;
  const i = Math.floor(x / 100);
  const from = net.nodes.get(`${westbound ? i + 1 : i},3`);
  const to = net.nodes.get(`${westbound ? i : i + 1},3`);
  const z = westbound ? 300 - lane : 300 + lane;
  const v = game.vehicleSystem.spawn(id, x, z, westbound ? -Math.PI / 2 : Math.PI / 2, color);
  v.driver = new LaneDriver(v, from, to, { lane, cruise, rng: game.rng });
  v.vx = (westbound ? -1 : 1) * cruise;
  v.persistent = true;
  return v;
}

/** A police chase down Ocean Drive at sunset: four stars, helicopter, traffic, mission HUD. */
function chase(game, stepDt) {
  quietStart(game);
  game.missions.load({ completed: ['homecoming', 'wheelwoman', 'coldcargo', 'papertrail', 'gullseason', 'sunsetescort', 'glasshouse'] });
  game.economy.load({ money: 48250, respect: 3900, ownedCars: [] });
  game.player.giveWeapon('pistol', 48);
  game.player.giveWeapon('smg', 120);
  game.player.selectWeapon('smg');
  game.player.armor = 60;
  game.player.health = 78;
  game.tod.state.hour = 19.05;
  const car = game.vehicleSystem.spawn('vento', 30, 298.1, -Math.PI / 2, 0xffd400);
  game.controller.enterVehicle(car);
  car.vx = -28;
  game.missions.forceStart('badgebones');
  game.missions.jumpToStep(4);
  game.ui.hud.clearMessages();
  game.wanted.setLevel(4, 30, 298);
  const cops = [
    [44, 297.8],
    [57, 302.2],
    [72, 298.2],
  ];
  for (const [x, z] of cops) {
    const c = game.police.spawnPursuitCar();
    if (!c) continue;
    c.position.set(x, 0, z);
    c.heading = -Math.PI / 2;
    c.vx = -28;
  }
  // Traffic both ways on Ocean Drive.
  laneCar(game, 'marlin', -70, 5.25, true, 0x2c3e50, 11);
  laneCar(game, 'coaster', -140, 1.9, true, 0xf1f1f1, 10);
  laneCar(game, 'pip', -40, 1.9, false, 0xf94144, 11);
  laneCar(game, 'cab', -95, 5.25, false, 0xffc300, 12);
  laneCar(game, 'dune', -160, 1.9, false, 0x6b705c, 11);
  laneCar(game, 'marlin', 120, 5.25, false, 0xecf0f1, 11);
  for (let i = 0; i < 14; i += 1) game.pedSystem.spawnCivilianNear(car.position);
  const original = game.controller.update;
  game.controller.update = () => {
    car.controls.throttle = car.forwardSpeed > 27 ? 0 : 0.9;
    car.controls.steer = (298.1 - car.position.z) * 0.06 + Math.sin(game.worldTime * 1.1) * 0.03;
    car.health = car.maxHealth;
  };
  game.cameraCtl.state.yaw = -Math.PI / 2 + Math.PI - 0.62;
  game.cameraCtl.state.pitch = 0.17;
  for (let i = 0; i < 110; i += 1) {
    game.cameraCtl.state.idleTime = 0;
    game.step(stepDt);
    if (i % 4 === 0) game.renderFrame(stepDt * 4);
    if (game.police.helicopter && i >= 80) {
      const heli = game.police.helicopter;
      if (i === 80) heli.position.set(car.position.x + 44, 24, car.position.z + 6);
    }
  }
  game.controller.update = original;
  game.ui.dialogue.hold({ who: 'radio', text: 'All units: yellow Vento westbound on Ocean Drive. Air support has eyes on the suspect.' });
  game.wanted.state.seen = true;
  game.cameraCtl.state.idleTime = 0;
}

/** Meeting Juno on Ocean Drive before the race, people on the sidewalk. */
function onFoot(game, stepDt) {
  quietStart(game);
  game.missions.load({ completed: ['homecoming'] });
  game.economy.load({ money: 2140, respect: 260, ownedCars: [] });
  game.player.giveWeapon('pistol', 36);
  game.tod.state.hour = 18.15;
  const p = game.player;
  p.position.set(-292, 0.18, 291.5);
  p.heading = -Math.PI / 2 - 0.3;
  for (let i = 0; i < 45; i += 1) game.traffic.spawnMovingCar(p.position);
  for (let i = 0; i < 40; i += 1) game.pedSystem.spawnCivilianNear(p.position);
  // A few walkers right along this sidewalk.
  const rng = createRandom(7);
  for (let i = 0; i < 8; i += 1) {
    const ped = game.pedSystem.spawnPed('civilian', -330 + i * 7 + rng.range(-2, 2), 290 + rng.range(-1.5, 1.5));
    game.pedSystem.startWalking(ped);
  }
  const juno = game.vehicleSystem.spawn('vento', -318, 305.2, Math.PI / 2, 0xff9cf2);
  juno.persistent = true;
  simulate(game, 30, stepDt);
  game.missions.forceStart('wheelwoman');
  game.ui.hud.clearMessages();
  simulate(game, 40, stepDt);
  p.position.set(-294, 0.18, 291.2);
  p.heading = -Math.PI / 2 + 0.25;
  game.cameraCtl.state.yaw = -Math.PI / 2 - 0.55;
  game.cameraCtl.state.pitch = 0.12;
  game.ui.dialogue.hold({ who: 'juno', text: 'Ocean Drive, up through Little Coral, back down to the beach. Loser buys the tacos.' });
  game.ui.setObjective('Meet ~Juno~ at the start line on Ocean Drive.');
  simulate(game, 12, stepDt);
}

/** The Gull Season shootout at the docks. */
function shootout(game, stepDt) {
  quietStart(game);
  game.missions.load({ completed: ['homecoming', 'wheelwoman', 'coldcargo', 'papertrail'] });
  game.economy.load({ money: 9850, respect: 1200, ownedCars: [] });
  game.settings.difficulty = 0.02;
  game.player.giveWeapon('pistol', 60);
  game.player.giveWeapon('smg', 180);
  game.player.giveWeapon('shotgun', 24);
  game.player.armor = 85;
  game.tod.state.hour = 18.85;
  game.missions.forceStart('gullseason');
  game.missions.jumpToStep(2);
  game.ui.hud.clearMessages();
  game.player.selectWeapon('smg');
  const p = game.player;
  p.position.set(553, 0, -167);
  p.heading = Math.PI - 0.25;
  game.cameraCtl.state.yaw = Math.PI - 0.3;
  game.cameraCtl.state.pitch = 0.08;
  const cover = game.vehicleSystem.spawn('dune', 549, -175, 0.4, 0x8d99ae);
  cover.persistent = true;
  const original = game.controller.update;
  game.controller.update = (dt) => {
    p.aiming = true;
    p.updateOnFoot(dt, { x: 0, z: 0 }, false, false, game.cameraCtl.state.yaw, game.city.collision);
  };
  // Let the fight develop: fire bursts at the closest gang member.
  for (let i = 0; i < 200; i += 1) {
    game.step(stepDt);
    if (i % 4 === 0) game.renderFrame(stepDt * 4);
    if (i > 60 && i % 7 === 0) {
      const targets = game.peds.filter((e) => e.role === 'gang' && !e.dead);
      if (targets.length > 2 && i < 150) targets[0].takeDamage(200, 'player', game.events);
    }
  }
  game.controller.update = original;
  // Final frame: firing.
  game.player.fireCooldown = 0;
  game.combat.firePlayerWeapon();
}

function mapScreen(game) {
  quietStart(game);
  game.missions.load({ completed: ['homecoming', 'wheelwoman'] });
  game.economy.load({ money: 5600, respect: 700, ownedCars: [] });
  game.player.position.set(-60, 0.2, 120);
  game.state = 'playing';
  game.flow.openMap();
  game.waypoint = { x: 560, z: -150 };
  game.ui.map.frame(70, -40, 1.05);
}

function title(game) {
  game.flow.showTitle();
  game.tod.state.hour = 18.75;
}

const SCENES = { chase, onfoot: onFoot, shootout, map: mapScreen, title };

/** Stage scene `name`; resolves when the frame is ready to capture. */
export async function stageShot(name, game, stepDt) {
  const scene = SCENES[name] ?? SCENES.title;
  scene(game, stepDt);
  if (name === 'title') {
    for (let i = 0; i < 140; i += 1) game.renderFrame(1 / 60);
  }
}
