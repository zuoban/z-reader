import {
  API_BASE,
  createAbortController,
  DEFAULT_TIMEOUT,
  getApiBaseCandidates,
  isAbortLikeError,
  normalizeRequestError,
} from '@/lib/config';
import { clearOfflineBooks, getOfflineBook, removeOfflineBook } from '@/lib/offline-books';

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
  category?: string;
  created_at: string;
  last_read_at?: string;
}

export interface BookPage {
	books: Book[];
	next_cursor?: string;
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

export interface User {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
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

function getToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage?.getItem) return null;
  return localStorage.getItem('token');
}

function setToken(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage?.setItem) return;
  localStorage.setItem('token', token);
}

function removeToken(): void {
  if (typeof window === 'undefined' || !window.localStorage?.removeItem) return;
  const userID = getCurrentUser()?.id;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  void clearOfflineBooks(userID);
}

function removeLegacyToken(): void {
  if (typeof window === 'undefined' || !window.localStorage?.removeItem) return;
  localStorage.removeItem('token');
}

function getCurrentUser(): User | null {
  if (typeof window === 'undefined' || !window.localStorage?.getItem) return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

function setCurrentUser(user: User): void {
  if (typeof window === 'undefined' || !window.localStorage?.setItem) return;
  localStorage.setItem('user', JSON.stringify(user));
}

export function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: token } : {};
}

function handleUnauthorized(res: Response): void {
  if (res.status !== 401) return;
  removeToken();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export function handleAuthResponse(res: Response): void {
  handleUnauthorized(res);
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
    ...getAuthHeaders(),
    ...options.headers,
  };

  let lastError: unknown;
  const apiBases = getApiBaseCandidates();

  for (const base of apiBases) {
    const { controller, timeoutId } = createAbortController(timeout);
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        credentials: options.credentials ?? 'include',
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        handleUnauthorized(res);
        if (shouldRetryResponseWithNextApiBase(res, apiBases, base)) {
          lastError = new ApiError('请求失败，正在尝试局域网后端', res.status);
          continue;
        }
        throw await parseApiError(res, '请求失败');
      }

      const text = await res.text();
      return text ? JSON.parse(text) : (null as T);
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithNextApiBase(error, apiBases, base)) {
        throw normalizeRequestError(error);
      }
    } finally {
      clearTimeout(timeoutId);
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
async function authedFetch(path: string, options: RequestInit = {}, timeout?: number): Promise<Response> {
  const headers: HeadersInit = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  let lastError: unknown;
  const apiBases = getApiBaseCandidates();

  for (const base of apiBases) {
    const { controller, timeoutId } = createAbortController(timeout);
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        credentials: options.credentials ?? 'include',
        headers,
        signal: controller.signal,
      });
      handleUnauthorized(res);
      if (shouldRetryResponseWithNextApiBase(res, apiBases, base)) {
        lastError = new ApiError('请求失败，正在尝试局域网后端', res.status);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (!shouldRetryWithNextApiBase(error, apiBases, base)) {
        throw normalizeRequestError(error);
      }
    } finally {
      clearTimeout(timeoutId);
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
  login: async (username: string, password: string): Promise<{ token?: string; user: User }> => {
    const res = await fetchApi<{ token?: string; user: User }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    removeLegacyToken();
    setCurrentUser(res.user);
    return res;
  },

  register: async (username: string, password: string): Promise<{ token?: string; user: User }> => {
    const res = await fetchApi<{ token?: string; user: User }>('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    removeLegacyToken();
    setCurrentUser(res.user);
    return res;
  },

  logout: async (): Promise<void> => {
    try {
      await fetchApi('/api/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout API call failed:', err);
    }
    removeToken();
  },

  verify: async (): Promise<{ valid: boolean; user?: User }> => {
    const res = await fetchApi<{ valid: boolean; user?: User }>('/api/auth/verify');
    if (res.user) {
      setCurrentUser(res.user);
    }
    return res;
  },

  listBooks: async (): Promise<Book[]> => {
    return fetchApi<Book[]>('/api/books');
  },

  listBooksPage: async (cursor?: string, limit = 20, sort = 'recent_read'): Promise<BookPage> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (sort) params.set('sort', sort);
    return fetchApi<BookPage>(`/api/books?${params.toString()}`);
  },

  searchBooks: async (
    query: string,
    cursor?: string,
    limit = 20,
    sort = 'recent_read'
  ): Promise<BookPage> => {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (sort) params.set('sort', sort);
    return fetchApi<BookPage>(`/api/books/search?${params.toString()}`);
  },

  getBookLibrarySummary: async (): Promise<BookLibrarySummary> => {
    return fetchApi<BookLibrarySummary>('/api/books/summary');
  },

  getBook: async (id: string): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${id}`);
  },

  updateBook: async (id: string, data: { title?: string; author?: string; category?: string | null }): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  uploadBook: async (file: File): Promise<Book> => {
    const formData = new FormData();
    formData.append('file', file);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await authedFetch('/api/books', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw await parseApiError(res, '上传失败');
        }

        return await parseJsonResponse<Book>(res, '上传成功但响应为空');
      } catch (error) {
        const duplicate = duplicateBookFromError(error);
        if (duplicate) return duplicate;
        if (error instanceof ApiError || attempt === 1) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }

    throw new Error('上传失败');
  },

  deleteBook: async (id: string): Promise<void> => {
    await fetchApi(`/api/books/${id}`, { method: 'DELETE' });
    void removeOfflineBook(getCurrentUser()?.id ?? '', id);
  },

  deleteBooks: async (ids: string[]): Promise<{ deleted_ids: string[] }> => {
    const result = await fetchApi<{ deleted_ids: string[] }>('/api/books/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    const userID = getCurrentUser()?.id ?? '';
    (result.deleted_ids ?? ids).forEach((id) => {
      void removeOfflineBook(userID, id);
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

  getBookUrl: (id: string): string => {
    return `${API_BASE}/api/books/${id}/file`;
  },

  getCoverUrl: (id: string, size?: 'thumb'): string => {
    const query = size ? `?size=${size}` : '';
    return `${API_BASE}/api/books/${id}/cover${query}`;
  },

  fetchBook: async (id: string): Promise<Blob> => {
    try {
      const res = await authedFetch(`/api/books/${id}/file`, {
        credentials: 'include',
      }, DEFAULT_TIMEOUT);
      if (!res.ok) {
        throw new Error(`加载书籍失败：${res.status} ${res.statusText}`);
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('书籍文件为空');
      }
      return blob;
    } catch (error) {
      console.error('Failed to fetch book:', error);
      throw error;
    }
  },

  createBookFile: async (id: string): Promise<File | Blob> => {
    let book: Book;
    let blob: Blob;
    try {
      [book, blob] = await Promise.all([
        api.getBook(id),
        api.fetchBook(id),
      ]);
    } catch (error) {
      const offlineBook = await getOfflineBook(getCurrentUser()?.id ?? '', id);
      if (offlineBook) return offlineBook;
      throw error;
    }

    // Try using File constructor first, fallback to Blob for compatibility
    let file: File | Blob;
    try {
      file = new File([blob], book.filename, {
        type: blob.type,
        lastModified: Date.parse(book.created_at) || Date.now(),
      });
    } catch (error) {
      console.warn('File constructor not supported, using Blob fallback:', error);
      // Fallback: just return the blob - foliate can work with Blob objects
      file = blob;
    }

    // Ensure arrayBuffer method exists (some older browsers don't have it on Blob)
    if (!file.arrayBuffer || typeof file.arrayBuffer !== 'function') {
      console.warn('Blob.arrayBuffer not supported, adding polyfill');
      (file as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async function() {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }

    // Ensure slice method exists
    if (!file.slice || typeof file.slice !== 'function') {
      console.warn('Blob.slice not supported, adding polyfill');
      (file as Blob & { slice: (start?: number, end?: number) => Blob }).slice = function(
        this: Blob,
        start?: number,
        end?: number
      ) {
        return blob.slice.call(this, start, end);
      };
    }

    return file;
  },

  uploadCover: async (id: string, file: Blob, filename = 'cover.png'): Promise<Book> => {
    const formData = new FormData();
    formData.append('file', file, filename);

    const res = await authedFetch(`/api/books/${id}/cover`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw await parseApiError(res, '上传封面失败');
    }

    return parseJsonResponse<Book>(res, '上传封面成功但响应为空');
  },

  fetchCover: async (id: string, size?: 'thumb'): Promise<Blob | null> => {
    const query = size ? `?size=${size}` : '';
    const res = await authedFetch(`/api/books/${id}/cover${query}`, {
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    if (!res.ok) {
      return null;
    }
    return res.blob();
  },

  getProgress: async (bookId: string): Promise<Progress> => {
    return fetchApi<Progress>(`/api/progress/${bookId}`);
  },

  listProgress: async (
    options: { bookIds?: string[]; updatedSince?: string } = {}
  ): Promise<Progress[]> => {
    const params = new URLSearchParams();
    if (options.bookIds?.length) params.set('book_ids', options.bookIds.join(','));
    if (options.updatedSince) params.set('updated_since', options.updatedSince);
    const query = params.toString();
    return fetchApi<Progress[]>(`/api/progress${query ? `?${query}` : ''}`);
  },

  saveProgress: async (
    bookId: string,
    cfi: string,
    percentage: number,
    options: { expectedUpdatedAt?: string; deviceId?: string } = {},
  ): Promise<Progress> => {
    const body: {
      cfi: string;
      percentage: number;
      expected_updated_at?: string;
      device_id?: string;
    } = { cfi, percentage };
    if (options.expectedUpdatedAt) {
      body.expected_updated_at = options.expectedUpdatedAt;
    }
    if (options.deviceId) {
      body.device_id = options.deviceId;
    }

    return fetchApi<Progress>(`/api/progress/${bookId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  saveProgressOnUnload: (
    bookId: string,
    cfi: string,
    percentage: number,
    options: { expectedUpdatedAt?: string; deviceId?: string } = {},
  ): void => {
    const body: {
      cfi: string;
      percentage: number;
      expected_updated_at?: string;
      device_id?: string;
    } = { cfi, percentage };
    if (options.expectedUpdatedAt) {
      body.expected_updated_at = options.expectedUpdatedAt;
    }
    if (options.deviceId) {
      body.device_id = options.deviceId;
    }

    void fetch(`${API_BASE}/api/progress/${bookId}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Ignore unload-time failures.
    });
  },

  listBookmarks: async (bookId: string): Promise<Bookmark[]> => {
    return fetchApi<Bookmark[]>(`/api/books/${bookId}/bookmarks`);
  },

  createBookmark: async (
    bookId: string,
    data: { cfi: string; percentage: number; chapter?: string; note?: string },
  ): Promise<Bookmark> => {
    return fetchApi<Bookmark>(`/api/books/${bookId}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteBookmark: async (bookId: string, bookmarkId: string): Promise<void> => {
    await fetchApi(`/api/books/${bookId}/bookmarks/${bookmarkId}`, { method: 'DELETE' });
  },
};

export const auth = {
  getToken,
  setToken,
  removeToken,
  getCurrentUser,
  setCurrentUser,
  isLoggedIn: () => !!getToken() || !!getCurrentUser(),
};
