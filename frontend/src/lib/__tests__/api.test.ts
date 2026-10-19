import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, auth, ApiError, getAuthHeaders } from '@/lib/api';
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

describe('getAuthHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty object when no token', () => {
    const headers = getAuthHeaders();
    expect(headers).toEqual({});
  });

  it('includes Authorization header when token exists', () => {
    localStorage.setItem('token', 'test-token');
    const headers = getAuthHeaders();
    expect(headers).toEqual({ Authorization: 'test-token' });
  });
});

describe('ApiError', () => {
  it('creates error with status', () => {
    const error = new ApiError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.name).toBe('ApiError');
  });
});

describe('auth helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isLoggedIn returns false when no token', () => {
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('isLoggedIn returns true when token exists', () => {
    auth.setToken('some-token');
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('getToken returns null when no token', () => {
    expect(auth.getToken()).toBeNull();
  });

  it('setToken and getToken round-trip', () => {
    auth.setToken('my-token');
    expect(auth.getToken()).toBe('my-token');
  });

  it('removeToken clears token and user', () => {
    auth.setToken('token');
    auth.setCurrentUser({ id: '1', username: 'test', created_at: '', updated_at: '' });
    auth.removeToken();
    expect(auth.getToken()).toBeNull();
    expect(auth.getCurrentUser()).toBeNull();
  });

  it('getCurrentUser parses stored user', () => {
    const user = { id: '1', username: 'test', created_at: '', updated_at: '' };
    auth.setCurrentUser(user);
    expect(auth.getCurrentUser()).toEqual(user);
  });

  it('getCurrentUser returns null for invalid JSON', () => {
    localStorage.setItem('user', 'not-json');
    expect(auth.getCurrentUser()).toBeNull();
  });
});

describe('api.login', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches user and clears legacy token on success', async () => {
    const user = { id: '1', username: 'test', created_at: '', updated_at: '' };
    localStorage.setItem('token', 'legacy-token');
    globalThis.fetch = mockFetch({
      body: { user },
      ok: true,
    });

    const result = await api.login('test', 'password');

    expect(result.user).toEqual(user);
    expect(auth.getToken()).toBeNull();
    expect(auth.getCurrentUser()).toEqual(user);
  });
});

describe('api.register', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches user and clears legacy token on success', async () => {
    const user = { id: '1', username: 'new-reader', created_at: '', updated_at: '' };
    localStorage.setItem('token', 'legacy-token');
    globalThis.fetch = mockFetch({
      body: { user },
      ok: true,
    });

    const result = await api.register('new-reader', 'password123');

    expect(result.user).toEqual(user);
    expect(auth.getToken()).toBeNull();
    expect(auth.getCurrentUser()).toEqual(user);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'new-reader', password: 'password123' }),
      }),
    );
  });
});

describe('api.logout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes token even if API call fails', async () => {
    auth.setToken('token');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await api.logout();

    expect(auth.getToken()).toBeNull();
  });

  it('calls logout API when available', async () => {
    auth.setToken('token');
    globalThis.fetch = mockFetch({ body: {}, ok: true });

    await api.logout();

    expect(auth.getToken()).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalled();
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
    auth.setToken('token');
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
        headers: expect.objectContaining({ Authorization: 'token' }),
      }),
    );
  });

  it('reads ahead of slow cache writes with a bounded queue', async () => {
    const { cache } = installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
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
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('first ') })
      .mockRejectedValueOnce(new Error('connection lost'));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'Content-Length': '13' }),
      body: { getReader: () => ({ read, releaseLock() {} }) },
    });

    await expect(api.fetchBook('interrupted')).rejects.toThrow('connection lost');
    const partial = await getPartialBookDownload('reader', 'interrupted');
    expect(partial?.downloadedBytes).toBe(6);
    expect(await partial?.chunks[0].text()).toBe('first ');
  });

  it('resumes a partial download using its committed Range offset', async () => {
    installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    await appendPartialBookDownload('reader', 'resumed', new Blob(['first ']), 13, 'text/plain');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('chapter', {
      status: 206,
      headers: { 'Content-Range': 'bytes 6-12/13', 'Content-Length': '7' },
    }));

    expect(await (await api.fetchBook('resumed')).text()).toBe('first chapter');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Range: 'bytes=6-' }),
    }));
    expect(await getPartialBookDownload('reader', 'resumed')).toBeNull();
  });

  it('validates the resumed prefix with If-Range when the server supplied an ETag', async () => {
    installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    const writer = await createPartialBookDownloadWriter(
      'reader', 'changed-partial', 13, 'text/plain', null, '"original"'
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
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    await appendPartialBookDownload('reader', 'bad-range', new Blob(['prefix']), 100, 'text/plain');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('invalid', {
        status: 206, headers: { 'Content-Range': 'bytes 2-8/100' },
      }))
      .mockResolvedValueOnce(new Response('fresh', { headers: { 'Content-Length': '5' } }));

    expect(await (await api.fetchBook('bad-range')).text()).toBe('fresh');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves the existing resumable prefix if cache writes and the network both fail', async () => {
    const { cache } = installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    await appendPartialBookDownload('reader', 'quota', new Blob(['prefix']), null, 'text/plain');
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
    expect((await getPartialBookDownload('reader', 'quota'))?.downloadedBytes).toBe(6);
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

  it('cancels the network when the final caller leaves and saves received bytes', async () => {
    installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
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
      expect((await getPartialBookDownload('reader', 'cancelled'))?.downloadedBytes).toBe(6);
    });
  });

  it('waits for cancelled partial writes before restarting the same book', async () => {
    const { cache } = installBookCache();
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
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
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
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
        expect((await getPartialBookDownload('reader', 'cancel-waiter'))?.downloadedBytes)
          .toBe(1024 * 1024);
      });
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('api.createBookFile offline cache reuse', () => {
  const book = {
    id: 'cached', user_id: 'reader', filename: 'cached.epub', content_hash: 'original',
    created_at: '2024-01-01',
  } as Book;

  beforeEach(async () => {
    localStorage.clear();
    installBookCache();
    auth.setToken('token');
    auth.setCurrentUser({ id: 'reader', username: 'reader', created_at: '', updated_at: '' });
    await saveOfflineBook('reader', book, new Blob(['offline book']));
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('validates authenticated metadata before reusing an explicit offline copy', async () => {
    globalThis.fetch = mockFetch({ body: book });
    const file = await api.createBookFile('cached');

    expect(await file.text()).toBe('offline book');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/books\/cached$/),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token' }) }));
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

  it('does not expose a prior account cache after the active user changes', async () => {
    let resolveMetadata!: (response: Response) => void;
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveMetadata = resolve;
    }));
    const file = api.createBookFile('cached');
    const rejection = expect(file).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    auth.setCurrentUser({ id: 'other', username: 'other', created_at: '', updated_at: '' });
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
    auth.setToken('token');
    globalThis.fetch = mockFetch({
      body: { error: 'Unauthorized' },
      ok: false,
      status: 401,
    });

    await expect(api.listBooks()).rejects.toThrow('Unauthorized');
    expect(auth.getToken()).toBeNull();
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

  it('updates user cache when response includes user', async () => {
    const user = { id: '1', username: 'verified', created_at: '', updated_at: '' };
    globalThis.fetch = mockFetch({ body: { valid: true, user }, ok: true });
    localStorage.setItem('token', 'token');

    const result = await api.verify();

    expect(result.valid).toBe(true);
    expect(auth.getCurrentUser()).toEqual(user);
  });
});
