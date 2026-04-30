import { expect, test } from '@playwright/test';

const user = {
  id: 'user-1',
  username: 'admin',
  role: 'admin',
  created_at: '2026-04-27T00:00:00Z',
  updated_at: '2026-04-27T00:00:00Z',
};

async function mockShelfData(page: import('@playwright/test').Page) {
  await page.route('**/api/books', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/progress', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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
  await page.goto('/shelf');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
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
      body: JSON.stringify({ valid: true, user }),
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
      body: JSON.stringify({ user }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('secret');
  await page.getByRole('button', { name: /进入/ }).click();

  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page.getByText('书架还是空的')).toBeVisible();
  await expect(page.getByText('添加第一本书')).toBeVisible();
});
