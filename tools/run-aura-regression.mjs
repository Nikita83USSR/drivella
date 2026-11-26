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
      // Consume the readiness response before reusing Undici's keep-alive socket.
      await response.arrayBuffer();
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
  await page.waitForFunction(() => Boolean(window.__GAME_SHADER_RESULT__) || document.title.startsWith('FAIL'), null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__GAME_SHADER_RESULT__);
  assert(result, 'Browser test page reported failure without a result object: ' + await page.title());
  await page.screenshot({ path: 'artifacts/derivative-grid-area-light-end-to-end-mirror-build205-regression.png', fullPage: true });
  console.log('PRODUCTION BUILD205: DERIVATIVE GRID + 16-POINT RED AREA LIGHT + VEHICLE MIRROR CAPTURE-TO-ROAD PIXEL REGRESSION\n' + JSON.stringify(result, null, 2));
  assert(result.pass, 'Production shader regression failed: ' + JSON.stringify(result));
  assert(pageErrors.length === 0, 'Browser page errors: ' + pageErrors.join('\\n'));
  console.log('ALL BUILD 205 DERIVATIVE GRID/16-POINT AREA LIGHT/REAL MIRROR-TO-ASPHALT PIXELS/SHADER/VEHICLE CHECKS PASSED');


  // Release the shader-fixture WebGL context before the live game allocates its own renderer targets.
  await page.close();
  // Launch the actual production game in the foreground and require a non-empty live mirror capture.
  const gamePage = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  gamePage.on('pageerror', error => pageErrors.push(error.stack || error.message));
  gamePage.on('console', message => {
    if (message.type() === 'error') console.error('GAME BROWSER CONSOLE:', message.text());
  });
  await gamePage.bringToFront();
  await gamePage.goto(baseUrl + '/', { waitUntil: 'load', timeout: 20000 });
  try {
    await gamePage.waitForSelector('#main-menu.show', { timeout: 20000 });
  } catch (error) {
    let startupState = null;
    try {
      startupState = await gamePage.evaluate(() => ({
        title: document.title,
        bodyClass: document.body.className,
        bootScreen: document.getElementById('boot-screen')?.className,
        bootStatus: document.getElementById('boot-status')?.innerText,
        bootPercent: document.getElementById('boot-percent')?.innerText,
        menuClass: document.getElementById('main-menu')?.className
      }));
      await gamePage.screenshot({ path: 'artifacts/build205-live-game-startup-failure.png', fullPage: true });
    } catch (_) {}
    throw new Error('Live game boot diagnostics: ' + JSON.stringify({ startupState, pageErrors }) + ' // ' + error.message);
  }
  await gamePage.locator('#menu-start').click();
  await gamePage.locator('#debug-toggle').click();
  await gamePage.waitForFunction(() => {
    const value = document.getElementById('debug-data')?.innerText || '';
    return value.includes('CAR REFLECTION TARGET') && value.includes('MESHES');
  }, null, { timeout: 45000 });
  await gamePage.waitForFunction(() => {
    const value = document.getElementById('debug-data')?.innerText || '';
    return value.includes('MIRROR CAPTURE READY') && /\\b[1-9][0-9]* MESHES\\b/.test(value);
  }, null, { timeout: 45000 });
  await gamePage.screenshot({ path: 'artifacts/build205-live-game-reflection-capture-smoke.png', fullPage: true });
  const liveReflectionDiagnostics = await gamePage.locator('#debug-data').innerText();
  assert(/MIRROR CAPTURE READY/.test(liveReflectionDiagnostics), 'Live game did not produce a READY planar vehicle reflection: ' + liveReflectionDiagnostics);
  assert(/\\b[1-9][0-9]* MESHES\\b/.test(liveReflectionDiagnostics), 'Live game mirror capture has no vehicle meshes: ' + liveReflectionDiagnostics);
  assert(pageErrors.length === 0, 'Game browser page errors: ' + pageErrors.join('\\n'));
  console.log('BUILD 205 LIVE GAME MIRROR CAPTURE // ' + liveReflectionDiagnostics.replace(/\\s+/g, ' '));
  await gamePage.close();

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
  const rearSignalBars = { left:[], right:[] };
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
      if(part.name==='bodyTail'){
        const centerX=triangle.reduce((sum,p)=>sum+p[0],0)/3;
        if(Math.abs(centerX)>.935)rearSignalBars[centerX<0?'left':'right'].push(triangle);
      }
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
  const signalIndicesMatch = productionIndex.match(/const COUNTACH_FRONT_TURN_SIGNAL_INDICES=(\[[^;]+\]),COUNTACH_FRONT_FOG_LAMP_INDICES=(\[[^;]+\]);/);
  assert(signalIndicesMatch, 'Front turn/fog lamp roles are missing');
  const turnIndices=JSON.parse(signalIndicesMatch[1]),fogIndices=JSON.parse(signalIndicesMatch[2]);
  assert(JSON.stringify(turnIndices)==='[0,3]'&&JSON.stringify(fogIndices)==='[1,2]','Front lamps must use outer lenses for amber signals and inner lenses for white fog lamps');
  assert(centres.length===4 && lowerLampPads.length===8, 'Expected four lower lamps fitted over eight source bumper triangles');
  for(const [x,y,z] of centres)assert(Math.abs(x)>=.62&&Math.abs(x)<=1.07&&y>=.57&&y<=.68&&z>=2.47&&z<=2.71,'Lower lamp is outside the imported Countach bumper pad: '+JSON.stringify([x,y,z]));
  assert(partBounds.bodyTail.triangles===12,'Expected the original 12-triangle rear tail-light element');
  assert(rearSignalBars.left.length===2&&rearSignalBars.right.length===2,'Expected two source triangles per outer rear indicator bar');
  assert(rearSignalBars.left.concat(rearSignalBars.right).every(tri=>tri.every(p=>Math.abs(p[2]+2.6039)<.0002)),'Rear indicator overlays are not fitted to the source tail-light plane');
  assert(productionIndex.includes('for(const p of triangle)signalBuffer.push(p[0],p[1],p[2]-.004);'),'Rear indicator overlay must be offset only 4 mm behind the source lens, not replace body geometry');
  assert(productionIndex.includes('rearSignalGeometry.left.length!==18||rearSignalGeometry.right.length!==18'),'Runtime must validate the two-triangle rear signal submeshes');
  const rearLampPointsMatch=productionIndex.match(/const COUNTACH_REAR_LAMP_FLARE_POINTS=(\[[^;]+\]);/);
  const rearSignalPointsMatch=productionIndex.match(/const COUNTACH_REAR_SIGNAL_FLARE_POINTS=(\[[^;]+\]);/);
  assert(rearLampPointsMatch&&rearSignalPointsMatch,'Rear lamp optical flare anchors are missing');
  const rearLampPoints=JSON.parse(rearLampPointsMatch[1]),rearSignalPoints=JSON.parse(rearSignalPointsMatch[1]);
  assert(rearLampPoints.length===2&&rearSignalPoints.length===2,'Expected left/right rear flare anchors');
  for(const [x,y,z] of rearLampPoints)assert(Math.abs(x)>=.74&&Math.abs(x)<=.95&&y>=partBounds.bodyTail.min[1]&&y<=partBounds.bodyTail.max[1]&&z<partBounds.bodyTail.min[2]&&z>=partBounds.bodyTail.min[2]-.01,'Rear brake/tail flare is not attached to the source centre lens bar: '+JSON.stringify([x,y,z]));
  for(const [x,y,z] of rearSignalPoints)assert(Math.abs(x)>=.94&&Math.abs(x)<=partBounds.bodyTail.max[0]&&y>=partBounds.bodyTail.min[1]&&y<=partBounds.bodyTail.max[1]&&z<partBounds.bodyTail.min[2]&&z>=partBounds.bodyTail.min[2]-.01,'Rear indicator flare is not attached to the source outer lens bar: '+JSON.stringify([x,y,z]));
  const inlineScriptMatch=productionIndex.match(/<script>([\s\S]*?)<\/script>/i);
  assert(inlineScriptMatch&&inlineScriptMatch[1].trim(),'Production inline JavaScript was not found');
  new Function(inlineScriptMatch[1]);
  console.log('BUILD 201 COUNTACH LAMP GEOMETRY // PLACEMENT CHECK\\n'+JSON.stringify({centres,turnIndices,fogIndices,rearSignalTriangles:{left:rearSignalBars.left.length,right:rearSignalBars.right.length},rearLampPoints,rearSignalPoints,sourceTailBounds:partBounds.bodyTail,sourcePads:lowerLampPads.map(p=>p.center),bumperBodyBlackBounds:partBounds.bodyBlack},null,2));
} catch (error) {
  console.error('VEHICLE LIGHTING REGRESSION FAILED\n' + (error.stack || error));
  console.error(serverOutput.join(''));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
