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

async function fetchApi<T>(path: string, options: RequestInit = {}, timeout?: number): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  let lastError: unknown;
  const apiBases = getApiBaseCandidates();
  const generation = getAccessGeneration();
  const changesAccess = path === '/api/login' || path === '/api/logout';

  for (const base of apiBases) {
    if (!changesAccess) assertCurrentAccess(generation);
    const { controller, timeoutId } = createAbortController(timeout);
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        credentials: options.credentials ?? 'include',
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });

      if (!changesAccess) assertCurrentAccess(generation);
      if (!res.ok) {
        if (!changesAccess) handleAuthResponse(res, generation);
        if (shouldRetryResponseWithNextApiBase(res, apiBases, base)) {
          lastError = new ApiError('请求失败，正在尝试局域网后端', res.status);
          continue;
        }
        const error = await parseApiError(res, '请求失败');
        if (!changesAccess && res.status !== 401) assertCurrentAccess(generation);
        throw error;
      }

      const text = await res.text();
      if (!changesAccess) assertCurrentAccess(generation);
      return text ? JSON.parse(text) : (null as T);
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted || !shouldRetryWithNextApiBase(error, apiBases, base)) {
        throw normalizeRequestError(error);
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  throw normalizeRequestError(lastError);
}

async function parseJsonResponse<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text();
  if (!text) {
    throw new ApiError(fallback, res.status);
  }
  return JSON.parse(text) as T;
}

/** 统一的带认证请求，供 fetchApi 之外的 blob/form 请求使用 */
async function authedFetch(
  path: string,
  options: RequestInit = {},
  timeout: number | null = DEFAULT_TIMEOUT
): Promise<Response> {
  const headers: HeadersInit = {
    ...options.headers,
  };

  let lastError: unknown;
  const apiBases = getApiBaseCandidates();
  const generation = getAccessGeneration();

  for (const base of apiBases) {
    assertCurrentAccess(generation);
    const abortRequest = timeout === null ? null : createAbortController(timeout);
    const cancel = () => abortRequest?.controller.abort(options.signal?.reason);
    if (options.signal?.aborted) cancel();
    else if (abortRequest) options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        credentials: options.credentials ?? 'include',
        cache: 'no-store',
        headers,
        signal: abortRequest?.controller.signal ?? options.signal,
      });
      assertCurrentAccess(generation);
      handleAuthResponse(res, generation);
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

function shouldRetryWithNextApiBase(
  error: unknown,
  apiBases: string[],
  currentBase: string
): boolean {
  if (apiBases[apiBases.length - 1] === currentBase) return false;
  if (error instanceof ApiError) return false;
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
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (sort) params.set('sort', sort);
    if (options.category) params.set('category', options.category);
    else if (options.uncategorized) params.set('uncategorized', 'true');
    return fetchApi<BookPage>(`/api/books?${params.toString()}`, { signal: options.signal });
  },

  searchBooks: async (
    query: string,
    cursor?: string,
    limit = 20,
    sort = 'recent_read',
    options: BookQueryOptions = {}
  ): Promise<BookPage> => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (sort) params.set('sort', sort);
    if (options.category) params.set('category', options.category);
    else if (options.uncategorized) params.set('uncategorized', 'true');
    return fetchApi<BookPage>(`/api/books/search?${params.toString()}`, { signal: options.signal });
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

  getBookLibrarySummary: async (): Promise<BookLibrarySummary> => {
    return fetchApi<BookLibrarySummary>('/api/books/summary');
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
        const res = await authedFetch('/api/books', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw await parseApiError(res, '上传失败');
        }

        const book = await parseJsonResponse<Book>(res, '上传成功但响应为空');
        assertCurrentAccess(generation);
        return book;
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
    const generation = getAccessGeneration();
    const formData = new FormData();
    formData.append('file', file, filename);

    const res = await authedFetch(`/api/books/${encodeURIComponent(id)}/cover`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw await parseApiError(res, '上传封面失败');
    }

    const book = await parseJsonResponse<Book>(res, '上传封面成功但响应为空');
    assertCurrentAccess(generation);
    return book;
  },

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
    const body: {
      cfi: string;
      percentage: number;
      expected_updated_at?: string;
      create_only?: boolean;
      device_id?: string;
    } = { cfi, percentage };
    if (options.expectedUpdatedAt) {
      body.expected_updated_at = options.expectedUpdatedAt;
    }
    if (options.createOnly) {
      body.create_only = true;
    }
    if (options.deviceId) {
      body.device_id = options.deviceId;
    }

    return fetchApi<Progress>(`/api/progress/${encodeURIComponent(bookId)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  saveProgressOnUnload: (
    bookId: string,
    cfi: string,
    percentage: number,
    options: { expectedUpdatedAt?: string; createOnly?: boolean; deviceId?: string } = {},
  ): void => {
    const body: {
      cfi: string;
      percentage: number;
      expected_updated_at?: string;
      create_only?: boolean;
      device_id?: string;
    } = { cfi, percentage };
    if (options.expectedUpdatedAt) {
      body.expected_updated_at = options.expectedUpdatedAt;
    }
    if (options.createOnly) {
      body.create_only = true;
    }
    if (options.deviceId) {
      body.device_id = options.deviceId;
    }

    void fetch(`${API_BASE}/api/progress/${encodeURIComponent(bookId)}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {
      // Ignore unload-time failures.
    });
  },

  listBookmarks: async (bookId: string): Promise<Bookmark[]> => {
    return fetchApi<Bookmark[]>(`/api/books/${encodeURIComponent(bookId)}/bookmarks`);
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
