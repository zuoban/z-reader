import {
  API_BASE,
  createAbortController,
  DEFAULT_TIMEOUT,
  getApiBaseCandidates,
  isAbortLikeError,
  normalizeRequestError,
} from '@/lib/config';
import { getAccessGeneration, getOfflineLibrary, setAccessGeneration } from '@/lib/library-access';
import { transitionOfflineProgress } from '@/lib/offline-progress-storage';
import { clearOfflineBooks, removeOfflineBook } from '@/lib/offline-books';

export { PERSONAL_LIBRARY } from '@/lib/library-access';

// Keep encoded UUID status paths below 4 KiB, leaving room for HTTP headers.
const BOOK_STATUS_BATCH_SIZE = 100;

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string;
  filename: string;
  format: string;
  size: number;
  content_hash?: string;
  cover_path?: string;
  cover_thumb_path?: string;
  cover_missing?: boolean;
	processing_state?: 'pending' | 'ready' | 'failed';
  category?: string;
  created_at: string;
  last_read_at?: string;
}

export interface BookDownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
  bytesPerSecond: number | null;
  resumed: boolean;
}

export interface FetchBookOptions {
  onProgress?: (progress: BookDownloadProgress) => void;
  signal?: AbortSignal;
}

export interface BookPage {
	books: Book[];
	next_cursor?: string;
}

export interface BookQueryOptions {
  category?: string;
  uncategorized?: boolean;
  signal?: AbortSignal;
}

export interface BookLibrarySummary {
	total: number;
	uncategorized: number;
	categories: Record<string, number>;
}

export interface BatchReparseBooksResponse {
  updated_ids: string[];
  failed_ids: string[];
  books: Book[];
}

export interface Progress {
  book_id: string;
  user_id: string;
  cfi: string;
  percentage: number;
  device_id?: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  book_id: string;
  user_id: string;
  cfi: string;
  percentage: number;
  chapter?: string;
  note?: string;
  created_at: string;
}

interface AccessStatus {
  valid: boolean;
  password_required: boolean;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const AUTH_EXPIRED_EVENT = 'z-reader-auth-expired';

function rotateAccess(generation: string | null, reason: 'expired' | 'login' | 'logout') {
  if (typeof window === 'undefined' || getAccessGeneration() !== generation) return false;
  const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  transitionOfflineProgress(generation, next, reason);
  setAccessGeneration(next);
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // The current tab can still invalidate access when storage is blocked.
  }
  void clearOfflineBooks(getOfflineLibrary(generation)).catch(() => {});
  return true;
}

function authChangedError() {
  return new ApiError('登录状态已变更，请重新打开书籍', 401);
}

function assertCurrentAccess(generation: string | null) {
  if (getAccessGeneration() !== generation) throw authChangedError();
}

let authOperation = Promise.resolve();
let authChanging = false;
let deferredExpiry: { generation: string | null } | undefined;

function expireAccess(generation: string | null) {
  if (rotateAccess(generation, 'expired')) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export function handleAuthResponse(res: Response, generation = getAccessGeneration()): void {
  if (res.status !== 401 || generation !== getAccessGeneration()) return;
  if (authChanging) {
    deferredExpiry = { generation };
    return;
  }
  expireAccess(generation);
}

function changeAccess<T>(reason: 'login' | 'logout', request: () => Promise<T>): Promise<T> {
  const operation = authOperation.then(async () => {
    authChanging = true;
    try {
      const result = await request();
      rotateAccess(getAccessGeneration(), reason);
      return result;
    } finally {
      authChanging = false;
      const expiry = deferredExpiry;
      deferredExpiry = undefined;
      if (expiry) expireAccess(expiry.generation);
    }
  });
  authOperation = operation.then(() => {}, () => {});
  return operation;
}

async function parseApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
  return new ApiError(body?.error || body?.message || fallback, res.status, body);
}

function duplicateBookFromError(error: unknown): Book | null {
  if (!(error instanceof ApiError) || error.status !== 409 || !error.details) return null;
  const details = error.details as { book?: Partial<Book> };
  const book = details.book;
  if (!book || typeof book.id !== 'string' || typeof book.filename !== 'string') return null;
  return book as Book;
}

async function requestWithFallback(
  path: string,
  options: RequestInit = {},
  timeout: number | null = DEFAULT_TIMEOUT,
  checkAccess = true,
): Promise<Response> {
  let lastError: unknown;
  const apiBases = getApiBaseCandidates();
  const generation = getAccessGeneration();

  for (const base of apiBases) {
    if (checkAccess) assertCurrentAccess(generation);
    const abortRequest = timeout === null ? null : createAbortController(timeout);
    const cancel = () => abortRequest?.controller.abort(options.signal?.reason);
    if (options.signal?.aborted) cancel();
    else if (abortRequest) options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        credentials: options.credentials ?? 'include',
        cache: 'no-store',
        signal: abortRequest?.controller.signal ?? options.signal,
      });

      if (checkAccess) {
        assertCurrentAccess(generation);
        handleAuthResponse(res, generation);
      }
      if (shouldRetryResponseWithNextApiBase(res, apiBases, base)) {
        lastError = new ApiError('请求失败，正在尝试局域网后端', res.status);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted || !shouldRetryWithNextApiBase(error, apiBases, base)) {
        throw normalizeRequestError(error);
      }
    } finally {
      if (abortRequest) {
        clearTimeout(abortRequest.timeoutId);
        options.signal?.removeEventListener('abort', cancel);
      }
    }
  }

  throw normalizeRequestError(lastError);
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
  timeout?: number,
  config: { errorFallback?: string; emptyError?: string } = {},
): Promise<T> {
  const generation = getAccessGeneration();
  const changesAccess = path === '/api/login' || path === '/api/logout';
  const headers = options.body instanceof FormData
    ? options.headers
    : {
        'Content-Type': 'application/json',
        ...options.headers,
      };
  const res = await requestWithFallback(
    path,
    {
      ...options,
      headers,
    },
    timeout,
    !changesAccess,
  );

  if (!res.ok) {
    const error = await parseApiError(res, config.errorFallback ?? '请求失败');
    if (!changesAccess && res.status !== 401) assertCurrentAccess(generation);
    throw error;
  }

  const text = await res.text();
  if (!changesAccess) assertCurrentAccess(generation);
  if (!text) {
    if (config.emptyError) throw new ApiError(config.emptyError, res.status);
    return null as T;
  }
  return JSON.parse(text) as T;
}

/** 统一的带认证请求，供 fetchApi 之外的 blob/form 请求使用 */
async function authedFetch(
  path: string,
  options: RequestInit = {},
  timeout: number | null = DEFAULT_TIMEOUT
): Promise<Response> {
  return requestWithFallback(path, options, timeout, true);
}

function buildBookQueryParams(
  base: Record<string, string>,
  cursor?: string,
  sort = 'recent_read',
  options: BookQueryOptions = {},
): string {
  const params = new URLSearchParams(base);
  if (cursor) params.set('cursor', cursor);
  if (sort) params.set('sort', sort);
  if (options.category) params.set('category', options.category);
  else if (options.uncategorized) params.set('uncategorized', 'true');
  return params.toString();
}

function buildProgressPayload(
  cfi: string,
  percentage: number,
  options: { expectedUpdatedAt?: string; createOnly?: boolean; deviceId?: string } = {},
) {
  const body: {
    cfi: string;
    percentage: number;
    expected_updated_at?: string;
    create_only?: boolean;
    device_id?: string;
  } = { cfi, percentage };
  if (options.expectedUpdatedAt) body.expected_updated_at = options.expectedUpdatedAt;
  if (options.createOnly) body.create_only = true;
  if (options.deviceId) body.device_id = options.deviceId;
  return JSON.stringify(body);
}

function shouldRetryWithNextApiBase(
  error: unknown,
  apiBases: string[],
  currentBase: string
): boolean {
  if (apiBases[apiBases.length - 1] === currentBase) return false;
  if (isAbortLikeError(error)) return true;
  return error instanceof TypeError;
}

function shouldRetryResponseWithNextApiBase(
  res: Response,
  apiBases: string[],
  currentBase: string
): boolean {
  if (apiBases[apiBases.length - 1] === currentBase) return false;
  return res.status === 502 || res.status === 503 || res.status === 504;
}

export const api = {
  login: (password: string) => changeAccess('login', () => fetchApi<AccessStatus>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })),

  logout: () => changeAccess('logout', async () => {
    await fetchApi('/api/logout', { method: 'POST' });
  }),

  verify: () => fetchApi<AccessStatus>('/api/auth/verify'),

  listBooks: async (): Promise<Book[]> => {
    return fetchApi<Book[]>('/api/books');
  },

  listBooksPage: async (
    cursor?: string, limit = 20, sort = 'recent_read', options: BookQueryOptions = {}
  ): Promise<BookPage> => {
    const queryString = buildBookQueryParams({ limit: String(limit) }, cursor, sort, options);
    return fetchApi<BookPage>(`/api/books?${queryString}`, { signal: options.signal });
  },

  searchBooks: async (
    query: string,
    cursor?: string,
    limit = 20,
    sort = 'recent_read',
    options: BookQueryOptions = {}
  ): Promise<BookPage> => {
    const queryString = buildBookQueryParams({ q: query, limit: String(limit) }, cursor, sort, options);
    return fetchApi<BookPage>(`/api/books/search?${queryString}`, { signal: options.signal });
  },

  getBooksStatus: async (bookIds: string[], signal?: AbortSignal): Promise<Book[]> => {
    const books: Book[] = [];
    for (let offset = 0; offset < bookIds.length; offset += BOOK_STATUS_BATCH_SIZE) {
      const params = new URLSearchParams({
        book_ids: bookIds.slice(offset, offset + BOOK_STATUS_BATCH_SIZE).join(','),
      });
      const result = await fetchApi<{ books: Book[] }>(`/api/books/status?${params}`, { signal });
      books.push(...(result.books ?? []));
    }
    return books;
  },

  renameBookCategory: async (from: string, to: string | null): Promise<{
    updated_ids: string[]; category?: string;
  }> => fetchApi('/api/books/categories', {
    method: 'PATCH', body: JSON.stringify({ from, to }),
  }),

  getBookLibrarySummary: async (signal?: AbortSignal): Promise<BookLibrarySummary> => {
    return fetchApi<BookLibrarySummary>('/api/books/summary', { signal });
  },

  getBook: async (id: string, signal?: AbortSignal): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${encodeURIComponent(id)}`, { signal });
  },

  updateBook: async (id: string, data: { title?: string; author?: string; category?: string | null }): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  uploadBook: async (file: File): Promise<Book> => {
    const generation = getAccessGeneration();
    const formData = new FormData();
    formData.append('file', file);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertCurrentAccess(generation);
      try {
        return await fetchApi<Book>(
          '/api/books',
          { method: 'POST', body: formData },
          DEFAULT_TIMEOUT,
          { errorFallback: '上传失败', emptyError: '上传成功但响应为空' },
        );
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) assertCurrentAccess(generation);
        const duplicate = duplicateBookFromError(error);
        if (duplicate) return duplicate;
        if (error instanceof ApiError || attempt === 1) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }

    throw new Error('上传失败');
  },

  deleteBook: async (id: string): Promise<void> => {
    const library = getOfflineLibrary();
    await fetchApi(`/api/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
    void removeOfflineBook(library, id);
  },

  deleteBooks: async (ids: string[]): Promise<{ deleted_ids: string[] }> => {
    const library = getOfflineLibrary();
    const result = await fetchApi<{ deleted_ids: string[] }>('/api/books/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    (result.deleted_ids ?? ids).forEach((id) => {
      void removeOfflineBook(library, id);
    });
    return result;
  },

  updateBooksCategory: async (
    ids: string[],
    category: string | null
  ): Promise<{ books: Book[] }> => {
    return fetchApi<{ books: Book[] }>('/api/books/batch/category', {
      method: 'POST',
      body: JSON.stringify({ ids, category }),
    });
  },

  reparseBook: async (id: string): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${encodeURIComponent(id)}/reparse`, {
      method: 'POST',
    });
  },

  batchReparseBooks: async (ids: string[]): Promise<BatchReparseBooksResponse> => {
    return fetchApi<BatchReparseBooksResponse>('/api/books/batch/reparse', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  fetchBook: async (id: string, options: FetchBookOptions = {}): Promise<Blob> => {
    const generation = getAccessGeneration();
    const { fetchBook } = await import('@/lib/book-download');
    assertCurrentAccess(generation);
    return fetchBook(id, options, bookDownloadContext(generation));
  },

  createBookFile: async (id: string, options: FetchBookOptions = {}): Promise<File | Blob> => {
    const generation = getAccessGeneration();
    const { createBookFile } = await import('@/lib/book-download');
    assertCurrentAccess(generation);
    return createBookFile(id, options, bookDownloadContext(generation));
  },

  uploadCover: async (id: string, file: Blob, filename = 'cover.png'): Promise<Book> => {
    const formData = new FormData();
    formData.append('file', file, filename);

    return fetchApi<Book>(
      `/api/books/${encodeURIComponent(id)}/cover`,
      { method: 'POST', body: formData },
      DEFAULT_TIMEOUT,
      { errorFallback: '上传封面失败', emptyError: '上传封面成功但响应为空' },
    );
  },

  deleteBookCover: (id: string): Promise<Book> =>
    fetchApi<Book>(
      `/api/books/${encodeURIComponent(id)}/cover`,
      { method: 'DELETE' },
      DEFAULT_TIMEOUT,
      { errorFallback: '移除封面失败', emptyError: '移除封面成功但响应为空' },
    ),

  fetchCover: async (
    id: string,
    size?: 'thumb',
    signal?: AbortSignal
  ): Promise<Blob | null> => {
    const query = size ? `?size=${size}` : '';
    try {
      const generation = getAccessGeneration();
      const res = await authedFetch(
        `/api/books/${encodeURIComponent(id)}/cover${query}`,
        {
          credentials: 'include',
          signal,
        },
        // When the caller supplies a signal (virtual list cancel), skip the
        // default timeout controller so abort ownership stays with the caller.
        signal ? null : DEFAULT_TIMEOUT
      );
      if (!res.ok) {
        if (res.status >= 500) {
          throw new Error(`Cover fetch failed with status ${res.status}`);
        }
        return null;
      }
      const blob = await res.blob();
      assertCurrentAccess(generation);
      return blob;
    } catch (error) {
      if (signal?.aborted || isAbortLikeError(error)) {
        return null;
      }
      throw error;
    }
  },

  getProgress: async (bookId: string): Promise<Progress> => {
    return fetchApi<Progress>(`/api/progress/${encodeURIComponent(bookId)}`);
  },

  listProgress: async (
    options: { bookIds?: string[]; updatedSince?: string; signal?: AbortSignal } = {}
  ): Promise<Progress[]> => {
    const params = new URLSearchParams();
    if (options.bookIds?.length) params.set('book_ids', options.bookIds.join(','));
    if (options.updatedSince) params.set('updated_since', options.updatedSince);
    const query = params.toString();
    return fetchApi<Progress[]>(`/api/progress${query ? `?${query}` : ''}`, { signal: options.signal });
  },

  saveProgress: async (
    bookId: string,
    cfi: string,
    percentage: number,
    options: { expectedUpdatedAt?: string; createOnly?: boolean; deviceId?: string } = {},
  ): Promise<Progress> => {
    return fetchApi<Progress>(`/api/progress/${encodeURIComponent(bookId)}`, {
      method: 'POST',
      body: buildProgressPayload(cfi, percentage, options),
    });
  },

  saveProgressOnUnload: (
    bookId: string,
    cfi: string,
    percentage: number,
    options: { expectedUpdatedAt?: string; createOnly?: boolean; deviceId?: string } = {},
  ): void => {
    void fetch(`${API_BASE}/api/progress/${encodeURIComponent(bookId)}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: buildProgressPayload(cfi, percentage, options),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {
      // Ignore unload-time failures.
    });
  },

  listBookmarks: async (bookId: string, signal?: AbortSignal): Promise<Bookmark[]> => {
    return fetchApi<Bookmark[]>(`/api/books/${encodeURIComponent(bookId)}/bookmarks`, { signal });
  },

  createBookmark: async (
    bookId: string,
    data: { cfi: string; percentage: number; chapter?: string; note?: string },
  ): Promise<Bookmark> => {
    return fetchApi<Bookmark>(`/api/books/${encodeURIComponent(bookId)}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateBookmark: async (
    bookId: string,
    bookmarkId: string,
    data: { note: string },
  ): Promise<Bookmark> => {
    return fetchApi<Bookmark>(
      `/api/books/${encodeURIComponent(bookId)}/bookmarks/${encodeURIComponent(bookmarkId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  },

  deleteBookmark: async (bookId: string, bookmarkId: string): Promise<void> => {
    await fetchApi(`/api/books/${encodeURIComponent(bookId)}/bookmarks/${encodeURIComponent(bookmarkId)}`, { method: 'DELETE' });
  },
};

const bookDownloadContext = (generation: string | null) => ({
  library: getOfflineLibrary(generation),
  generation: getAccessGeneration,
  getBook: (id: string, signal?: AbortSignal) => api.getBook(id, signal),
  fetchBook: (id: string, options: FetchBookOptions) => api.fetchBook(id, options),
  requestFile: (path: string, options: RequestInit) => {
    assertCurrentAccess(generation);
    return authedFetch(path, options);
  },
  isApiError: (error: unknown) => error instanceof ApiError,
  authChangedError,
});
