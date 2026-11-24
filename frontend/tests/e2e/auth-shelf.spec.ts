import { expect, test } from '@playwright/test';

async function mockShelfData(page: import('@playwright/test').Page) {
  await page.route(/\/api\/books(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ books: [] }),
    });
  });

  await page.route('**/api/progress', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/books/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0, uncategorized: 0, categories: {} }),
    });
  });

  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test('redirects unauthenticated shelf visitors to login', async ({ page }) => {
  await page.route('**/api/auth/verify', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });

  await page.goto('/shelf');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '解锁书库' })).toBeVisible();
});

test('logs in and shows the empty shelf', async ({ page }) => {
  let authenticated = false;

  await page.route('**/api/auth/verify', async (route) => {
    if (!authenticated) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, password_required: true }),
    });
  });
  await mockShelfData(page);

  await page.route('**/api/login', async (route) => {
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Set-Cookie': 'z_reader_session=test-token; Path=/; HttpOnly; SameSite=Lax',
      },
      body: JSON.stringify({ valid: true, password_required: true }),
    });
  });

  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: '用户名' })).toHaveCount(0);
  await page.getByPlaceholder('请输入访问密码').fill('secret123');
  await page.getByRole('button', { name: /进入/ }).click();

  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page.getByText('书架还是空的')).toBeVisible();
  await expect(page.getByText('添加第一本书')).toBeVisible();
  await page.getByRole('button', { name: '书架设置' }).click();
  const settings = page.getByRole('menu', { name: '书架设置' });
  await expect(settings.getByRole('menuitem', { name: '退出登录' })).toBeVisible();
});

test('opens the shared shelf and its settings on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('**/api/auth/verify', route => route.fulfill({
    json: { valid: true, password_required: false },
  }));
  await mockShelfData(page);
  await page.goto('/shelf');
  await expect(page.getByText('书架还是空的')).toBeVisible();

  const header = page.getByRole('banner');
  const upload = header.getByRole('button', { name: '上传书籍', exact: true });
  const trigger = header.getByRole('button', { name: '书架设置' });
  for (const action of [upload, trigger]) {
    await expect(action).toBeInViewport({ ratio: 1 });
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  await upload.focus();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Enter'),
  ]);
  expect(chooser.isMultiple()).toBe(true);

  await trigger.focus();
  await page.keyboard.press('Enter');
  const settings = page.getByRole('menu', { name: '书架设置' });
  await expect(settings).toBeInViewport({ ratio: 1 });
  await expect(settings.getByRole('menuitem', { name: '退出登录' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await settings.getByRole('menuitem', { name: '暗色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reader-preset', 'dark');
  await trigger.click();
  await expect(settings.getByRole('menuitem', { name: '亮色模式' })).toBeVisible();
  await settings.getByRole('menuitem', { name: '离线图书管理' }).click();
  const offlineDialog = page.getByRole('dialog', { name: '离线图书管理' });
  await expect(offlineDialog).toBeVisible();
  await expect(offlineDialog.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const box = await offlineDialog.boundingBox();
    if (!box) return Infinity;
    return Math.max(
      Math.abs(box.x + box.width / 2 - viewport.width / 2),
      Math.abs(box.y + box.height / 2 - viewport.height / 2),
    );
  }).toBeLessThan(2);
});
