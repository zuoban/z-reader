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
});

test('opens the shared shelf directly when no password is configured', async ({ page }) => {
  await page.route('**/api/auth/verify', route => route.fulfill({
    json: { valid: true, password_required: false },
  }));
  await mockShelfData(page);
  await page.goto('/shelf');
  await expect(page.getByText('书架还是空的')).toBeVisible();
  await expect(page.getByTitle('书架设置')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '离线图书管理' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(亮色|暗色)模式$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '退出登录' })).toHaveCount(0);
});
