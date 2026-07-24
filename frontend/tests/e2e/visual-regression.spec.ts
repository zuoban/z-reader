import { expect, test } from '@playwright/test';
import {
  gotoStable,
  installBrowserStubs,
  mockAuthUnauthorized,
  mockAuthVerified,
  mockAuthVerifyHanging,
  mockEmptyShelfApis,
  mockPopulatedShelfApis,
  mockReaderBookOpenError,
  mockShelfLoadError,
} from './helpers/fixtures';

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
    await expect(page).toHaveScreenshot('landing-light.png', { fullPage: true });
  });

  test('landing page — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/');
    await expect(page.getByRole('heading', { name: 'Z Reader' })).toBeVisible();
    await expect(page).toHaveScreenshot('landing-dark.png', { fullPage: true });
  });

  test('login page — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await expect(page).toHaveScreenshot('login-light.png', { fullPage: true });
  });

  test('login page — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await expect(page).toHaveScreenshot('login-dark.png', { fullPage: true });
  });

  test('login register mode — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light' });
    await mockAuthUnauthorized(page);
    await gotoStable(page, '/login?mode=register');
    await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible();
    await expect(page).toHaveScreenshot('login-register-light.png', { fullPage: true });
  });

  test('empty shelf — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot('shelf-empty-light.png', { fullPage: true });
  });

  test('empty shelf — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockAuthVerified(page);
    await mockEmptyShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot('shelf-empty-dark.png', { fullPage: true });
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
    await expect(page).toHaveScreenshot('shelf-populated-light.png', { fullPage: true });
  });

  test('populated shelf — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockAuthVerified(page);
    await mockPopulatedShelfApis(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByRole('button', { name: '阅读《红楼梦》' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveScreenshot('shelf-populated-dark.png', { fullPage: true });
  });

  test('shelf load error — light', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'light', authenticated: true });
    await mockAuthVerified(page);
    await mockShelfLoadError(page);
    await gotoStable(page, '/shelf');
    await expect(page.getByText('书架暂时无法加载')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot('shelf-error-light.png', { fullPage: true });
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
    await expect(page).toHaveScreenshot('shelf-populated-mobile-light.png', {
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
    await expect(page).toHaveScreenshot('shelf-selection-light.png', { fullPage: true });
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
    await expect(page).toHaveScreenshot('shelf-filter-classical-light.png', {
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
    await expect(page).toHaveScreenshot('reader-error-light.png', { fullPage: true });
  });

  test('reader open error — dark', async ({ page }) => {
    await installBrowserStubs(page, { preset: 'dark', authenticated: true });
    await mockReaderBookOpenError(page, 'book-1');
    await gotoStable(page, '/read/book-1');
    await expect(page).toHaveURL(/\/read\/book-1/);
    await expect(page.getByText('无法打开本书', { exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page).toHaveScreenshot('reader-error-dark.png', { fullPage: true });
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
    await expect(page).toHaveScreenshot('reader-auth-loading-light.png', {
      fullPage: true,
    });
  });
});
