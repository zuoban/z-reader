import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockReaderHappyPath,
} from './helpers/fixtures';

/**
 * Reader happy path against a minimal in-repo EPUB fixture.
 * API + file bytes are fully mocked (no live backend required).
 */
test.describe('reader happy path', () => {
  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  async function waitForReaderReady(page: Page) {
    await expect(page.getByText('无法打开本书', { exact: true })).toHaveCount(0);
    // Book metadata comes from the opened EPUB package via foliate.
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });
    // Status bar is present whether compact or expanded.
    await expect(
      page
        .getByRole('button', { name: '展开操作栏' })
        .or(page.getByRole('button', { name: '收起顶部操作栏' }))
    ).toBeVisible({ timeout: 15_000 });
  }

  async function ensureToolbarVisible(page: Page) {
    const collapse = page.getByRole('button', { name: '收起顶部操作栏' });
    if (await collapse.isVisible().catch(() => false)) {
      return;
    }
    await page.getByRole('button', { name: '展开操作栏' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  }

  test('opens a book, shows chrome, and returns to the shelf', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    const mock = await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await expect(page).toHaveURL(/\/read\/book-1/);
    await waitForReaderReady(page);
    expect(mock.fileHits).toBeGreaterThan(0);
    await expect.poll(() => page.locator('foliate-view').evaluate((element) => {
      const view = element as HTMLElement & {
        renderer?: { getContents(): Array<{ doc: Document }> };
      };
      const doc = view.renderer?.getContents()[0]?.doc;
      return {
        sandbox: doc?.defaultView?.frameElement?.getAttribute('sandbox'),
        body: doc?.body?.textContent,
      };
    })).toEqual({
      sandbox: 'allow-same-origin',
      body: expect.stringContaining('Hello Z Reader.'),
    });

    const openedLink = await page.locator('foliate-view').evaluate(async (element) => {
      const view = element as HTMLElement & {
        renderer: { getContents(): Array<{ doc: Document }> };
      };
      const { doc } = view.renderer.getContents()[0];
      const link = doc.createElement('a');
      link.href = 'https://example.com/reading';
      doc.body.append(link);
      const calls: string[][] = [];
      const originalOpen = window.open;
      window.open = (...args) => {
        calls.push(args.map(String));
        return null;
      };
      try {
        link.click();
        await Promise.resolve();
        return calls;
      } finally {
        window.open = originalOpen;
        link.remove();
      }
    });
    expect(openedLink).toEqual([['https://example.com/reading', '_blank', 'noopener,noreferrer']]);

    await ensureToolbarVisible(page);
    await expect(page.getByRole('button', { name: /目录/ }).first()).toBeVisible();

    // Desktop toolbar exposes TOC entry.
    await page.getByRole('button', { name: /目录/ }).first().click();
    await expect(page.getByRole('dialog').getByText('第一章 开篇')).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press('Escape');

    // Back control leaves the reader (title attribute on icon button).
    await ensureToolbarVisible(page);
    await page.getByTitle('返回书库').click();
    await expect(page).toHaveURL(/\/shelf/, { timeout: 15_000 });
    const shelfBackground = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    );
    await expect(page.locator('meta[data-z-reader-theme-color]'))
      .toHaveAttribute('content', shelfBackground);
  });

  test('isolates fixed-layout content and preserves standalone chapter selection', async ({ page }) => {
    await page.route('**/api/auth/verify', (route) => route.fulfill({ status: 401 }));
    await gotoStable(page, '/login');
    const chapter = await page.evaluate(async () => {
      const modulePath = '/foliate/fixed-layout.js';
      const { FixedLayout } = await import(modulePath);
      const renderer = new FixedLayout();
      document.body.append(renderer);
      const url = URL.createObjectURL(new Blob([
        '<meta name="viewport" content="width=600,height=800"><p>Fixed layout chapter</p>',
      ], { type: 'text/html' }));
      try {
        renderer.open({ rendition: { spread: 'none' }, sections: [{ load: () => url }] });
        await renderer.goTo({ index: 0 });
        const { doc } = renderer.getContents()[0];
        return {
          sandbox: doc.defaultView.frameElement.getAttribute('sandbox'),
          body: doc.body.textContent,
        };
      } finally {
        renderer.destroy();
        renderer.remove();
        URL.revokeObjectURL(url);
      }
    });
    expect(chapter).toEqual({ sandbox: 'allow-same-origin', body: 'Fixed layout chapter' });

    const chapterSelection = await page.evaluate(async () => {
      const modulePath = '/foliate/ui/tree.js';
      const { createTOCView } = await import(modulePath);
      const selected: string[] = [];
      const { element } = createTOCView([{ label: 'Chapter 1', href: 'chapter.xhtml' }],
        (href: string) => selected.push(href));
      const item = element.querySelector('a');
      item.click();
      return { selected, nativeHref: item.getAttribute('href') };
    });
    expect(chapterSelection).toEqual({ selected: ['chapter.xhtml'], nativeHref: '#' });
  });

  test('reconnects after opening the reader without a server connection', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    const authRoute = '**/api/auth/verify**';
    await page.route(authRoute, (route) => route.abort('internetdisconnected'));

    await gotoStable(page, '/read/book-1');
    await expect(page.getByText('当前处于离线状态，本书尚未保存到离线缓存')).toBeVisible();

    await page.unroute(authRoute);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitForReaderReady(page);
  });

  test('keeps the other device’s progress when an offline edit is replayed', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    let serverProgress = {
      book_id: 'book-1',
      cfi: 'epubcfi(/6/2!/4/2/2)',
      percentage: 1,
      device_id: 'device-a',
      updated_at: '2026-01-20T08:00:00Z',
    };
    const rejectedVersions: Array<string | undefined> = [];
    await page.route('**/api/progress/book-1', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: serverProgress });
        return;
      }
      const body = route.request().postDataJSON() as {
        cfi: string;
        percentage: number;
        expected_updated_at?: string;
      };
      if (body.expected_updated_at && body.expected_updated_at !== serverProgress.updated_at) {
        rejectedVersions.push(body.expected_updated_at);
        await route.fulfill({ status: 409, json: { progress: serverProgress } });
        return;
      }
      serverProgress = { ...serverProgress, cfi: body.cfi, percentage: body.percentage };
      await route.fulfill({ json: serverProgress });
    });

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);
    await ensureToolbarVisible(page);

    const baseline = serverProgress;
    await page.context().setOffline(true);
    await page.getByRole('button', { name: /目录/ }).first().click();
    await page.getByRole('dialog', { name: '目录', exact: true })
      .getByRole('button', { name: /^第二章 续篇/ }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const offlineKey = 'z-reader-offline-progress:book-1';
    await expect.poll(() => page.evaluate(key => Boolean(localStorage.getItem(key)), offlineKey))
      .toBe(true);

    const otherDeviceProgress = {
      ...baseline,
      percentage: 2,
      device_id: 'device-b',
      updated_at: '2026-01-20T09:00:00Z',
    };
    serverProgress = otherDeviceProgress;
    await page.context().setOffline(false);

    await expect.poll(() => rejectedVersions).toContain(baseline.updated_at);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), offlineKey)).toBeNull();
    expect(serverProgress).toEqual(otherDeviceProgress);
  });

  for (const width of [390, 1280]) {
    test(`centers the keyboard shortcuts dialog at ${width}px`, async ({ page }) => {
      const height = 720;
      await page.setViewportSize({ width, height });
      await installBrowserStubs(page, { preset: 'light', authenticated: true });
      await mockReaderHappyPath(page);
      await gotoStable(page, '/read/book-1');
      await waitForReaderReady(page);
      await ensureToolbarVisible(page);

      if (width < 1024) {
        await page.getByRole('button', { name: '更多阅读操作' }).click();
      }
      await page.getByRole('button', { name: '快捷键', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '键盘快捷键' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '关闭快捷键帮助' })).toBeFocused();
      await expect.poll(async () => {
        const box = await dialog.boundingBox();
        if (!box) return Infinity;
        return Math.max(
          Math.abs(box.x + box.width / 2 - width / 2),
          Math.abs(box.y + box.height / 2 - height / 2),
        );
      }).toBeLessThan(1);
      await expect(dialog.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/read\/book-1$/);
      await page.locator('#main-content').focus();
      await page.keyboard.press('?');
      await expect(dialog).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(dialog).toBeHidden();
    });
  }

  test('turns pages with keyboard and can open the next chapter via TOC', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);
    await ensureToolbarVisible(page);

    // Focus the page and advance with keyboard shortcuts used by the reader.
    await page.locator('.reader-page-surface').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await ensureToolbarVisible(page);
    await page.getByRole('button', { name: /目录/ }).first().click();
    const toc = page.getByRole('dialog', { name: '目录', exact: true });
    const chapter = toc.getByRole('button', { name: /^第二章 续篇/ });
    await expect(chapter).toBeVisible({ timeout: 10_000 });
    await chapter.click();
    await expect(toc).toBeHidden();

    // After TOC jump, chrome still works and title remains.
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  });

  test('keeps page shortcuts out of toolbar buttons and settings sliders', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);
    await ensureToolbarVisible(page);

    const reader = page.locator('foliate-view');
    await reader.evaluate((element) => {
      const view = element as HTMLElement & { prev(): void; next(): void };
      view.prev = () => { element.dataset.pageShortcut = 'prev'; };
      view.next = () => { element.dataset.pageShortcut = 'next'; };
      element.dataset.pageShortcut = 'none';
    });

    const toc = page.getByRole('button', { name: '目录', exact: true }).first();
    await toc.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog', { name: '目录', exact: true })).toBeVisible();
    await expect(reader).toHaveAttribute('data-page-shortcut', 'none');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '目录', exact: true })).toBeHidden();

    await ensureToolbarVisible(page);
    await page.getByTitle('阅读设置').click();
    await page.getByRole('tab', { name: '排版', exact: true }).click();
    const fontSize = page.getByRole('tabpanel', { name: '排版设置' }).getByRole('slider').first();
    const initialSize = Number(await fontSize.getAttribute('aria-valuenow'));
    await fontSize.press('ArrowRight');
    await expect(fontSize).toHaveAttribute('aria-valuenow', String(initialSize + 1));
    await expect(reader).toHaveAttribute('data-page-shortcut', 'none');
    await page.keyboard.press('Escape');
    await expect(fontSize).toBeHidden();

    await reader.evaluate((element) => {
      const view = element as HTMLElement & {
        renderer: { getContents(): Array<{ doc: Document }> };
      };
      const { doc } = view.renderer.getContents()[0];
      doc.body.tabIndex = -1;
      doc.body.focus();
    });
    await page.keyboard.press('ArrowRight');
    await expect(reader).toHaveAttribute('data-page-shortcut', 'next');
  });

  test('records progress saves while reading', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    const mock = await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);

    await page.locator('.reader-page-surface').click({ position: { x: 40, y: 40 } });
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
    }

    // Debounced progress writer should eventually POST.
    await expect
      .poll(() => mock.progressSaves.length, { timeout: 20_000 })
      .toBeGreaterThan(0);

    const last = mock.progressSaves[mock.progressSaves.length - 1];
    expect(typeof last.cfi).toBe('string');
    expect(last.percentage).toBeGreaterThanOrEqual(0);
  });

  test('searches full book text and jumps to a matching passage', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);
    await ensureToolbarVisible(page);

    await page.getByRole('button', { name: '书内搜索' }).first().click();
    const searchDialog = page.getByRole('dialog', { name: '书内搜索' });
    await expect(searchDialog).toBeVisible({ timeout: 10_000 });

    const input = searchDialog.getByRole('searchbox', { name: '书内全文搜索' });
    await input.fill('样例书第二章');
    await input.press('Enter');

    const resultButton = searchDialog
      .getByRole('button')
      .filter({ hasText: '样例书第二章' })
      .first();
    await expect(resultButton).toBeVisible({ timeout: 15_000 });
    await resultButton.click();

    await expect(searchDialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  });

  test('creates a bookmark, edits its note inline, and exports Markdown', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    const mock = await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);
    await ensureToolbarVisible(page);

    await page.getByRole('button', { name: '书签', exact: true }).first().click();
    const bookmarksDialog = page.getByRole('dialog', { name: '书签' });
    await expect(bookmarksDialog).toBeVisible({ timeout: 10_000 });

    await bookmarksDialog.getByRole('button', { name: '添加当前书签' }).click();
    await expect.poll(() => mock.bookmarks.length, { timeout: 10_000 }).toBe(1);

    const editButton = bookmarksDialog.getByRole('button', { name: /^编辑书签备注：/ }).first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    const noteInput = bookmarksDialog.getByRole('textbox', { name: '书签备注' });
    await expect(noteInput).toBeVisible();
    await noteInput.fill('这一段的伏笔很精彩');
    await bookmarksDialog.getByRole('button', { name: '保存', exact: true }).click();

    await expect.poll(() => mock.bookmarkUpdates.length, { timeout: 10_000 }).toBe(1);
    expect(mock.bookmarkUpdates[0].note).toBe('这一段的伏笔很精彩');
    await expect(bookmarksDialog.getByText('这一段的伏笔很精彩')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      bookmarksDialog.getByRole('button', { name: '导出 Markdown' }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('E2E Sample Book');
    expect(download.suggestedFilename()).toMatch(/\.md$/);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const content = await readFile(filePath!, 'utf8');
    expect(content).toContain('# E2E Sample Book');
    expect(content).toContain('> 这一段的伏笔很精彩');
  });

  test('opens TOC, bookmarks, and theme settings via T/B/S keyboard shortcuts', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/read/book-1');
    await waitForReaderReady(page);

    // T -> TOC sheet
    await page.keyboard.press('t');
    const tocDialog = page.getByRole('dialog', { name: '目录' });
    await expect(tocDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(tocDialog).toBeHidden({ timeout: 10_000 });

    // B -> Bookmarks sheet
    await page.keyboard.press('b');
    const bookmarksDialog = page.getByRole('dialog', { name: '书签' });
    await expect(bookmarksDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(bookmarksDialog).toBeHidden({ timeout: 10_000 });

    // S -> Theme settings drawer
    await page.keyboard.press('s');
    const themeDialog = page.getByRole('dialog', { name: '阅读偏好' });
    await expect(themeDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(themeDialog).toBeHidden({ timeout: 10_000 });

    // ? -> Shortcuts dialog lists T/B/S
    await page.keyboard.press('?');
    const shortcutsDialog = page.getByRole('dialog', { name: '键盘快捷键' });
    await expect(shortcutsDialog).toBeVisible({ timeout: 10_000 });
    await expect(shortcutsDialog.getByText('目录')).toBeVisible();
    await expect(shortcutsDialog.getByText('书签')).toBeVisible();
    await expect(shortcutsDialog.getByText('排版与外观')).toBeVisible();
  });
});
