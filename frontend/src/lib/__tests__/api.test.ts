import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, auth, ApiError, getAuthHeaders } from '@/lib/api';

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
