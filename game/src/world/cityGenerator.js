import { randomInt, randomInRange } from '../core/random.js';

export function generateCity(random, renderer) {
  const w = renderer.getWidth();
  const h = renderer.getHeight();

  const buildings = [];
  const roads = [];
  const water = [];

  const gridSize = 100;
  const roadWidth = 40;

  // Generate grid roads
  for (let x = 0; x < 2000; x += gridSize) {
    roads.push({ x, y: 500, width: 2000, height: roadWidth });
  }
  for (let y = 0; y < 2000; y += gridSize) {
    roads.push({ x: 500, y, width: roadWidth, height: 2000 });
  }

  // Generate buildings in grid
  const colors = ['#cc3344', '#3366cc', '#33cc66', '#cccc33', '#cc8833', '#8833cc', '#ff6699'];

  for (let x = 100; x < 1900; x += gridSize + roadWidth) {
    for (let y = 100; y < 1900; y += gridSize + roadWidth) {
      if (Math.random() < 0.7) {
        buildings.push({
          x, y,
          width: randomInt(60, gridSize - 10, random),
          height: randomInt(60, gridSize - 10, random),
          color: colors[Math.floor(random() * colors.length)]
        });
      }
    }
  }

  // Beach and water
  water.push({ x: 0, y: 1600, width: 2000, height: 400 });

  return {
    buildings,
    roads,
    water,
    playerStart: { x: 400, y: 400 },
    width: 2000,
    height: 2000
  };
}
