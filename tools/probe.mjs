// Opens the game in headless Chrome, waits, optionally runs a script of steps, prints every
// console error/warning/exception and any non-local network request, and saves a screenshot.
// Usage: node tools/probe.mjs <path-and-query> <out.jpg> [seconds] [steps.json]
// steps.json: [{"eval":"js"}, {"key":"w","down":true}, {"wait":1000}, {"shot":"file.jpg"}]
import { readFileSync, writeFileSync } from 'node:fs';
import { launchBrowser, delay } from './cdp.mjs';

const [, , path = '/', out = 'probe.jpg', seconds = '6', stepsFile] = process.argv;
const KEYCODES = { w: 87, a: 65, s: 83, d: 68, f: 70, ' ': 32, Shift: 16, Escape: 27, Enter: 13, e: 69, q: 81, m: 77, h: 72, r: 82, Tab: 9, '1': 49, '2': 50, '3': 51, '4': 52 };
const CODES = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', f: 'KeyF', ' ': 'Space', Shift: 'ShiftLeft', Escape: 'Escape', Enter: 'Enter', e: 'KeyE', q: 'KeyQ', m: 'KeyM', h: 'KeyH', r: 'KeyR', Tab: 'Tab', '1': 'Digit1', '2': 'Digit2', '3': 'Digit3', '4': 'Digit4' };

const browser = await launchBrowser();
try {
  await browser.goto(`http://localhost:8080/${path.replace(/^\/+/, '')}`);
  await delay(Number(seconds) * 1000);
  if (stepsFile) {
    const steps = JSON.parse(readFileSync(stepsFile, 'utf8'));
    for (const step of steps) {
      if (step.eval) console.log('eval →', JSON.stringify(await browser.evaluate(step.eval)));
      if (step.key) await browser.key(step.down === false ? 'keyUp' : 'keyDown', step.key, CODES[step.key] ?? step.key, KEYCODES[step.key] ?? 0);
      if (step.click) await browser.mouse('mousePressed', step.click[0], step.click[1]).then(() => browser.mouse('mouseReleased', step.click[0], step.click[1]));
      if (step.wait) await delay(step.wait);
      if (step.shot) writeFileSync(step.shot, await browser.screenshot('jpeg', 85));
    }
  }
  try {
    const stats = await browser.evaluate('JSON.stringify(window.__debugStats ? window.__debugStats() : null)');
    console.log('stats:', stats);
  } catch (err) {
    console.log('stats error', err.message);
  }
  writeFileSync(out, await browser.screenshot('jpeg', 85));
  for (const log of browser.logs) {
    if (log.level === 'request' && log.text.startsWith('http://localhost:8080')) continue;
    if (log.level === 'request' && log.text.startsWith('data:')) continue;
    if (['log', 'info', 'debug', 'verbose'].includes(log.level)) {
      console.log(`[${log.level}] ${log.text}`);
      continue;
    }
    console.log(`[${log.level}] ${log.text}`);
  }
} finally {
  await browser.close();
}
