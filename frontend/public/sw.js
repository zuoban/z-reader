const CACHE_NAME = 'z-reader-v0.1.6';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Network-First Strategy: Fetch from network first, fallback to a public cache.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === 'navigate') {
      return caches.match('/');
    }

    return new Response('Offline Content Unavailable', { status: 503 });
  }
}

// Cache-First Strategy: Serve from cache instantly, fetch and store if missing
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline Asset Unavailable', { status: 503 });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 1. Immutable static assets (Foliate-JS & content-hashed Next.js chunks): Cache-First
  // These files are immutable in production, caching them speeds up repeat loads and offline reading.
  if (url.pathname.includes('/foliate/') || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 2. API responses and authenticated shelf views must skip shared Cache Storage
  // so revisiting always validates current library access.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/shelf' ||
    url.pathname.startsWith('/shelf/')
  ) {
    return;
  }

  // 3. Default Next.js pages, CSS, and public images: Network-First
  event.respondWith(networkFirst(request));
});
