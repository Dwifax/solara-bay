// Fills each city block with buildings in its district's style (glass towers downtown, pastel
// deco hotels on Ocean Drive, mid-rises in Little Coral, houses and villas, warehouses and
// container yards) and records each as a box for rendering and collision.
import { DISTRICTS, districtAt } from '../data/districts.js';
import { hash2 } from '../core/random.js';

/** Special blocks that hold a named place instead of generic buildings. */
export const SPECIAL_BLOCKS = {
  '-1,-3': 'castellaneTower',
  '-1,1': 'bayfrontPark',
  '0,-2': 'policeStation',
  '-4,-1': 'hospital',
  '-3,-4': 'hillsPark',
  '2,-2': 'dealership',
  '1,0': 'gunShop',
  '5,-1': 'bennys',
  '-2,0': 'safehouse',
  '0,1': 'garage',
};

/** Storefronts built into an otherwise ordinary block: sign text and the street side they face. */
const SHOPFRONTS = {
  gunShop: { text: 'BAYLINE ARMS', color: '#1a1a1a', bg: '#f2c14e', side: 'north', wall: 0x5a5f66 },
  bennys: { text: "BENNY'S BAIT & TACKLE", color: '#ffffff', bg: '#1f6f8b', side: 'north', wall: 0xc9b79c },
  safehouse: { text: 'CORAL ARMS APTS', color: '#ffffff', bg: '#c4573a', side: 'south', wall: 0xf0dcc0 },
  garage: { text: 'SUNSET CUSTOMS', color: '#ffffff', bg: '#7b3fa0', side: 'north', wall: 0x8b8f96 },
};

const GROUND = {
  towers: 0xd6d1c7,
  deco: 0xe9dcc4,
  midrise: 0xd2c9ba,
  houses: 0x86b25e,
  villas: 0x7fae5a,
  warehouses: 0x8f8c86,
  docks: 0x9b9890,
  park: 0x79ab55,
};

export function generateBuildings(blocks, rng) {
  const out = {
    glass: [], // downtown curtain-wall towers
    stucco: [], // painted walls with windows
    industrial: [], // big-panel walls
    plain: [], // no windows (roof units, containers, parapets)
    roofs: [], // pitched roofs
    pools: [],
    parks: [],
    neon: [],
    neonSigns: [],
    houseYards: [],
    signs: [],
  };
  for (const block of blocks) {
    const key = `${block.bi},${block.bj}`;
    const special = SPECIAL_BLOCKS[key];
    const district = block.area === 'docks' ? 'portCalloway' : districtAt(block.cx, block.cz);
    block.district = district;
    const style = special === 'bayfrontPark' || special === 'hillsPark' ? 'park' : DISTRICTS[district].style;
    block.style = style;
    block.special = special ?? null;
    block.groundColor = GROUND[style] ?? 0xcfc6b8;
    const palette = DISTRICTS[district].palette;
    const h = (n) => hash2(block.bi * 13 + n, block.bj * 7 - n * 3);
    if (special === 'castellaneTower') buildCastellane(block, out);
    else if (special === 'policeStation') buildPoliceStation(block, out);
    else if (special === 'hospital') buildHospital(block, out);
    else if (special === 'dealership') buildDealership(block, out, palette);
    else if (SHOPFRONTS[special]) buildShopBlock(block, out, palette, rng, SHOPFRONTS[special]);
    else if (style === 'park') out.parks.push(block);
    else if (style === 'towers') buildTowers(block, out, palette, h, rng);
    else if (style === 'deco') buildDeco(block, out, palette, h, rng);
    else if (style === 'midrise') buildMidrise(block, out, palette, h, rng);
    else if (style === 'houses') buildHouses(block, out, palette, h, rng);
    else if (style === 'villas') buildVillas(block, out, palette, h, rng);
    else if (style === 'warehouses') buildWarehouses(block, out, palette, h, rng);
    else if (style === 'docks') buildDocks(block, out, palette, h, rng);
  }
  return out;
}

function pushBox(list, x, z, w, d, h, color, y = 0, solid = true) {
  const b = { x, y, z, w, d, h, color, solid };
  list.push(b);
  return b;
}

function roofUnits(out, x, z, w, d, top, rng) {
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i += 1) {
    pushBox(out.plain, x + rng.range(-w / 3, w / 3), z + rng.range(-d / 3, d / 3), rng.range(2, 4), rng.range(2, 4), rng.range(1.2, 2.5), 0x9aa0a6, top, false);
  }
}

function buildTowers(block, out, palette, h, rng) {
  const { lot } = block;
  const half = (lot.maxX - lot.minX) / 2;
  const merge = h(1) < 0.25;
  const cells = merge ? [[0.5, 0.5, 2]] : [
    [0.25, 0.25, 1],
    [0.75, 0.25, 1],
    [0.25, 0.75, 1],
    [0.75, 0.75, 1],
  ];
  for (const [fx, fz, span] of cells) {
    const cx = lot.minX + (lot.maxX - lot.minX) * fx;
    const cz = lot.minZ + (lot.maxZ - lot.minZ) * fz;
    const size = half * span - 3;
    const color = rng.pick(palette);
    if (rng.chance(0.15) && !merge) {
      // A small plaza with a kiosk instead of a tower.
      pushBox(out.stucco, cx, cz, 8, 6, 4, rng.pick(palette));
      continue;
    }
    const w = rng.range(size * 0.65, size);
    const d = rng.range(size * 0.65, size);
    const height = merge ? rng.range(70, 120) : rng.range(32, 95);
    let base = 0;
    if (rng.chance(0.5)) {
      pushBox(out.stucco, cx, cz, size, size, 9, rng.pick(palette));
      base = 9;
    }
    pushBox(out.glass, cx, cz, w, d, height - base, color, base);
    let top = height;
    if (rng.chance(0.55)) {
      const sh = rng.range(10, 26);
      pushBox(out.glass, cx, cz, w * 0.68, d * 0.68, sh, color, top);
      top += sh;
    }
    pushBox(out.plain, cx, cz, w * 0.5 + 0.6, d * 0.5 + 0.6, 0.8, 0x6e757c, top, false);
    roofUnits(out, cx, cz, w * 0.6, d * 0.6, top, rng);
    if (rng.chance(0.35)) pushBox(out.plain, cx, cz, 0.6, 0.6, rng.range(8, 18), 0xb8bec4, top, false);
  }
}

function buildDeco(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  const cell = span / 3;
  for (let ix = 0; ix < 3; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      const cx = lot.minX + cell * (ix + 0.5);
      const cz = lot.minZ + cell * (iz + 0.5);
      if (ix === 1 && iz === 1) {
        out.pools.push({ x: cx, z: cz, w: cell - 6, d: cell - 8 });
        continue;
      }
      const color = rng.pick(palette);
      const height = rng.range(9, 24);
      const w = cell - rng.range(1.5, 4);
      const d = cell - rng.range(1.5, 4);
      pushBox(out.stucco, cx, cz, w, d, height, color);
      // Deco crown and a vertical fin on the street side.
      pushBox(out.plain, cx, cz, w * 0.55, d * 0.55, rng.range(2, 4), 0xfaf7f0, height, false);
      const faceZ = iz === 2 ? 1 : iz === 0 ? -1 : 0;
      const faceX = ix === 2 ? 1 : ix === 0 ? -1 : 0;
      if (faceZ === 1 && height > 11) {
        // Hotels on Ocean Drive carry their name in neon on the street front.
        out.neonSigns.push({ text: HOTEL_NAMES[out.neonSigns.length % HOTEL_NAMES.length], x: cx, y: height - 2.2, z: cz + d / 2 + 0.12, w: Math.min(w - 2, 11), h: 2.2, rotY: 0, color: rng.pick(NEON_SIGN_COLORS) });
        pushBox(out.plain, cx, cz + d / 2 + 0.3, w * 0.9, 0.35, 0.5, 0xffffff, height * 0.35, false);
        pushBox(out.plain, cx, cz + d / 2 + 0.3, w * 0.9, 0.35, 0.5, 0xffffff, height * 0.6, false);
      } else if (faceZ !== 0 && rng.chance(0.7)) {
        pushBox(out.plain, cx, cz + faceZ * (d / 2 + 0.4), 2.2, 0.8, height + 3, 0xffffff, 0, false);
        out.neon.push({ x: cx + rng.range(-w / 4, w / 4), y: height * rng.range(0.55, 0.85), z: cz + faceZ * (d / 2 + 0.25), w: rng.range(5, 9), h: 0.7, axis: 'x', color: rng.pick([0xff4fa0, 0x3ff0ff, 0xffd23f, 0x9d6bff, 0x56ff9b]) });
      } else if (faceX !== 0 && rng.chance(0.5)) {
        out.neon.push({ x: cx + faceX * (w / 2 + 0.25), y: height * rng.range(0.55, 0.85), z: cz + rng.range(-d / 4, d / 4), w: rng.range(5, 9), h: 0.7, axis: 'z', color: rng.pick([0xff4fa0, 0x3ff0ff, 0xffd23f, 0x9d6bff]) });
      }
    }
  }
}

function buildMidrise(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  const cell = span / 3;
  for (let ix = 0; ix < 3; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      if (rng.chance(0.12)) continue;
      const cx = lot.minX + cell * (ix + 0.5);
      const cz = lot.minZ + cell * (iz + 0.5);
      const w = cell - rng.range(2, 5);
      const d = cell - rng.range(2, 5);
      const height = rng.range(7, 26);
      pushBox(out.stucco, cx, cz, w, d, height, rng.pick(palette));
      pushBox(out.plain, cx, cz, w + 0.4, d + 0.4, 0.7, 0xe9e2d4, height, false);
      roofUnits(out, cx, cz, w, d, height + 0.7, rng);
    }
  }
}

const HOTEL_NAMES = ['HOTEL CORAL', 'SEA BREEZE', 'SUNSET SUITES', 'PALMERA', 'THE TIDE', 'CASA DEL MAR', 'AURORA', 'PELICAN INN', 'NEON PALMS', 'LA PLAYA', 'SOLARA ROYALE', 'MARISOL'];
const NEON_SIGN_COLORS = ['#ff4fa0', '#3ff0ff', '#ffd23f', '#b98bff', '#56ff9b'];

const ROOF_COLORS = [0xb5573b, 0xa4472f, 0x6f6a66, 0xc4693e, 0x8a4a3a];

function buildHouses(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  const cell = span / 3;
  for (let ix = 0; ix < 3; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      const cx = lot.minX + cell * (ix + 0.5);
      const cz = lot.minZ + cell * (iz + 0.5);
      if (ix === 1 && iz === 1) {
        out.houseYards.push({ x: cx, z: cz });
        continue;
      }
      const w = rng.range(10, 15);
      const d = rng.range(9, 13);
      const height = rng.range(3.6, 6.5);
      pushBox(out.stucco, cx, cz, w, d, height, rng.pick(palette));
      out.roofs.push({ x: cx, y: height, z: cz, w: w + 1, d: d + 1, h: rng.range(2, 3.2), color: rng.pick(ROOF_COLORS) });
      out.houseYards.push({ x: cx + rng.range(-6, 6), z: cz + (rng.chance(0.5) ? -1 : 1) * (d / 2 + 3) });
      if (rng.chance(0.3)) out.pools.push({ x: cx + (ix === 0 ? 1 : -1) * 2, z: cz + (iz === 0 ? -1 : 1) * (d / 2 + 4.5), w: 6, d: 3.5 });
    }
  }
}

function buildVillas(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  const cell = span / 2;
  for (let ix = 0; ix < 2; ix += 1) {
    for (let iz = 0; iz < 2; iz += 1) {
      const cx = lot.minX + cell * (ix + 0.5);
      const cz = lot.minZ + cell * (iz + 0.5) - 4;
      const w = rng.range(18, 24);
      const d = rng.range(12, 16);
      const color = rng.pick(palette);
      pushBox(out.stucco, cx, cz, w, d, 4.2, color);
      pushBox(out.stucco, cx + rng.range(-3, 3), cz - 1, w * 0.6, d * 0.7, 3.8, color, 4.2);
      pushBox(out.plain, cx, cz, w + 1.2, d + 1.2, 0.4, 0xffffff, 4.2, false);
      out.pools.push({ x: cx, z: cz + d / 2 + 7, w: w * 0.6, d: 5 });
      out.houseYards.push({ x: cx - w / 2 - 3, z: cz + d / 2 + 6 });
      out.houseYards.push({ x: cx + w / 2 + 3, z: cz + d / 2 + 6 });
    }
  }
}

function buildWarehouses(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  if (rng.chance(0.5)) {
    pushBox(out.industrial, (lot.minX + lot.maxX) / 2, lot.minZ + span * 0.3, span - 6, span * 0.5, rng.range(9, 14), rng.pick(palette));
    pushBox(out.industrial, lot.minX + span * 0.3, lot.minZ + span * 0.8, span * 0.5, span * 0.3, rng.range(6, 9), rng.pick(palette));
  } else {
    pushBox(out.industrial, lot.minX + span * 0.27, (lot.minZ + lot.maxZ) / 2, span * 0.45, span - 8, rng.range(10, 15), rng.pick(palette));
    pushBox(out.industrial, lot.minX + span * 0.77, lot.minZ + span * 0.3, span * 0.38, span * 0.5, rng.range(7, 12), rng.pick(palette));
  }
  addContainers(out, lot.maxX - 10, lot.maxZ - 8, 2, 2, rng);
}

const CONTAINER_COLORS = [0xc0392b, 0x2e6da4, 0xe67e22, 0x16a085, 0x8e44ad, 0xd4ac0d, 0x7f8c8d, 0x1f5f8b];

function addContainers(out, x, z, rows, layers, rng) {
  for (let r = 0; r < rows; r += 1) {
    const stack = rng.int(1, layers);
    for (let l = 0; l < stack; l += 1) {
      pushBox(out.plain, x, z - r * 2.8, 12, 2.6, 2.6, rng.pick(CONTAINER_COLORS), l * 2.6, true);
    }
  }
}

function buildDocks(block, out, palette, h, rng) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  pushBox(out.industrial, lot.minX + span * 0.3, lot.minZ + span * 0.3, span * 0.5, span * 0.45, rng.range(10, 15), rng.pick(palette));
  for (let k = 0; k < 4; k += 1) addContainers(out, lot.minX + span * 0.72 + (k % 2) * 14, lot.minZ + 10 + Math.floor(k / 2) * 30, 3, 3, rng);
  for (let k = 0; k < 3; k += 1) addContainers(out, lot.minX + 10 + k * 14, lot.maxZ - 8, 3, 2, rng);
}

/** A block of mid-rises with one storefront on the middle of its north or south side. */
function buildShopBlock(block, out, palette, rng, shop) {
  const { lot } = block;
  const span = lot.maxX - lot.minX;
  const cell = span / 3;
  const shopRow = shop.side === 'north' ? 0 : 2;
  for (let ix = 0; ix < 3; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      const cx = lot.minX + cell * (ix + 0.5);
      const cz = lot.minZ + cell * (iz + 0.5);
      if (ix === 1 && iz === shopRow) {
        const facing = shop.side === 'north' ? -1 : 1;
        const fz = facing < 0 ? lot.minZ : lot.maxZ;
        const shopZ = fz - facing * 7;
        pushBox(out.stucco, cx, shopZ, cell - 2, 14, 6, shop.wall);
        pushBox(out.plain, cx, fz - facing * 0.2, cell - 1, 0.4, 0.5, 0xffffff, 5.2, false);
        out.signs.push({ text: shop.text, x: cx, y: 4.6, z: fz + facing * 0.05, w: cell - 4, h: 1.8, rotY: facing < 0 ? Math.PI : 0, color: shop.color, bg: shop.bg });
        continue;
      }
      if (ix === 1 && iz === 1) continue;
      const w = cell - rng.range(2, 5);
      const d = cell - rng.range(2, 5);
      const height = rng.range(8, 20);
      pushBox(out.stucco, cx, cz, w, d, height, rng.pick(palette));
    }
  }
}

function buildCastellane(block, out) {
  const cx = block.cx;
  const cz = block.cz;
  pushBox(out.stucco, cx, cz, 70, 70, 10, 0xe3dccd);
  pushBox(out.glass, cx, cz, 34, 34, 120, 0x9fc0d8, 10);
  pushBox(out.glass, cx, cz, 26, 26, 30, 0x9fc0d8, 130);
  pushBox(out.glass, cx, cz, 18, 18, 18, 0xb0cfe4, 160);
  pushBox(out.plain, cx, cz, 1.4, 1.4, 34, 0xdfe6ea, 178, false);
  out.signs.push({ text: 'CASTELLANE', x: cx, y: 16, z: cz + 35.3, w: 28, h: 4, rotY: 0, color: '#1b2a3a', bg: '#f1e8d5' });
}

function buildPoliceStation(block, out) {
  const cx = block.cx;
  const cz = block.cz;
  pushBox(out.stucco, cx - 10, cz - 12, 50, 30, 11, 0xdfe3e8);
  pushBox(out.plain, cx - 10, cz + 3.4, 50, 1.2, 1.2, 0x2a5aa8, 8, false);
  pushBox(out.stucco, cx + 24, cz - 12, 14, 14, 18, 0xc8d0da);
  out.signs.push({ text: 'SBPD CENTRAL', x: cx - 10, y: 6, z: cz + 3.2, w: 22, h: 3, rotY: 0, color: '#ffffff', bg: '#1d3f80' });
}

function buildHospital(block, out) {
  const cx = block.cx;
  const cz = block.cz;
  pushBox(out.stucco, cx, cz - 8, 56, 34, 22, 0xf4f4f0);
  pushBox(out.stucco, cx + 18, cz + 16, 20, 14, 9, 0xeaeae4);
  out.signs.push({ text: 'ST. MARISOL GENERAL', x: cx, y: 18, z: cz + 9.2, w: 30, h: 3.2, rotY: 0, color: '#c0262d', bg: '#ffffff' });
}

function buildDealership(block, out, palette) {
  const cx = block.cx;
  const cz = block.cz;
  pushBox(out.glass, cx - 8, cz + 10, 44, 22, 8, 0xd8e4ea);
  pushBox(out.industrial, cx + 10, cz - 20, 40, 26, 10, palette[0]);
  out.signs.push({ text: 'COASTLINE MOTORS', x: cx - 8, y: 9.5, z: cz + 21.3, w: 24, h: 3, rotY: 0, color: '#ffffff', bg: '#d2462f' });
}
