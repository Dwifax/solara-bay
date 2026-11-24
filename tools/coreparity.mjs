// Checks that the Rust/WebAssembly core and the JavaScript fallback agree: loads the game twice
// in headless Chrome (normally and with ?nowasm=1), samples the street graph, blocks, terrain,
// circle collision, raycasts, nearest-road queries and A* route lengths in each, and compares.
// Usage: node tools/coreparity.mjs
import { launchBrowser } from './cdp.mjs';

const PROBE = `(async () => {
  const g = window.__solara;
  const layout = await import('/src/world/cityLayout.js');
  const nav = await import('/src/systems/roadNavigation.js');
  const net = g.city.network;
  const col = g.city.collision;
  const r = (v) => Math.round(v * 1e6) / 1e6;
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = { status: g.core.status() };
  out.nodes = net.nodeList.map((n) => [n.i, n.j]).join(';');
  out.edges = net.edges.map((e) => [e.a.id, e.b.id, e.bridge ? 1 : 0]).join(';');
  out.blocks = g.city.blocks.map((b) => [b.bi, b.bj, b.area]).join(';');
  out.ground = [];
  out.circles = [];
  out.rays = [];
  out.roads = [];
  out.routes = [];
  for (let i = 0; i < 1500; i += 1) {
    const x = -560 + rnd() * 1260;
    const z = -560 + rnd() * 1030;
    out.ground.push(r(layout.surfaceHeight(x, z)), g.core.ready ? r(g.core.surfaceHeight(x, z)) : r(layout.surfaceHeight(x, z)));
    const c = col.resolveCircle(x, z, 0.4 + rnd() * 1.2, 0);
    out.circles.push(c.hit ? [r(c.x), r(c.z)].join(',') : '-');
    const a = rnd() * Math.PI * 2;
    const t = col.raycast(x, 0.5 + rnd() * 20, z, Math.sin(a) * 0.98, 0.2 * (rnd() - 0.5), Math.cos(a) * 0.98, 120);
    out.rays.push(t === Infinity ? 'inf' : r(t));
    const p = layout.nearestRoadPoint(net, x, z);
    out.roads.push(r(p.distance));
    if (i < 300) {
      const route = nav.findRoute(net, layout.nearestNode(net, x, z), net.nodeList[(i * 17) % net.nodeList.length]);
      let len = 0;
      for (let k = 1; k < route.length; k += 1) len += Math.hypot(route[k].x - route[k - 1].x, route[k].z - route[k - 1].z);
      out.routes.push(Math.round(len));
    }
  }
  return out;
})()`;

async function sample(query) {
  const browser = await launchBrowser({ port: 9334 });
  try {
    await browser.goto(`http://localhost:8080/index.html${query}`);
    await browser.waitFor('window.__solara && window.__solara.core', 60000);
    const result = await browser.evaluate(PROBE);
    const errors = browser.logs.filter((l) => ['error', 'exception', 'warning'].includes(l.level));
    return { result, errors };
  } finally {
    await browser.close();
  }
}

const native = await sample('');
const fallback = await sample('?nowasm=1');
console.log(`native: ${native.result.status}\nfallback: ${fallback.result.status}`);
let failures = 0;
for (const key of ['nodes', 'edges', 'blocks', 'ground', 'circles', 'rays', 'roads', 'routes']) {
  const a = native.result[key];
  const b = fallback.result[key];
  const listA = Array.isArray(a) ? a : [a];
  const listB = Array.isArray(b) ? b : [b];
  let diff = 0;
  let firstDiff = -1;
  for (let i = 0; i < Math.max(listA.length, listB.length); i += 1) {
    if (String(listA[i]) !== String(listB[i])) {
      diff += 1;
      if (firstDiff < 0) firstDiff = i;
    }
  }
  if (key === 'ground') {
    // Pairs of (JS, Rust) inside the native run must agree too.
    for (let i = 0; i < listA.length; i += 2) if (listA[i] !== listA[i + 1]) diff += 1;
  }
  console.log(`${key.padEnd(8)} ${listA.length} samples, ${diff} differ${diff ? ` (first at ${firstDiff}: ${listA[firstDiff]} vs ${listB[firstDiff]})` : ''}`);
  failures += diff;
}
for (const e of [...native.errors, ...fallback.errors]) console.log(`  [${e.level}] ${e.text}`);
console.log(failures === 0 ? 'PARITY OK' : `PARITY: ${failures} differences`);
