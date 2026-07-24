import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockMutableShelfApis,
} from './helpers/fixtures';

/**
 * Shelf batch selection flows: category update + delete confirmation.
 */
test.describe('shelf batch operations', () => {
  test.describe.configure({ timeout: 60_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('selects books and applies a batch category', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /批量操作/ }).click();
    await expect(page.getByText('已选中')).toBeVisible();

    await page.getByRole('button', { name: '选择《红楼梦》' }).click();
    await expect(page.getByText('已选中').locator('..')).toContainText('1');

    await page.getByRole('button', { name: '批量分类', exact: true }).click();
    await expect(page.getByRole('heading', { name: '批量设置分类' })).toBeVisible({
      timeout: 10_000,
    });

    // Pick an existing category chip inside the sheet.
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: /科幻/ }).click();
    await sheet.getByRole('button', { name: '保存' }).click();

    await expect
      .poll(() => mock.categoryCalls.length, { timeout: 10_000 })
      .toBe(1);
    expect(mock.categoryCalls[0]).toEqual({
      ids: ['book-1'],
      category: '科幻',
    });

    // Selection mode exits after successful batch category.
    await expect(page.getByText('已选中')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible();
  });

  test('selects all loaded books and batch-deletes them', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /批量操作/ }).click();
    await page.getByRole('button', { name: '选择已加载' }).click();
    await expect(page.getByText('已选中').locator('..')).toContainText('4');

    await page.getByRole('button', { name: '批量删除', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog.getByRole('heading', { name: '删除所选图书' })).toBeVisible();
    await expect(deleteDialog.getByText(/确定删除选中的 4 本图书/)).toBeVisible();

    await deleteDialog.getByRole('button', { name: '确认删除' }).click();

    await expect
      .poll(() => mock.deleteCalls.length, { timeout: 10_000 })
      .toBe(1);
    expect(mock.deleteCalls[0].sort()).toEqual(
      ['book-1', 'book-2', 'book-3', 'book-4'].sort()
    );

    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toHaveCount(0);
    // Empty shelf after deleting the whole mock catalog.
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 10_000 });
  });

  test('can cancel batch delete without removing books', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /批量操作/ }).click();
    await page.getByRole('button', { name: '选择《三体》' }).click();
    await page.getByRole('button', { name: '批量删除', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog.getByRole('heading', { name: '删除所选图书' })).toBeVisible();

    await deleteDialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('heading', { name: '删除所选图书' })).toHaveCount(0);
    expect(mock.deleteCalls).toHaveLength(0);
    // Still in selection mode with the card selected.
    await expect(page.getByRole('button', { name: '取消选择《三体》' })).toBeVisible();
    await expect(page.getByText('已选中')).toBeVisible();
  });
});
