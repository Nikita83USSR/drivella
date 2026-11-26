import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = 4173;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm"
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let filePath = path.resolve(root, "." + pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader"
  ]
});

let externalRequests = [];
let pageErrors = [];
let browserConsoleErrors = [];
try {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== "http://127.0.0.1:" + port) externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") browserConsoleErrors.push(message.text());
  });

  await page.goto("http://127.0.0.1:" + port + "/engine-lab/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__DRIVELLA_LAB__?.ready === true, { timeout: 60000 });
  await page.waitForFunction(() => window.__DRIVELLA_LAB__?.physicsReady === true, { timeout: 60000 });
  await page.waitForFunction(() => window.__DRIVELLA_LAB__?.probeStableFrames >= 30, { timeout: 30000 });

  const state = await page.evaluate(() => ({
    renderer: window.__DRIVELLA_LAB__.renderer,
    frames: window.__DRIVELLA_LAB__.frames,
    physicsMode: window.__DRIVELLA_LAB__.physicsMode,
    probeY: window.__DRIVELLA_LAB__.probeY,
    probeStableFrames: window.__DRIVELLA_LAB__.probeStableFrames,
    probeX: window.__DRIVELLA_LAB__.probeX,
    probeZ: window.__DRIVELLA_LAB__.probeZ,
    terrainYAtProbe: window.__DRIVELLA_LAB__.terrainYAtProbe,
    spatial: window.__DRIVELLA_LAB__.spatial,
    biomes: window.__DRIVELLA_LAB__.biomes,
    biomeTypes: window.__DRIVELLA_LAB__.biomeTypes
  }));

  if (state.frames < 30) throw new Error("Render loop did not advance enough frames.");
  if (!state.physicsMode.startsWith("havok")) throw new Error("Havok Physics V2 was not initialized.");
  if (state.probeStableFrames < 30) throw new Error("Physics probe did not settle after collision.");
  const probeClearance = state.probeY - 1.5 - state.terrainYAtProbe;
  if (!Number.isFinite(probeClearance) || probeClearance < -0.8 || probeClearance > 8) {
    throw new Error("Physics probe is not resting against the visible terrain surface: " + JSON.stringify({ probeClearance, state }));
  }
  if (!state.biomes || !state.biomeTypes || state.biomeTypes.length < 2) {
    throw new Error("The browser scene did not populate multiple biome regions: " + JSON.stringify(state));
  }
  const propCount = Object.values(state.biomes).reduce((sum, count) => sum + count, 0);
  if (propCount < 8) throw new Error("Biome decoration did not create enough world props: " + JSON.stringify(state.biomes));
  if (!state.spatial || Object.values(state.spatial.axisCoverage).some((covered) => !covered)) {
    throw new Error("Spatial chunk coverage is incomplete in one or more XYZ directions.");
  }
  if (externalRequests.length) throw new Error("Third-party runtime requests detected: " + externalRequests.join(", "));
  if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));
  const unexpectedConsoleErrors = browserConsoleErrors.filter((message) => {
    const expectedWebGpuFallback = state.renderer.startsWith("WebGL")
      && message.includes("A fatal error occurred during WebGPU creation/initialization");
    return !expectedWebGpuFallback;
  });
  if (unexpectedConsoleErrors.length) {
    throw new Error("Unexpected browser console errors: " + unexpectedConsoleErrors.join(" | "));
  }

  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/engine-lab-spatial-preview.png" });
  console.log("ENGINE LAB PASS", JSON.stringify(state));
  console.log("RUNTIME NETWORK PASS: same-origin requests only.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
