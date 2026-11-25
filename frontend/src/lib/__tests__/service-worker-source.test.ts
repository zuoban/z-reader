import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
const performanceBudget = JSON.parse(
  readFileSync(resolve(process.cwd(), 'performance-budget.json'), 'utf8')
) as {
  offline: { staticShellRoutes: string[]; minHitRate: number };
};

function extractStaticAssets(source: string): string[] {
  const match = source.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error('STATIC_ASSETS list not found in public/sw.js');
  }
  return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
}

describe('service worker privacy policy', () => {
  it('does not cache authenticated API responses', () => {
    expect(serviceWorkerSource).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorkerSource).not.toContain("startsWith('/api/books')");
    expect(serviceWorkerSource).not.toContain("startsWith('/api/progress')");
    expect(serviceWorkerSource).not.toContain("startsWith('/api/verify')");
  });

  it('does not pre-cache the authenticated shelf route', () => {
    const assets = extractStaticAssets(serviceWorkerSource);
    expect(assets).not.toContain('/shelf');
  });

  it('skips shared cache storage for /shelf routes', () => {
    expect(serviceWorkerSource).toContain("url.pathname === '/shelf'");
    expect(serviceWorkerSource).toContain("url.pathname.startsWith('/shelf/')");
  });

  it('uses cache-first for immutable Next.js static chunks', () => {
    expect(serviceWorkerSource).toContain("url.pathname.startsWith('/_next/static/')");
  });

  it('lets HTTP revalidate standalone Foliate files and caches the versioned reader', async () => {
    type FetchHandler = (event: {
      request: Request;
      respondWith: (response: Promise<Response>) => void;
    }) => void;
    const handlers = new Map<string, FetchHandler>();
    const origin = 'https://reader.test';
    const cachedReader = new Response('versioned reader');
    runInNewContext(serviceWorkerSource, {
      URL,
      self: { location: { origin }, addEventListener: handlers.set.bind(handlers) },
      caches: { match: async () => cachedReader },
    });

    const respondWith = vi.fn<(response: Promise<Response>) => void>();
    const fetchHandler = handlers.get('fetch')!;
    fetchHandler({ request: new Request(`${origin}/foliate/view.js`), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    fetchHandler({ request: new Request(`${origin}/foliate/built/abc/view.js`), respondWith });
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedReader);
  });

  it('ignores cross-origin requests in the fetch handler', () => {
    expect(serviceWorkerSource).toContain('url.origin !== self.location.origin');
  });

  it('returns 503 for offline navigate requests when / is uncached and falls back to / when cached', async () => {
    type FetchHandler = (event: {
      request: { url: string; method: string; mode: string };
      respondWith: (response: Promise<Response>) => void;
    }) => void;
    const origin = 'https://reader.test';

    // Case 1: '/' is not in cache -> must resolve to 503 Response, not undefined
    const handlersUncached = new Map<string, FetchHandler>();
    runInNewContext(serviceWorkerSource, {
      URL,
      Response,
      self: { location: { origin }, addEventListener: handlersUncached.set.bind(handlersUncached) },
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      caches: {
        open: vi.fn().mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) }),
        match: vi.fn().mockResolvedValue(undefined),
      },
    });

    const respondWithUncached = vi.fn<(response: Promise<Response>) => void>();
    handlersUncached.get('fetch')!({
      request: { url: `${origin}/reader/1`, method: 'GET', mode: 'navigate' },
      respondWith: respondWithUncached,
    });
    const offlineResponse = await respondWithUncached.mock.calls[0]?.[0];
    expect(offlineResponse).toBeInstanceOf(Response);
    expect(offlineResponse?.status).toBe(503);
    expect(await offlineResponse?.text()).toBe('Offline Content Unavailable');

    // Case 2: '/' is cached -> returns the cached shell response
    const shellResponse = new Response('<html>shell</html>', { status: 200 });
    const handlersCached = new Map<string, FetchHandler>();
    runInNewContext(serviceWorkerSource, {
      URL,
      Response,
      self: { location: { origin }, addEventListener: handlersCached.set.bind(handlersCached) },
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      caches: {
        open: vi.fn().mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) }),
        match: vi.fn(async (key: unknown) => (key === '/' ? shellResponse : undefined)),
      },
    });

    const respondWithCached = vi.fn<(response: Promise<Response>) => void>();
    handlersCached.get('fetch')!({
      request: { url: `${origin}/reader/1`, method: 'GET', mode: 'navigate' },
      respondWith: respondWithCached,
    });
    await expect(respondWithCached.mock.calls[0]?.[0]).resolves.toBe(shellResponse);
  });

  it('swallows cache.put rejections without failing networkFirst or cacheFirst responses', async () => {
    type FetchHandler = (event: {
      request: Request;
      respondWith: (response: Promise<Response>) => void;
    }) => void;
    const handlers = new Map<string, FetchHandler>();
    const origin = 'https://reader.test';
    const put = vi.fn().mockRejectedValue(new Error('QuotaExceededError'));
    const makeOkResponse = (body: string) =>
      ({
        status: 200,
        type: 'basic',
        body,
        clone: () => ({ status: 200, type: 'basic', body }),
      }) as unknown as Response;

    const networkPageResponse = makeOkResponse('page');
    const staticAssetResponse = makeOkResponse('asset');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(networkPageResponse)
      .mockResolvedValueOnce(staticAssetResponse);

    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      runInNewContext(serviceWorkerSource, {
        URL,
        Response,
        self: { location: { origin }, addEventListener: handlers.set.bind(handlers) },
        fetch: fetchMock,
        caches: {
          open: vi.fn().mockResolvedValue({ put }),
          match: vi.fn().mockResolvedValue(undefined),
        },
      });

      const fetchHandler = handlers.get('fetch')!;

      // networkFirst route
      const respondWithNetwork = vi.fn<(response: Promise<Response>) => void>();
      fetchHandler({
        request: new Request(`${origin}/login`),
        respondWith: respondWithNetwork,
      });
      await expect(respondWithNetwork.mock.calls[0]?.[0]).resolves.toBe(networkPageResponse);

      // cacheFirst route
      const respondWithCache = vi.fn<(response: Promise<Response>) => void>();
      fetchHandler({
        request: new Request(`${origin}/_next/static/chunks/app.js`),
        respondWith: respondWithCache,
      });
      await expect(respondWithCache.mock.calls[0]?.[0]).resolves.toBe(staticAssetResponse);

      // Flush microtask & macrotask queue to surface any unhandled rejection
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
      expect(put).toHaveBeenCalledTimes(2);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});

describe('service worker offline shell budget', () => {
  it('pre-caches the documented static shell routes', () => {
    const assets = extractStaticAssets(serviceWorkerSource);
    for (const route of performanceBudget.offline.staticShellRoutes) {
      expect(assets).toContain(route);
    }
  });

  it('keeps offline hit-rate budget at a meaningful threshold', () => {
    expect(performanceBudget.offline.minHitRate).toBeGreaterThanOrEqual(0.8);
  });
});
