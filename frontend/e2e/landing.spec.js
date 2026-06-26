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

test('cinema easter egg toggles with physical V key (any layout)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.landing')).not.toHaveClass(/landing--cinema/);

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyV',
      key: 'М',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
  await expect(page.locator('.landing')).toHaveClass(/landing--cinema/);
  await expect(page.locator('.landing__cinema-hint')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.landing')).not.toHaveClass(/landing--cinema/);
});

test('landing easter egg whisper is present', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.landing__egg')).toBeAttached();
});

test('FAQ Telegram contact link', async ({ page }) => {
  await page.goto('/landing#faq');
  const tg = page.getByRole('link', { name: /Message on Telegram|Написать в Telegram|Написать в ТГ/i });
  await expect(tg).toBeVisible();
  await expect(tg).toHaveAttribute('href', /t\.me\/alexhenderson/);
});
