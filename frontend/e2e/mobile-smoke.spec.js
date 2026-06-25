import { test, expect, devices } from '@playwright/test';
import { installE2EAuth, routeMediaToken, routeQualityAvailable, routeStream } from './helpers.js';

test.use({ ...devices['iPhone 13'] });

test('mobile library and legal footer visible', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-mobile' });
  await page.route('**/api/playlists', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/library**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await routeMediaToken(page);
  await routeQualityAvailable(page);
  await routeStream(page);

  await page.goto('/library');
  await expect(page.getByRole('heading', { name: /Your Library|Ваша медиатека/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.legal-footer')).toBeVisible();
});

test('terms page loads on mobile', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /Terms of Use|Условия/i })).toBeVisible();
});

test('party mode button hidden on mobile', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-mobile-party' });
  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await routeMediaToken(page);
  await routeQualityAvailable(page);
  await routeStream(page);

  await page.goto('/search');
  await expect(page.getByTestId('player-party-btn')).toHaveCount(0);
});
