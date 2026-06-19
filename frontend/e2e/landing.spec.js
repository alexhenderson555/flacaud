import { test, expect } from '@playwright/test';

test('landing premium sections and CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.landing__headline')).toContainText(/hard drive|на диске/i);
  await expect(page.getByRole('link', { name: /Log in\s*\/\s*Sign up|Войти\s*\/\s*Рега/i }).first()).toBeVisible();
  await expect(page.locator('.landing-mockup')).toBeVisible();
  await page.locator('.landing-auth-strip').scrollIntoViewIfNeeded();
  await expect(page.locator('.landing-auth-strip')).toBeVisible();
  await expect(page.getByRole('link', { name: /Log in\s*\/\s*Sign up|Войти\s*\/\s*Рега/i })).toBeVisible();
  await page.locator('#showcase').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: /Pricing|Тарифы/i })).toBeVisible();
  await expect(page.locator('#showcase')).toBeVisible();
  await expect(page.locator('.landing-product')).toBeVisible();
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await expect(page.locator('#faq')).toBeVisible();
  await expect(page.locator('.landing-faq__layout')).toBeVisible();
  await page.locator('#compare').scrollIntoViewIfNeeded();
  await expect(page.locator('#compare')).toBeVisible();
  await expect(page.locator('.landing__lang-btn')).toBeVisible();
});

test('FAQ Telegram contact link', async ({ page }) => {
  await page.goto('/landing#faq');
  const tg = page.getByRole('link', { name: /Message on Telegram|Написать в Telegram|Написать в ТГ/i });
  await expect(tg).toBeVisible();
  await expect(tg).toHaveAttribute('href', /t\.me\/alexhenderson/);
});
