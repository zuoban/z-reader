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
  cover_path?: string;
  category_id?: string;
  created_at: string;
  last_read_at?: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Progress {
  book_id: string;
  user_id: string;
  cfi: string;
  percentage: number;
  updated_at: string;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

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

async function fetchApi<T>(path: string, options: RequestInit = {}, timeout?: number): Promise<T> {
  const token = getToken();
  const { controller, timeoutId } = createAbortController(timeout);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: '未知错误' }));
      throw new Error(error.error || error.message || '请求失败');
    }

    return res.json();
  } catch (error) {
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 统一的带认证请求，供 fetchApi 之外的 blob/form 请求使用 */
async function authedFetch(path: string, options: RequestInit = {}, timeout?: number): Promise<Response> {
  const token = getToken();
  const { controller, timeoutId } = createAbortController(timeout);

  const headers: HeadersInit = {
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return res;
  } catch (error) {
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  login: async (username: string, password: string): Promise<{ token: string; user: User }> => {
    const res = await fetchApi<{ token: string; user: User }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(res.token);
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

  updateBook: async (id: string, data: { title?: string; author?: string; category_id?: string | null }): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  removeBookCategory: async (id: string): Promise<Book> => {
    return fetchApi<Book>(`/api/books/${id}/category`, {
      method: 'DELETE',
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
      const error = await res.json().catch(() => ({ error: '未知错误' }));
      throw new Error(error.error || error.message || '上传失败');
    }

    return res.json();
  },

  deleteBook: async (id: string): Promise<void> => {
    await fetchApi(`/api/books/${id}`, { method: 'DELETE' });
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
      const error = await res.json().catch(() => ({ error: '未知错误' }));
      throw new Error(error.error || error.message || '上传封面失败');
    }

    return res.json();
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

  saveProgress: async (bookId: string, cfi: string, percentage: number): Promise<Progress> => {
    return fetchApi<Progress>(`/api/progress/${bookId}`, {
      method: 'POST',
      body: JSON.stringify({ cfi, percentage }),
    });
  },

  saveProgressOnUnload: (bookId: string, cfi: string, percentage: number): void => {
    const token = getToken();
    void fetch(`${API_BASE}/api/progress/${bookId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify({ cfi, percentage }),
      keepalive: true,
    }).catch(() => {
      // Ignore unload-time failures.
    });
  },

  listCategories: async (): Promise<Category[]> => {
    return fetchApi<Category[]>('/api/categories');
  },

  createCategory: async (data: { name: string; sort_order?: number }): Promise<Category> => {
    return fetchApi<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory: async (id: string, data: { name?: string; sort_order?: number }): Promise<Category> => {
    return fetchApi<Category>(`/api/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCategory: async (id: string): Promise<void> => {
    await fetchApi(`/api/categories/${id}`, { method: 'DELETE' });
  },
};

export const auth = {
  getToken,
  setToken,
  removeToken,
  getCurrentUser,
  setCurrentUser,
  isLoggedIn: () => !!getToken(),
};
