import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    expect(serviceWorkerSource).not.toMatch(/['"]\/shelf['"]/);
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
