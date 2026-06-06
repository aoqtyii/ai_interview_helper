import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input').nth(0).fill(email);
  await page.locator('input').nth(1).fill(password);
  await page.locator('button').first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('seeded user can log in and reach the dashboard', async ({ page }) => {
  await login(page, 'user@aih.local', 'user123456');

  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
});

test('ordinary users cannot use the admin page', async ({ page }) => {
  await login(page, 'user@aih.local', 'user123456');
  await expect(page.getByRole('link', { name: '管理台' })).toHaveCount(0);

  await page.goto('/admin');

  await expect(page.locator('main')).toContainText('403');
  await expect(page.locator('main')).toContainText('当前账号没有管理员权限。');
});

test('interview page loads for authenticated users', async ({ page }) => {
  await login(page, 'user@aih.local', 'user123456');
  await page.goto('/interviews');

  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('button').first()).toBeVisible();
});

test('interview creation failures are visible to users', async ({ page }) => {
  await login(page, 'user@aih.local', 'user123456');
  await page.goto('/interviews');

  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/interviews/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '开始面试' }).click();
  const response = await responsePromise;

  expect(response.status()).toBe(502);
  await expect(page.locator('.text-red-100').first()).toBeVisible();
});

test('admin page surfaces API failures instead of hiding them', async ({ page }) => {
  await login(page, 'admin@aih.local', 'admin123456');
  await page.route('**/admin/ai-run-logs', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'e2e forced failure',
        requestId: 'e2e-admin-failure'
      })
    });
  });

  await page.goto('/admin');

  await expect(page.locator('main')).toContainText('API');
});
