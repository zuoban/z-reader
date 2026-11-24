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
