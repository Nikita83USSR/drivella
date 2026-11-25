import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4173';
const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe']
});
let browser;
let diagnosticPage;
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
  console.error('AURA REGRESSION FAILED\\n' + (error.stack || error));
  if (diagnosticPage) {
    try {
      console.error('PAGE DIAGNOSTICS:', JSON.stringify({
        url: diagnosticPage.url(),
        title: await diagnosticPage.title(),
        body: (await diagnosticPage.locator('body').innerText().catch(() => '')).slice(0, 1000)
      }));
      await diagnosticPage.screenshot({ path: 'artifacts/failure-page.png', fullPage: true }).catch(() => {});
    } catch {}
  }
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
