// ── SERVICE WORKER — Catálogo de Videos ────────────────────────
// Estrategia: cache-first para el shell de la app,
//             network-first para el CSV (datos siempre frescos).

const CACHE_NAME  = 'catalogo-videos-v1';
const CACHE_URLS  = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
];

// ── INSTALL: cachear el shell de la app ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: limpiar caches viejos ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: estrategia según tipo de recurso ───────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // CSV → siempre red primero (datos frescos), fallback a cache
  if (url.includes('docs.google.com') && url.includes('output=csv')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Thumbnails de Drive → red con fallback silencioso
  if (url.includes('drive.google.com/thumbnail')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // App shell → cache first, fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback para navegación
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
