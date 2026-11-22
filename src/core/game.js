import { createRenderer } from './renderer.js';
import { seededRandom, randomInt, chooseRandom } from './random.js';
import { generateCity } from '../world/cityGenerator.js';
import { createPlayer } from '../entities/player.js';
import { createAudio } from './audio.js';
import { updateTraffic, createTraffic } from '../systems/traffic.js';
import { updateWanted } from '../systems/wanted.js';
import { updateMissions } from '../systems/missions.js';
import { createPoliceSystem } from '../systems/police.js';
import { renderHUD } from '../ui/hud.js';
import { MISSIONS } from '../data/missions.js';
import { createVehicle } from '../entities/vehicle.js';

export function createGame(canvas) {
  const renderer = createRenderer(canvas);
  const random = seededRandom(Math.floor(Math.random() * 0xffffffff));
  const audio = createAudio();

  const city = generateCity(random, renderer);
  const player = createPlayer(city);
  const traffic = createTraffic(city, random, 15);
  const vehicles = [];

  // Create parked vehicles
  for (const lot of city.parkingLots) {
    if (random() < 0.6) {
      vehicles.push(createVehicle(lot.x + 20, lot.y + 20, Math.floor(random() * 4)));
    }
  }

  let menuToggle = false;
  const gameState = {
    player,
    city,
    traffic,
    vehicles,
    audio,
    money: 1000,
    health: 100,
    armor: 0,
    wanted: 0,
    respect: 0,
    currentMission: null,
    missions: MISSIONS.map(m => ({ ...m, completed: false, active: false })),
    time: 0,
    isPaused: false,
    screenMode: 'title' // title, game, menu, pause, gameover
  };

  const police = createPoliceSystem(gameState, city, random);

  player.x = city.playerStart.x;
  player.y = city.playerStart.y;

  return {
    update(dt, actions) {
      if (gameState.screenMode === 'title') {
        if (actions.forward || actions.fire || actions.jump) {
          gameState.screenMode = 'game';
        }
        return;
      }

      if (actions.menu && !menuToggle) {
        menuToggle = true;
        if (gameState.screenMode === 'game') gameState.screenMode = 'pause';
        else if (gameState.screenMode === 'pause') gameState.screenMode = 'game';
      }
      if (!actions.menu) menuToggle = false;

      if (gameState.screenMode === 'gameover') {
        if (actions.forward || actions.fire || actions.jump) {
          gameState.screenMode = 'title';
          player.x = city.playerStart.x;
          player.y = city.playerStart.y;
          player.health = 100;
          gameState.wanted = 0;
        }
        return;
      }

      if (gameState.screenMode !== 'game') return;

      gameState.time += dt;

      // Check vehicle entry
      for (const v of vehicles) {
        const dist = Math.hypot(v.x - player.x, v.y - player.y);
        if (dist < 20 && actions.interact) {
          player.inVehicle = true;
          player.vehicle = v;
          v.occupied = true;
          v.driver = player;
        }
      }

      if (player.inVehicle && player.vehicle) {
        player.vehicle.update(dt, actions, city);
        player.x = player.vehicle.x;
        player.y = player.vehicle.y;
        if (actions.interact) {
          player.inVehicle = false;
          player.vehicle.occupied = false;
          player.vehicle = null;
        }
      } else {
        player.update(dt, actions, city);
      }

      updateTraffic(traffic, dt, city, player);
      police.update(dt, player, city);
      updateWanted(gameState, player, city);
      updateMissions(gameState, player, dt);

      player.health = Math.max(0, player.health - (actions.fire ? dt * 5 : 0));
      if (player.health <= 0) gameState.screenMode = 'gameover';
    },

    render() {
      const w = renderer.getWidth();
      const h = renderer.getHeight();

      // Title screen
      if (gameState.screenMode === 'title') {
        renderer.clear('#000a1a');
        const ctx = renderer.getContext();

        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#1a3a5a');
        gradient.addColorStop(1, '#0a1a2a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        renderer.drawText('SOLARA BAY', w / 2 - 100, h / 2 - 100, '#ff9900', 48);
        renderer.drawText('A Crime Story', w / 2 - 60, h / 2 - 40, '#ffff00', 20);

        const time = gameState.time % 2;
        const opacity = Math.sin(time * Math.PI) * 0.5 + 0.5;
        ctx.globalAlpha = opacity;
        renderer.drawText('Press SPACEBAR to start', w / 2 - 110, h / 2 + 60, '#00ff00', 16);
        ctx.globalAlpha = 1;

        renderer.drawText('WASD: Move | F: Enter Vehicle | Mouse: Look | ESC: Menu', w / 2 - 200, h - 100, '#888888', 12);
        renderer.drawText('E: Fire | Left Click: Aim | P: Save | L: Load', w / 2 - 150, h - 75, '#888888', 12);
        return;
      }

      renderer.clear('#1a3a2a');

      // Draw sky gradient
      const ctx = renderer.getContext();
      const gradient = ctx.createLinearGradient(0, 0, 0, h * 0.4);
      gradient.addColorStop(0, '#ffa840');
      gradient.addColorStop(0.5, '#ff8820');
      gradient.addColorStop(1, '#4a8cff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h * 0.4);

      // Camera
      const camX = player.x - w / 2;
      const camY = player.y - h / 2;

      ctx.save();
      ctx.translate(-camX, -camY);

      // Draw city
      for (const building of city.buildings) {
        const color = building.color;
        renderer.drawRect(building.x, building.y, building.width, building.height, color);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(building.x, building.y, building.width, building.height);
      }

      // Draw roads
      for (const road of city.roads) {
        renderer.drawRect(road.x, road.y, road.width, road.height, '#444');
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        if (road.width > road.height) ctx.strokeRect(road.x, road.y + road.height / 2 - 1, road.width, 2);
        else ctx.strokeRect(road.x + road.width / 2 - 1, road.y, 2, road.height);
        ctx.setLineDash([]);
      }

      // Draw water
      for (const water of city.water) {
        renderer.drawRect(water.x, water.y, water.width, water.height, '#2a5a9a');
      }

      // Draw vehicles
      for (const v of vehicles) {
        const size = 20;
        const angle = v.angle;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(angle);
        renderer.drawRect(-size / 2, -size / 2, size, size, v.spec.color);
        ctx.restore();
      }

      // Draw traffic
      for (const car of traffic) {
        const size = 15;
        renderer.drawRect(car.x - size / 2, car.y - size / 2, size, size, car.color);
      }

      // Draw police
      for (const car of police.units) {
        const size = 18;
        renderer.drawRect(car.x - size / 2, car.y - size / 2, size, size, '#0066ff');
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(car.x - size / 2, car.y - size / 2, size, size);
      }

      // Draw player
      const psize = player.inVehicle ? 10 : 8;
      renderer.drawCircle(player.x, player.y, psize, player.inVehicle ? '#ff00ff' : '#00ff00');

      ctx.restore();

      renderHUD(renderer, gameState, w, h);
    }
  };
}
