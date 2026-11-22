// Builds the game: renderer, city, player, every system, the interface and the screen flow, and
// defines the order of one simulation step and one rendered frame. The returned object is the
// shared context every system receives.
import { createRenderer } from '../render/renderer.js';
import { createSkyDome } from '../render/skyDome.js';
import { createTimeOfDay, paletteAt } from '../render/timeOfDay.js';
import { updateCityMaterials } from '../render/cityMaterials.js';
import { createEffects } from '../render/particles.js';
import { createSkidMarks } from '../render/skidMarks.js';
import { generateCity } from '../world/cityGenerator.js';
import { createMarkers } from '../world/markers.js';
import { createInput } from './input.js';
import { createEventBus } from './events.js';
import { createRandom } from './random.js';
import { loadSettings } from './settings.js';
import { createSaveSystem } from './saveSystem.js';
import { createGameFlow } from './gameFlow.js';
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
import { createMissionSystem } from '../systems/missionSystem.js';
import { createEconomy } from '../systems/economy.js';
import { createActivities } from '../systems/activities.js';
import { createAudioDirector } from '../audio/audioDirector.js';
import { createTutorialHints } from '../systems/tutorialHints.js';
import { createPoliceRadio } from '../systems/policeRadio.js';
import { createUi } from '../ui/uiRoot.js';
import { districtAt } from '../data/districts.js';

export const CITY_SEED = 20261124;

export function createGame(canvas, uiRoot) {
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
    timeScale: 1,
    state: 'title',
    gps: null,
    waypoint: null,
    stats: { shotsFired: 0, kills: 0, copsKilled: 0, carsStolen: 0, distanceDriven: 0, distanceWalked: 0, missionsPassed: 0, crimes: 0, escapes: 0, wasted: 0, busted: 0, playTime: 0, shellsFound: 0, racesWon: 0, jobsDone: 0 },
    district: null,
  };

  game.effects = createEffects(gfx.scene);
  game.skidMarks = createSkidMarks(gfx.scene);
  game.markers = createMarkers(gfx.scene);
  game.player = new Player(-140, 92);
  gfx.scene.add(game.player.group);
  game.cameraCtl = createCameraController(gfx.camera, city.collision);
  game.cameraCtl.state.sensitivity = settings.sensitivity;
  game.vehicleSystem = createVehicleSystem(game);
  game.pedSystem = createPedestrianSystem(game);
  game.traffic = createTrafficSystem(game);
  game.combat = createCombatSystem(game);
  game.npcCombat = createNpcCombat(game);
  game.missions = createMissionSystem(game);
  game.wanted = createWantedSystem(game);
  game.police = createPoliceSystem(game);
  game.vehicleEffects = createVehicleEffects(game);
  game.controller = createPlayerController(game);
  game.economy = createEconomy(game);
  game.activities = createActivities(game);
  game.saveSystem = createSaveSystem(game);
  game.audioDirector = createAudioDirector(game);
  game.flow = createGameFlow(game);
  game.ui = createUi(game, uiRoot, game.flow);
  game.hints = createTutorialHints(game);
  game.policeRadio = createPoliceRadio(game);
  game.economy.addShopMarkers();
  game.activities.addMarkers();
  game.player.selectWeapon('fists');

  /** One fixed simulation step. */
  game.step = (dt) => {
    game.flow.update(dt);
    if (game.state === 'playing') {
      game.timeScale = game.ui.wheel.update();
      const sdt = dt * game.timeScale;
      game.worldTime += sdt;
      game.stats.playTime += dt;
      if (!game.ui.wheel.open) game.controller.update(sdt);
      game.audioDirector.handleRadioKeys();
      game.traffic.update(sdt);
      game.police.update(sdt);
      game.vehicleSystem.update(sdt);
      game.pedSystem.update(sdt);
      game.combat.update(sdt);
      game.wanted.update(sdt);
      game.missions.update(sdt);
      game.economy.update(sdt);
      game.activities.update(sdt);
      game.hints.update(sdt);
      game.vehicleEffects.update(sdt);
      if (game.player.vehicle) game.player.position.copy(game.player.vehicle.position);
      events.emit('stepEnd', {});
    }
    input.endFrame();
  };

  /** One rendered frame: camera, light, materials, particles, HUD, audio. */
  game.renderFrame = (dt) => {
    const playing = game.state === 'playing';
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    if (game.state === 'title') game.flow.titleCamera(dt);
    else game.cameraCtl.update(dt, game.player, game.player.vehicle);
    const focus = game.state === 'title' ? game.camera.position : p;
    tod.update(dt * game.timeScale, focus, !playing && game.state !== 'title');
    const palette = paletteAt(tod.state.hour);
    updateCityMaterials(tod.state.night, palette.horizon, dt);
    city.water.update(dt, tod.state.sunDir, palette.sun, palette.horizon, tod.state.night);
    city.landmarks.update(dt);
    city.boats.update(dt);
    game.effects.update(playing ? dt * game.timeScale : 0);
    game.markers.update(dt, game.camera);
    sky.follow(gfx.camera);
    game.district = districtAt(p.x, p.z);
    if (playing) game.ui.hud.update(dt);
    if (game.state === 'map') game.ui.map.draw();
    game.audioDirector.update();
    gfx.render();
  };

  return game;
}
