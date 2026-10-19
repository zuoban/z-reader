import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockPopulatedShelfApis,
  mockReaderHappyPath,
} from './helpers/fixtures';

test.describe('responsive reading and shelf controls', () => {
  test.describe.configure({ timeout: 60_000 });

  for (const width of [320, 375, 390]) {
    test(`batch actions fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await installBrowserStubs(page, { authenticated: true });
      await mockAuthVerified(page);
      await mockPopulatedShelfApis(page);
      await gotoStable(page, '/shelf');
      const search = page.getByRole('searchbox', { name: '搜索书库' });
      const sort = page.getByRole('button', { name: '书籍排序方式' });
      await expect(search).toHaveCSS('font-size', '16px');
      const searchBox = await search.boundingBox();
      const sortBox = await sort.boundingBox();
      expect(searchBox!.y).toBe(sortBox!.y);
      expect(searchBox!.x + searchBox!.width).toBeLessThan(sortBox!.x);
      await expect(page.getByRole('button', { name: '更多书库操作' }))
        .toBeInViewport({ ratio: 1 });
      await page.getByRole('button', { name: '更多书库操作' }).click();
      await page.getByRole('menuitem', { name: '批量操作', exact: true }).click();
      await page.getByRole('button', { name: '选择《红楼梦》', exact: true }).click();

      const label = page.getByText('已选中', { exact: true });
      await expect(label).toBeVisible();
      const labelBox = await label.boundingBox();
      expect(labelBox!.height).toBeLessThanOrEqual(20);
      await expect(label.locator('..')).toContainText('1');

      for (const name of ['选择已加载', '批量分类', '批量删除']) {
        const action = page.getByRole('button', { name, exact: true });
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        const fits = await action.evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(fits).toBe(true);
      }

      await page.getByRole('button', { name: '退出选择', exact: true }).click();
      await expect(label).toHaveCount(0);
    });
  }

  for (const width of [640, 768, 1023]) {
    test(`reader keeps its title and back control at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await installBrowserStubs(page, { authenticated: true });
      await mockReaderHappyPath(page);
      await gotoStable(page, '/read/book-1');
      const title = page.getByRole('heading', { name: 'E2E Sample Book' });
      await expect(title).toBeVisible({ timeout: 30_000 });
      const back = page.getByRole('button', { name: '返回书库', exact: true });
      await expect(back).toBeInViewport({ ratio: 1 });
      expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(120);
      await page.getByRole('button', { name: '更多阅读操作', exact: true }).click();
      const actions = page.getByRole('dialog', { name: '阅读操作' });
      await expect(actions.getByRole('button', { name: '目录', exact: true })).toBeVisible();
      await actions.getByRole('button', { name: '设置', exact: true }).click();
      await expect(page.getByRole('heading', { name: '阅读偏好' })).toBeVisible();
    });
  }

  test('book card footer opens the book', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('红楼梦', { exact: true })).toHaveCount(1);
    await expect(page.getByText('曹雪芹', { exact: true })).toHaveCount(1);
    const read = page.getByRole('button', { name: '继续阅读：红楼梦', exact: true });
    await expect(read).toBeVisible();
    await mockReaderHappyPath(page);
    await read.click();
    await expect(page).toHaveURL(/\/read\/book-1/);
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  });

  test('reader and preview load the same bundled Chinese font at the selected size', async ({
    page,
  }) => {
    await installBrowserStubs(page, { authenticated: true });
    await page.addInitScript(() => {
      localStorage.setItem('z-reader-theme', JSON.stringify({
        preset: 'light', fontFamily: 'classic', fontSize: 32,
      }));
    });
    await mockReaderHappyPath(page);
    await gotoStable(page, '/read/book-1');
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();

    await expect.poll(async () => {
      const chapter = page.frames().find((frame) => frame.url().startsWith('blob:'));
      if (!chapter) return false;
      return chapter.evaluate(async () => {
        await document.fonts.ready;
        return Array.from(document.fonts).some((face) =>
          face.family.includes('LXGW WenKai TC') && face.status === 'loaded'
        );
      }).catch(() => false);
    }).toBe(true);

    const chapter = page.frames().find((frame) => frame.url().startsWith('blob:'))!;
    const bodyFont = await chapter.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toContain('LXGW WenKai TC');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const preview = page.getByRole('region', { name: '阅读效果预览' });
    const passage = preview.getByText('文字应该安静地留在页面里。');
    await expect(passage).toHaveCSS('font-size', '32px');
    await expect(passage).toHaveCSS('font-family', bodyFont);
    await preview.getByRole('button', { name: '收起预览' }).click();
    await expect(passage).toBeHidden();
    await expect(page.getByRole('button', { name: '净白', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: '展开预览' }).click();
    await expect(passage).toBeVisible();
  });

  test('reader overflow supports keyboard focus in landscape with reduced motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installBrowserStubs(page, { authenticated: true, preset: 'dark' });
    await mockReaderHappyPath(page);
    await page.goto('/read/book-1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
    const more = page.getByRole('button', { name: '更多阅读操作' });
    await more.focus();
    await page.keyboard.press('Enter');
    const actions = page.getByRole('dialog', { name: '阅读操作' });
    await expect(actions.getByRole('button', { name: '目录', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await expect(actions).toBeHidden();
    await expect(page).toHaveURL(/\/read\/book-1/);

    await page.keyboard.press('Enter');
    await expect(actions.getByRole('button', { name: '目录', exact: true })).toBeFocused();
    const settings = actions.getByRole('button', { name: '设置', exact: true });
    await settings.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: '阅读偏好' }),
    });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(375);
    await sheet.getByRole('button', { name: '收起预览' }).click();
    await expect(sheet.getByRole('button', { name: '展开预览' })).toBeVisible();
  });
});
