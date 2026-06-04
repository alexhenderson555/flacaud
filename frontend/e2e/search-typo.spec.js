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

test('search auto-corrects layout typo when alternate query has results', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);

  let callCount = 0;
  await page.route('**/api/search', async (route) => {
    callCount += 1;
    const body = callCount === 1
      ? { tracks: [], has_more: false }
      : {
          tracks: [{
            provider: 'tidal',
            provider_id: '9002',
            title: 'Привет',
            artists: ['Test'],
            cover_url: 'https://via.placeholder.com/64',
          }],
          has_more: false,
        };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('ghbdtn');
  await expect(page.getByPlaceholder(SEARCH_INPUT)).toHaveValue('привет', { timeout: 15000 });
  await expect(page.getByText('Привет')).toBeVisible({ timeout: 15000 });
});
