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
      const response = await fetch(baseUrl + '/tools/game-shader-compile.html');
      if (response.ok) return;
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error('Local test server did not start: ' + String(lastError));
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('BROWSER CONSOLE:', message.text());
  });

  await page.goto(baseUrl + '/tools/game-shader-compile.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__GAME_SHADER_RESULT__), null, { timeout: 20000 });
  const result = await page.evaluate(() => window.__GAME_SHADER_RESULT__);
  await page.screenshot({ path: 'artifacts/sun-bloom-build179.png', fullPage: true });
  console.log('PRODUCTION SHADER + COUNTACH GEOMETRY REGRESSION\n' + JSON.stringify(result, null, 2));
  assert(result.pass, 'Production shader regression failed: ' + JSON.stringify(result));
  assert(pageErrors.length === 0, 'Browser page errors: ' + pageErrors.join('\n'));
  console.log('ALL SHADER REGRESSION CHECKS PASSED');
  const gamePage = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const gamePageErrors = [];
  gamePage.on('pageerror', error => gamePageErrors.push(error.stack || error.message));
  await gamePage.goto(baseUrl + '/index.html', { waitUntil: 'load', timeout: 25000 });
  await gamePage.waitForFunction(() => Boolean(window.DRIVELLA_COUNTACH_GEOMETRY_BOUNDS), null, { timeout: 25000 });
  const modelGeometry = await gamePage.evaluate(() => ({ ready: typeof countachModelReady !== 'undefined' && countachModelReady, bounds: window.DRIVELLA_COUNTACH_GEOMETRY_BOUNDS }));
  assert(modelGeometry.ready, 'Imported Countach geometry did not finish loading');
  assert(gamePageErrors.length === 0, 'Game startup page errors: ' + gamePageErrors.join('\\n'));
  console.log('COUNTACH MODEL PART BOUNDS\\n' + JSON.stringify(modelGeometry.bounds, null, 2));
  await gamePage.close();
} catch (error) {
  console.error('WIDE-BODY SUN BLOOM REGRESSION FAILED\n' + (error.stack || error));
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
