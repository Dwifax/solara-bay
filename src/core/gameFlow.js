// The game's screens and transitions: title (with a slow cinematic flight over the city), new
// game and loading, play, pause, map and shop overlays, and the flatlined / cuffed sequence that
// respawns the player at the hospital or the police station.
import { LOCATIONS, PARKING_SPOTS } from '../data/locations.js';
import { dist2d } from './mathUtils.js';

const TITLE_PATH = [
  { x: -260, y: 34, z: 380, tx: -40, ty: 12, tz: 230 },
  { x: 40, y: 46, z: 390, tx: -60, ty: 30, tz: 120 },
  { x: 300, y: 60, z: 260, tx: 380, ty: 20, tz: -100 },
  { x: 120, y: 90, z: -60, tx: -50, ty: 60, tz: -250 },
];

export function createGameFlow(game) {
  let deadTimer = 0;
  let deadKind = null;
  let titleTime = 0;
  let hadLock = false;

  function clearWorld() {
    game.missions.abort();
    game.police.reset();
    for (const v of game.vehicles.slice()) game.vehicleSystem.remove(v);
    for (const p of game.peds.slice()) game.pedSystem.remove(p);
    game.wanted.clear();
    game.waypoint = null;
    game.gps = null;
    const player = game.player;
    player.vehicle = null;
    player.group.visible = true;
    player.dead = false;
    player.health = player.maxHealth;
    player.vy = 0;
    player.moveX = 0;
    player.moveZ = 0;
    game.controller.cancelEntering();
    game.skidMarks.clear();
    document.body.classList.remove('dead-fx');
  }

  function placePlayer(x, z, heading) {
    const p = game.player;
    p.position.set(x, 0.18, z);
    p.heading = heading;
    p.syncTransform();
    game.cameraCtl.snapBehind(heading);
  }

  function spawnOwnedCar() {
    const owned = game.economy.state.ownedCars;
    if (!owned.length) return;
    const last = owned[owned.length - 1];
    const spot = PARKING_SPOTS[0];
    const v = game.vehicleSystem.spawn(last.id, spot.x, spot.z, spot.heading, last.color);
    v.persistent = true;
    v.owned = true;
  }

  function enterPlay() {
    game.state = 'playing';
    game.ui.menus.hide();
    game.ui.map.close();
    game.ui.hud.show(true);
    game.ui.hud.flashDistrict();
    game.input.reset();
  }

  const flow = {
    newGame() {
      clearWorld();
      game.economy.load({ money: 500, streetCred: 0, ownedCars: [] });
      game.missions.load({ completed: [] });
      game.activities.load({});
      for (const k of Object.keys(game.stats)) game.stats[k] = 0;
      game.hints.reset();
      const p = game.player;
      p.weapons = { fists: { mag: 0, reserve: 0 } };
      p.selectWeapon('fists');
      p.armor = 0;
      game.tod.state.hour = 17.6;
      placePlayer(-128, 92.5, 0);
      enterPlay();
      game.ui.banner('SOLARA BAY', 'Four years away. One phone call to come home.', 4.5, 'mission');
      game.ui.notify('Walk into the <span class="hl">K</span> marker to answer Kiko’s call. Click the game to use the mouse. <b>Esc</b> pauses.', 9);
      game.input.requestLock();
    },
    loadSlot(slot) {
      const data = game.saveSystem.read(slot);
      if (!data) return;
      clearWorld();
      game.economy.load(data.economy);
      game.missions.load(data.missions);
      game.activities.load(data.activities);
      Object.assign(game.stats, data.stats ?? {});
      const p = game.player;
      p.weapons = data.player.weapons ?? { fists: { mag: 0, reserve: 0 } };
      if (!p.weapons.fists) p.weapons.fists = { mag: 0, reserve: 0 };
      p.selectWeapon(p.weapons[data.player.current] ? data.player.current : 'fists');
      p.health = Math.max(30, data.player.health ?? 100);
      p.armor = data.player.armor ?? 0;
      game.tod.state.hour = data.hour ?? 18;
      placePlayer(data.player.x, data.player.z, 0);
      spawnOwnedCar();
      enterPlay();
      game.ui.notify(`Loaded ${slot === 'auto' ? 'autosave' : `slot ${slot}`}.`);
      game.input.requestLock();
    },
    resume() {
      enterPlay();
      game.input.requestLock();
    },
    pause() {
      if (game.state !== 'playing') return;
      game.state = 'paused';
      game.input.releaseLock();
      game.ui.menus.showPause();
    },
    openMap() {
      game.state = 'map';
      game.ui.menus.hide();
      game.input.releaseLock();
      game.ui.map.open();
    },
    openOverlay(show) {
      game.state = 'paused';
      game.input.releaseLock();
      show();
    },
    quitToTitle() {
      clearWorld();
      flow.showTitle();
    },
    showTitle() {
      game.state = 'title';
      game.ui.hud.show(false);
      game.ui.map.close();
      game.ui.menus.showTitle();
      game.tod.state.hour = 18.7;
      titleTime = 0;
    },
    /** Jump the title flight to a moment (seconds along the path). */
    setTitleTime(t) {
      titleTime = t;
    },
    /** Cinematic camera for the title screen. */
    titleCamera(dt) {
      titleTime += dt;
      const seg = TITLE_PATH.length;
      const t = (titleTime / 14) % seg;
      const i = Math.floor(t);
      const f = t - i;
      const s = f * f * (3 - 2 * f);
      const a = TITLE_PATH[i];
      const b = TITLE_PATH[(i + 1) % seg];
      const cam = game.camera;
      cam.position.set(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, a.z + (b.z - a.z) * s);
      cam.lookAt(a.tx + (b.tx - a.tx) * s, a.ty + (b.ty - a.ty) * s, a.tz + (b.tz - a.tz) * s);
      if (cam.fov !== 60) {
        cam.fov = 60;
        cam.updateProjectionMatrix();
      }
    },
    /** Per-step checks: pause / map keys, death and arrest sequences. */
    update(dt) {
      const input = game.input;
      if (game.state === 'playing') {
        if (input.wasPressed('Escape') || input.wasPressed('KeyP')) flow.pause();
        else if (input.wasPressed('KeyM')) flow.openMap();
        if (game.player.dead && !deadKind) {
          deadKind = 'flatlined';
          deadTimer = 4.5;
          game.stats.flatlined += 1;
          game.events.emit('flatlined', {});
          game.ui.banner('FLATLINED', '', 4.2, 'flatlined');
          document.body.classList.add('dead-fx');
        }
        if (deadKind) {
          deadTimer -= dt;
          if (deadTimer <= 0) respawn();
        }
      } else if (game.state === 'map') {
        if (input.wasPressed('Escape') || input.wasPressed('KeyM')) flow.resume();
      }
    },
  };

  function respawn() {
    const kind = deadKind;
    deadKind = null;
    clearWorld();
    const loc = kind === 'cuffed' ? LOCATIONS.police : LOCATIONS.hospital;
    placePlayer(loc.x, loc.z, loc.heading);
    const fee = Math.min(kind === 'cuffed' ? 1500 : 1000, Math.round(game.economy.state.money * (kind === 'cuffed' ? 0.15 : 0.1)));
    game.economy.state.money -= fee;
    if (kind === 'cuffed') {
      for (const id of Object.keys(game.player.weapons)) {
        const w = game.player.weapons[id];
        w.reserve = Math.floor(w.reserve / 2);
      }
    }
    game.tod.state.hour = (game.tod.state.hour + 1.5) % 24;
    game.missions.refreshStartMarker();
    game.ui.notify(kind === 'cuffed' ? `Released from SBPD Central. Bail and fines: $${fee}.` : `Patched up at St. Marisol General. Medical bill: $${fee}.`, 6);
  }

  game.events.on('cuffed', () => {
    if (deadKind) return;
    deadKind = 'cuffed';
    deadTimer = 4;
    game.stats.cuffed += 1;
    game.ui.banner('CUFFED', '', 3.8, 'cuffed');
    document.body.classList.add('dead-fx');
    if (game.player.vehicle) game.controller.exitVehicle(true);
  });

  // Stats.
  game.events.on('carjack', () => {
    game.stats.carsStolen += 1;
  });
  game.events.on('enteredVehicle', ({ vehicle }) => {
    if (!vehicle.owned && !vehicle.missionTag && !vehicle.counted) {
      vehicle.counted = true;
      if (!vehicle.persistent) game.stats.carsStolen += 1;
    }
  });
  game.events.on('pedKilled', ({ ped, attacker }) => {
    if (attacker !== 'player') return;
    game.stats.kills += 1;
    if (ped.role === 'cop') game.stats.copsKilled += 1;
  });
  let lastPos = null;
  game.events.on('stepEnd', () => {
    const v = game.player.vehicle;
    const pos = v ? v.position : game.player.position;
    if (lastPos) {
      const d = dist2d(lastPos.x, lastPos.z, pos.x, pos.z);
      if (d < 5) {
        if (v) game.stats.distanceDriven += d;
        else game.stats.distanceWalked += d;
      }
    }
    lastPos = { x: pos.x, z: pos.z };
  });

  // Losing the mouse capture (Esc in the browser) pauses the game.
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (!locked && hadLock && game.state === 'playing' && !deadKind) flow.pause();
    hadLock = locked;
  });

  return flow;
}
