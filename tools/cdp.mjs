// Minimal Chrome DevTools Protocol driver (Node 22+, standard library only).
// Launches headless Chrome, opens a page, collects console errors and exceptions,
// evaluates expressions, dispatches input and captures JPEG/PNG screenshots.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Chrome not listening yet.
    }
    await delay(250);
  }
  throw new Error(`no answer from ${url}`);
}

export async function launchBrowser({ width = 1280, height = 720, port = 9333, gpu = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'sb-chrome-'));
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars',
    '--mute-audio',
    gpu ? '--enable-gpu' : '--disable-gpu',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let page = null;
  for (let tries = 0; !page && tries < 40; tries += 1) {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    page = targets.find((t) => t.type === 'page');
    if (!page) await delay(250);
  }
  if (!page) throw new Error('Chrome opened no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  const logs = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push({ level: msg.params.type, text });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push({ level: 'exception', text: `${d.exception?.description ?? d.text} @${d.url ?? ''}:${d.lineNumber}` });
    } else if (msg.method === 'Log.entryAdded') {
      logs.push({ level: msg.params.entry.level, text: `${msg.params.entry.text} ${msg.params.entry.url ?? ''}` });
    } else if (msg.method === 'Network.requestWillBeSent') {
      logs.push({ level: 'request', text: msg.params.request.url });
    }
    for (const fn of listeners) fn(msg);
  };
  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    logs,
    send,
    async goto(url) {
      await send('Page.navigate', { url });
    },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, timeoutMs = 60000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          if (await api.evaluate(expression)) return true;
        } catch {
          // page still loading
        }
        await delay(200);
      }
      throw new Error(`timeout waiting for ${expression}`);
    },
    async screenshot(format = 'jpeg', quality = 85) {
      const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? quality : undefined });
      return Buffer.from(r.data, 'base64');
    },
    async key(type, key, code, keyCode) {
      await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
    },
    async mouse(type, x, y, button = 'left') {
      await send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
    },
    async close() {
      try {
        await send('Browser.close');
      } catch {
        // already gone
      }
      ws.close();
      setTimeout(() => proc.kill(), 500);
    },
  };
  return api;
}

export { delay };
