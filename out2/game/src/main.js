import { createGame } from './core/game.js';
import { createInput } from './core/input.js';

const canvas = document.getElementById('canvas');
const input = createInput(canvas);
const game = createGame(canvas);

let lastTime = performance.now();

function gameLoop(currentTime) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  const actions = input.getActions();
  game.update(dt, actions);
  game.render();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
