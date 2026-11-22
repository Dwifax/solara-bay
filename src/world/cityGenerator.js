// Builds the whole of Solara Bay from a seed: the street graph, every block's buildings, terrain,
// sea, palms, street lamps and signals, and landmarks. Returns the data other systems need
// (road network, collision, blocks, signal controller, animated landmarks).
import { createRandom } from '../core/random.js';
import { createRoadNetwork, listBlocks, BLOCK, ROAD_HALF, BEACH, CHANNEL, PIER } from './cityLayout.js';
import { createCollisionWorld } from './collisionWorld.js';
import { generateBuildings } from './buildingGenerator.js';
import { buildBuildingMeshes } from './buildingMeshes.js';
import { buildRoads } from './roadBuilder.js';
import { buildTerrain } from './terrain.js';
import { createWater } from './water.js';
import { buildVegetation } from './vegetation.js';
import { buildStreetLights, buildTrafficLights } from './streetProps.js';
import { buildLandmarks } from './landmarks.js';

const PALM_STREETS = { rows: [3, 0, -3], cols: [-1, -4, 2] };

/** Where palms, trees and bushes go: boulevards, beach, promenade, parks and yards. */
function planVegetation(network, blocks, generated, rng) {
  const palms = [];
  const trees = [];
  const bushes = [];
  for (const edge of network.edges) {
    if (edge.bridge) continue;
    const isRow = edge.horizontal && PALM_STREETS.rows.includes(edge.a.j);
    const isCol = !edge.horizontal && PALM_STREETS.cols.includes(edge.a.i);
    if (!isRow && !isCol) continue;
    const nx = -edge.dirZ;
    const nz = edge.dirX;
    for (let t = 20; t < edge.length - 18; t += 15) {
      for (const s of [-1, 1]) {
        if (edge.a.j === 3 && s * nz > 0 && edge.horizontal) {
          // Beach side of Ocean Drive: palms on the promenade edge.
        }
        palms.push({ x: edge.a.x + edge.dirX * t + nx * s * 9.6, z: edge.a.z + edge.dirZ * t + nz * s * 9.6, y: 0.18, solid: true });
      }
    }
  }
  // Beach palms in loose clusters.
  for (let i = 0; i < 70; i += 1) {
    const x = rng.range(-520, 340);
    if (x > PIER.minX - 8 && x < PIER.maxX + 8) continue;
    palms.push({ x, z: rng.range(BEACH.minZ + 6, BEACH.minZ + 30), y: -0.2, solid: false });
  }
  // Promenade along the channel.
  for (let z = -480; z < 300; z += 16) {
    if (Math.abs(z + 100) < 14 || Math.abs(z - 200) < 14) continue;
    palms.push({ x: 336, z, y: 0, solid: true });
  }
  // Parks: trees and palms off the paths.
  for (const block of blocks) {
    if (block.style !== 'park') continue;
    for (let i = 0; i < 40; i += 1) {
      const x = rng.range(block.lot.minX + 3, block.lot.maxX - 3);
      const z = rng.range(block.lot.minZ + 3, block.lot.maxZ - 3);
      if (Math.abs(x - block.cx) < 4 || Math.abs(z - block.cz) < 4 || Math.hypot(x - block.cx, z - block.cz) < 10) continue;
      if (rng.chance(0.5)) palms.push({ x, z, y: 0.2, solid: false });
      else trees.push({ x, z, y: 0.2 });
    }
    for (let i = 0; i < 30; i += 1) bushes.push({ x: rng.range(block.lot.minX, block.lot.maxX), z: rng.range(block.lot.minZ, block.lot.maxZ), y: 0.2 });
  }
  for (const yard of generated.houseYards) {
    if (rng.chance(0.55)) palms.push({ x: yard.x, z: yard.z, y: 0.2, solid: false });
    else trees.push({ x: yard.x, z: yard.z, y: 0.2 });
    bushes.push({ x: yard.x + rng.range(-3, 3), z: yard.z + rng.range(-3, 3), y: 0.2 });
  }
  // Downtown plazas get a few trees on the sidewalk.
  for (const block of blocks) {
    if (block.style !== 'towers') continue;
    for (const [fx, fz] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      if (rng.chance(0.5)) continue;
      trees.push({ x: block.cx + fx * 41 + (fz !== 0 ? rng.range(-25, 25) : 0), z: block.cz + fz * 41 + (fx !== 0 ? rng.range(-25, 25) : 0), y: 0.2 });
    }
  }
  return { palms, trees, bushes };
}

export function generateCity(scene, seed) {
  const rng = createRandom(seed);
  const network = createRoadNetwork();
  const blocks = listBlocks();
  const collision = createCollisionWorld();
  const generated = generateBuildings(blocks, rng);
  buildTerrain(scene, collision, rng);
  buildRoads(scene, network, blocks);
  buildBuildingMeshes(scene, generated, collision);
  const vegetationPlan = planVegetation(network, blocks, generated, rng);
  buildVegetation(scene, vegetationPlan, rng, collision);
  const lamps = buildStreetLights(scene, network);
  const signals = buildTrafficLights(scene, network);
  const landmarks = buildLandmarks(scene, collision, rng, blocks);
  const water = createWater(scene);
  return {
    seed,
    network,
    blocks,
    collision,
    signals,
    landmarks,
    water,
    lamps,
    generated,
    constants: { BLOCK, ROAD_HALF, CHANNEL },
  };
}
