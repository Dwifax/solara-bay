// Simulation benchmark in headless Chrome: stages the police-chase scene (many cars, cops, a
// helicopter and pedestrians), then runs fixed simulation steps with each subsystem timed, and
// prints the per-step cost, whether the Rust/WebAssembly core was used, and any console errors.
// Usage: node tools/bench.mjs [steps] [extra query, e.g. "&nowasm=1"]
import { launchBrowser } from './cdp.mjs';

const steps = Number(process.argv[2] ?? 1200);
const extra = process.argv[3] ?? '';
const browser = await launchBrowser();
try {
  const url = `http://localhost:8080/index.html?shot=chase${extra}`;
  await browser.goto(url);
  await browser.waitFor('window.__shotReady === true', 120000);
  const result = await browser.evaluate(`(async () => {
    const g = window.__solara;
    const timed = {};
    const wrap = (name, obj, key) => {
      const fn = obj[key].bind(obj);
      timed[name] = 0;
      obj[key] = (...a) => { const t = performance.now(); const r = fn(...a); timed[name] += performance.now() - t; return r; };
    };
    wrap('traffic', g.traffic, 'update');
    wrap('police', g.police, 'update');
    wrap('vehicles', g.vehicleSystem, 'update');
    wrap('peds', g.pedSystem, 'update');
    wrap('combat', g.combat, 'update');
    wrap('wanted', g.wanted, 'update');
    // Keep the scene busy: the chase car drives on, traffic and peds keep spawning.
    const car = g.player.vehicle;
    g.controller.update = () => { if (car) { car.controls.throttle = car.forwardSpeed > 24 ? 0 : 0.8; car.controls.steer = 0; car.health = car.maxHealth; } };
    // Collision and routing micro-benchmarks on the live city.
    const col = g.city.collision;
    let t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < 20000; i += 1) { const r = col.resolveCircle(-300 + (i % 400) * 1.7, -200 + (i % 97) * 4.1, 0.4, 0); if (r.hit) hits += 1; }
    const resolveMs = performance.now() - t0;
    t0 = performance.now();
    let rays = 0;
    for (let i = 0; i < 4000; i += 1) { const a = i * 0.37; if (col.raycast(-100 + (i % 50) * 6, 1.5, -100 + (i % 31) * 7, Math.sin(a), 0, Math.cos(a), 90) < Infinity) rays += 1; }
    const rayMs = performance.now() - t0;
    const net = g.city.network;
    const nav = await import("/src/systems/roadNavigation.js");
    t0 = performance.now();
    let routeLen = 0;
    for (let i = 0; i < 2000; i += 1) { const a = net.nodeList[i % net.nodeList.length]; const b = net.nodeList[(i * 7 + 13) % net.nodeList.length]; const r = nav.findRoute(net, a, b); routeLen += r ? r.length : 0; }
    const routeMs = performance.now() - t0;
    let vMax = 0, pMax = 0;
    const start = performance.now();
    for (let i = 0; i < ${steps}; i += 1) { g.step(1 / 60); vMax = Math.max(vMax, g.vehicles.length); pMax = Math.max(pMax, g.peds.length); }
    const total = performance.now() - start;
    const per = {};
    for (const k in timed) per[k] = +(timed[k] / ${steps}).toFixed(4);
    return { wasm: g.core ? g.core.status() : 'n/a', msPerStep: +(total / ${steps}).toFixed(4), per, vMax, pMax,
      resolve20k: +resolveMs.toFixed(2), hits, ray4k: +rayMs.toFixed(2), rays, route2k: +routeMs.toFixed(2), routeLen,
      player: g.player.position.toArray().map((v) => Math.round(v)) };
  })()`);
  console.log(JSON.stringify(result, null, 1));
  for (const log of browser.logs) {
    if (log.level === 'request') continue;
    if (['debug', 'verbose'].includes(log.level)) continue;
    console.log(`  [${log.level}] ${log.text}`);
  }
} finally {
  await browser.close();
}
