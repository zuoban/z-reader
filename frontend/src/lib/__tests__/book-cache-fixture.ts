import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { vi } from 'vitest';

export function installBookCache() {
  const entries = new Map<string, Response>();
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, window.location.origin) : input, init);
    }
  });
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  const cache = {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    }),
    keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
  const storage = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => { entries.clear(); return true; }),
  };
  vi.stubGlobal('caches', storage);
  const estimate = vi.fn(async () => ({ usage: 0, quota: 1024 * 1024 * 1024 }));
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate },
  });
  return { cache, storage, estimate, entries };
}
