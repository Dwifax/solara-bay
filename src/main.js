// Solara Bay: boot. Builds the game, starts the loop and shows the title screen, or, with
// ?shot=<scene> (or #shot=<scene>), stages a deterministic screenshot scene instead.
import { createGame } from './core/game.js';
import { startGameLoop, STEP } from './core/gameLoop.js';
import { stageShot } from './shots/screenshotScenes.js';
import { createRandom } from './core/random.js';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const loading = document.getElementById('loading');
const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const shot = params.get('shot') ?? hashParams.get('shot');

// Screenshot scenes use a seeded Math.random so the same frame comes out every time.
if (shot) Math.random = createRandom(1234).next;

const game = createGame(canvas, uiRoot);
window.__solara = game;

function hideLoading() {
  if (loading) loading.remove();
}

if (shot) {
  document.body.classList.add('shot-mode');
  stageShot(shot, game, STEP).then(() => {
    hideLoading();
    let painted = 0;
    function paint() {
      game.renderFrame(1 / 60);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paint);
  });
} else {
  game.flow.showTitle();
  canvas.addEventListener('click', () => {
    if (game.state === 'playing') game.input.requestLock();
  });
  startGameLoop(game.step, game.renderFrame);
  requestAnimationFrame(hideLoading);
}

window.__debugStats = () => ({
  state: game.state,
  calls: game.gfx.renderer.info.render.calls,
  tris: game.gfx.renderer.info.render.triangles,
  vehicles: game.vehicles.length,
  peds: game.peds.length,
  player: game.player.position.toArray().map((v) => Math.round(v * 10) / 10),
  inCar: !!game.player.vehicle,
  wanted: game.wanted.level,
  hp: Math.round(game.player.health),
  mission: game.missions.active ? `${game.missions.active.mission.id}#${game.missions.active.stepIndex}` : null,
  money: game.economy.state.money,
});
