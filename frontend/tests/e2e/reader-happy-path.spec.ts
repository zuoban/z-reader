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
  });

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
    await expect(page.getByText('第二章 续篇').first()).toBeVisible({ timeout: 10_000 });
    await page.getByText('第二章 续篇').first().click();

    // After TOC jump, chrome still works and title remains.
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
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
});
