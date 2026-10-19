import { Blob } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeZipLoader } from '../../../public/foliate/zip-loader.js';

async function sampleBook() {
  return new Blob([await readFile('tests/e2e/fixtures/sample.epub')]);
}

describe('reader archive worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads ZIP contents in browsers without workers', async () => {
    vi.stubGlobal('Worker', undefined);
    const loader = await makeZipLoader(await sampleBook());
    expect(await loader.loadText('mimetype')).toBe('application/epub+zip');
    expect(loader.getSize('mimetype')).toBe(20);
    expect(loader.loadText('missing.xhtml')).toBeNull();
    loader.destroy();
  });

  it('dispatches decoding to the worker and releases it when the book closes', async () => {
    const terminate = vi.fn();
    class ArchiveWorker extends EventTarget {
      terminate = terminate;
      postMessage(message: { id: number; type: string; name?: string }) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: {
          id: message.id,
          result: message.type === 'init'
            ? [{ filename: 'chapter.xhtml', uncompressedSize: 42 }]
            : 'worker chapter',
        } })));
      }
    }
    vi.stubGlobal('Worker', ArchiveWorker);
    const loader = await makeZipLoader(await sampleBook());
    expect(await loader.loadText('chapter.xhtml')).toBe('worker chapter');
    expect(loader.getSize('chapter.xhtml')).toBe(42);
    loader.destroy();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('falls back to local decoding when module workers are blocked', async () => {
    class BlockedWorker extends EventTarget {
      terminate = vi.fn();
      postMessage() {
        queueMicrotask(() => this.dispatchEvent(new Event('error')));
      }
    }
    vi.stubGlobal('Worker', BlockedWorker);
    const loader = await makeZipLoader(await sampleBook());
    expect(await loader.loadText('mimetype')).toBe('application/epub+zip');
    loader.destroy();
  });

  it('retries an extraction locally if the worker loses codec support', async () => {
    const terminate = vi.fn();
    class FailingWorker extends EventTarget {
      terminate = terminate;
      postMessage(message: { id: number; type: string }) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: {
          id: message.id,
          ...(message.type === 'init'
            ? { result: [{ filename: 'META-INF/container.xml', uncompressedSize: 252 }] }
            : { error: 'Codec unavailable in worker' }),
        } })));
      }
    }
    vi.stubGlobal('Worker', FailingWorker);
    const loader = await makeZipLoader(await sampleBook());
    expect(await loader.loadText('META-INF/container.xml')).toContain('rootfile');
    expect(terminate).toHaveBeenCalledOnce();
    loader.destroy();
  });
});
