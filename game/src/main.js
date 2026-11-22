// Boot (temporary test harness while systems are built).
import { createGame } from './core/game.js';
import { startGameLoop } from './core/gameLoop.js';

const canvas = document.getElementById('game');
const game = createGame(canvas);
window.__game = game;
game.state = 'playing';
game.player.giveWeapon('pistol', 60);
game.player.giveWeapon('smg', 120);
game.tod.state.hour = 18.6;
game.vehicleSystem.spawn('vento', -150, 100.5, Math.PI / 2);
game.cameraCtl.snapBehind(Math.PI);
let fps = 0;
startGameLoop(
  (dt) => {
    if (game.state === 'playing') game.step(dt);
  },
  (dt) => {
    fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    game.renderFrame(dt);
  },
);
canvas.addEventListener('click', () => game.input.requestLock());
window.__debugStats = () => ({
  fps: Math.round(fps),
  calls: game.gfx.renderer.info.render.calls,
  tris: game.gfx.renderer.info.render.triangles,
  vehicles: game.vehicles.length,
  peds: game.peds.length,
  player: game.player.position.toArray().map((v) => Math.round(v * 10) / 10),
  inCar: !!game.player.vehicle,
  wanted: game.wanted.level,
  hp: game.player.health,
});
