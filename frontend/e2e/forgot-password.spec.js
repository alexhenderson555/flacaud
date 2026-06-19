import { test, expect } from '@playwright/test';

test('forgot password page loads and submits', async ({ page }) => {
  await page.route('**/api/auth/forgot-password', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: /Forgot password|Забыли пароль/i })).toBeVisible();
  await page.getByPlaceholder(/email/i).fill('user@example.com');
  await page.getByRole('button', { name: /Send reset link|Отправить ссылку/i }).click();
  await expect(page.getByText(/Check your inbox|Проверьте почту/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Spam|Спам/i)).toBeVisible();
});
