// Connects the game to sound: plays effects for game events, keeps the listener on the camera,
// drives the continuous vehicle voices, and runs the radio while the player is in a car
// (Q / E to change station), plus soft radio music behind the title screen.
import { createAudioEngine } from './audioEngine.js';
import { createSoundEffects } from './soundEffects.js';
import { createVehicleAudio } from './vehicleAudio.js';
import { createRadio } from './radio.js';

export function createAudioDirector(game) {
  const audio = createAudioEngine(game.settings);
  const sfx = createSoundEffects(audio);
  const vehicleAudio = createVehicleAudio(audio);
  const radio = createRadio(audio);
  const { events } = game;
  let radioWanted = true;

  // Start audio on the first gesture (browsers block it before).
  const unlock = () => {
    audio.start();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  events.on('gunshot', ({ x, z, weapon }) => sfx.gunshot(x, z, weapon));
  events.on('explosion', ({ x, z }) => sfx.explosion(x, z));
  events.on('vehicleImpact', ({ x, z, impact }) => sfx.crash(x, z, impact));
  events.on('vehicleCollision', ({ x, z, impact }) => sfx.crash(x, z, impact));
  events.on('punch', ({ hit }) => sfx.punch(game.player.position.x, game.player.position.z, hit));
  events.on('footstep', ({ x, z, run }) => sfx.footstep(x, z, run));
  events.on('scream', ({ x, z }) => sfx.scream(x, z));
  events.on('reload', () => sfx.reload());
  events.on('dryFire', () => sfx.dryFire());
  events.on('horn', ({ vehicle }) => {
    if (vehicle === game.player.vehicle) vehicleAudio.horn();
  });
  events.on('vehicleSunk', ({ vehicle }) => sfx.splash(vehicle.position.x, vehicle.position.z));
  events.on('enteredVehicle', ({ vehicle }) => {
    sfx.door();
    if (radioWanted && !vehicle.isPolice && audio.ready) {
      radio.setOn(true);
      game.ui?.showRadio(radio.nowPlaying());
    }
  });
  events.on('exitedVehicle', () => {
    sfx.door();
    radio.setOn(false);
  });
  events.on('wantedChanged', ({ level, before }) => {
    if (level > before) sfx.starUp();
  });
  events.on('wantedEscaped', () => sfx.lostCops());
  events.on('missionPassed', () => sfx.missionPassed());
  events.on('missionFailed', () => sfx.missionFailed());
  events.on('wasted', () => sfx.wasted());
  events.on('busted', () => sfx.wasted());
  events.on('checkpoint', () => sfx.checkpoint());
  events.on('pickup', () => sfx.pickup());
  events.on('cash', () => sfx.cash());
  events.on('uiMove', () => sfx.uiMove());
  events.on('uiSelect', () => sfx.uiSelect());
  radio.onSongChange((info) => {
    if (game.player.vehicle && info.on) game.ui?.showRadio(info);
  });

  /** Radio keys, read during the simulation step (before input is cleared). */
  function handleRadioKeys() {
    if (game.player.vehicle) {
      if (game.input.wasPressed('KeyE')) {
        radioWanted = true;
        radio.setOn(true);
        game.ui?.showRadio(radio.tune(1));
      }
      if (game.input.wasPressed('KeyQ')) {
        radioWanted = true;
        radio.setOn(true);
        game.ui?.showRadio(radio.tune(-1));
      }
      if (game.input.wasPressed('KeyX')) {
        radioWanted = !radio.on;
        radio.setOn(!radio.on);
        game.ui?.showRadio(radio.nowPlaying());
      }
    }
  }

  function update() {
    const cam = game.camera.position;
    audio.listener.x = cam.x;
    audio.listener.z = cam.z;
    audio.listener.yaw = game.cameraCtl.state.yaw;
    const playing = game.state === 'playing';
    vehicleAudio.update(game, playing);
    if (game.state === 'title') {
      if (audio.ctx && !radio.on) radio.setOn(true);
    } else if (!game.player.vehicle && radio.on && playing) {
      radio.setOn(false);
    }
    if (game.state === 'paused' || game.state === 'map') {
      if (audio.music) audio.music.gain.setTargetAtTime(game.settings.musicVolume * 0.35, audio.now(), 0.2);
    } else if (audio.music) {
      audio.music.gain.setTargetAtTime(game.settings.musicVolume, audio.now(), 0.2);
    }
    radio.pump();
  }

  return { audio, sfx, radio, update, handleRadioKeys };
}
