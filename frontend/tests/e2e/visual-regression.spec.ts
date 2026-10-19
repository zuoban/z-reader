import { expect, test, type Page } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthUnauthorized,
  mockAuthVerified,
  mockAuthVerifyHanging,
  mockEmptyShelfApis,
  mockPopulatedShelfApis,
  mockReaderBookOpenError,
  mockReaderHappyPath,
  mockShelfLoadError,
  prepareVisualPage,
} from './helpers/fixtures';

async function expectStableScreenshot(
  page: Page,
  name: string,
  options: { fullPage?: boolean } = {},
) {
  // The virtual grid can restore scroll position after data arrives. Full-page
  // capture must start at the top so off-screen fixed controls stay off-screen.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, options);
}

/**
 * Visual regression baselines for the paper UI system.
 *
 * Snapshots are platform-scoped (`linux/` for CI, `darwin/` for local macOS).
 *
 * Update Linux (CI) baselines:
 *   npm run test:visual:update:linux
 *
 * Update this machine only:
 *   npm run test:visual:update
 */
test.describe('visual regression', () => {
  test.describe.configure({ timeout: 60_000 });

  test.use({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });

  test('landing page — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/');
    await expect(page.getByRole('heading', { name: 'Z Reader' })).toBeVisible();
    await expectStableScreenshot(page, 'landing-light.png', { fullPage: true });
  });

  test('landing page — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/');
    await expect(page.getByRole('heading', { name: 'Z Reader' })).toBeVisible();
    await expectStableScreenshot(page, 'landing-dark.png', { fullPage: true });
  });

  test('login page — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await expectStableScreenshot(page, 'login-light.png', { fullPage: true });
  });

  test('login page — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await expectStableScreenshot(page, 'login-dark.png', { fullPage: true });
  });

  test('login register mode — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login?mode=register');
    await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible();
    await expectStableScreenshot(page, 'login-register-light.png', { fullPage: true });
  });

  for (const entry of [
    { path: '/', heading: 'Z Reader', preset: 'light', snapshot: 'landing-mobile-light.png' },
    { path: '/login', heading: '欢迎回来', preset: 'dark', snapshot: 'login-mobile-dark.png' },
    {
      path: '/login?mode=register', heading: '创建账号', preset: 'light',
      snapshot: 'login-register-mobile-light.png',
    },
  ] as const) {
    test(`mobile entry — ${entry.snapshot}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await installBrowserStubs(page, { preset: entry.preset });
      await mockAuthUnauthorized(page);
      await gotoStable(page, entry.path);
      await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible();
      const background = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      );
      await expect(page.locator('meta[data-z-reader-theme-color]'))
        .toHaveAttribute('content', background);
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth
      )).toBe(true);
      await expectStableScreenshot(page, entry.snapshot, { fullPage: true });
    });
  }

  test('empty shelf — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 });
    await expectStableScreenshot(page, 'shelf-empty-light.png', { fullPage: true });
  });

  test('empty shelf — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 });
    await expectStableScreenshot(page, 'shelf-empty-dark.png', { fullPage: true });
  });

  test('populated shelf — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    // Title appears on both cover fallback and card body — assert by accessible name.
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toBeVisible();
    await expectStableScreenshot(page, 'shelf-populated-light.png', { fullPage: true });
  });

  test('populated shelf — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await expectStableScreenshot(page, 'shelf-populated-dark.png', { fullPage: true });
  });

  test('shelf load error — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockShelfLoadError(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架暂时无法加载')).toBeVisible({ timeout: 15_000 });
    await expectStableScreenshot(page, 'shelf-error-light.png', { fullPage: true });
  });

  test('populated shelf — mobile light', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await expectStableScreenshot(page, 'shelf-populated-mobile-light.png', {
      fullPage: true,
    });
  });

  test('shelf selection mode — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /批量操作/ }).click();
    await expect(page.getByText('已选中')).toBeVisible();
    await expectStableScreenshot(page, 'shelf-selection-light.png', { fullPage: true });
  });

  test('shelf category filter — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: '古典', exact: true }).click();
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible();
    await expect(page.getByRole('button', { name: '阅读《三体》' })).toHaveCount(0);
    await expectStableScreenshot(page, 'shelf-filter-classical-light.png', {
      fullPage: true,
    });
  });

  test('reader open error — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    // Catch-all API mock includes auth verify — no separate auth route needed.
    await mockReaderBookOpenError(page, 'book-1');
    await gotoStable(page, '/read/book-1');
    await expect(page).toHaveURL(/\/read\/book-1/);
    await expect(page.getByText('无法打开本书', { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole('button', { name: '返回书库' })).toBeVisible();
    await expectStableScreenshot(page, 'reader-error-light.png', { fullPage: true });
  });

  test('reader open error — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockReaderBookOpenError(page, 'book-1');
    await gotoStable(page, '/read/book-1');
    await expect(page).toHaveURL(/\/read\/book-1/);
    await expect(page.getByText('无法打开本书', { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expectStableScreenshot(page, 'reader-error-dark.png', { fullPage: true });
  });

  test('reader auth loading — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerifyHanging(page);
    await page.goto('/read/book-1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status', { name: '正在验证登录' })).toBeVisible({
      timeout: 10_000,
    });
    // Freeze motion before capture.
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none!important;transition:none!important;}',
    });
    await expectStableScreenshot(page, 'reader-auth-loading-light.png', {
      fullPage: true,
    });
  });

  test('mobile shelf selection — light', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await page.getByRole('button', { name: '更多书库操作' }).click();
    await page.getByRole('menuitem', { name: '批量操作', exact: true }).click();
    await page.getByRole('button', { name: '选择《红楼梦》', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('region', { name: '书籍批量操作' })).toBeVisible();
    await expectStableScreenshot(page, 'shelf-selection-mobile-light.png');
  });

  test('tablet reader toolbar — light', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockReaderHappyPath(page);
    await gotoStable(page, '/read/book-1');
    await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
    await prepareVisualPage(page);
    await expectStableScreenshot(page, 'reader-tablet-light.png');
  });

  for (const preset of ['light', 'dark'] as const) {
    test(`mobile reader settings — ${preset}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await installBrowserStubs(page, { preset, authenticated: true });
      await mockReaderHappyPath(page);
      await gotoStable(page, '/read/book-1');
      await expect(page.getByRole('heading', { name: 'E2E Sample Book' })).toBeVisible();
      await page.getByRole('button', { name: '更多阅读操作' }).click();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await expect(page.getByRole('heading', { name: '阅读偏好' })).toBeVisible();
      await prepareVisualPage(page);
      await expectStableScreenshot(page, `reader-settings-mobile-${preset}.png`);
    });
  }
});
