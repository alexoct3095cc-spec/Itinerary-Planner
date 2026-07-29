const CACHE = "next-stop-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  // cache.addAll() is atomic — if even ONE url in the list 404s, the WHOLE
  // install fails and nothing gets cached at all. That's exactly what
  // happened here: a missing icon file broke caching for everything,
  // including the actual app files that were fine. Caching each asset
  // independently means one bad file can't take the rest down with it.
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn(`Service worker: couldn't cache ${url} (continuing anyway):`, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // Only ever intercept same-origin requests. This was missing before —
  // the fetch handler ran for EVERY GET request regardless of destination,
  // including third-party API calls (Wikipedia, weather, etc.) and,
  // notably, anything involved in Google/Firebase's own sign-in redirect
  // flow. Service workers interfering with cross-origin auth redirects is a
  // known, documented way for signInWithRedirect to silently misbehave —
  // scoping this to same-origin only removes the service worker as a
  // variable in that flow entirely, regardless of whether it was the actual
  // cause here.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  // Network-first for the main document. This project is under active
  // development — a cache-first strategy here meant an update could go live
  // on GitHub Pages and never actually reach an already-installed device
  // until the cache name was manually bumped (which is exactly what
  // happened: several rounds of real fixes went out while anyone with the
  // app already cached kept silently seeing an old snapshot). Falls back to
  // the cache only when genuinely offline, so offline use still works.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest) — these change
  // rarely, and cache-first keeps them loading instantly.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
