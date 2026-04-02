import { API_BASE, createAbortController, DEFAULT_TIMEOUT } from '@/lib/config';

export interface Book {
  id: string;
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
  name: string;
  color: string;
  created_at: string;
}

export interface Progress {
  book_id: string;
  cfi: string;
  percentage: number;
  updated_at: string;
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

function setToken(token: string): void {
  localStorage.setItem('token', token);
}

function removeToken(): void {
  localStorage.removeItem('token');
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
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Request failed');
    }

    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  login: async (password: string): Promise<{ token: string }> => {
    const res = await fetchApi<{ token: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    setToken(res.token);
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

  verify: async (): Promise<{ valid: boolean }> => {
    return fetchApi('/api/auth/verify');
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

  uploadBook: async (file: File): Promise<Book> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/api/books`, {
      method: 'POST',
      headers: token ? { Authorization: token } : {},
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Upload failed');
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
    const token = getToken();
    const { controller, timeoutId } = createAbortController(DEFAULT_TIMEOUT);
    try {
      const res = await fetch(`${API_BASE}/api/books/${id}/file`, {
        headers: token ? { Authorization: token } : {},
        signal: controller.signal,
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch book: ${res.status}`);
      }
      return res.blob();
    } finally {
      clearTimeout(timeoutId);
    }
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
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file, filename);

    const res = await fetch(`${API_BASE}/api/books/${id}/cover`, {
      method: 'POST',
      headers: token ? { Authorization: token } : {},
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Cover upload failed');
    }

    return res.json();
  },

  fetchCover: async (id: string): Promise<Blob | null> => {
    const token = getToken();
    const { controller, timeoutId } = createAbortController(DEFAULT_TIMEOUT);
    try {
      const res = await fetch(`${API_BASE}/api/books/${id}/cover`, {
        headers: token ? { Authorization: token } : {},
        signal: controller.signal,
        credentials: 'include',
      });
      if (!res.ok) {
        return null;
      }
      return res.blob();
    } finally {
      clearTimeout(timeoutId);
    }
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

  listCategories: async (): Promise<Category[]> => {
    return fetchApi<Category[]>('/api/categories');
  },

  createCategory: async (data: { name: string; color: string }): Promise<Category> => {
    return fetchApi<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCategory: async (id: string, data: { name?: string; color?: string }): Promise<Category> => {
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
  isLoggedIn: () => !!getToken(),
};
