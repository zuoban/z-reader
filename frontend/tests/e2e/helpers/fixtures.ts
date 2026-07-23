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
    if (path.endsWith('/books') || path.endsWith('/search')) {
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

export async function gotoStable(page: Page, path: string) {
  // Prefer 'load' over 'networkidle': Next dev + cover probes can keep the
  // network busy indefinitely.
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');
  await prepareVisualPage(page);
  await page.waitForTimeout(150);
}
