const CACHE_NAME = 'z-reader-v3';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/shelf',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Network-First Strategy: Fetch from internet first, fallback to cached copy
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
    if (response && response.status === 200) {
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

  // Only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 1. Foliate-JS libraries & Reader static core assets: Cache-First
  // These files are static and never change in production, caching them speeds up load and enables offline reading.
  if (url.pathname.includes('/foliate/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 2. Uploaded books & covers: Cache-First
  // Cached once loaded to enable offline reading and save cellular data.
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Dynamic API Endpoints for Offline PWA support: Network-First
  // - /api/verify: Cache verification so user isn't kicked to /login when offline!
  // - /api/books: Cache the shelf list so user sees their books offline.
  // - /api/progress: Cache user reading progress locally.
  if (
    url.pathname.startsWith('/api/verify') ||
    url.pathname.startsWith('/api/books') ||
    url.pathname.startsWith('/api/progress')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 4. Other Dynamic API requests (auth login, user management etc.): Do not cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 5. Default Next.js pages, page chunks, CSS, and images: Network-First
  event.respondWith(networkFirst(request));
});
