import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
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
  await page.screenshot({ path: 'artifacts/vehicle-lighting-build180.png', fullPage: true });
  console.log('PRODUCTION SHADER + VEHICLE LIGHTING REGRESSION\n' + JSON.stringify(result, null, 2));
  assert(result.pass, 'Production shader regression failed: ' + JSON.stringify(result));
  assert(pageErrors.length === 0, 'Browser page errors: ' + pageErrors.join('\n'));
  console.log('ALL SHADER AND VEHICLE LIGHTING CHECKS PASSED');
  const metaScript = await readFile('assets/countach_model_0.js', 'utf8');
  const metaMatch = metaScript.match(/window\.DRIVELLA_COUNTACH_META=(\{[\s\S]*?\});/);
  assert(metaMatch, 'Countach metadata JSON was not found');
  const modelMeta = JSON.parse(metaMatch[1]);
  const chunkNames = ['0a','0b','0c','0d','1','2','3a','3b','3c','3d'];
  let encodedModel = '';
  for (const chunk of chunkNames) {
    const source = await readFile('assets/countach_model_' + chunk + '.js', 'utf8');
    const part = source.match(/window\.DRIVELLA_COUNTACH_DATA\+='([^']+)'/);
    assert(part, 'Countach geometry chunk is missing: ' + chunk);
    encodedModel += part[1];
  }
  const rawModel = inflateSync(Buffer.from(encodedModel, 'base64'));
  assert(rawModel.byteLength === modelMeta.rawBytes, 'Countach decompressed size mismatch: ' + rawModel.byteLength);
  const modelView = new DataView(rawModel.buffer, rawModel.byteOffset, rawModel.byteLength);
  const partBounds = {};
  const lowerLampPads = [];
  for (const part of modelMeta.parts) {
    const bounds = { min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity], triangles:0 };
    for (let offset=0; offset<part.indexCount; offset+=3) {
      const triangle = [];
      for (let corner=0; corner<3; corner++) {
        const vertex = modelView.getUint16(part.indexOffset+(offset+corner)*2, true);
        const v = part.vertexOffset + vertex*6;
        triangle.push([
          modelView.getInt16(v,true)/modelMeta.unitsPerGameUnit,
          modelView.getInt16(v+2,true)/modelMeta.unitsPerGameUnit,
          modelView.getInt16(v+4,true)/modelMeta.unitsPerGameUnit
        ]);
      }
      for (const point of triangle) for(let axis=0;axis<3;axis++) {
        bounds.min[axis]=Math.min(bounds.min[axis],point[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],point[axis]);
      }
      bounds.triangles++;
      if(part.name==='bodyBlack' && triangle.every(p=>Math.abs(p[0])>=.62&&Math.abs(p[0])<=1.07&&p[1]>=.57&&p[1]<=.68&&p[2]>=2.47&&p[2]<=2.71)) {
        lowerLampPads.push({ center:triangle[0].map((_,axis)=>triangle.reduce((sum,p)=>sum+p[axis],0)/3), vertices:triangle });
      }
    }
    partBounds[part.name]=bounds;
  }
  const productionIndex = await readFile('index.html', 'utf8');
  const centresMatch = productionIndex.match(/const COUNTACH_FOG_LAMP_CENTERS=(\[[^;]+\]);/);
  assert(centresMatch, 'Countach lower lamp source positions are missing');
  const centres = JSON.parse(centresMatch[1]);
  assert(centres.length===4 && lowerLampPads.length===8, 'Expected four lower lamps fitted over eight source bumper triangles');
  for(const [x,y,z] of centres)assert(Math.abs(x)>=.62&&Math.abs(x)<=1.07&&y>=.57&&y<=.68&&z>=2.47&&z<=2.71,'Lower lamp is outside the imported Countach bumper pad: '+JSON.stringify([x,y,z]));
  console.log('COUNTACH LOWER LIGHTS // PLACEMENT CHECK\\n'+JSON.stringify({centres,sourcePads:lowerLampPads.map(p=>p.center),bodyBounds:partBounds.bodyPaint,blackBounds:partBounds.bodyBlack},null,2));
} catch (error) {
  console.error('VEHICLE LIGHTING REGRESSION FAILED\n' + (error.stack || error));
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
