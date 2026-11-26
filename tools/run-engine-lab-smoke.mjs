import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
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
  await page.waitForFunction(() => {
    const y = window.__DRIVELLA_LAB__?.probeY;
    return Number.isFinite(y) && y < 6 && y > -5;
  }, { timeout: 25000 });

  const state = await page.evaluate(() => ({
    renderer: window.__DRIVELLA_LAB__.renderer,
    frames: window.__DRIVELLA_LAB__.frames,
    physicsMode: window.__DRIVELLA_LAB__.physicsMode,
    probeY: window.__DRIVELLA_LAB__.probeY
  }));

  if (state.frames < 30) throw new Error("Render loop did not advance enough frames.");
  if (!state.physicsMode.startsWith("havok")) throw new Error("Havok Physics V2 was not initialized.");
  if (externalRequests.length) throw new Error("Third-party runtime requests detected: " + externalRequests.join(", "));
  if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));
  if (browserConsoleErrors.length) throw new Error("Browser console errors: " + browserConsoleErrors.join(" | "));

  console.log("ENGINE LAB PASS", JSON.stringify(state));
  console.log("RUNTIME NETWORK PASS: same-origin requests only.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
