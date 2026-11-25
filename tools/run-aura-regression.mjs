import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4173';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe']
});
let browser;
const serverOutput = [];
server.stdout.on('data', chunk => serverOutput.push(String(chunk)));
server.stderr.on('data', chunk => serverOutput.push(String(chunk)));

async function waitForServer() {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl + '/tools/aura-regression.html');
      if (response.ok) return;
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error('Local test server did not start: ' + String(lastError) + '\n' + serverOutput.join(''));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await mkdir('artifacts', { recursive: true });
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage'
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));

  await page.goto(baseUrl + '/tools/aura-regression.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__AURA_TEST_RESULT__), null, { timeout: 15000 });
  const synthetic = await page.evaluate(() => window.__AURA_TEST_RESULT__);
  await page.screenshot({ path: 'artifacts/aura-synthetic.png' });
  console.log('SYNTHETIC AURA REGRESSION\n' + JSON.stringify(synthetic, null, 2));
  assert(synthetic.pass, 'Synthetic occlusion/bloom test failed: ' + JSON.stringify(synthetic));

  pageErrors.length = 0;
  await page.goto(baseUrl + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const label = document.querySelector('#version-label')?.textContent || '';
    return label.includes('v0.19.01') || Boolean(document.querySelector('#boot-status')?.textContent?.startsWith('ОШИБКА ЗАПУСКА'));
  }, null, { timeout: 20000 });
  const boot = await page.evaluate(() => ({
    version: document.querySelector('#version-label')?.textContent || '',
    status: document.querySelector('#boot-status')?.textContent || '',
    bootDone: document.querySelector('#boot-screen')?.classList.contains('done') || false,
    webgl: (() => {
      const canvas = document.querySelector('#scene');
      const gl = canvas?.getContext('webgl');
      return gl ? gl.getParameter(gl.VERSION) : null;
    })()
  }));
  assert(boot.version.includes('v0.19.01 · BUILD 167'), 'Unexpected live game version: ' + JSON.stringify(boot));
  assert(!boot.status.startsWith('ОШИБКА ЗАПУСКА'), 'Game startup error: ' + boot.status);
  assert(Boolean(boot.webgl), 'Game did not create a WebGL context');
  await page.waitForFunction(() => document.querySelector('#boot-screen')?.classList.contains('done'), null, { timeout: 20000 });

  await page.keyboard.press('F4');
  const debugToggle = page.locator('[data-fx="sunAuraDebug"]');
  await debugToggle.check();
  await page.waitForTimeout(500);
  const gameState = await page.evaluate(() => {
    const canvas = document.querySelector('#scene');
    const gl = canvas?.getContext('webgl');
    return {
      effectsMenuOpen: document.querySelector('#effects-menu')?.classList.contains('show') || false,
      debugChecked: document.querySelector('[data-fx="sunAuraDebug"]')?.checked || false,
      glVersion: gl ? gl.getParameter(gl.VERSION) : null,
      glError: gl ? gl.getError() : null,
      bootStatus: document.querySelector('#boot-status')?.textContent || ''
    };
  });
  await page.screenshot({ path: 'artifacts/drivella-build167-smoke.png' });
  assert(gameState.effectsMenuOpen, 'F4 effects menu did not open');
  assert(gameState.debugChecked, 'Object aura bloom diagnostic did not enable');
  assert(gameState.glError === 0, 'WebGL error after enabling bloom diagnostic: ' + gameState.glError);
  assert(pageErrors.length === 0, 'Runtime JavaScript/page errors: ' + pageErrors.join('\n'));
  console.log('LIVE GAME WEBGL SMOKE\n' + JSON.stringify({ boot, gameState, pageErrors }, null, 2));
  console.log('ALL AURA REGRESSION CHECKS PASSED');
} catch (error) {
  console.error('AURA REGRESSION FAILED\n' + (error.stack || error));
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
