// Water Classroom service worker — offline-capable PWA caching.
// Strategies:
//   API (/api/*)            → network only (never cache user data)
//   Navigations (HTML)      → network first, fallback to cached shell (offline SPA)
//   Fonts (Google + local)  → stale-while-revalidate (dedicated cache)
//   Same-origin JS/CSS      → stale-while-revalidate (dedicated cache)
//   Images                  → cache first, cap entries (dedicated cache)
//   Everything else (GET)   → stale-while-revalidate (generic runtime cache)

const VERSION = "water-classroom-v4";
const STATIC_CACHE = `${VERSION}-static`;
const FONT_CACHE = `${VERSION}-fonts`;
const IMAGE_CACHE = `${VERSION}-images`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const ALL_CACHES = [STATIC_CACHE, FONT_CACHE, IMAGE_CACHE, RUNTIME_CACHE];
const MAX_IMAGE_ENTRIES = 80;

const APP_SHELL = [
  "/",
  "/index.html",
  "/index.js",
  "/tailwind.css",
  "/index.css",
  "/icon.jpg",
  "/manifest.json",
  "/neue_frutiger_world_regular.ttf",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Precaching app shell + fonts + css + js + images...");
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!ALL_CACHES.includes(key)) {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

function isCacheable(res) {
  // Cache OK responses and opaque cross-origin responses (e.g. font files).
  return !!res && (res.status === 200 || res.type === "opaque");
}

function putInCache(cacheName, request, response) {
  if (!isCacheable(response)) return Promise.resolve();
  return caches.open(cacheName).then((cache) => cache.put(request, response.clone()).catch(() => {}));
}

function trimCache(cacheName, maxEntries) {
  caches.open(cacheName).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > maxEntries) {
        cache.delete(keys[0]).then(() => trimCache(cacheName, maxEntries));
      }
    });
  });
}

// Stale-while-revalidate: serve cache instantly, refresh in background.
function staleWhileRevalidate(cacheName, request, fetchEvent) {
  return caches.match(request).then((cached) => {
    const network = fetch(request).then((networkRes) => {
      putInCache(cacheName, request, networkRes);
      return networkRes;
    }).catch(() => cached);
    return cached || network;
  });
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1. API calls are never cached.
  if (url.pathname.startsWith("/api/")) return;

  // 2. Navigations: network first so users get fresh HTML, cached shell offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).then((networkRes) => {
        putInCache(STATIC_CACHE, "/index.html", networkRes);
        return networkRes;
      }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 3. Fonts: Google Fonts (CSS + woff2) and local font files.
  const isFont =
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url.pathname);
  if (isFont) {
    e.respondWith(staleWhileRevalidate(FONT_CACHE, request, e));
    return;
  }

  // 4. Images (same-origin + remote lesson/game art): cache first, cap size.
  const isImage =
    request.destination === "image" ||
    /\.(png|jpe?g|gif|webp|avif|svg|ico)(\?|$)/i.test(url.pathname);
  if (isImage) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkRes) => {
          putInCache(IMAGE_CACHE, request, networkRes).then(() => trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES));
          return networkRes;
        });
      })
    );
    return;
  }

  // 5. Same-origin JS/CSS: stale-while-revalidate.
  const isScriptOrStyle =
    request.destination === "script" ||
    request.destination === "style" ||
    /\.(js|mjs|css)(\?|$)/i.test(url.pathname);
  if (isScriptOrStyle && url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(STATIC_CACHE, request, e));
    return;
  }

  // 6. Everything else GET (same-origin): stale-while-revalidate runtime cache.
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(RUNTIME_CACHE, request, e));
  }
});
