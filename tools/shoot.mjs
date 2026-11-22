// Captures the screenshots listed in shots.json from the real game in headless Chrome
// (1280x720 JPEG, quality lowered until each file is at most 256 KiB).
// Usage: node tools/shoot.mjs [outDir] [onlyName]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, delay } from './cdp.mjs';

const outDir = process.argv[2] ?? 'screenshots';
const only = process.argv[3];
const shots = JSON.parse(readFileSync('shots.json', 'utf8'));
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser({ width: 1280, height: 720 });
try {
  for (const shot of shots) {
    if (only && shot.name !== only) continue;
    browser.logs.length = 0;
    await browser.goto('about:blank');
    await browser.waitFor('location.href === "about:blank"', 10000);
    const url = `http://localhost:8080/index.html${shot.query}`;
    await browser.goto(url);
    await browser.waitFor(`location.href === ${JSON.stringify(url)} && window.__shotReady === true`, 90000);
    await delay(400);
    let quality = 92;
    let data = await browser.screenshot('jpeg', quality);
    while (data.length > 256 * 1024 && quality > 40) {
      quality -= 4;
      data = await browser.screenshot('jpeg', quality);
    }
    writeFileSync(join(outDir, shot.name), data);
    console.log(`${shot.name}: ${(data.length / 1024).toFixed(1)} KiB at q${quality}`);
    for (const log of browser.logs) {
      if (log.level === 'request' && log.text.startsWith('http://localhost:8080')) continue;
      if (['log', 'info', 'debug', 'verbose'].includes(log.level)) continue;
      console.log(`  [${log.level}] ${log.text}`);
    }
  }
} finally {
  await browser.close();
}
