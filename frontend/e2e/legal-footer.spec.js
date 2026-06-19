import { test, expect } from '@playwright/test';
import { installE2EAuth, routeMediaToken, routeQualityAvailable, routeStream } from './helpers.js';

test('legal footer links navigate to terms and privacy', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-legal' });
  await page.route('**/api/playlists', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/library**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tracks: [] }) });
  });
  await routeMediaToken(page);
  await routeQualityAvailable(page);
  await routeStream(page);

  await page.goto('/library');
  const footer = page.locator('.legal-footer');
  await expect(footer).toBeVisible();

  await footer.getByRole('link', { name: /Terms|Условия/i }).click();
  await expect(page).toHaveURL(/\/terms/);
  await expect(page.getByRole('heading', { name: /Terms of Use|Условия/i })).toBeVisible();

  await page.goto('/library');
  await footer.getByRole('link', { name: /Privacy|Конфиденциальность/i }).click();
  await expect(page).toHaveURL(/\/privacy/);
  await expect(page.getByRole('heading', { name: /Privacy Policy|Конфиденциальность/i })).toBeVisible();
});
