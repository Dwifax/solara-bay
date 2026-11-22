import { createRenderer } from './renderer.js';
import { seededRandom, randomInt, chooseRandom } from './random.js';
import { generateCity } from '../world/cityGenerator.js';
import { createPlayer } from '../entities/player.js';
import { createAudio } from './audio.js';
import { updateTraffic, createTraffic } from '../systems/traffic.js';
import { updateWanted } from '../systems/wanted.js';
import { updateMissions } from '../systems/missions.js';
import { renderHUD } from '../ui/hud.js';
import { MISSIONS } from '../data/missions.js';

export function createGame(canvas) {
  const renderer = createRenderer(canvas);
  const random = seededRandom(Math.floor(Math.random() * 0xffffffff));
  const audio = createAudio();

  const city = generateCity(random, renderer);
  const player = createPlayer(city);
  const traffic = createTraffic(city, random, 15);

  let menuToggle = false;
  const gameState = {
    player,
    city,
    traffic,
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
    screenMode: 'game' // game, menu, pause
  };

  player.x = city.playerStart.x;
  player.y = city.playerStart.y;

  return {
    update(dt, actions) {
      if (actions.menu && !menuToggle) {
        menuToggle = true;
        gameState.screenMode = gameState.screenMode === 'game' ? 'pause' : 'game';
      }
      if (!actions.menu) menuToggle = false;

      if (gameState.screenMode !== 'game') return;

      gameState.time += dt;

      player.update(dt, actions, city);
      updateTraffic(traffic, dt, city, player);
      updateWanted(gameState, player, city);
      updateMissions(gameState, player, dt);

      player.health = Math.max(0, player.health - (actions.fire ? dt * 20 : 0));
      if (player.health <= 0) gameState.screenMode = 'gameover';
    },

    render() {
      const w = renderer.getWidth();
      const h = renderer.getHeight();

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

      // Draw traffic
      for (const car of traffic) {
        const size = 20;
        renderer.drawRect(car.x - size / 2, car.y - size / 2, size, size, car.color);
      }

      // Draw player
      renderer.drawCircle(player.x, player.y, 8, player.inVehicle ? '#f00' : '#0f0');

      ctx.restore();

      renderHUD(renderer, gameState, w, h);
    }
  };
}
