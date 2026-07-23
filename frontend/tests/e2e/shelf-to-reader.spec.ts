import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockReaderHappyPath,
} from './helpers/fixtures';

/**
 * Navigation bridge: shelf book card → reader open → back to shelf.
 * Reuses the sample EPUB happy-path mock so no live backend is required.
 */
test.describe('shelf to reader', () => {
  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('opens a book from the shelf and returns via the reader chrome', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    const mock = await mockReaderHappyPath(page, 'book-1');

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('heading', { name: '我的书库' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: '阅读《E2E Sample Book》' })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: '阅读《E2E Sample Book》' }).click();

    await expect(page).toHaveURL(/\/read\/book-1/, { timeout: 15_000 });
    await expect(page.getByText('无法打开本书', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });
    expect(mock.fileHits).toBeGreaterThan(0);

    // Toolbar may already be expanded after open.
    const collapse = page.getByRole('button', { name: '收起顶部操作栏' });
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '展开操作栏' }).click();
    }

    await page.getByTitle('返回书库').click();
    await expect(page).toHaveURL(/\/shelf/, { timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: '阅读《E2E Sample Book》' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shelf card navigation lands on the correct book id', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-42');

    await gotoStable(page, '/shelf');
    await expect(
      page.getByRole('button', { name: '阅读《E2E Sample Book》' })
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: '阅读《E2E Sample Book》' }).click();
    await expect(page).toHaveURL(/\/read\/book-42/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });
  });
});
