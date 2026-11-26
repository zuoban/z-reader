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

  for (const width of [390, 1280]) {
    test(`category management leaves the shelf visible at ${width}px`, async ({ page }) => {
      const height = 720;
      await page.setViewportSize({ width, height });
      await installBrowserStubs(page, { preset: 'light', authenticated: true });
      await mockAuthVerified(page);
      await mockMutableShelfApis(page);
      await gotoStable(page, '/shelf');
      const book = page.getByRole('button', { name: '阅读《红楼梦》' });
      await expect(book).toBeVisible();

      if (width < 640) {
        await page.getByRole('button', { name: '更多书库操作' }).click();
        await page.getByRole('menuitem', { name: '管理分类' }).click();
      } else {
        await page.getByRole('button', { name: '管理', exact: true }).click();
      }
      const manager = page.getByRole('dialog', { name: '管理分类' });
      await expect(manager).toBeVisible();
      await expect(manager.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.poll(async () => {
        const box = await manager.boundingBox();
        if (!box) return Infinity;
        return Math.max(
          Math.abs(box.x + box.width / 2 - width / 2),
          Math.abs(box.y + box.height / 2 - height / 2),
        );
      }).toBeLessThan(1);

      await manager.getByRole('button', { name: '删除 古典' }).click();
      const confirmation = page.getByRole('alertdialog', { name: '删除分类' });
      await expect(confirmation).toBeVisible();
      await expect(confirmation.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await confirmation.getByRole('button', { name: '取消' }).click();
      await expect(confirmation).toBeHidden();
      await expect(manager).toBeVisible();

      await page.mouse.click(4, 4);
      await expect(manager).toBeHidden();
      await expect(book).toBeVisible();
    });
  }

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

  test('categorizes and deletes a search result outside the loaded shelf page', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);
    await page.route('**/api/books?*', async (route) => {
      await route.fulfill({ json: { books: mock.books.filter((book) => book.id !== 'book-1') } });
    });

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible();
    const searchOnlyBook = page.getByRole('button', { name: '阅读《红楼梦》' });
    await expect(searchOnlyBook).toHaveCount(0);

    const searchBox = page.getByRole('searchbox', { name: '搜索书库' });
    await searchBox.fill('三体');
    await expect(page.getByText('共 1 本', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /批量操作/ }).click();
    const batchToolbar = page.getByRole('region', { name: '书籍批量操作' });
    await expect(batchToolbar).toBeVisible();

    let releaseSearch!: () => void;
    const pendingSearch = new Promise<void>((resolve) => { releaseSearch = resolve; });
    await page.route('**/api/books/search?*', async (route) => {
      await pendingSearch;
      await route.fallback();
    });
    await searchBox.fill('红楼梦');
    try {
      await expect(page.getByText('正在搜索…')).toBeVisible();
      await expect(batchToolbar).toBeHidden();
    } finally {
      releaseSearch();
    }

    const selectBook = page.getByRole('button', { name: '选择《红楼梦》' });
    await selectBook.click();
    const selectedCount = page.getByText('已选中').locator('..');
    await expect(selectedCount).toContainText('1 本');

    await page.getByRole('button', { name: '批量分类', exact: true }).click();
    const categoryDialog = page.getByRole('dialog', { name: '批量设置分类' });
    await categoryDialog.getByRole('button', { name: /科幻/ }).click();
    await categoryDialog.getByRole('button', { name: '保存' }).click();
    await expect.poll(() => mock.categoryCalls).toEqual([{ ids: ['book-1'], category: '科幻' }]);
    await expect(searchOnlyBook).toBeVisible();

    await page.getByRole('button', { name: /批量操作/ }).click();
    await page.getByRole('button', { name: '全选', exact: true }).click();
    await expect(selectedCount).toContainText('1 本');
    await page.getByRole('button', { name: '批量删除', exact: true }).click();
    const deleteDialog = page.getByRole('alertdialog', { name: '删除所选图书' });
    await expect(deleteDialog.getByText(/确定删除选中的 1 本图书/)).toBeVisible();
    await deleteDialog.getByRole('button', { name: '确认删除' }).click();
    await expect.poll(() => mock.deleteCalls).toEqual([['book-1']]);
    await expect(searchOnlyBook).toHaveCount(0);
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
    await page.getByRole('button', { name: '全选', exact: true }).click();
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

  test('keeps filters available after deleting the last uncategorized book', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    const filters = page.getByRole('group', { name: '书籍分类筛选' });
    await filters.getByRole('button', { name: '未分类', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《人类简史》' })).toBeVisible();
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toHaveCount(0);

    await page.getByRole('button', { name: /批量操作/ }).click();
    await page.getByRole('button', { name: '选择《人类简史》' }).click();
    await page.getByRole('button', { name: '批量删除', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '确认删除' }).click();

    await expect.poll(() => mock.books.length).toBe(3);
    await expect(page.getByText('未找到相关书籍', { exact: true })).toBeVisible();
    await expect(page.getByText('书架还是空的', { exact: true })).toHaveCount(0);
    await expect(filters).toBeVisible();
    await filters.getByRole('button', { name: '全部', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible();
    await expect(page.getByRole('button', { name: '阅读《人类简史》' })).toHaveCount(0);
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

  test('reparses metadata for a single book and in batch', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《夜航西飞》' })).toBeVisible({
      timeout: 15_000,
    });

    // Single-book reparse via card action menu
    await page.getByRole('button', { name: '更多操作：《夜航西飞》' }).click();
    await page.getByRole('menuitem', { name: '重新解析元数据' }).click();
    await expect.poll(() => mock.reparseCalls.length, { timeout: 10_000 }).toBe(1);
    expect(mock.reparseCalls[0]).toBe('book-4');
    await expect(page.getByText('柏瑞尔·马卡姆')).toBeVisible({ timeout: 10_000 });

    // Batch reparse via selection mode
    await page.getByRole('button', { name: /批量操作/ }).click();
    await page.getByRole('button', { name: '选择《红楼梦》' }).click();
    await page.getByRole('button', { name: '选择《三体》' }).click();
    await page.getByRole('button', { name: '重刷元数据', exact: true }).click();

    await expect.poll(() => mock.batchReparseCalls.length, { timeout: 10_000 }).toBe(1);
    expect(mock.batchReparseCalls[0].sort()).toEqual(['book-1', 'book-2']);
    await expect(page.getByRole('button', { name: '阅读《红楼梦（已重刷）》' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: '阅读《三体（已重刷）》' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('edits book metadata, uploads a custom cover, and focuses search with /', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    const mock = await mockMutableShelfApis(page);

    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《夜航西飞》' })).toBeVisible({
      timeout: 15_000,
    });

    // Press / to focus the shelf search input
    await page.keyboard.press('/');
    const searchBox = page.getByRole('searchbox', { name: '搜索书库' });
    await expect(searchBox).toBeFocused();
    await searchBox.blur();

    // Open metadata dialog via card menu and update title + upload custom PNG cover
    await page.getByRole('button', { name: '更多操作：《夜航西飞》' }).click();
    await page.getByRole('menuitem', { name: '编辑信息' }).click();

    const dialog = page.getByRole('dialog', { name: '编辑书籍信息' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    await dialog.getByLabel('选择封面图片').setInputFiles({
      name: 'night-flight.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    await expect(dialog.getByText('待保存', { exact: true })).toBeVisible();
    await dialog.getByRole('textbox', { name: '书名' }).fill('夜航西飞（典藏版）');

    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await expect.poll(() => mock.updateCalls.length, { timeout: 10_000 }).toBe(1);
    await expect.poll(() => mock.coverUploadCalls.length, { timeout: 10_000 }).toBe(1);
    expect(mock.updateCalls[0]).toEqual({ id: 'book-4', title: '夜航西飞（典藏版）' });
    expect(mock.coverUploadCalls[0]).toBe('book-4');

    await expect(page.getByRole('button', { name: '阅读《夜航西飞（典藏版）》' })).toBeVisible({
      timeout: 10_000,
    });
    const uploadedCoverImg = page.getByRole('img', { name: '夜航西飞（典藏版）' });
    await expect(uploadedCoverImg).toBeVisible({ timeout: 10_000 });

    // Reopen metadata dialog on the book with an existing cover and remove the cover
    await page.getByRole('button', { name: '更多操作：《夜航西飞（典藏版）》' }).click();
    await page.getByRole('menuitem', { name: '编辑信息' }).click();

    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const removeCoverButton = dialog.getByRole('button', { name: '移除封面' });
    await expect(removeCoverButton).toBeVisible();
    await removeCoverButton.click();

    await expect(dialog.getByRole('button', { name: '恢复原封面' })).toBeVisible();
    await expect(dialog.getByText('待移除')).toBeVisible();

    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await expect.poll(() => mock.coverDeleteCalls.length, { timeout: 10_000 }).toBe(1);
    expect(mock.coverDeleteCalls).toContain('book-4');
    await expect(uploadedCoverImg).toHaveCount(0, { timeout: 10_000 });
  });
});
