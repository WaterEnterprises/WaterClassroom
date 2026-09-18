const CACHE_NAME = "water-classroom-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/index.js",
  "/tailwind.css",
  "/index.css",
  "/icon.png",
  "/manifest.json",
  "/neue_frutiger_world_regular.ttf"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching app shell and core assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache first with network fallback for static assets
self.addEventListener("fetch", (e) => {
  // Avoid caching API calls or chrome-extension requests
  if (e.request.url.startsWith("http") && !e.request.url.includes("/api/")) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch from network in background to refresh cache
          fetch(e.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          }).catch(() => {/* Ignore network errors of background updates */});
          
          return cachedResponse;
        }
        
        return fetch(e.request);
      })
    );
  }
});
