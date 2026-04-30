import {
  API_BASE,
  createAbortController,
  DEFAULT_TIMEOUT,
  normalizeRequestError,
} from '@/lib/config';

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
  category?: string;
  created_at: string;
  last_read_at?: string;
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
  role: 'admin' | 'user';
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
  localStorage.removeItem('token');
  localStorage.removeItem('user');
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

async function fetchApi<T>(path: string, options: RequestInit = {}, timeout?: number): Promise<T> {
  const { controller, timeoutId } = createAbortController(timeout);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      handleUnauthorized(res);
      throw await parseApiError(res, '请求失败');
    }

    const text = await res.text();
    return text ? JSON.parse(text) : (null as T);
  } catch (error) {
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeoutId);
  }
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
  const { controller, timeoutId } = createAbortController(timeout);

  const headers: HeadersInit = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
      signal: controller.signal,
    });
    handleUnauthorized(res);
    return res;
  } catch (error) {
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeoutId);
  }
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

  listUsers: async (): Promise<User[]> => {
    return fetchApi<User[]>('/api/users');
  },

  createUser: async (data: { username: string; password: string; role: User['role'] }): Promise<User> => {
    return fetchApi<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateUser: async (id: string, data: { password?: string; role?: User['role'] }): Promise<User> => {
    return fetchApi<User>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteUser: async (id: string): Promise<void> => {
    await fetchApi(`/api/users/${id}`, { method: 'DELETE' });
  },

  listBooks: async (): Promise<Book[]> => {
    return fetchApi<Book[]>('/api/books');
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

    const res = await authedFetch('/api/books', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw await parseApiError(res, '上传失败');
    }

    return parseJsonResponse<Book>(res, '上传成功但响应为空');
  },

  deleteBook: async (id: string): Promise<void> => {
    await fetchApi(`/api/books/${id}`, { method: 'DELETE' });
  },

  deleteBooks: async (ids: string[]): Promise<{ deleted_ids: string[] }> => {
    return fetchApi<{ deleted_ids: string[] }>('/api/books/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
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

  getCoverUrl: (id: string): string => {
    return `${API_BASE}/api/books/${id}/cover`;
  },

  fetchBook: async (id: string): Promise<Blob> => {
    const res = await authedFetch(`/api/books/${id}/file`, {
      credentials: 'include',
    }, DEFAULT_TIMEOUT);
    if (!res.ok) {
      throw new Error(`加载书籍失败：${res.status}`);
    }
    return res.blob();
  },

  createBookFile: async (id: string): Promise<File> => {
    const [book, blob] = await Promise.all([
      api.getBook(id),
      api.fetchBook(id),
    ]);

    return new File([blob], book.filename, {
      type: blob.type,
      lastModified: Date.parse(book.created_at) || Date.now(),
    });
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

  fetchCover: async (id: string): Promise<Blob | null> => {
    const res = await authedFetch(`/api/books/${id}/cover`, {
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

  listProgress: async (): Promise<Progress[]> => {
    return fetchApi<Progress[]>('/api/progress');
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
