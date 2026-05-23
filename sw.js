// ── SERVICE WORKER — Catálogo de Videos ─────────────────────────────
// v4 — 2026-05-23
// Estrategia:
//   • index.html  → siempre red (garantiza actualizaciones inmediatas)
//   • CSV         → siempre red, fallback a caché offline
//   • thumbnails  → siempre red, sin caché (evita imágenes viejas)
//   • resto       → caché primero, red como fallback

const CACHE_NAME = 'catalogo-videos-v4';
const SHELL_URLS = [
  './manifest.json',
];

// ── INSTALL ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  );
  // Activar de inmediato sin esperar a que se cierren las pestañas viejas
  self.skipWaiting();
});

// ── ACTIVATE: limpiar caches viejas ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Eliminando cache vieja:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1. index.html → siempre red (actualizaciones instantáneas)
  if (url.endsWith('index.html') || url.endsWith('/CatalogoVideos/') || url.endsWith('/CatalogoVideos')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2. CSV del Sheet → red primero, guardar en caché para offline
  if (url.includes('docs.google.com') && url.includes('output=csv')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Thumbnails de Drive → solo red, nunca caché (evita imágenes obsoletas)
  if (
    url.includes('drive.google.com/thumbnail') ||
    url.includes('lh3.googleusercontent.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // 4. Videos de Drive (/preview) → solo red, sin interceptar
  if (url.includes('drive.google.com/file')) {
    return; // El navegador lo maneja directamente
  }

  // 5. Resto (assets estáticos) → caché primero, red como fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (
          response &&
          response.status === 200 &&
          (response.type === 'basic' || response.type === 'cors')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
