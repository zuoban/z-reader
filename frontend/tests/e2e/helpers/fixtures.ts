import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';

export const MOCK_USER = {
  id: 'user-visual-1',
  username: 'reader',
  created_at: '2026-01-15T08:00:00Z',
  updated_at: '2026-01-15T08:00:00Z',
};

export const MOCK_BOOKS = [
  {
    id: 'book-1',
    user_id: MOCK_USER.id,
    title: '红楼梦',
    author: '曹雪芹',
    filename: 'hongloumeng.epub',
    format: 'epub',
    size: 2_450_000,
    category: '古典',
    created_at: '2026-01-10T10:00:00Z',
    processing_state: 'ready' as const,
  },
  {
    id: 'book-2',
    user_id: MOCK_USER.id,
    title: '三体',
    author: '刘慈欣',
    filename: 'santi.epub',
    format: 'epub',
    size: 1_820_000,
    category: '科幻',
    created_at: '2026-01-12T12:00:00Z',
    processing_state: 'ready' as const,
  },
  {
    id: 'book-3',
    user_id: MOCK_USER.id,
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    filename: 'sapiens.pdf',
    format: 'pdf',
    size: 8_120_000,
    created_at: '2026-01-14T09:30:00Z',
    processing_state: 'ready' as const,
  },
  {
    id: 'book-4',
    user_id: MOCK_USER.id,
    title: '夜航西飞',
    author: '未知作者',
    filename: 'night.mobi',
    format: 'mobi',
    size: 980_000,
    category: '随笔',
    created_at: '2026-01-16T15:20:00Z',
    processing_state: 'ready' as const,
  },
];

export type ThemePreset = 'light' | 'sepia' | 'green' | 'dark';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Stabilize fonts/animations before visual capture. */
export async function prepareVisualPage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      .paper-reveal,
      .paper-reveal-soft {
        opacity: 1 !important;
        transform: none !important;
        filter: none !important;
        animation: none !important;
      }
      /* Hide Next.js dev error toast/overlay so screenshots stay clean. */
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `,
  });

  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  });
}

/**
 * Seed theme/session before page JS. Must run before page.goto.
 * Also blocks service-worker script fetches so SW cannot hijack API traffic.
 */
export async function installBrowserStubs(
  page: Page,
  options: { preset?: ThemePreset; authenticated?: boolean } = {}
) {
  const { preset = 'light', authenticated = false } = options;

  await page.route('**/sw.js', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'service worker disabled in e2e',
    });
  });

  await page.addInitScript(
    ({ presetValue, user, isAuthed }) => {
      try {
        const raw = localStorage.getItem('z-reader-theme');
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          'z-reader-theme',
          JSON.stringify({ ...current, preset: presetValue })
        );
      } catch {
        localStorage.setItem('z-reader-theme', JSON.stringify({ preset: presetValue }));
      }

      if (isAuthed) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }

      // Soft-disable registration without removing the ServiceWorker API surface
      // (hard-deleting navigator.serviceWorker can crash app bootstrap).
      try {
        if (navigator.serviceWorker?.register) {
          navigator.serviceWorker.register = async () => {
            throw new Error('service worker disabled in e2e');
          };
        }
      } catch {
        // ignore
      }
    },
    { presetValue: preset, user: MOCK_USER, isAuthed: authenticated }
  );
}

export async function mockAuthVerified(page: Page) {
  await page.route('**/api/auth/verify**', async (route) => {
    await json(route, { valid: true, user: MOCK_USER });
  });
}

export async function mockAuthUnauthorized(page: Page) {
  await page.route('**/api/auth/verify**', async (route) => {
    await json(route, { error: 'Unauthorized' }, 401);
  });
}

async function mockShelfCommon(page: Page) {
  await page.route('**/api/progress**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    // Only list endpoint; ignore POST progress saves.
    const url = route.request().url();
    if (/\/api\/progress\/[^/?]+/.test(url)) {
      await json(route, {
        book_id: 'book-1',
        user_id: MOCK_USER.id,
        cfi: 'epubcfi(/6/4!/4/2/2)',
        percentage: 0,
        updated_at: '2026-01-20T08:00:00Z',
      });
      return;
    }
    await json(route, [
      {
        book_id: 'book-1',
        user_id: MOCK_USER.id,
        cfi: 'epubcfi(/6/4!/4/2/2)',
        percentage: 42.5,
        updated_at: '2026-01-20T08:00:00Z',
      },
      {
        book_id: 'book-2',
        user_id: MOCK_USER.id,
        cfi: 'epubcfi(/6/4!/4/2/2)',
        percentage: 8,
        updated_at: '2026-01-18T08:00:00Z',
      },
    ]);
  });

  await page.route('**/api/categories**', async (route) => {
    await json(route, ['古典', '科幻', '随笔']);
  });

  await page.route(/\/api\/books\/[^/]+\/cover/, async (route) => {
    await route.fulfill({ status: 404, body: 'not found' });
  });
}

export async function mockEmptyShelfApis(page: Page) {
  await mockShelfCommon(page);

  await page.route('**/api/books/summary**', async (route) => {
    await json(route, { total: 0, uncategorized: 0, categories: {} });
  });

  await page.route('**/api/books**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/summary')) {
      await json(route, { total: 0, uncategorized: 0, categories: {} });
      return;
    }
    if (path.includes('/cover')) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    // list / search pages
    if (path.endsWith('/books') || path.endsWith('/search')) {
      await json(route, { books: [] });
      return;
    }
    await route.fallback();
  });
}

export async function mockPopulatedShelfApis(page: Page) {
  await mockShelfCommon(page);

  await page.route('**/api/books**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/summary')) {
      await json(route, {
        total: MOCK_BOOKS.length,
        uncategorized: 1,
        categories: { 古典: 1, 科幻: 1, 随笔: 1 },
      });
      return;
    }
    if (path.includes('/cover')) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }
    if (path.endsWith('/search')) {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const matched = MOCK_BOOKS.filter((book) => {
        if (!q) return true;
        const haystack = [book.title, book.author, book.filename, book.category, book.format]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
      await json(route, { books: matched });
      return;
    }
    if (path.endsWith('/books')) {
      await json(route, { books: MOCK_BOOKS });
      return;
    }
    // single book GET /api/books/:id
    const bookMatch = path.match(/\/api\/books\/([^/]+)$/);
    if (bookMatch) {
      const book = MOCK_BOOKS.find((item) => item.id === bookMatch[1]);
      if (book) {
        await json(route, book);
        return;
      }
    }
    await route.fallback();
  });
}

const PAGINATED_CATEGORIES = ['古典', '科幻', '随笔'] as const;

/** Deterministic catalog for pagination / virtual-list e2e. */
export function makeMockBooks(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, offset) => {
    const n = startIndex + offset + 1;
    const category = PAGINATED_CATEGORIES[n % PAGINATED_CATEGORIES.length];
    return {
      id: `book-${n}`,
      user_id: MOCK_USER.id,
      title: `测试图书 ${n}`,
      author: `作者 ${((n - 1) % 12) + 1}`,
      filename: `book-${n}.epub`,
      format: 'epub',
      size: 1_000_000 + n * 1000,
      category,
      created_at: `2026-01-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      processing_state: 'ready' as const,
    };
  });
}

export type PaginatedShelfMock = {
  /** Cursor values requested for list/search pages (null = first page). */
  listCursors: Array<string | null>;
  total: number;
  books: ReturnType<typeof makeMockBooks>;
};

/**
 * Cursor-paginated shelf APIs for virtual grid / infinite-load tests.
 * Cursor is a decimal offset string; optional chunkSize caps each page
 * (simulates short pages so fill-viewport load-more can fire without scrolling).
 */
export async function mockPaginatedShelfApis(
  page: Page,
  options: { total?: number; chunkSize?: number } = {}
): Promise<PaginatedShelfMock> {
  const total = options.total ?? 80;
  const chunkSize = options.chunkSize;
  const books = makeMockBooks(total);
  const state: PaginatedShelfMock = {
    listCursors: [],
    total,
    books,
  };

  const categoryCounts = books.reduce<Record<string, number>>((acc, book) => {
    if (book.category) {
      acc[book.category] = (acc[book.category] ?? 0) + 1;
    }
    return acc;
  }, {});

  await mockShelfCommon(page);

  await page.route('**/api/books**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/summary')) {
      await json(route, {
        total,
        uncategorized: 0,
        categories: categoryCounts,
      });
      return;
    }
    if (path.includes('/cover')) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }

    if (path.endsWith('/books') || path.endsWith('/search')) {
      const cursorParam = url.searchParams.get('cursor');
      const requestedLimit = Number(url.searchParams.get('limit') || '50');
      const limit = Math.max(
        1,
        chunkSize ? Math.min(chunkSize, requestedLimit) : requestedLimit
      );
      const start = cursorParam ? Number.parseInt(cursorParam, 10) || 0 : 0;
      state.listCursors.push(cursorParam);
      const pageBooks = books.slice(start, start + limit);
      const nextStart = start + pageBooks.length;
      await json(route, {
        books: pageBooks,
        next_cursor: nextStart < total ? String(nextStart) : undefined,
      });
      return;
    }

    const bookMatch = path.match(/\/api\/books\/([^/]+)$/);
    if (bookMatch) {
      const book = books.find((item) => item.id === bookMatch[1]);
      if (book) {
        await json(route, book);
        return;
      }
    }
    await route.fallback();
  });

  return state;
}

export async function mockShelfLoadError(page: Page) {
  await page.route('**/api/progress**', async (route) => {
    await json(route, []);
  });
  await page.route('**/api/categories**', async (route) => {
    await json(route, []);
  });
  await page.route('**/api/books**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await json(route, { error: 'database unavailable' }, 500);
  });
}

/**
 * Reader book open fails after auth succeeds.
 * Uses a single catch-all API mock so nothing falls through to a live backend
 * (which can 401 and bounce the app back to /login).
 */
export async function mockReaderBookOpenError(page: Page, bookId = 'book-1') {
  const book = MOCK_BOOKS.find((item) => item.id === bookId) ?? MOCK_BOOKS[0];

  await page.route('**/api/**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.includes('/auth/verify')) {
      await json(route, { valid: true, user: MOCK_USER });
      return;
    }

    if (path.includes('/progress')) {
      if (method !== 'GET') {
        await json(route, {
          book_id: book.id,
          user_id: MOCK_USER.id,
          cfi: '',
          percentage: 0,
          updated_at: '2026-01-20T08:00:00Z',
        });
        return;
      }
      // getProgress(/api/progress/:id) or list
      if (/\/api\/progress\/[^/]+$/.test(path)) {
        await json(route, {
          book_id: book.id,
          user_id: MOCK_USER.id,
          cfi: '',
          percentage: 0,
          updated_at: '2026-01-20T08:00:00Z',
        });
        return;
      }
      await json(route, []);
      return;
    }

    if (path.includes('/bookmarks')) {
      await json(route, []);
      return;
    }

    if (path.includes('/file')) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'book file unavailable' }),
      });
      return;
    }

    if (path.includes('/cover')) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }

    if (path.endsWith(`/books/${book.id}`)) {
      await json(route, book);
      return;
    }

    // Never fall through to a real backend during visual runs.
    await json(route, { error: `unmocked ${method} ${path}` }, 404);
  });
}

/** Keep auth verify pending so reader shows auth loading chrome. */
export async function mockAuthVerifyHanging(page: Page) {
  await page.route('**/api/auth/verify**', async () => {
    // Never resolve — page stays on ReaderAuthLoading.
    await new Promise(() => {});
  });
}

export type ReaderHappyPathMock = {
  book: (typeof MOCK_BOOKS)[number];
  progressSaves: Array<{ cfi: string; percentage: number }>;
  fileHits: number;
};

const SAMPLE_EPUB_PATH = path.join(
  process.cwd(),
  'tests/e2e/fixtures/sample.epub'
);

/**
 * Reader happy-path APIs: real minimal EPUB bytes + empty progress/bookmarks.
 * Catch-all so nothing falls through to a live backend.
 */
export async function mockReaderHappyPath(
  page: Page,
  bookId = 'book-1'
): Promise<ReaderHappyPathMock> {
  const book = {
    ...(MOCK_BOOKS.find((item) => item.id === bookId) ?? MOCK_BOOKS[0]),
    id: bookId,
    title: 'E2E Sample Book',
    author: 'Fixture Author',
    filename: 'sample.epub',
    format: 'epub',
    processing_state: 'ready' as const,
  };

  const state: ReaderHappyPathMock = {
    book,
    progressSaves: [],
    fileHits: 0,
  };

  const epubBytes = readFileSync(SAMPLE_EPUB_PATH);

  await page.route('**/api/**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const pathName = url.pathname;

    if (pathName.includes('/auth/verify')) {
      await json(route, { valid: true, user: MOCK_USER });
      return;
    }

    if (pathName.includes('/progress')) {
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        let body: { cfi?: string; percentage?: number } = {};
        try {
          body = route.request().postDataJSON() as typeof body;
        } catch {
          // ignore
        }
        const saved = {
          book_id: book.id,
          user_id: MOCK_USER.id,
          cfi: body.cfi ?? '',
          percentage: body.percentage ?? 0,
          updated_at: new Date().toISOString(),
        };
        state.progressSaves.push({
          cfi: saved.cfi,
          percentage: saved.percentage,
        });
        await json(route, saved);
        return;
      }
      if (/\/api\/progress\/[^/]+$/.test(pathName)) {
        await json(route, {
          book_id: book.id,
          user_id: MOCK_USER.id,
          cfi: '',
          percentage: 0,
          updated_at: '2026-01-20T08:00:00Z',
        });
        return;
      }
      await json(route, []);
      return;
    }

    if (pathName.includes('/bookmarks')) {
      if (method === 'POST') {
        let body: { cfi?: string; percentage?: number; chapter?: string; note?: string } =
          {};
        try {
          body = route.request().postDataJSON() as typeof body;
        } catch {
          // ignore
        }
        await json(route, {
          id: 'bm-e2e-1',
          book_id: book.id,
          user_id: MOCK_USER.id,
          cfi: body.cfi ?? 'epubcfi(/6/2!/4/2/2)',
          percentage: body.percentage ?? 0,
          chapter: body.chapter ?? '',
          note: body.note ?? '',
          created_at: new Date().toISOString(),
        });
        return;
      }
      await json(route, []);
      return;
    }

    if (pathName.includes('/file')) {
      state.fileHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/epub+zip',
        headers: {
          'Content-Length': String(epubBytes.byteLength),
          'Accept-Ranges': 'bytes',
        },
        body: epubBytes,
      });
      return;
    }

    if (pathName.includes('/cover')) {
      await route.fulfill({ status: 404, body: 'not found' });
      return;
    }

    if (pathName.includes('/voices') || pathName.includes('/tts') || pathName.includes('/ssml')) {
      await json(route, pathName.includes('/voices') ? [] : { error: 'tts disabled in e2e' }, 200);
      return;
    }

    if (pathName.endsWith(`/books/${book.id}`)) {
      await json(route, book);
      return;
    }

    if (pathName.endsWith('/books') || pathName.endsWith('/search')) {
      await json(route, { books: [book] });
      return;
    }

    if (pathName.endsWith('/summary')) {
      await json(route, { total: 1, uncategorized: 0, categories: {} });
      return;
    }

    if (pathName.includes('/categories')) {
      await json(route, []);
      return;
    }

    await json(route, { error: `unmocked ${method} ${pathName}` }, 404);
  });

  return state;
}

export async function gotoStable(page: Page, path: string) {
  // Prefer 'load' over 'networkidle': Next dev + cover probes can keep the
  // network busy indefinitely.
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');
  await prepareVisualPage(page);
  await page.waitForTimeout(150);
}
