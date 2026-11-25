import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deferred } from '@/test/deferred';
import { api, ApiError, AUTH_EXPIRED_EVENT, PERSONAL_LIBRARY, handleAuthResponse } from '@/lib/api';
import * as config from '@/lib/config';
import { getAccessGeneration, getOfflineLibrary } from '@/lib/library-access';
import { offlineProgressKey, offlineProgressQueueKey } from '@/lib/offline-progress-storage';
import {
  appendPartialBookDownload,
  createPartialBookDownloadWriter,
  getPartialBookDownload,
  saveOfflineBook,
} from '@/lib/offline-books';
import { installBookCache } from './book-cache-fixture';
import type { Book } from '@/lib/api';

type MockResponse = {
  body?: unknown;
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
};

function mockFetch(response: MockResponse) {
  const { body, ok = true, status = 200, headers = {} } = response;
  const responseBody = body ?? {};

  return vi.fn().mockResolvedValue({
    ok,
    status,
    headers: {
      get: (key: string) => (headers as Record<string, string>)[key] ?? null,
      ...headers,
    },
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
    blob: () => Promise.resolve(new Blob(['test'])),
  } as Response);
}

describe('ApiError', () => {
  it('creates error with status', () => {
    const error = new ApiError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.name).toBe('ApiError');
  });
});

describe('library access', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('submits only the password and uses a cookie', async () => {
    globalThis.fetch = mockFetch({ body: { valid: true, password_required: true } });
    await api.login('test access');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/login'),
      expect.objectContaining({ credentials: 'include', body: JSON.stringify({ password: 'test access' }) }));
  });

  it('isolates an old request from a newly established library session', async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    try {
      let finishOldRequest!: (response: Response) => void;
      globalThis.fetch = vi.fn()
        .mockImplementationOnce(() => new Promise<Response>((resolve) => {
          finishOldRequest = resolve;
        }))
        .mockResolvedValueOnce(Response.json({ valid: true, password_required: true }))
        .mockResolvedValueOnce(Response.json([]));
      const oldRequest = api.listBooks();
      const rejected = expect(oldRequest).rejects.toMatchObject({ status: 401 });
      const oldLibrary = getOfflineLibrary();
      await api.login('test access');
      const nextGeneration = getAccessGeneration();
      expect(getOfflineLibrary()).not.toBe(oldLibrary);

      finishOldRequest(new Response(null, { status: 401 }));
      await rejected;
      expect(getAccessGeneration()).toBe(nextGeneration);
      expect(listener).not.toHaveBeenCalled();
      await expect(api.listBooks()).resolves.toEqual([]);
      expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/books'),
        expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    }
  });

  it.each(['login', 'logout'] as const)('finishes %s after an earlier request returns 401', async (action) => {
    const started = deferred<void>();
    const oldResponse = deferred<Response>();
    const authResponse = deferred<Response>();
    globalThis.fetch = vi.fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockImplementationOnce(() => {
        started.resolve();
        return authResponse.promise;
      });
    const previous = getAccessGeneration();
    const request = expect(api.listBooks()).rejects.toMatchObject({ status: 401 });
    const change = action === 'login' ? api.login('test access') : api.logout();
    await started.promise;
    oldResponse.resolve(new Response(null, { status: 401 }));
    await request;
    expect(getAccessGeneration()).toBe(previous);

    authResponse.resolve(Response.json({ valid: true, password_required: true }));
    await change;
    expect(getAccessGeneration()).not.toBe(previous);
  });

  it('dispatches the auth expiry event when local storage is blocked', async () => {
    const listener = vi.fn();
    const blocked = () => { throw new DOMException('Blocked', 'SecurityError'); };
    const methods = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked),
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked),
    ];
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    try {
      globalThis.fetch = mockFetch({ ok: false, status: 401, body: { error: 'expired' } });
      await expect(api.verify()).rejects.toMatchObject({ status: 401, message: 'expired' });
      expect(listener).toHaveBeenCalledOnce();
      expect(getAccessGeneration()).toBeTruthy();
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
      methods.forEach((mock) => mock.mockRestore());
      globalThis.fetch = mockFetch({});
      await api.logout();
    }
  });

  it('moves queued offline progress only after successful reauthentication', async () => {
    const initial = getAccessGeneration();
    const queued = JSON.stringify({ cfi: 'epubcfi(/6/2)', expected_updated_at: 'server-version' });
    localStorage.setItem(offlineProgressQueueKey(initial), JSON.stringify(['book-1']));
    localStorage.setItem(offlineProgressKey('book-1', initial), queued);

    handleAuthResponse(new Response(null, { status: 401 }));
    const expired = getAccessGeneration();
    expect(localStorage.getItem(offlineProgressQueueKey(expired))).toBeNull();
    globalThis.fetch = mockFetch({ ok: false, status: 401 });
    await expect(api.login('incorrect')).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem(offlineProgressKey('book-1', expired))).toBeNull();

    globalThis.fetch = mockFetch({ body: { valid: true, password_required: true } });
    await api.login('test access');
    const authenticated = getAccessGeneration();
    expect(localStorage.getItem(offlineProgressQueueKey(authenticated))).toBe('["book-1"]');
    expect(localStorage.getItem(offlineProgressKey('book-1', authenticated))).toBe(queued);

    await api.logout();
    await api.login('test access');
    expect(localStorage.getItem(offlineProgressQueueKey(getAccessGeneration()))).toBeNull();
  });

  it('reports a failed logout so the library is not shown as locked', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await expect(api.logout()).rejects.toThrow('Network error');
  });

  it('removes legacy credentials on logout', async () => {
    localStorage.setItem('token', 'old');
    globalThis.fetch = mockFetch({});
    await api.logout();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it.each([502, 503, 504])('verifies access through the fallback after HTTP %i', async (status) => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['', 'http://reader:8080']);
    const access = { valid: true, password_required: false };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json(access));
    await expect(api.verify()).resolves.toEqual(access);
    expect(fetch).toHaveBeenLastCalledWith('http://reader:8080/api/auth/verify',
      expect.objectContaining({ credentials: 'include' }));
  });

  it('keeps a password rejection on the responding server', async () => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['', 'http://reader:8080']);
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ message: '密码错误' }, { status: 401 }));
    const generation = getAccessGeneration();
    await expect(api.login('invalid')).rejects.toMatchObject({ message: '密码错误', status: 401 });
    expect(getAccessGeneration()).toBe(generation);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the session cookie when the cover request falls back after a network failure', async () => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['', 'http://reader:8080']);
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(new Response('cover'));
    const cover = await api.fetchCover('book', 'thumb');
    expect(await cover?.text()).toBe('cover');
    expect(fetch).toHaveBeenLastCalledWith('http://reader:8080/api/books/book/cover?size=thumb',
      expect.objectContaining({ credentials: 'include' }));
  });

  it('handles a protected cover returning an empty unauthorized response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(api.fetchCover('book')).resolves.toBeNull();
  });
});

describe('api.listBooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns books array', async () => {
    const books = [
      { id: '1', user_id: 'u1', title: 'Book', author: '', filename: 'b.epub', format: 'epub', size: 100, created_at: '2024-01-01' },
    ];
    globalThis.fetch = mockFetch({ body: books, ok: true });
    localStorage.setItem('token', 'token');

    const result = await api.listBooks();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Book');
  });
});

describe('api.listBooksPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests a cursor page with the requested limit', async () => {
    globalThis.fetch = mockFetch({
      body: {
        books: [
          {
            id: 'book-1',
            user_id: 'u1',
            title: 'Book',
            author: '',
            filename: 'book.epub',
            format: 'epub',
            size: 100,
            created_at: '2024-01-01',
          },
        ],
        next_cursor: 'book-1',
      },
    });

    const page = await api.listBooksPage('book-0', 10);

    expect(page.books).toHaveLength(1);
    expect(page.next_cursor).toBe('book-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books?limit=10&cursor=book-0&sort=recent_read'),
      expect.any(Object),
    );
  });
});

describe('api.fetchBook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports streamed book download progress', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first '));
        controller.enqueue(new TextEncoder().encode('chapter'));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(stream, {
      headers: {
        'Content-Length': '13',
        'Content-Type': 'application/epub+zip',
      },
    }));
    const progress: number[] = [];

    const book = await api.fetchBook('book-1', {
      onProgress: (update) => progress.push(update.downloadedBytes),
    });

    expect(await book.text()).toBe('first chapter');
    expect(progress.at(-1)).toBe(13);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book-1/file'),
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('tries the LAN backend after a book response header timeout', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['', 'http://reader:8080']);
      globalThis.fetch = vi.fn()
        .mockImplementationOnce((_, options: RequestInit) => new Promise<Response>((_, reject) => {
          const signal = options.signal!;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }))
        .mockResolvedValueOnce(new Response('book'));
      const download = api.fetchBook('header-timeout');
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(30000);
      expect(await (await download).text()).toBe('book');
      expect(fetch).toHaveBeenLastCalledWith(
        'http://reader:8080/api/books/header-timeout/file', expect.anything(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out when a download stalls and keeps the received prefix for retry', async () => {
    vi.useFakeTimers();
    try {
      installBookCache();
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('first ')); },
        cancel,
      });
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(new Response(body, { headers: { 'Content-Length': '13' } }))
        .mockResolvedValueOnce(new Response('chapter', {
          status: 206,
          headers: { 'Content-Range': 'bytes 6-12/13' },
        }));

      const download = api.fetchBook('stalled');
      const rejected = expect(download).rejects.toThrow('书籍下载超时');
      await vi.waitFor(() => expect(body.locked).toBe(true));
      await vi.advanceTimersByTimeAsync(30000);
      await rejected;
      expect(cancel).toHaveBeenCalledOnce();
      expect((await getPartialBookDownload(getOfflineLibrary(), 'stalled'))?.downloadedBytes).toBe(6);

      const resumed = await api.fetchBook('stalled');
      expect(await resumed.text()).toBe('first chapter');
      expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/stalled/file'),
        expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=6-' }) }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a download that finishes after logout', async () => {
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        finish = () => { controller.enqueue(new Uint8Array([1])); controller.close(); };
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body));
    const download = api.fetchBook('locked');
    await vi.waitFor(() => expect(body.locked).toBe(true));
    handleAuthResponse(new Response(null, { status: 401 }));
    finish();
    await expect(download).rejects.toMatchObject({ status: 401 });
  });

  it('reads ahead of slow cache writes with a bounded queue', async () => {
    const { cache } = installBookCache();
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const originalPut = cache.put.getMockImplementation()!;
    cache.put.mockImplementation(async (request, response) => {
      if (request.url.endsWith('/chunk/0')) await blockedWrite;
      return originalPut(request, response);
    });
    let reads = 0;
    const read = vi.fn(async () => {
      reads += 1;
      return reads <= 8
        ? { done: false, value: new Uint8Array(1024 * 1024) }
        : { done: true, value: undefined };
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      body: { getReader: () => ({ read, releaseLock() {} }) },
    });

    const download = api.fetchBook('slow-cache');
    try {
      await vi.waitFor(() => expect(reads).toBeGreaterThan(1));
      expect(reads).toBeLessThanOrEqual(3);
    } finally {
      releaseWrite();
      await download;
    }
  });

  it('flushes bytes below the batch size when a stream is interrupted', async () => {
    installBookCache();
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('first ') })
      .mockRejectedValueOnce(new Error('connection lost'));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'Content-Length': '13' }),
      body: { getReader: () => ({ read, releaseLock() {} }) },
    });

    await expect(api.fetchBook('interrupted')).rejects.toThrow('connection lost');
    const partial = await getPartialBookDownload(PERSONAL_LIBRARY, 'interrupted');
    expect(partial?.downloadedBytes).toBe(6);
    expect(await partial?.chunks[0].text()).toBe('first ');
  });

  it('resumes a partial download using its committed Range offset', async () => {
    installBookCache();
    await appendPartialBookDownload(PERSONAL_LIBRARY, 'resumed', new Blob(['first ']), 13, 'text/plain');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('chapter', {
      status: 206,
      headers: { 'Content-Range': 'bytes 6-12/13', 'Content-Length': '7' },
    }));

    expect(await (await api.fetchBook('resumed')).text()).toBe('first chapter');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Range: 'bytes=6-' }),
    }));
    expect(await getPartialBookDownload(PERSONAL_LIBRARY, 'resumed')).toBeNull();
  });

  it('validates the resumed prefix with If-Range when the server supplied an ETag', async () => {
    installBookCache();
    const writer = await createPartialBookDownloadWriter(
      PERSONAL_LIBRARY, 'changed-partial', 13, 'text/plain', null, '"original"'
    );
    await writer.append(new Blob(['first ']));
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('changed book', {
      headers: { ETag: '"changed"' },
    }));

    expect(await (await api.fetchBook('changed-partial')).text()).toBe('changed book');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Range: 'bytes=6-', 'If-Range': '"original"' }),
    }));
  });

  it('uses the fresh response length after retrying a mismatched range', async () => {
    installBookCache();
    await appendPartialBookDownload(PERSONAL_LIBRARY, 'bad-range', new Blob(['prefix']), 100, 'text/plain');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('invalid', {
        status: 206, headers: { 'Content-Range': 'bytes 2-8/100' },
      }))
      .mockResolvedValueOnce(new Response('fresh', { headers: { 'Content-Length': '5' } }));

    expect(await (await api.fetchBook('bad-range')).text()).toBe('fresh');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels the rejected range body before restarting without a Range header', async () => {
    installBookCache();
    await appendPartialBookDownload(PERSONAL_LIBRARY, 'stale-range', new Blob(['prefix']), 13, 'text/plain');
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
        status: 416, headers: { 'Content-Range': 'bytes */5' },
      }))
      .mockImplementationOnce(async () => {
        expect(cancel).toHaveBeenCalledOnce();
        return new Response('fresh', { headers: { 'Content-Length': '5' } });
      });
    globalThis.fetch = fetch;

    expect(await (await api.fetchBook('stale-range')).text()).toBe('fresh');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].headers).toEqual(expect.objectContaining({ Range: 'bytes=6-' }));
    expect(new Headers(fetch.mock.calls[1][1].headers).has('Range')).toBe(false);
    expect(await getPartialBookDownload(PERSONAL_LIBRARY, 'stale-range')).toBeNull();
  });

  it('preserves the existing resumable prefix if cache writes and the network both fail', async () => {
    const { cache } = installBookCache();
    await appendPartialBookDownload(PERSONAL_LIBRARY, 'quota', new Blob(['prefix']), null, 'text/plain');
    cache.put.mockRejectedValue(new Error('quota exceeded'));
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024 * 1024) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(1024 * 1024) })
      .mockRejectedValueOnce(new Error('connection lost'));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 206, headers: new Headers({ 'Content-Range': 'bytes 6-2097157/*' }),
      body: { getReader: () => ({ read, releaseLock() {} }) },
    });

    await expect(api.fetchBook('quota')).rejects.toThrow('connection lost');
    expect((await getPartialBookDownload(PERSONAL_LIBRARY, 'quota'))?.downloadedBytes).toBe(6);
  });

  it('shares an in-flight transfer while allowing one caller to cancel independently', async () => {
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        finish = () => { controller.enqueue(new TextEncoder().encode('book')); controller.close(); };
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body));
    const controller = new AbortController();
    const cancelled = api.fetchBook('shared', { signal: controller.signal });
    const cancellation = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const retained = api.fetchBook('shared');
    controller.abort();
    finish();

    await cancellation;
    expect((await retained).size).toBe(4);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps shared downloads running when a subscriber throws during progress updates', async () => {
    const initialProgress = deferred<void>();
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        finish = () => { controller.enqueue(new TextEncoder().encode('book')); controller.close(); };
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Length': '4' } }));
    globalThis.fetch = fetch;
    const first = api.fetchBook('shared-progress', { onProgress: () => initialProgress.resolve() });
    await initialProgress.promise;

    const throwingProgress = vi.fn(() => { throw new Error('progress UI failed'); });
    const lastProgress = vi.fn();
    const downloads = Promise.allSettled([
      first,
      api.fetchBook('shared-progress', { onProgress: throwingProgress }),
      api.fetchBook('shared-progress', { onProgress: lastProgress }),
    ]);
    try {
      await vi.waitFor(() => {
        expect(throwingProgress).toHaveBeenCalledWith(expect.objectContaining({ downloadedBytes: 0 }));
        expect(lastProgress).toHaveBeenCalledWith(expect.objectContaining({ downloadedBytes: 0 }));
      });
    } finally {
      finish();
    }

    for (const result of await downloads) {
      if (result.status === 'rejected') throw result.reason;
      expect(await result.value.text()).toBe('book');
    }
    expect(throwingProgress).toHaveBeenLastCalledWith(expect.objectContaining({ downloadedBytes: 4 }));
    expect(lastProgress).toHaveBeenLastCalledWith(expect.objectContaining({ downloadedBytes: 4 }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('cancels the network when the final caller leaves and saves received bytes', async () => {
    installBookCache();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('prefix')); },
      cancel,
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body));
    const controller = new AbortController();
    const progress = vi.fn();
    const download = api.fetchBook('cancelled', { signal: controller.signal, onProgress: progress });
    const rejection = expect(download).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort();

    await rejection;
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    await vi.waitFor(async () => {
      expect((await getPartialBookDownload(PERSONAL_LIBRARY, 'cancelled'))?.downloadedBytes).toBe(6);
    });
  });

  it('waits for cancelled partial writes before restarting the same book', async () => {
    const { cache } = installBookCache();
    let releaseWrite!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const originalPut = cache.put.getMockImplementation()!;
    cache.put.mockImplementation(async (request, response) => {
      if (request.url.endsWith('/chunk/0')) await blocked;
      return originalPut(request, response);
    });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      })))
      .mockResolvedValueOnce(new Response('rest', {
        status: 206,
        headers: { 'Content-Range': `bytes 1048576-1048579/1048580` },
      }));
    const controller = new AbortController();
    const first = api.fetchBook('restart', { signal: controller.signal });
    const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled());
    controller.abort();
    const restarted = api.fetchBook('restart');
    try {
      await rejection;
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      releaseWrite();
      expect((await restarted).size).toBe(1048580);
    }
  });

  it('immediately cancels a caller waiting for a previous partial write to finish', async () => {
    const { cache } = installBookCache();
    let releaseWrite!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const originalPut = cache.put.getMockImplementation()!;
    cache.put.mockImplementation(async (request, response) => {
      if (request.url.endsWith('/chunk/0')) await blocked;
      return originalPut(request, response);
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    })));
    const firstController = new AbortController();
    const first = api.fetchBook('cancel-waiter', { signal: firstController.signal });
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled());
    firstController.abort();
    await firstRejection;

    const waitingController = new AbortController();
    const settled = vi.fn();
    const waiting = api.fetchBook('cancel-waiter', { signal: waitingController.signal })
      .then(() => settled('resolved'), (error: unknown) => settled(error));
    // Let the lazy module wrapper subscribe while the previous writer is blocked.
    await new Promise((resolve) => setTimeout(resolve, 0));
    waitingController.abort();
    try {
      await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AbortError' })
      ));
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      releaseWrite();
      await waiting;
      await vi.waitFor(async () => {
        expect((await getPartialBookDownload(PERSONAL_LIBRARY, 'cancel-waiter'))?.downloadedBytes)
          .toBe(1024 * 1024);
      });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('api.createBookFile offline cache reuse', () => {
  const book = {
    id: 'cached', user_id: PERSONAL_LIBRARY, filename: 'cached.epub', content_hash: 'original',
    created_at: '2024-01-01',
  } as Book;

  beforeEach(async () => {
    localStorage.clear();
    installBookCache();
    await saveOfflineBook(PERSONAL_LIBRARY, book, new Blob(['offline book']));
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('validates authenticated metadata before reusing an explicit offline copy', async () => {
    globalThis.fetch = mockFetch({ body: book });
    const file = await api.createBookFile('cached');

    expect(await file.text()).toBe('offline book');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/books\/cached$/),
      expect.objectContaining({ credentials: 'include' }));
  });

  it('downloads the current content when the stored hash is stale', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...book, content_hash: 'changed' })))
      .mockResolvedValueOnce(new Response('updated book'));

    expect(await (await api.createBookFile('cached')).text()).toBe('updated book');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not use stale cached content after current metadata identifies a different hash', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...book, content_hash: 'changed' })))
      .mockRejectedValue(new Error('network unavailable'));

    await expect(api.createBookFile('cached')).rejects.toThrow('network unavailable');
  });

  it('rejects authorization failures even when a cached file is available', async () => {
    globalThis.fetch = mockFetch({ body: { error: 'Unauthorized' }, ok: false, status: 401 });
    await expect(api.createBookFile('cached')).rejects.toMatchObject({ status: 401 });
  });

  it('retains offline reading when authenticated metadata cannot reach the server', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network unavailable'));
    expect(await (await api.createBookFile('cached')).text()).toBe('offline book');
  });

  it('keeps metadata and content requests behind their public API methods', async () => {
    const metadata = vi.spyOn(api, 'getBook').mockResolvedValue({ ...book, id: 'uncached' });
    const content = vi.spyOn(api, 'fetchBook').mockResolvedValue(new Blob(['mocked content']));
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('unexpected direct request'));

    expect(await (await api.createBookFile('uncached')).text()).toBe('mocked content');
    expect(metadata).toHaveBeenCalledWith('uncached', undefined);
    expect(content).toHaveBeenCalledWith('uncached', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not return a cached file after access expires', async () => {
    let resolveMetadata!: (response: Response) => void;
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveMetadata = resolve;
    }));
    const file = api.createBookFile('cached');
    const rejection = expect(file).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    handleAuthResponse(new Response(null, { status: 401 }));
    resolveMetadata(new Response(JSON.stringify(book)));
    await rejection;
  });

  it('cancels an uncached content transfer when its metadata request fails', async () => {
    let rejectMetadata!: (error: unknown) => void;
    const cancel = vi.fn();
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (!url.endsWith('/file')) return new Promise((_, reject) => { rejectMetadata = reject; });
      return Promise.resolve(new Response(new ReadableStream({ cancel })));
    });
    const file = api.createBookFile('uncached');
    const rejection = expect(file).rejects.toThrow('metadata failed');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    rejectMetadata(new Error('metadata failed'));
    await rejection;
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});

describe('api.getProgress', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns progress for book', async () => {
    const progress = { book_id: '1', user_id: 'u1', cfi: 'epubcfi(/6/2)', percentage: 50, updated_at: '2024-01-01' };
    globalThis.fetch = mockFetch({ body: progress, ok: true });
    localStorage.setItem('token', 'token');

    const result = await api.getProgress('1');
    expect(result.percentage).toBe(50);
  });
});

describe('api.saveProgress', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends progress data', async () => {
    globalThis.fetch = mockFetch({
      body: { book_id: '1', cfi: 'epubcfi(/6/4)', percentage: 75, updated_at: '' },
      ok: true,
    });
    localStorage.setItem('token', 'token');

    await api.saveProgress('1', 'epubcfi(/6/4)', 75, {
      expectedUpdatedAt: '2024-01-01T00:00:00Z',
      deviceId: 'device-1',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/progress/1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cfi: 'epubcfi(/6/4)',
          percentage: 75,
          expected_updated_at: '2024-01-01T00:00:00Z',
          device_id: 'device-1',
        }),
      }),
    );
  });

  it('sends the conditional creation flag for regular and unload saves', async () => {
    globalThis.fetch = mockFetch({ body: {}, ok: true });

    await api.saveProgress('1', 'epubcfi(/6/4)', 75, { createOnly: true });
    api.saveProgressOnUnload('1', 'epubcfi(/6/4)', 75, { createOnly: true });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    for (const [, request] of vi.mocked(globalThis.fetch).mock.calls) {
      expect(request?.method).toBe('POST');
      expect(JSON.parse(String(request?.body))).toEqual({
        cfi: 'epubcfi(/6/4)', percentage: 75, create_only: true,
      });
    }
  });
});

describe('api error handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ApiError on 404 response', async () => {
    globalThis.fetch = mockFetch({
      body: { error: 'Not found' },
      ok: false,
      status: 404,
    });
    localStorage.setItem('token', 'token');

    await expect(api.listBooks()).rejects.toThrow('Not found');
  });

  it('throws ApiError on 401 response and clears token', async () => {
    globalThis.fetch = mockFetch({
      body: { error: 'Unauthorized' },
      ok: false,
      status: 401,
    });

    await expect(api.listBooks()).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('throws on network error', async () => {
    localStorage.setItem('token', 'token');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(api.listBooks()).rejects.toThrow('Network error');
  });

  it('throws timeout error when request is slow', async () => {
    localStorage.setItem('token', 'token');
    const timeoutError = new Error('请求在 30000ms 后超时');
    timeoutError.name = 'TimeoutError';
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

    await expect(api.listBooks()).rejects.toThrow('请求超时');
  });
});

describe('api.listProgress', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when no progress', async () => {
    globalThis.fetch = mockFetch({ body: [], ok: true });
    localStorage.setItem('token', 'token');

    const result = await api.listProgress();
    expect(result).toEqual([]);
  });
});

describe('api.verify', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports open access without a user record', async () => {
    globalThis.fetch = mockFetch({ body: { valid: true, password_required: false } });
    expect(await api.verify()).toEqual({ valid: true, password_required: false });
  });
});

describe('api error handling, retries, and aborts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses body.message or fallback message when server returns non-JSON error', async () => {
    globalThis.fetch = mockFetch({
      body: { message: 'Custom server message' },
      ok: false,
      status: 422,
    });
    await expect(api.listBooks()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Custom server message',
      status: 422,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as Response);
    await expect(api.listBooks()).rejects.toMatchObject({
      name: 'ApiError',
      message: '请求失败',
      status: 500,
    });
  });

  it('returns null when an ok response has an empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as Response);

    const result = await api.deleteBookmark('book/1', 'bm/1');
    expect(result).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book%2F1/bookmarks/bm%2F1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('respects an already-aborted signal without retrying', async () => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['http://primary', 'http://fallback']);
    const controller = new AbortController();
    controller.abort(new DOMException('Aborted', 'AbortError'));
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(api.getBook('book-1', controller.signal)).rejects.toThrow('请求超时');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries with the next API base on 502/503/504 and TypeError in fetchApi', async () => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['http://primary', 'http://fallback']);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json([]));

    await expect(api.listBooks()).resolves.toEqual([]);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'http://primary/api/books', expect.any(Object));
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, 'http://fallback/api/books', expect.any(Object));

    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ total: 1, uncategorized: 0, categories: {} }));

    await expect(api.getBookLibrarySummary()).resolves.toEqual({
      total: 1,
      uncategorized: 0,
      categories: {},
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('ignores non-401 or stale-generation responses in handleAuthResponse', () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, listener);
    try {
      handleAuthResponse(new Response(null, { status: 200 }));
      handleAuthResponse(new Response(null, { status: 401 }), 'stale-generation');
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
    }
  });
});

describe('api book queries, categories, and CRUD', () => {
  const sampleBook: Book = {
    id: 'book-1',
    user_id: 'reader',
    title: '三体',
    author: '刘慈欣',
    filename: 'santi.epub',
    format: 'epub',
    size: 2048,
    created_at: '2026-01-01T00:00:00Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes cursor, sort, category, and uncategorized options in listBooksPage and searchBooks', async () => {
    globalThis.fetch = mockFetch({ body: { books: [sampleBook], next_cursor: 'c2' } });

    const page1 = await api.listBooksPage('c1', 30, 'title', { category: '科幻' });
    expect(page1.books).toEqual([sampleBook]);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books?limit=30&cursor=c1&sort=title&category=%E7%A7%91%E5%B9%BB'),
      expect.any(Object),
    );

    await api.listBooksPage(undefined, 20, 'recent_read', { uncategorized: true });
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books?limit=20&sort=recent_read&uncategorized=true'),
      expect.any(Object),
    );

    const searchRes = await api.searchBooks('三体', 'c1', 10, 'author', { category: '科幻' });
    expect(searchRes.books).toEqual([sampleBook]);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/search?q=%E4%B8%89%E4%BD%93&limit=10&cursor=c1&sort=author&category=%E7%A7%91%E5%B9%BB'),
      expect.any(Object),
    );

    await api.searchBooks('三体', undefined, 20, 'recent_read', { uncategorized: true });
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/search?q=%E4%B8%89%E4%BD%93&limit=20&sort=recent_read&uncategorized=true'),
      expect.any(Object),
    );
  });

  it('chunks getBooksStatus requests into batches of 100 IDs', async () => {
    const ids = Array.from({ length: 105 }, (_, i) => `b-${i}`);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ books: [sampleBook] }))
      .mockResolvedValueOnce(Response.json({ books: [{ ...sampleBook, id: 'b-100' }] }));

    const result = await api.getBooksStatus(ids);
    expect(result).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toContain('/api/books/status?book_ids=');
    expect(vi.mocked(globalThis.fetch).mock.calls[1][0]).toContain('b-100');
  });

  it('calls summary, updateBook, renameBookCategory, updateBooksCategory, deleteBook, and deleteBooks', async () => {
    globalThis.fetch = mockFetch({
      body: { total: 5, uncategorized: 1, categories: { 科幻: 4 } },
    });
    expect(await api.getBookLibrarySummary()).toEqual({
      total: 5,
      uncategorized: 1,
      categories: { 科幻: 4 },
    });

    globalThis.fetch = mockFetch({ body: { ...sampleBook, title: '三体 II' } });
    const updated = await api.updateBook('book/1', { title: '三体 II', author: '刘慈欣' });
    expect(updated.title).toBe('三体 II');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book%2F1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: '三体 II', author: '刘慈欣' }),
      }),
    );

    globalThis.fetch = mockFetch({ body: { updated_ids: ['book-1'], category: '文学' } });
    expect(await api.renameBookCategory('科幻', '文学')).toEqual({
      updated_ids: ['book-1'],
      category: '文学',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/categories'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ from: '科幻', to: '文学' }),
      }),
    );

    globalThis.fetch = mockFetch({ body: { books: [sampleBook] } });
    expect(await api.updateBooksCategory(['book-1'], '科幻')).toEqual({ books: [sampleBook] });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/batch/category'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ids: ['book-1'], category: '科幻' }),
      }),
    );

    globalThis.fetch = mockFetch({ body: null });
    await api.deleteBook('book/1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book%2F1'),
      expect.objectContaining({ method: 'DELETE' }),
    );

    globalThis.fetch = mockFetch({ body: { deleted_ids: ['book-1', 'book-2'] } });
    expect(await api.deleteBooks(['book-1', 'book-2'])).toEqual({
      deleted_ids: ['book-1', 'book-2'],
    });

    globalThis.fetch = mockFetch({ body: {} });
    await api.deleteBooks(['book-3']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/batch/delete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ids: ['book-3'] }),
      }),
    );
  });

  it('reparses a single book and batch reparses books with exact backend contract', async () => {
    const reparsed: Book = {
      ...sampleBook,
      title: '三体（重刷）',
      cover_path: 'covers/book-1-v2.jpg',
      cover_thumb_path: 'covers/book-1-v2-thumb.jpg',
    };
    globalThis.fetch = mockFetch({ body: reparsed });

    const single = await api.reparseBook('book/1');
    expect(single).toEqual(reparsed);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book%2F1/reparse'),
      expect.objectContaining({ method: 'POST' }),
    );

    const batchPayload = {
      updated_ids: ['book-1'],
      failed_ids: ['book-2'],
      books: [reparsed],
    };
    globalThis.fetch = mockFetch({ body: batchPayload });

    const batch = await api.batchReparseBooks(['book-1', 'book-2']);
    expect(batch).toEqual(batchPayload);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/batch/reparse'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ids: ['book-1', 'book-2'] }),
      }),
    );
  });
});

describe('api.uploadBook, api.uploadCover, and api.fetchCover', () => {
  const sampleBook: Book = {
    id: 'book-up',
    user_id: 'reader',
    title: 'Uploaded',
    author: 'Author',
    filename: 'uploaded.epub',
    format: 'epub',
    size: 512,
    created_at: '2026-01-01T00:00:00Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uploads a book successfully and handles 409 duplicate recovery', async () => {
    const file = new File(['epub-data'], 'uploaded.epub', { type: 'application/epub+zip' });
    globalThis.fetch = mockFetch({ body: sampleBook, ok: true });

    await expect(api.uploadBook(file)).resolves.toEqual(sampleBook);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );

    // 409 with valid duplicate book returns existing book instead of throwing
    globalThis.fetch = mockFetch({
      ok: false,
      status: 409,
      body: { error: 'Duplicate', book: sampleBook },
    });
    await expect(api.uploadBook(file)).resolves.toEqual(sampleBook);

    // 409 without valid book details still rejects with ApiError
    globalThis.fetch = mockFetch({
      ok: false,
      status: 409,
      body: { error: 'Conflict without book', book: { id: 123 } },
    });
    await expect(api.uploadBook(file)).rejects.toMatchObject({
      status: 409,
      message: 'Conflict without book',
    });
  });

  it('retries uploadBook once on transient failure and rejects on empty response or persistent error', async () => {
    vi.useFakeTimers();
    const file = new File(['epub-data'], 'uploaded.epub');

    // Transient network error succeeds on second attempt
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network reset'))
      .mockResolvedValueOnce(Response.json(sampleBook));

    const retryPromise = api.uploadBook(file);
    await vi.advanceTimersByTimeAsync(500);
    await expect(retryPromise).resolves.toEqual(sampleBook);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Empty body throws ApiError without retrying
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);
    await expect(api.uploadBook(file)).rejects.toMatchObject({
      name: 'ApiError',
      message: '上传成功但响应为空',
    });

    // Non-409 API error throws immediately without retry
    globalThis.fetch = mockFetch({ ok: false, status: 400, body: {} });
    await expect(api.uploadBook(file)).rejects.toMatchObject({
      status: 400,
      message: '上传失败',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uploads a cover and handles errors and empty responses', async () => {
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    globalThis.fetch = mockFetch({ body: { ...sampleBook, cover_path: 'covers/new.png' } });

    const updated = await api.uploadCover('book/1', blob, 'custom.png');
    expect(updated.cover_path).toBe('covers/new.png');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/book%2F1/cover'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );

    globalThis.fetch = mockFetch({ ok: false, status: 413, body: {} });
    await expect(api.uploadCover('book/1', blob)).rejects.toMatchObject({
      status: 413,
      message: '上传封面失败',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    } as Response);
    await expect(api.uploadCover('book/1', blob)).rejects.toMatchObject({
      message: '上传封面成功但响应为空',
    });
  });

  it('fetches covers with thumb query, multi-base fallback, 404/500, and abort handling', async () => {
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['http://primary', 'http://fallback']);
    const coverBlob = new Blob(['img']);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(coverBlob),
      } as Response);

    await expect(api.fetchCover('book/1', 'thumb')).resolves.toBe(coverBlob);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      'http://primary/api/books/book%2F1/cover?size=thumb',
      expect.any(Object),
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'http://fallback/api/books/book%2F1/cover?size=thumb',
      expect.any(Object),
    );

    // 404 returns null
    vi.spyOn(config, 'getApiBaseCandidates').mockReturnValue(['']);
    globalThis.fetch = mockFetch({ ok: false, status: 404 });
    await expect(api.fetchCover('book-1')).resolves.toBeNull();

    // 500 throws error
    globalThis.fetch = mockFetch({ ok: false, status: 500 });
    await expect(api.fetchCover('book-1')).rejects.toThrow('Cover fetch failed with status 500');

    // Caller abort signal returns null
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(api.fetchCover('book-1', 'thumb', controller.signal)).resolves.toBeNull();

    // Non-abort error rethrows
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(api.fetchCover('book-1')).rejects.toThrow('offline');
  });
});

describe('api progress options and bookmarks CRUD', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes query parameters in listProgress and all fields in saveProgressOnUnload', async () => {
    globalThis.fetch = mockFetch({ body: [] });
    const controller = new AbortController();
    await api.listProgress({
      bookIds: ['b1', 'b2'],
      updatedSince: '2026-01-01T00:00:00Z',
      signal: controller.signal,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/progress?book_ids=b1%2Cb2&updated_since=2026-01-01T00%3A00%3A00Z'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('unload aborted'));
    api.saveProgressOnUnload('book/1', 'cfi-1', 55, {
      expectedUpdatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'dev-1',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/progress/book%2F1'),
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({
          cfi: 'cfi-1',
          percentage: 55,
          expected_updated_at: '2026-01-01T00:00:00Z',
          device_id: 'dev-1',
        }),
      }),
    );
  });

  it('lists, creates, and deletes bookmarks', async () => {
    const bookmark = {
      id: 'bm-1',
      book_id: 'book-1',
      user_id: 'reader',
      cfi: 'epubcfi(/6/2)',
      percentage: 12.5,
      chapter: '第一章',
      note: '好句',
      created_at: '2026-01-01T00:00:00Z',
    };

    globalThis.fetch = mockFetch({ body: [bookmark] });
    expect(await api.listBookmarks('book/1')).toEqual([bookmark]);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/book%2F1/bookmarks'),
      expect.any(Object),
    );

    globalThis.fetch = mockFetch({ body: bookmark });
    const created = await api.createBookmark('book/1', {
      cfi: bookmark.cfi,
      percentage: bookmark.percentage,
      chapter: bookmark.chapter,
      note: bookmark.note,
    });
    expect(created).toEqual(bookmark);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/book%2F1/bookmarks'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cfi: bookmark.cfi,
          percentage: bookmark.percentage,
          chapter: bookmark.chapter,
          note: bookmark.note,
        }),
      }),
    );

    globalThis.fetch = mockFetch({ body: null });
    await api.deleteBookmark('book/1', 'bm/1');
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/book%2F1/bookmarks/bm%2F1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('updates a bookmark note and propagates API errors', async () => {
    const updatedBookmark = {
      id: 'bm/1',
      book_id: 'book/1',
      user_id: 'reader',
      cfi: 'epubcfi(/6/2)',
      percentage: 12.5,
      chapter: '第一章',
      note: '更新后的笔记',
      created_at: '2026-01-01T00:00:00Z',
    };

    globalThis.fetch = mockFetch({ body: updatedBookmark });
    const result = await api.updateBookmark('book/1', 'bm/1', { note: '更新后的笔记' });
    expect(result).toEqual(updatedBookmark);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/books/book%2F1/bookmarks/bm%2F1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ note: '更新后的笔记' }),
      }),
    );

    globalThis.fetch = mockFetch({
      ok: false,
      status: 404,
      body: { error: 'bookmark not found' },
    });
    await expect(
      api.updateBookmark('book/1', 'missing', { note: '测试' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'bookmark not found',
    });
  });
});
