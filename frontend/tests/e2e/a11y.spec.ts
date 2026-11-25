import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers/a11y';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockEmptyShelfApis,
  mockMutableShelfApis,
  mockPopulatedShelfApis,
  mockReaderHappyPath,
} from './helpers/fixtures';

/**
 * Accessibility gate for core interactive surfaces.
 * Uses axe-core; fails only on serious/critical WCAG 2.x findings.
 */
test.describe('accessibility', () => {
  test.describe.configure({ timeout: 90_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('empty shelf has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 });

    await expectNoSeriousA11yViolations(page);
  });

  test('populated shelf has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    await expectNoSeriousA11yViolations(page);
  });

  test('shelf category filter has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: '古典', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible();
    await expect(page.getByRole('group', { name: '书籍分类筛选' })).toBeVisible();

    await expectNoSeriousA11yViolations(page);
  });

  test('shelf selection mode has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /批量操作/ }).click();
    await expect(page.getByText('已选中')).toBeVisible();
    await page.getByRole('button', { name: '选择《红楼梦》' }).click();
    await expect(page.getByText(/已选中\s*1/)).toBeVisible();

    await expectNoSeriousA11yViolations(page);
  });

  test('reader chrome has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    await gotoStable(page, '/read/book-1');

    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });

    // Foliate injects iframe content documents; axe only scans the top frame by
    // default, which is what we want for app chrome.
    await expectNoSeriousA11yViolations(page, {
      // Reader page surface can host ephemeral custom elements from foliate.
      exclude: ['foliate-view', '.reader-page-surface'],
    });
  });

  test('reader TOC sheet has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    await gotoStable(page, '/read/book-1');

    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });

    const collapse = page.getByRole('button', { name: '收起顶部操作栏' });
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '展开操作栏' }).click();
    }

    await page.getByRole('button', { name: /目录/ }).first().click();
    const tocDialog = page.getByRole('dialog', { name: '目录' });
    await expect(tocDialog).toBeVisible({ timeout: 10_000 });
    await expect(tocDialog.getByText('第一章 开篇')).toBeVisible();
    const scrubber = tocDialog.getByRole('slider', { name: '跳转阅读进度' });
    await expect(scrubber).toBeVisible();

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
      exclude: ['foliate-view', '.reader-page-surface'],
    });

    // Also scan TOC drawer with the jump-back button visible after scrubbing
    await scrubber.fill('75');
    await expect(tocDialog.getByRole('button', { name: /返回原位/ })).toBeVisible({
      timeout: 10_000,
    });
    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
      exclude: ['foliate-view', '.reader-page-surface'],
    });
  });

  test('reader search sheet has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page, 'book-1');
    await gotoStable(page, '/read/book-1');

    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });

    const collapse = page.getByRole('button', { name: '收起顶部操作栏' });
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '展开操作栏' }).click();
    }

    await page.getByRole('button', { name: '书内搜索' }).first().click();
    const dialog = page.getByRole('dialog', { name: '书内搜索' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const input = dialog.getByRole('searchbox', { name: '书内全文搜索' });
    await input.fill('样例书第二章');
    await input.press('Enter');
    await expect(dialog.getByRole('button').filter({ hasText: '样例书第二章' }).first()).toBeVisible({
      timeout: 15_000,
    });

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
      exclude: ['foliate-view', '.reader-page-surface'],
    });
  });

  test('reader bookmarks sheet and inline note editor have no serious violations', async ({
    page,
  }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    const mock = await mockReaderHappyPath(page, 'book-1');
    mock.bookmarks.push({
      id: 'bm-a11y-1',
      book_id: 'book-1',
      user_id: 'user-visual-1',
      cfi: 'epubcfi(/6/2!/4/2/2)',
      percentage: 12.5,
      chapter: '第一章 开篇',
      note: '用于无障碍检查的书签备注',
      created_at: '2026-11-25T08:00:00Z',
    });
    await gotoStable(page, '/read/book-1');

    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible({
      timeout: 45_000,
    });

    const collapse = page.getByRole('button', { name: '收起顶部操作栏' });
    if (!(await collapse.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: '展开操作栏' }).click();
    }

    await page.getByRole('button', { name: '书签', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '书签' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('用于无障碍检查的书签备注')).toBeVisible();

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
      exclude: ['foliate-view', '.reader-page-surface'],
    });

    await dialog.getByRole('button', { name: /^编辑书签备注：/ }).first().click();
    await expect(dialog.getByRole('textbox', { name: '书签备注' })).toBeVisible();

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
      exclude: ['foliate-view', '.reader-page-surface'],
    });
  });

  test('book metadata and cover upload dialog has no serious violations', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockMutableShelfApis(page);
    await gotoStable(page, '/shelf');

    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: '更多操作：《红楼梦》' }).click();
    await page.getByRole('menuitem', { name: '编辑信息' }).click();

    const dialog = page.getByRole('dialog', { name: '编辑书籍信息' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: /选择封面|更换封面/ })).toBeVisible();

    // Scan dialog without an existing cover
    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
    });

    // Upload a cover so existing-cover actions (更换封面 / 移除封面 / 恢复原封面) are scanned
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    await dialog.getByLabel('选择封面图片').setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('img', { name: '红楼梦' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '更多操作：《红楼梦》' }).click();
    await page.getByRole('menuitem', { name: '编辑信息' }).click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const removeButton = dialog.getByRole('button', { name: '移除封面' });
    await expect(removeButton).toBeVisible();

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
    });

    await removeButton.click();
    await expect(dialog.getByRole('button', { name: '恢复原封面' })).toBeVisible();

    await expectNoSeriousA11yViolations(page, {
      include: ['[role="dialog"]'],
    });
  });
});
