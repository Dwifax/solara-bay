import { randomInt, randomInRange, chooseRandom } from '../core/random.js';

export function generateCity(random, renderer) {
  const buildings = [];
  const roads = [];
  const water = [];
  const landmarks = [];
  const parkingLots = [];

  const gridSize = 120;
  const roadWidth = 50;

  // Generate grid roads
  for (let x = 0; x < 2000; x += gridSize + roadWidth) {
    roads.push({ x: x + roadWidth, y: 0, width: roadWidth, height: 2000 });
  }
  for (let y = 0; y < 2000; y += gridSize + roadWidth) {
    roads.push({ x: 0, y: y + roadWidth, width: 2000, height: roadWidth });
  }

  const colors = ['#cc3344', '#3366cc', '#33cc66', '#cccc33', '#cc8833', '#8833cc', '#ff6699'];

  // Downtown towers
  for (let x = 300; x < 800; x += 150) {
    for (let y = 300; y < 800; y += 150) {
      buildings.push({
        x, y,
        width: 120,
        height: 120,
        color: '#3366cc'
      });
      landmarks.push({ x: x + 60, y: y + 60, name: 'Downtown' });
    }
  }

  // Residential areas
  for (let x = 100; x < 1900; x += gridSize + roadWidth) {
    for (let y = 100; y < 1900; y += gridSize + roadWidth) {
      if ((x < 250 || x > 850) && (y < 250 || y > 850)) {
        if (random() < 0.6) {
          buildings.push({
            x, y,
            width: randomInt(80, 110, random),
            height: randomInt(80, 110, random),
            color: chooseRandom(colors, random)
          });
        } else if (random() < 0.5) {
          parkingLots.push({ x, y, width: 100, height: 100 });
        }
      }
    }
  }

  // Beach
  water.push({ x: 0, y: 1600, width: 2000, height: 400 });

  return {
    buildings,
    roads,
    water,
    landmarks,
    parkingLots,
    playerStart: { x: 400, y: 400 },
    width: 2000,
    height: 2000
  };
}
