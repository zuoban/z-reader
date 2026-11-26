import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import type { Book, BookDownloadProgress, FetchBookOptions } from '@/lib/api';
import { DEFAULT_TIMEOUT } from '@/lib/config';
import { createBookFile, fetchBook } from '@/lib/book-download';
import { bookDownloadAborted, shareBookDownload } from '@/lib/shared-book-download';
import {
  clearPartialBookDownload,
  createPartialBookDownloadWriter,
  getOfflineBookEntry,
  getPartialBookDownload,
  type OfflineBookEntry,
  type PartialBookDownload,
} from '@/lib/offline-books';
import { deferred } from '@/test/deferred';

vi.mock('@/lib/offline-books', () => ({
  getPartialBookDownload: vi.fn(),
  createPartialBookDownloadWriter: vi.fn(),
  clearPartialBookDownload: vi.fn(),
  getOfflineBookEntry: vi.fn(),
}));

const encoder = new TextEncoder();

function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    user_id: 'user-1',
    title: 'Test Book',
    author: 'Test Author',
    filename: 'test-book.epub',
    format: 'epub',
    size: 1024,
    content_hash: 'hash-v1',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeStreamingResponse(
  chunks: Array<Uint8Array | (() => Promise<Uint8Array | null>)>,
  init: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    onCancel?: () => void;
  } = {}
): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const next = chunks[index++];
      const chunk = typeof next === 'function' ? await next() : next;
      if (chunk === null) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      init.onCancel?.();
    },
  });

  return new Response(stream, {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.headers,
  });
}

type TestDownloadContext = Parameters<typeof fetchBook>[2];

function makeContext(overrides: Partial<TestDownloadContext> = {}): TestDownloadContext {
  const authError = () => new Error('登录状态已变更');
  const context: TestDownloadContext = {
    library: overrides.library ?? 'user-1',
    generation: overrides.generation ?? (() => 'gen-1'),
    getBook: overrides.getBook ?? vi.fn(async (id: string) => makeBook({ id })),
    fetchBook: overrides.fetchBook ?? vi.fn((id: string, options: FetchBookOptions): Promise<Blob> =>
      fetchBook(id, options, context)
    ),
    requestFile: overrides.requestFile ?? vi.fn(async () => new Response('')),
    isApiError: overrides.isApiError ?? (() => false),
    authChangedError: overrides.authChangedError ?? authError,
  };
  return context;
}

describe('book-download', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('File', NodeFile);
    vi.mocked(getPartialBookDownload).mockResolvedValue(null);
    vi.mocked(clearPartialBookDownload).mockResolvedValue(undefined);
    vi.mocked(createPartialBookDownloadWriter).mockResolvedValue({
      append: vi.fn(async () => {}),
    });
    vi.mocked(getOfflineBookEntry).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('fetchBook streaming downloads', () => {
    it('streams a fresh 200 OK download with throttled progress updates and final 100% callback', async () => {
      let now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);

      const chunk1 = encode('hello');
      const chunk2 = encode(' ');
      const chunk3 = encode('world!');
      const totalBytes = chunk1.byteLength + chunk2.byteLength + chunk3.byteLength;

      const requestFile = vi.fn(async () =>
        makeStreamingResponse(
          [
            async () => {
              now = 1050; // within 160ms throttle window -> skipped
              return chunk1;
            },
            async () => {
              now = 1100;
              return new Uint8Array(0); // empty chunk -> ignored
            },
            async () => {
              now = 1200; // >= 160ms since last report -> reported
              return chunk2;
            },
            async () => {
              now = 1250; // within 160ms -> skipped until forced final callback
              return chunk3;
            },
          ],
          {
            status: 200,
            headers: {
              'Content-Length': String(totalBytes),
              'Content-Type': 'application/epub+zip',
              ETag: '"etag-fresh"',
            },
          }
        )
      );

      const progressEvents: BookDownloadProgress[] = [];
      const context = makeContext({ requestFile });

      const blob = await fetchBook('book/1', {
        onProgress: (progress) => progressEvents.push(progress),
      }, context);

      expect(requestFile).toHaveBeenCalledWith(
        '/api/books/book%2F1/file',
        expect.objectContaining({
          credentials: 'include',
          headers: undefined,
        })
      );
      expect(blob.type).toBe('application/epub+zip');
      expect(await blob.text()).toBe('hello world!');

      // Initial forced 0%, one throttled intermediate event at 6 bytes, and forced final 100%
      expect(progressEvents).toHaveLength(3);
      expect(progressEvents[0]).toMatchObject({
        downloadedBytes: 0,
        totalBytes,
        percentage: 0,
        bytesPerSecond: null,
        resumed: false,
      });
      expect(progressEvents[1]).toMatchObject({
        downloadedBytes: 6,
        totalBytes,
        resumed: false,
      });
      expect(progressEvents[1].percentage).toBeCloseTo((6 / totalBytes) * 100);
      expect(progressEvents[1].bytesPerSecond).toBeGreaterThan(0);
      expect(progressEvents[2]).toMatchObject({
        downloadedBytes: totalBytes,
        totalBytes,
        percentage: 100,
        resumed: false,
      });
    });

    it('persists 1 MiB batches to the partial writer and clears partial cache after completion', async () => {
      const append = vi.fn(async () => {});
      vi.mocked(createPartialBookDownloadWriter).mockResolvedValue({ append });

      const oneMiB = new Uint8Array(1024 * 1024).fill(65);
      const secondMiB = new Uint8Array(1024 * 1024).fill(66);
      const tail = encode('end');
      const total = oneMiB.byteLength + secondMiB.byteLength + tail.byteLength;

      const requestFile = vi.fn(async () =>
        makeStreamingResponse([oneMiB, secondMiB, tail], {
          status: 200,
          headers: {
            'Content-Length': String(total),
            'Content-Type': 'application/epub+zip',
            ETag: '"etag-large"',
          },
        })
      );

      const blob = await fetchBook('large-book', {}, makeContext({ requestFile }));

      expect(blob.size).toBe(total);
      expect(createPartialBookDownloadWriter).toHaveBeenCalledWith(
        'user-1',
        'large-book',
        total,
        'application/epub+zip',
        null,
        '"etag-large"'
      );
      expect(append).toHaveBeenCalledTimes(2);
      // Wait a microtask for fire-and-forget cleanup chain on fresh downloads
      await vi.waitFor(() => {
        expect(clearPartialBookDownload).toHaveBeenCalledWith('user-1', 'large-book');
      });
    });

    it('finishes in memory even when partial writer creation or append fails', async () => {
      vi.mocked(createPartialBookDownloadWriter).mockRejectedValueOnce(new Error('quota full'));

      const oneMiB = new Uint8Array(1024 * 1024).fill(65);
      const requestFile = vi.fn(async () =>
        makeStreamingResponse([oneMiB], {
          status: 200,
          headers: { 'Content-Length': String(oneMiB.byteLength) },
        })
      );

      const blob1 = await fetchBook('writer-init-fail', {}, makeContext({ requestFile }));
      expect(blob1.size).toBe(oneMiB.byteLength);

      const failingAppend = vi.fn().mockRejectedValueOnce(new Error('disk error'));
      vi.mocked(createPartialBookDownloadWriter).mockResolvedValueOnce({ append: failingAppend });

      const blob2 = await fetchBook('writer-append-fail', {}, makeContext({ requestFile }));
      expect(blob2.size).toBe(oneMiB.byteLength);
      expect(failingAppend).toHaveBeenCalledTimes(1);
    });

    it('falls back to response.blob() when response.body is null', async () => {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/pdf', 'Content-Length': '12' }),
        body: null,
        blob: vi.fn(async () => new Blob(['pdf-contents'], { type: 'application/pdf' })),
      } as unknown as Response;

      const progressEvents: BookDownloadProgress[] = [];
      const blob = await fetchBook('null-body-book', {
        onProgress: (p) => progressEvents.push(p),
      }, makeContext({
        requestFile: vi.fn(async () => response),
      }));

      expect(response.blob).toHaveBeenCalledOnce();
      expect(await blob.text()).toBe('pdf-contents');
      expect(progressEvents.at(-1)).toMatchObject({
        downloadedBytes: 12,
        totalBytes: 12,
        percentage: 100,
        resumed: false,
      });
    });

    it('rejects when response.body is null and response.blob() is empty', async () => {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: null,
        blob: vi.fn(async () => new Blob([])),
      } as unknown as Response;

      await expect(
        fetchBook('empty-blob-book', {}, makeContext({
          requestFile: vi.fn(async () => response),
        }))
      ).rejects.toThrow('书籍文件为空');
    });
  });

  describe('resumed downloads and Range fallback handling', () => {
    it('resumes a 206 Partial Content download with Range and If-Range headers', async () => {
      const partial: PartialBookDownload = {
        chunks: [new Blob(['hello'])],
        downloadedBytes: 5,
        totalBytes: 10,
        contentType: 'application/epub+zip',
        etag: '"etag-v1"',
      };
      vi.mocked(getPartialBookDownload).mockResolvedValue(partial);

      const requestFile = vi.fn(async () =>
        makeStreamingResponse([encode('world')], {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': 'bytes 5-9/10',
            'Content-Length': '5',
          },
        })
      );

      const progressEvents: BookDownloadProgress[] = [];
      const blob = await fetchBook('resume-ok', {
        onProgress: (p) => progressEvents.push(p),
      }, makeContext({ requestFile }));

      expect(requestFile).toHaveBeenCalledTimes(1);
      expect(requestFile).toHaveBeenCalledWith(
        '/api/books/resume-ok/file',
        expect.objectContaining({
          credentials: 'include',
          headers: {
            Range: 'bytes=5-',
            'If-Range': '"etag-v1"',
          },
        })
      );
      expect(await blob.text()).toBe('helloworld');
      expect(blob.type).toBe('application/epub+zip');
      expect(progressEvents[0]).toMatchObject({
        downloadedBytes: 5,
        totalBytes: 10,
        percentage: 50,
        resumed: true,
      });
      expect(progressEvents.at(-1)).toMatchObject({
        downloadedBytes: 10,
        totalBytes: 10,
        percentage: 100,
        resumed: true,
      });
      expect(clearPartialBookDownload).toHaveBeenCalledWith('user-1', 'resume-ok');
    });

    it('supports 206 resume without ETag and wildcard Content-Range total', async () => {
      vi.mocked(getPartialBookDownload).mockResolvedValue({
        chunks: [new Blob(['abc'])],
        downloadedBytes: 3,
        totalBytes: null,
        contentType: 'application/octet-stream',
      });

      const requestFile = vi.fn(async () =>
        makeStreamingResponse([encode('def')], {
          status: 206,
          headers: {
            'Content-Range': 'bytes 3-5/*',
          },
        })
      );

      const progressEvents: BookDownloadProgress[] = [];
      const blob = await fetchBook('resume-wildcard', {
        onProgress: (p) => progressEvents.push(p),
      }, makeContext({ requestFile }));

      expect(requestFile).toHaveBeenCalledWith(
        '/api/books/resume-wildcard/file',
        expect.objectContaining({
          headers: { Range: 'bytes=3-' },
        })
      );
      expect(await blob.text()).toBe('abcdef');
      expect(progressEvents.at(-1)).toMatchObject({
        downloadedBytes: 6,
        totalBytes: null,
        percentage: null,
        resumed: true,
      });
    });

    it('clears partial cache and uses fresh body when server replies 200 OK instead of 206', async () => {
      vi.mocked(getPartialBookDownload).mockResolvedValue({
        chunks: [new Blob(['stale'])],
        downloadedBytes: 5,
        totalBytes: 10,
        contentType: 'application/epub+zip',
        etag: '"old-etag"',
      });

      const requestFile = vi.fn(async () =>
        makeStreamingResponse([encode('fresh-content')], {
          status: 200,
          headers: {
            'Content-Length': '13',
            'Content-Type': 'application/epub+zip',
            ETag: '"new-etag"',
          },
        })
      );

      const progressEvents: BookDownloadProgress[] = [];
      const blob = await fetchBook('etag-changed', {
        onProgress: (p) => progressEvents.push(p),
      }, makeContext({ requestFile }));

      expect(requestFile).toHaveBeenCalledTimes(1);
      expect(clearPartialBookDownload).toHaveBeenCalledWith('user-1', 'etag-changed');
      expect(await blob.text()).toBe('fresh-content');
      expect(progressEvents[0]).toMatchObject({
        downloadedBytes: 0,
        totalBytes: 13,
        resumed: false,
      });
    });

    it('clears partial cache and retries from byte 0 on 416 Range Not Satisfiable', async () => {
      vi.mocked(getPartialBookDownload).mockResolvedValue({
        chunks: [new Blob(['stale-prefix'])],
        downloadedBytes: 12,
        totalBytes: 20,
        contentType: 'application/epub+zip',
        etag: '"etag-416"',
      });

      const cancelFirst = vi.fn();
      const requestFile = vi.fn()
        .mockResolvedValueOnce(
          makeStreamingResponse([encode('ignored')], {
            status: 416,
            statusText: 'Range Not Satisfiable',
            onCancel: cancelFirst,
          })
        )
        .mockResolvedValueOnce(
          makeStreamingResponse([encode('complete-file')], {
            status: 200,
            headers: { 'Content-Length': '13' },
          })
        );

      const blob = await fetchBook('range-416', {}, makeContext({ requestFile }));

      expect(cancelFirst).toHaveBeenCalledOnce();
      expect(clearPartialBookDownload).toHaveBeenCalledWith('user-1', 'range-416');
      expect(requestFile).toHaveBeenCalledTimes(2);
      expect(requestFile.mock.calls[0][1]).toMatchObject({
        headers: { Range: 'bytes=12-', 'If-Range': '"etag-416"' },
      });
      expect(requestFile.mock.calls[1][1]).toMatchObject({
        headers: undefined,
      });
      expect(await blob.text()).toBe('complete-file');
    });

    it.each([
      ['mismatched start', 'bytes 0-9/10'],
      ['malformed header', 'invalid-range'],
      ['missing header', ''],
    ])('restarts from byte 0 on 206 with %s Content-Range', async (_label, contentRange) => {
      vi.mocked(getPartialBookDownload).mockResolvedValue({
        chunks: [new Blob(['12345'])],
        downloadedBytes: 5,
        totalBytes: 10,
        contentType: 'application/epub+zip',
      });

      const cancelBad206 = vi.fn();
      const requestFile = vi.fn()
        .mockResolvedValueOnce(
          makeStreamingResponse([encode('bad')], {
            status: 206,
            headers: contentRange ? { 'Content-Range': contentRange } : {},
            onCancel: cancelBad206,
          })
        )
        .mockResolvedValueOnce(
          makeStreamingResponse([encode('restarted!')], {
            status: 200,
            headers: { 'Content-Length': '10' },
          })
        );

      const blob = await fetchBook(`bad-206-${contentRange}`, {}, makeContext({ requestFile }));

      expect(cancelBad206).toHaveBeenCalledOnce();
      expect(clearPartialBookDownload).toHaveBeenCalledWith('user-1', `bad-206-${contentRange}`);
      expect(requestFile).toHaveBeenCalledTimes(2);
      expect(await blob.text()).toBe('restarted!');
    });
  });

  describe('error handling, aborts, auth changes, and timeouts', () => {
    it.each([
      [401, 'Unauthorized'],
      [404, 'Not Found'],
      [500, 'Internal Server Error'],
    ])('throws formatted error for HTTP %i response', async (status, statusText) => {
      const requestFile = vi.fn(async () =>
        new Response('error', { status, statusText })
      );

      await expect(
        fetchBook(`http-${status}`, {}, makeContext({ requestFile }))
      ).rejects.toThrow(`加载书籍失败：${status} ${statusText}`);
    });

    it('propagates network errors from requestFile', async () => {
      const networkError = new TypeError('Failed to fetch');
      const requestFile = vi.fn().mockRejectedValue(networkError);

      await expect(
        fetchBook('network-fail', {}, makeContext({ requestFile }))
      ).rejects.toBe(networkError);
    });

    it('rejects empty streaming responses', async () => {
      const requestFile = vi.fn(async () =>
        makeStreamingResponse([], { status: 200, headers: { 'Content-Length': '0' } })
      );

      await expect(
        fetchBook('empty-stream', {}, makeContext({ requestFile }))
      ).rejects.toThrow('书籍文件为空');
    });

    it('persists buffered chunks and rejects when stream ends before totalBytes', async () => {
      const append = vi.fn<(chunk: Blob) => Promise<void>>(async () => {});
      vi.mocked(createPartialBookDownloadWriter).mockResolvedValue({ append });

      const requestFile = vi.fn(async () =>
        makeStreamingResponse([encode('partial')], {
          status: 200,
          headers: { 'Content-Length': '20' },
        })
      );

      await expect(
        fetchBook('truncated-book', {}, makeContext({ requestFile }))
      ).rejects.toThrow('书籍下载未完成，请重试以继续下载');

      expect(append).toHaveBeenCalledTimes(1);
      const savedChunk = append.mock.calls[0][0];
      expect(await savedChunk.text()).toBe('partial');
    });

    it('rejects immediately when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const requestFile = vi.fn();

      await expect(
        fetchBook('pre-aborted', { signal: controller.signal }, makeContext({ requestFile }))
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(requestFile).not.toHaveBeenCalled();
    });

    it('aborts mid-stream, cancels reader, and flushes pending batch to partial storage', async () => {
      let now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        now += 200;
        return now;
      });

      const append = vi.fn<(chunk: Blob) => Promise<void>>(async () => {});
      vi.mocked(createPartialBookDownloadWriter).mockResolvedValue({ append });

      const firstChunkConsumed = deferred<void>();
      const secondChunkGate = deferred<Uint8Array | null>();
      const onCancel = vi.fn(() => secondChunkGate.resolve(null));
      const requestFile = vi.fn(async () =>
        makeStreamingResponse(
          [
            encode('chunk-one'),
            () => secondChunkGate.promise,
          ],
          { status: 200, headers: { 'Content-Length': '100' }, onCancel }
        )
      );

      const controller = new AbortController();
      const promise = fetchBook('mid-abort', {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.downloadedBytes > 0) firstChunkConsumed.resolve();
        },
      }, makeContext({ requestFile }));

      await firstChunkConsumed.promise;
      controller.abort();

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => {
        expect(onCancel).toHaveBeenCalled();
        expect(append).toHaveBeenCalledTimes(1);
      });
      expect(await append.mock.calls[0][0].text()).toBe('chunk-one');
    });

    it('rejects with authChangedError when auth generation changes mid-download', async () => {
      let currentGen = 'gen-1';
      const responseGate = deferred<Response>();
      const onCancel = vi.fn();

      const context = makeContext({
        generation: () => currentGen,
        requestFile: vi.fn(() => responseGate.promise),
      });

      const promise = fetchBook('auth-change', {}, context);
      await vi.waitFor(() => expect(context.requestFile).toHaveBeenCalledOnce());

      currentGen = 'gen-2';
      responseGate.resolve(
        makeStreamingResponse([encode('secret')], { status: 200, onCancel })
      );

      await expect(promise).rejects.toThrow('登录状态已变更');
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('rejects with timeout error when stream stalls beyond DEFAULT_TIMEOUT', async () => {
      vi.useFakeTimers();

      const append = vi.fn(async () => {});
      vi.mocked(createPartialBookDownloadWriter).mockResolvedValue({ append });

      const cancelReader = vi.fn();
      let readCount = 0;
      const stalledResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Length': '50' }),
        body: {
          getReader: () => ({
            read: vi.fn(() => {
              readCount += 1;
              if (readCount === 1) {
                return Promise.resolve({ done: false, value: encode('start') });
              }
              return new Promise<ReadableStreamReadResult<Uint8Array>>(() => {});
            }),
            cancel: vi.fn(async () => {
              cancelReader();
            }),
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response;

      const context = makeContext({
        requestFile: vi.fn(async () => stalledResponse),
      });

      const promise = fetchBook('timeout-book', {}, context);
      const assertion = expect(promise).rejects.toThrow('书籍下载超时，请重试以继续下载');

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT);
      await assertion;

      expect(cancelReader).toHaveBeenCalledOnce();
      expect(append).toHaveBeenCalledTimes(1);
    });
  });

  describe('shared in-flight download deduplication', () => {
    it('deduplicates concurrent downloads, replays latest progress, isolates callback errors, and handles partial vs full aborts', async () => {
      const gate1 = deferred<Uint8Array | null>();
      const gate2 = deferred<Uint8Array | null>();
      const onCancel = vi.fn();
      const requestFile = vi.fn(async () =>
        makeStreamingResponse(
          [
            () => gate1.promise,
            () => gate2.promise,
          ],
          { status: 200, headers: { 'Content-Length': '10' }, onCancel }
        )
      );

      const context = makeContext({ requestFile });
      const sub1Controller = new AbortController();
      const sub1Progress: BookDownloadProgress[] = [];
      const sub2Progress: BookDownloadProgress[] = [];

      const p1 = fetchBook('shared-1', {
        signal: sub1Controller.signal,
        onProgress: (p) => {
          sub1Progress.push(p);
          if (sub1Progress.length === 1) throw new Error('observer bug');
        },
      }, context);

      await vi.waitFor(() => expect(requestFile).toHaveBeenCalledOnce());
      gate1.resolve(encode('12345'));
      await vi.waitFor(() => expect(sub1Progress.length).toBeGreaterThanOrEqual(1));

      // Second subscriber joins mid-flight and receives cached latestProgress immediately
      const p2 = fetchBook('shared-1', {
        onProgress: (p) => sub2Progress.push(p),
      }, context);

      expect(requestFile).toHaveBeenCalledOnce();
      expect(sub2Progress.length).toBeGreaterThanOrEqual(1);

      // Aborting subscriber 1 does not cancel subscriber 2
      sub1Controller.abort();
      await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
      expect(onCancel).not.toHaveBeenCalled();

      gate2.resolve(encode('67890'));
      const blob = await p2;
      expect(await blob.text()).toBe('1234567890');
    });

    it('cancels the shared transfer when the last subscriber aborts and waits before restarting', async () => {
      const firstFinish = deferred<Blob>();
      let calls = 0;
      const start = vi.fn((opts: FetchBookOptions) => {
        calls += 1;
        if (calls === 1) {
          return firstFinish.promise;
        }
        expect(opts.signal?.aborted).toBe(false);
        return Promise.resolve(new Blob(['restarted']));
      });

      const c1 = new AbortController();
      const p1 = shareBookDownload('restart-key', { signal: c1.signal }, start);
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

      // Abort the only subscriber -> underlying controller is aborted, but firstFinish hasn't settled yet
      c1.abort();
      await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
      expect(start.mock.calls[0][0].signal?.aborted).toBe(true);

      // A waiting subscriber that aborts before previous settles should reject without restarting
      const cWaiterAbort = new AbortController();
      const pWaiterAbort = shareBookDownload('restart-key', { signal: cWaiterAbort.signal }, start);
      cWaiterAbort.abort();
      await expect(pWaiterAbort).rejects.toMatchObject({ name: 'AbortError' });

      // Another subscriber waits for previous cleanup, then restarts
      const p2 = shareBookDownload('restart-key', {}, start);
      expect(start).toHaveBeenCalledTimes(1);

      firstFinish.reject(bookDownloadAborted());
      const blob = await p2;
      expect(start).toHaveBeenCalledTimes(2);
      expect(await blob.text()).toBe('restarted');
    });
  });

  describe('createBookFile', () => {
    it('returns the offline cached file when content_hash matches without downloading', async () => {
      const cachedFile = new File(['cached-epub'], 'cached.epub', { type: 'application/epub+zip' });
      const cachedEntry: OfflineBookEntry = {
        file: cachedFile,
        contentHash: 'hash-v1',
        filename: 'cached.epub',
        title: 'Test Book',
        author: 'Test Author',
        size: cachedFile.size,
        savedAt: '2026-01-01T00:00:00.000Z',
      };
      vi.mocked(getOfflineBookEntry).mockResolvedValue(cachedEntry);

      const fetchBookSpy = vi.fn();
      const context = makeContext({
        getBook: vi.fn(async () => makeBook({ content_hash: 'hash-v1' })),
        fetchBook: fetchBookSpy,
      });

      const file = await createBookFile('book-1', {}, context);
      expect(file).toBe(cachedFile);
      expect(fetchBookSpy).not.toHaveBeenCalled();
    });

    it('downloads a fresh file when cached content_hash is stale and wraps it in File', async () => {
      const staleFile = new File(['old'], 'test-book.epub', { type: 'application/epub+zip' });
      vi.mocked(getOfflineBookEntry).mockResolvedValue({
        file: staleFile,
        contentHash: 'hash-old',
        filename: 'test-book.epub',
        title: 'Test Book',
        author: 'Test Author',
        size: 3,
        savedAt: '2026-01-01T00:00:00.000Z',
      });

      const fetchBookSpy = vi.fn(async () => new Blob(['new-epub'], { type: 'application/epub+zip' }));
      const context = makeContext({
        getBook: vi.fn(async () => makeBook({ content_hash: 'hash-new', filename: 'updated.epub' })),
        fetchBook: fetchBookSpy,
      });

      const file = await createBookFile('book-1', {}, context);
      expect(fetchBookSpy).toHaveBeenCalledOnce();
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe('updated.epub');
      expect(await file.text()).toBe('new-epub');
    });

    it('falls back to cached offline file when metadata request fails with a non-API network error', async () => {
      const cachedFile = new File(['offline-copy'], 'offline.epub', { type: 'application/epub+zip' });
      vi.mocked(getOfflineBookEntry).mockResolvedValue({
        file: cachedFile,
        contentHash: 'hash-v1',
        filename: 'offline.epub',
        title: 'Offline Book',
        author: 'Author',
        size: cachedFile.size,
        savedAt: '2026-01-01T00:00:00.000Z',
      });

      const context = makeContext({
        getBook: vi.fn().mockRejectedValue(new TypeError('offline')),
        isApiError: () => false,
      });

      const file = await createBookFile('book-1', {}, context);
      expect(file).toBe(cachedFile);
    });

    it('rethrows API errors and cancels in-flight download when no cache hit applies', async () => {
      const apiError = Object.assign(new Error('Forbidden'), { status: 403 });
      const downloadDeferred = deferred<Blob>();
      const fetchBookSpy = vi.fn((_id: string, opts: FetchBookOptions) => {
        opts.signal?.addEventListener('abort', () => downloadDeferred.reject(bookDownloadAborted()));
        return downloadDeferred.promise;
      });

      const context = makeContext({
        getBook: vi.fn().mockRejectedValue(apiError),
        fetchBook: fetchBookSpy,
        isApiError: (err) => err === apiError,
      });

      await expect(createBookFile('book-1', {}, context)).rejects.toBe(apiError);
      expect(fetchBookSpy).toHaveBeenCalledOnce();
      expect(fetchBookSpy.mock.calls[0][1].signal?.aborted).toBe(true);
    });

    it('rejects with authChangedError if generation changes during createBookFile', async () => {
      let gen = 'gen-1';
      const metaDeferred = deferred<Book>();
      const context = makeContext({
        generation: () => gen,
        getBook: vi.fn(() => metaDeferred.promise),
        fetchBook: vi.fn(async () => new Blob(['data'])),
      });

      const promise = createBookFile('book-1', {}, context);
      await Promise.resolve();
      gen = 'gen-2';
      metaDeferred.resolve(makeBook());

      await expect(promise).rejects.toThrow('登录状态已变更');
    });

    it('rejects with AbortError when signal is aborted while awaiting metadata in createBookFile', async () => {
      const controller = new AbortController();
      const metaDeferred = deferred<Book>();
      const getBook = vi.fn(() => metaDeferred.promise);
      const context = makeContext({
        getBook,
        fetchBook: vi.fn(async () => new Blob(['data'])),
      });

      const promise = createBookFile('book-1', { signal: controller.signal }, context);
      // Let getOfflineBookEntry resolve before aborting so abort hits the post-metadata check
      await Promise.resolve();
      await Promise.resolve();
      controller.abort();
      metaDeferred.resolve(makeBook());

      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });
  });
});
