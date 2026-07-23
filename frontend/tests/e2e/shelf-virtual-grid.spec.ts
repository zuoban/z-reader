import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockPaginatedShelfApis,
} from './helpers/fixtures';

/**
 * Functional coverage for the shelf virtual grid:
 * - cursor pagination / infinite load
 * - virtualization (not all cards mounted)
 * - filter reset keeps usable list
 */
test.describe('shelf virtual grid', () => {
  test.describe.configure({ timeout: 60_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('auto-loads additional short pages until the end probe leaves the viewport', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    // Small chunks keep the sentinel near the fold so fill-viewport load fires.
    const mock = await mockPaginatedShelfApis(page, { total: 36, chunkSize: 6 });

    await gotoStable(page, '/shelf');

    await expect(page.getByRole('button', { name: '阅读《测试图书 1》' })).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(() => mock.listCursors.length, { timeout: 15_000 })
      .toBeGreaterThan(1);

    // First call is the initial page (null cursor); later calls carry offsets.
    expect(mock.listCursors[0]).toBeNull();
    expect(mock.listCursors.slice(1).some((cursor) => cursor !== null)).toBe(true);

    await expect(page.getByText(/已载入 \d+ \/ 36 本/)).toBeVisible({ timeout: 15_000 });
  });

  test('scroll near the end requests the next cursor page', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    // Large first page so auto fill-viewport stops; scroll is required for page 2.
    // Keep total > 100 so the load-more footer remains after page 2.
    const mock = await mockPaginatedShelfApis(page, { total: 120, chunkSize: 50 });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《测试图书 1》' })).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(() => mock.listCursors.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);

    const cursorsBeforeScroll = mock.listCursors.length;

    // Drive the window virtualizer's end probe into view.
    await page.evaluate(async () => {
      const distance = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      window.scrollTo(0, distance);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      window.scrollTo(0, distance);
    });

    await expect
      .poll(() => mock.listCursors.length, { timeout: 15_000 })
      .toBeGreaterThan(cursorsBeforeScroll);

    expect(mock.listCursors.some((cursor) => cursor === '50')).toBe(true);

    // Wait until the second page is merged into UI (footer count), not just requested.
    await expect
      .poll(
        async () => {
          const label = page.getByText(/已载入 \d+ \/ 120 本/);
          if ((await label.count()) === 0) return 0;
          const text = await label.textContent();
          return Number(text?.match(/已载入 (\d+)/)?.[1] ?? 0);
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(50);
  });

  test('virtualizes long shelves so only near-viewport cards mount', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPaginatedShelfApis(page, { total: 80, chunkSize: 50 });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《测试图书 1》' })).toBeVisible({
      timeout: 15_000,
    });

    const grid = page.locator('[data-shelf-grid="virtual"]');
    await expect(grid).toBeVisible();

    const stats = await page.evaluate(() => {
      const root = document.querySelector('[data-shelf-grid="virtual"]');
      const rowCount = Number(root?.getAttribute('data-row-count') ?? 0);
      const mountedRows = document.querySelectorAll('[data-shelf-grid="virtual"] [data-index]')
        .length;
      const mountedCards = document.querySelectorAll(
        '[data-shelf-grid="virtual"] button[aria-label^="阅读《"]'
      ).length;
      return { rowCount, mountedRows, mountedCards };
    });

    expect(stats.rowCount).toBeGreaterThan(5);
    // Overscan mounts a window, not the full catalog.
    expect(stats.mountedRows).toBeGreaterThan(0);
    expect(stats.mountedRows).toBeLessThan(stats.rowCount);
    expect(stats.mountedCards).toBeLessThan(50);
    expect(stats.mountedCards).toBeGreaterThan(0);
  });

  test('category filter updates the virtual grid without leaving a blank list', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPaginatedShelfApis(page, { total: 40, chunkSize: 40 });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《测试图书 1》' })).toBeVisible({
      timeout: 15_000,
    });

    // Scroll away from the top so resetKey must recover a usable view.
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(100);

    await page.getByRole('button', { name: '古典', exact: true }).click();

    const grid = page.locator('[data-shelf-grid="virtual"]');
    await expect(grid).toBeVisible();

    await expect
      .poll(async () => Number((await grid.getAttribute('data-row-count')) ?? 0))
      .toBeGreaterThan(0);

    // At least one classical book remains interactive after filter + virtual remount.
    await expect(page.locator('[data-shelf-grid="virtual"] button[aria-label^="阅读《"]').first())
      .toBeVisible({ timeout: 10_000 });

    // Non-classical sample from the catalog should not remain mounted as a read action.
    // makeMockBooks: n % 3 → 0 古典 / 1 科幻 / 2 随笔, so book-2 is 随笔.
    await expect(page.getByRole('button', { name: '阅读《测试图书 2》' })).toHaveCount(0);
  });

  test('manual load-more control fetches the next page', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    // Leave a third page so the footer stays after the first manual load.
    const mock = await mockPaginatedShelfApis(page, { total: 110, chunkSize: 50 });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《测试图书 1》' })).toBeVisible({
      timeout: 15_000,
    });

    const loadMore = page.getByRole('button', { name: '加载更多图书' });
    await expect(loadMore).toBeVisible({ timeout: 10_000 });

    const before = mock.listCursors.length;
    await loadMore.click();

    await expect
      .poll(() => mock.listCursors.length, { timeout: 10_000 })
      .toBeGreaterThan(before);

    expect(mock.listCursors.some((cursor) => cursor === '50')).toBe(true);

    await expect
      .poll(
        async () => {
          const label = page.getByText(/已载入 \d+ \/ 110 本/);
          if ((await label.count()) === 0) return 0;
          const text = await label.textContent();
          return Number(text?.match(/已载入 (\d+)/)?.[1] ?? 0);
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(50);
  });
});
