import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    // Screenshot 1: Title screen
    console.log('Taking title screen screenshot...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/1-title.jpg', fullPage: false });

    // Screenshot 2: Gameplay (press space to start)
    console.log('Taking gameplay screenshot...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/2-gameplay.jpg', fullPage: false });

    // Screenshot 3: With police
    console.log('Taking police screenshot...');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/3-police.jpg', fullPage: false });

    console.log('Screenshots taken successfully');
  } catch (error) {
    console.error('Error:', error);
  }

  await browser.close();
}

takeScreenshots();
