/* ═══════════════════════════════════════════════════════════════
   sw.js — Service Worker for 日本語深層學習アプリ
   Strategy:
     • App shell (index.html, JS, CSS icons) → Cache-first, update in background
     • Dict data files (n5_dict.js etc.)      → Cache-first (large, rarely change)
     • Firebase / Google APIs                 → Network-only (never cache auth)
     • Everything else                        → Network-first, cache fallback
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME  = 'jp-app-v1';
const SHELL_CACHE = 'jp-shell-v1';
const DICT_CACHE  = 'jp-dict-v1';

// Core app shell — cached on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/firebase-config.js',
  '/firebase-sync.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  '/manifest.json',
];

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      // addAll fails if any resource 404s — use individual fetches to be safe
      Promise.allSettled(
        SHELL_ASSETS.map(url =>
          fetch(url).then(res => { if (res.ok) cache.put(url, res); })
                    .catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== DICT_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ───────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin Firebase / Google auth requests
  if (request.method !== 'GET') return;
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('google')) return;

  // Dict data files — cache-first (they're large and stable)
  if (url.pathname.includes('_dict.js') || url.pathname === '/pitch_accent.js') {
    event.respondWith(cacheFirst(request, DICT_CACHE));
    return;
  }

  // App shell — cache-first, refresh in background (stale-while-revalidate)
  if (SHELL_ASSETS.some(a => url.pathname === a || url.pathname === a + 'index.html')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Default: network-first, fall back to cache
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── Strategies ────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(fresh => {
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
