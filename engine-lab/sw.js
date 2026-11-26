const CACHE_NAME = "drivella-engine-lab-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./vendor/drivella-engine.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of SHELL) {
      try {
        await cache.add(url);
      } catch (error) {
        // A missing optional or not-yet-built file must not prevent the page from opening.
        console.warn("DRIVELLA cache skipped:", url, error);
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("drivella-engine-lab-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      return new Response("This DRIVELLA asset is not cached yet. Reconnect and retry the download.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
