// Builds the game: renderer, city, player, every system, and the per-step update order. The
// returned object is the shared context every system receives.
import { createRenderer } from '../render/renderer.js';
import { createSkyDome } from '../render/skyDome.js';
import { createTimeOfDay, paletteAt } from '../render/timeOfDay.js';
import { updateCityMaterials } from '../render/cityMaterials.js';
import { createEffects } from '../render/particles.js';
import { generateCity } from '../world/cityGenerator.js';
import { createInput } from './input.js';
import { createEventBus } from './events.js';
import { createRandom } from './random.js';
import { loadSettings } from './settings.js';
import { Player } from '../entities/player.js';
import { createCameraController } from '../systems/cameraController.js';
import { createPlayerController } from '../systems/playerController.js';
import { createVehicleSystem } from '../systems/vehicleSystem.js';
import { createTrafficSystem } from '../systems/trafficSystem.js';
import { createPedestrianSystem } from '../systems/pedestrianSystem.js';
import { createCombatSystem } from '../systems/combatSystem.js';
import { createNpcCombat } from '../systems/npcCombat.js';
import { createWantedSystem } from '../systems/wantedSystem.js';
import { createPoliceSystem } from '../systems/policeSystem.js';
import { createVehicleEffects } from '../systems/vehicleEffects.js';
import { districtAt } from '../data/districts.js';

export const CITY_SEED = 20261124;

export function createGame(canvas) {
  const settings = loadSettings();
  const gfx = createRenderer(canvas, settings);
  const sky = createSkyDome(gfx.scene);
  const tod = createTimeOfDay(gfx.scene, sky);
  const city = generateCity(gfx.scene, CITY_SEED);
  const input = createInput(canvas);
  const events = createEventBus();

  const game = {
    settings,
    gfx,
    scene: gfx.scene,
    camera: gfx.camera,
    sky,
    tod,
    city,
    input,
    events,
    rng: createRandom(CITY_SEED ^ 0x5bd1e995),
    vehicles: [],
    peds: [],
    worldTime: 0,
    state: 'title',
    stats: { shotsFired: 0, kills: 0, copsKilled: 0, carsStolen: 0, distanceDriven: 0, distanceWalked: 0, missionsPassed: 0, crimes: 0, escapes: 0, wasted: 0, busted: 0, playTime: 0, shellsFound: 0, racesWon: 0, jobsDone: 0 },
    district: null,
  };

  game.effects = createEffects(gfx.scene);
  game.player = new Player(-150, 96);
  gfx.scene.add(game.player.group);
  game.cameraCtl = createCameraController(gfx.camera, city.collision);
  game.cameraCtl.state.sensitivity = settings.sensitivity;
  game.vehicleSystem = createVehicleSystem(game);
  game.pedSystem = createPedestrianSystem(game);
  game.traffic = createTrafficSystem(game);
  game.combat = createCombatSystem(game);
  game.npcCombat = createNpcCombat(game);
  game.missions = { suppressGunfireCrime: () => false, update() {} };
  game.wanted = createWantedSystem(game);
  game.police = createPoliceSystem(game);
  game.vehicleEffects = createVehicleEffects(game);
  game.controller = createPlayerController(game);

  /** One fixed simulation step of play. */
  game.step = (dt) => {
    game.worldTime += dt;
    game.stats.playTime += dt;
    game.controller.update(dt);
    game.traffic.update(dt);
    game.police.update(dt);
    game.vehicleSystem.update(dt);
    game.pedSystem.update(dt);
    game.combat.update(dt);
    game.wanted.update(dt);
    game.missions.update(dt);
    game.vehicleEffects.update(dt);
    if (game.player.vehicle) game.player.position.copy(game.player.vehicle.position);
    input.endFrame();
  };

  /** Per-frame visuals: camera, sky and light, materials, particles. */
  game.renderFrame = (dt) => {
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    game.cameraCtl.update(dt, game.player, game.player.vehicle);
    tod.update(dt, p, game.state === 'title' ? false : false);
    const palette = paletteAt(tod.state.hour);
    updateCityMaterials(tod.state.night, palette.horizon, dt);
    city.water.update(dt, tod.state.sunDir, palette.sun, palette.horizon, tod.state.night);
    city.landmarks.update(dt);
    game.effects.update(dt);
    sky.follow(gfx.camera);
    game.district = districtAt(p.x, p.z);
    gfx.render();
  };

  return game;
}
