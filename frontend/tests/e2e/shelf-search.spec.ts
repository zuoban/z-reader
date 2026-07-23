import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockPopulatedShelfApis,
} from './helpers/fixtures';

/**
 * Shelf server-side search + filter reset flows.
 * Search is debounced (~250ms) and hits GET /api/books/search?q=...
 */
test.describe('shelf search', () => {
  test.describe.configure({ timeout: 60_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('searches by title via the server endpoint', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);

    const searchRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/books/search')) {
        searchRequests.push(url);
      }
    });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible();

    const search = page.getByRole('searchbox', { name: '搜索书库' });
    await search.fill('三体');

    await expect
      .poll(() => searchRequests.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(searchRequests.some((url) => url.includes('q=%E4%B8%89%E4%BD%93') || url.includes('q=三体'))).toBe(
      true
    );

    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toHaveCount(0);
  });

  test('clears search and restores the full shelf', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    const search = page.getByRole('searchbox', { name: '搜索书库' });
    await search.fill('三体');
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toHaveCount(0);

    await page.getByRole('button', { name: '清除搜索' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible();
  });

  test('shows empty search state and resets filters', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    // Category + search that yields nothing.
    await page.getByRole('button', { name: '古典', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible();
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toHaveCount(0);

    await page.getByRole('searchbox', { name: '搜索书库' }).fill('不存在的书名xyz');
    await expect(page.getByText('未找到相关书籍')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '重置所有筛选' }).click();
    await expect(page.getByRole('searchbox', { name: '搜索书库' })).toHaveValue('');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible();
  });

  test('searches by author', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('searchbox', { name: '搜索书库' }).fill('刘慈欣');
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '阅读《人类简史》' })).toHaveCount(0);
  });
});
