import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthVerified,
  mockMutableShelfApis,
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
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
      const toolbarBox = await page.locator('header.reader-chrome').boundingBox();
      const contentBox = await page.locator('.reader-page-frame').boundingBox();
      expect(contentBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height);
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

  for (const width of [390, 818, 1023]) {
    test(`reader menu icons align before and after loading read-aloud at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 923 });
      await installBrowserStubs(page, { authenticated: true });
      await mockReaderHappyPath(page);
      await gotoStable(page, '/read/book-1');
      await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();

      const more = page.getByRole('button', { name: '更多阅读操作', exact: true });
      await more.click();
      const actions = page.getByRole('dialog', { name: '阅读操作' });

      async function expectAlignedMenu() {
        const buttons = actions.getByRole('button');
        await expect(buttons).toHaveCount(7);
        const geometry = await buttons.evaluateAll((elements) => elements.map((button) => {
          const row = button.getBoundingClientRect();
          const icon = button.querySelector('svg')!.getBoundingClientRect();
          const label = button.querySelector('span')!.getBoundingClientRect();
          return {
            iconLeft: icon.x,
            iconWidth: icon.width,
            labelLeft: label.x,
            rowHeight: row.height,
            centerOffset: icon.y + icon.height / 2 - (row.y + row.height / 2),
          };
        }));
        for (const item of geometry) {
          expect(item.iconLeft).toBeCloseTo(geometry[0].iconLeft, 1);
          expect(item.iconWidth).toBeCloseTo(geometry[0].iconWidth, 1);
          expect(item.labelLeft).toBeCloseTo(geometry[0].labelLeft, 1);
          expect(item.rowHeight).toBeCloseTo(geometry[0].rowHeight, 1);
          expect(item.rowHeight).toBeGreaterThanOrEqual(44);
          expect(item.centerOffset).toBeCloseTo(0, 1);
        }
      }

      await expectAlignedMenu();
      await actions.getByRole('button', { name: '朗读控制', exact: true }).click();
      await page.getByRole('button', { name: '关闭朗读控制', exact: true }).click();
      if (!await actions.isVisible()) await more.click();
      await expectAlignedMenu();
    });
  }

  test('book card footer opens the book', async ({ page }) => {
    await installBrowserStubs(page, { authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('heading', { name: '红楼梦', exact: true })).toHaveCount(1);
    await expect(page.getByText('曹雪芹', { exact: true })).toHaveCount(1);
    const read = page.getByRole('button', { name: '继续阅读：红楼梦', exact: true });
    await expect(read).toBeVisible();
    await mockReaderHappyPath(page);
    await read.click();
    await expect(page).toHaveURL(/\/read\/book-1/);
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
  });

  for (const width of [390, 818, 1280]) {
    test(`book cards align with mixed title lengths at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 923 });
      await installBrowserStubs(page, { authenticated: true });
      await mockAuthVerified(page);
      const shelf = await mockMutableShelfApis(page);
      shelf.books = shelf.books.slice(0, 2);
      shelf.books[0].title = 'Go 语言精进之路：从新手到高手的编程思想、方法和技巧';
      shelf.books[1].title = '中国近代史';
      await gotoStable(page, '/shelf');

      const cards = page.locator('article.shelf-book-card');
      await expect(cards).toHaveCount(2);
      const geometry = await cards.evaluateAll((elements) => elements.map((card) => {
        const bounds = card.getBoundingClientRect();
        const footer = card.querySelector(':scope > div')!.getBoundingClientRect();
        const progress = card.querySelector('.h-1')!.getBoundingClientRect();
        const title = card.querySelector('h2')!.getBoundingClientRect();
        const cover = card.querySelector(':scope > button > div')!.getBoundingClientRect();
        return {
          top: bounds.top,
          height: bounds.height,
          footerTop: footer.top,
          progressTop: progress.top,
          titleHeight: title.height,
          coverWidth: cover.width,
          coverHeight: cover.height,
        };
      }));

      expect(geometry[0].titleHeight).toBeGreaterThan(geometry[1].titleHeight);
      expect(geometry[0].top).toBeCloseTo(geometry[1].top, 1);
      expect(geometry[0].height).toBeCloseTo(geometry[1].height, 1);
      expect(geometry[0].footerTop).toBeCloseTo(geometry[1].footerTop, 1);
      expect(geometry[0].progressTop).toBeCloseTo(geometry[1].progressTop, 1);
      for (const card of geometry) {
        expect(card.coverHeight).toBeCloseTo(card.coverWidth * 6 / 5, 1);
      }
    });
  }

  test('long fallback titles stay between cover labels on narrow phones', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await installBrowserStubs(page, { authenticated: true });
    await mockAuthVerified(page);
    const shelf = await mockMutableShelfApis(page);
    const title = '一本关于世界历史与人类文明漫长旅途的书';
    shelf.books[0].title = title;
    await gotoStable(page, '/shelf');
    const card = page.getByRole('button', { name: `阅读《${title}》`, exact: true });
    const cover = card.locator('.book-cover-fallback');
    const collection = await cover.locator(':scope > span').first().boundingBox();
    const category = await cover.locator(':scope > span').last().boundingBox();
    const coverTitle = await cover.locator('p').boundingBox();
    expect(coverTitle!.y).toBeGreaterThanOrEqual(collection!.y + collection!.height);
    expect(coverTitle!.y + coverTitle!.height).toBeLessThanOrEqual(category!.y);
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
