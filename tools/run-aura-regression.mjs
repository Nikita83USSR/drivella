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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('BROWSER CONSOLE:', message.text());
  });

  await page.goto(baseUrl + '/tools/aura-regression.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__AURA_TEST_RESULT__), null, { timeout: 15000 });
  const synthetic = await page.evaluate(() => window.__AURA_TEST_RESULT__);
  await page.screenshot({ path: 'artifacts/aura-synthetic.png' });
  console.log('SYNTHETIC AURA REGRESSION\n' + JSON.stringify(synthetic, null, 2));
  assert(synthetic.pass, 'Synthetic occlusion/bloom test failed: ' + JSON.stringify(synthetic));

  pageErrors.length = 0;
  await page.goto(baseUrl + '/tools/game-shader-compile.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__GAME_SHADER_RESULT__), null, { timeout: 20000 });
  const production = await page.evaluate(() => window.__GAME_SHADER_RESULT__);
  await page.screenshot({ path: 'artifacts/production-shader-compile.png' });
  console.log('PRODUCTION GAME SHADER COMPILE\n' + JSON.stringify(production, null, 2));
  assert(production.pass, 'Production shader compile/source check failed: ' + JSON.stringify(production));
  assert(pageErrors.length === 0, 'Browser page errors: ' + pageErrors.join('\n'));
  console.log('ALL AURA REGRESSION CHECKS PASSED');
} catch (error) {
  console.error('AURA REGRESSION FAILED\n' + (error.stack || error));
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
