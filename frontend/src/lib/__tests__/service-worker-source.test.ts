import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

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
