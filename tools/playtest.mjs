// Automated playthrough: starts a new game in headless Chrome and completes every story mission
// (and a street race and a courier job) by satisfying each step in the real game, reporting
// progress and any console errors. Usage: node tools/playtest.mjs [missionId]
import { launchBrowser, delay } from './cdp.mjs';

const only = process.argv[2];
const AUTO = `
window.__auto = function () {
  const g = window.__solara;
  const run = g.missions.active;
  if (!run) return 'idle';
  const step = run.step;
  const s = run.state;
  const p = g.player;
  const tp = (x, z) => {
    if (p.vehicle) { p.vehicle.position.set(x, 0, z); p.vehicle.vx = 0; p.vehicle.vz = 0; }
    else p.position.set(x, 0.2, z);
  };
  const ensureCar = () => {
    if (p.vehicle) return p.vehicle;
    const v = g.vehicleSystem.spawn('heron', p.position.x + 3, p.position.z, 0);
    g.controller.enterVehicle(v);
    return v;
  };
  switch (step.type) {
    case 'dialogue': g.ui.dialogue.clear(); s.done = true; break;
    case 'enterVehicle': if (p.vehicle) g.controller.exitVehicle(true); g.controller.enterVehicle(s.vehicle); break;
    case 'getVehicle': ensureCar(); break;
    case 'pickup': { ensureCar(); tp(s.ped.position.x + 4, s.ped.position.z); break; }
    case 'goto': if (step.vehicle) ensureCar(); tp(step.x, step.z); break;
    case 'deliver': if (p.vehicle !== s.vehicle) { if (p.vehicle) g.controller.exitVehicle(true); g.controller.enterVehicle(s.vehicle); } g.wanted.clear(); tp(step.x, step.z); break;
    case 'race': { ensureCar(); if (s.countdown > 0) break; const cp = step.checkpoints[s.index]; tp(cp[0], cp[1]); break; }
    case 'chase': s.target.damage(s.target.maxHealth * 0.7, g.events, null); tp(s.target.position.x + 8, s.target.position.z); break;
    case 'collect': tp(s.x, s.z); break;
    case 'kill': for (const e of g.peds.filter((e) => e.missionTag === step.group)) e.takeDamage(999, 'player', g.events); break;
    case 'escort': { ensureCar(); const v = s.van; for (const e of g.peds) if (e.missionTag && e.missionTag.startsWith('ambush')) e.takeDamage(999, 'player', g.events); v.position.set(s.goal.x, 0, s.goal.z); tp(s.goal.x + 10, s.goal.z); break; }
    case 'hold': tp(step.x, step.z); s.time = step.time; break;
    case 'loseWanted': g.wanted.clear(); break;
  }
  g.player.health = 100;
  return run.mission.id + '#' + run.stepIndex + ':' + step.type;
};
`;

const browser = await launchBrowser();
const errors = [];
try {
  await browser.goto('http://localhost:8080/index.html');
  await browser.waitFor('window.__solara && window.__solara.state === "title"', 60000);
  await browser.evaluate(AUTO);
  await browser.evaluate('window.__solara.flow.newGame(); 1');
  await delay(1500);
  const missions = await browser.evaluate('window.__solara.missions.list.map((m) => m.id)');
  for (const id of missions) {
    if (only && id !== only) {
      await browser.evaluate(`window.__solara.missions.progress.completed.push('${id}'); 1`);
      continue;
    }
    await browser.evaluate(`window.__solara.missions.forceStart('${id}'); 1`);
    let guard = 0;
    let last = '';
    while (guard < 400) {
      guard += 1;
      const status = await browser.evaluate('window.__auto()');
      if (status !== last) {
        console.log('  ', status);
        last = status;
      }
      if (status === 'idle') break;
      await delay(250);
    }
    const passed = await browser.evaluate(`window.__solara.missions.progress.completed.includes('${id}')`);
    const stats = await browser.evaluate('JSON.stringify(window.__debugStats())');
    console.log(`${passed ? 'PASSED' : 'NOT PASSED'} ${id} ${stats}`);
    await delay(1200);
  }
  // Side activities.
  await browser.evaluate(`(() => { const g = window.__solara; const v = g.vehicleSystem.spawn('brawler', -300, 300, Math.PI/2); g.controller.enterVehicle(v); return 1; })()`);
  await browser.evaluate(`(() => { const g = window.__solara; g.missions.startSide({ id: 'race-test', title: 'Test Race', reward: { money: 10, streetCred: 1 }, steps: [{ type: 'race', grid: { x: -300, z: 305.2, heading: Math.PI/2 }, countdown: 1, rivals: [{ car: 'vireo', color: 0, x: -300, z: 301.6, skill: 1 }], checkpoints: [[-100, 300], [100, 300]], text: 'race' }] }); return 1; })()`);
  for (let i = 0; i < 40; i += 1) {
    const st = await browser.evaluate('window.__auto()');
    if (st === 'idle') break;
    await delay(250);
  }
  console.log('race done', await browser.evaluate('JSON.stringify(window.__debugStats())'));
  // Shops and saving.
  await browser.evaluate(`(() => { const g = window.__solara; g.economy.addMoney(100000); g.economy.addStreetCred(20000); g.controller.exitVehicle(true); for (const item of g.economy.catalog('guns')) item.action(); for (const item of g.economy.catalog('cars')) item.action(); g.saveSystem.save('1'); return 1; })()`);
  await delay(500);
  console.log('weapons', await browser.evaluate('JSON.stringify(Object.keys(window.__solara.player.weapons))'));
  await browser.evaluate(`window.__solara.flow.loadSlot('1'); 1`);
  await delay(800);
  console.log('after load', await browser.evaluate('JSON.stringify(window.__debugStats())'));
  // Wanted escalation and the police response.
  await browser.evaluate(`(() => { const g = window.__solara; g.wanted.setLevel(5); return 1; })()`);
  await delay(8000);
  console.log('5 stars', await browser.evaluate('JSON.stringify(window.__debugStats())'), await browser.evaluate('window.__solara.vehicles.filter(v => v.isPolice).length + " cop cars, heli " + !!window.__solara.police.helicopter'));
  await browser.evaluate(`(() => { const g = window.__solara; g.player.takeDamage(500); return 1; })()`);
  await delay(6000);
  console.log('after flatlined', await browser.evaluate('JSON.stringify(window.__debugStats())'));
} catch (err) {
  console.log('PLAYTEST ERROR', err.message);
} finally {
  for (const log of browser.logs) {
    if (log.level === 'request' && log.text.startsWith('http://localhost:8080')) continue;
    if (['log', 'info', 'debug', 'verbose'].includes(log.level)) continue;
    errors.push(`[${log.level}] ${log.text}`);
  }
  console.log(errors.length ? errors.join('\n') : 'no console errors');
  await browser.close();
}
