const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface Book {
  id: string;
  title: string;
  author: string;
  filename: string;
  size: number;
  cover_path?: string;
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

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: token } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
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
    } catch {}
    removeToken();
  },

  verify: async (): Promise<{ valid: boolean }> => {
    return fetchApi('/api/auth/verify');
  },

  listBooks: async (): Promise<Book[]> => {
    return fetchApi<Book[]>('/api/books');
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
    console.log('Fetching book:', id, 'token:', token ? 'exists' : 'missing');
    const res = await fetch(`${API_BASE}/api/books/${id}/file`, {
      headers: token ? { Authorization: token } : {},
    });
    console.log('Fetch response:', res.status, res.statusText);
    if (!res.ok) {
      const text = await res.text();
      console.error('Fetch error:', text);
      throw new Error(`Failed to fetch book: ${res.status}`);
    }
    const blob = await res.blob();
    console.log('Blob size:', blob.size, 'type:', blob.type);
    return blob;
  },

  fetchCover: async (id: string): Promise<Blob | null> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/books/${id}/cover`, {
      headers: token ? { Authorization: token } : {},
    });
    if (!res.ok) {
      return null;
    }
    return res.blob();
  },

  getProgress: async (bookId: string): Promise<Progress> => {
    console.log('Getting progress for book:', bookId);
    return fetchApi<Progress>(`/api/progress/${bookId}`);
  },

  saveProgress: async (bookId: string, cfi: string, percentage: number): Promise<Progress> => {
    console.log('Saving progress:', { bookId, cfi, percentage });
    return fetchApi<Progress>(`/api/progress/${bookId}`, {
      method: 'POST',
      body: JSON.stringify({ cfi, percentage }),
    });
  },
};

export const auth = {
  getToken,
  setToken,
  removeToken,
  isLoggedIn: () => !!getToken(),
};