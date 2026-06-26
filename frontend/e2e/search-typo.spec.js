import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, SEARCH_INPUT } from './helpers.js';

test('search does not show layout typo hint for valid latin query with results', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracks: [{
          provider: 'tidal',
          provider_id: '9001',
          title: 'Smooth Operator',
          artists: ['Sitze'],
          cover_url: 'https://via.placeholder.com/64',
          quality: 'LOSSLESS',
        }],
        has_more: false,
      }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('sitze');
  await expect(page.getByText('Smooth Operator')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Did you mean/i)).toHaveCount(0);
});

test('search shows did-you-mean hint when API suggests alternate query', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);

  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracks: [],
        has_more: false,
        suggested_query: 'привет',
      }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('ghbdtn');
  await expect(page.getByText(/Did you mean/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('привет')).toBeVisible();
});
