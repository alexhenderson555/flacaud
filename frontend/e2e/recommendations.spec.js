import { test, expect } from '@playwright/test';
import { routeAuthMe } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '660001',
  title: 'Rec Track One',
  artists: ['Rec Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
};

test('recommendations page loads tracks from recommendations API', async ({ page }) => {
  await routeAuthMe(page);

  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-rec');
    window.__E2E_DISABLE_AUTOSAVE__ = true;
  });

  await page.route('**/api/recommendations**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK, { ...TRACK, provider_id: '660002', title: 'Rec Track Two' }] }),
    });
  });

  await page.goto('/recommendations');
  await expect(page.getByText('Rec Track One')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Rec Track Two')).toBeVisible();
});
