import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '555001',
  title: 'Radio Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 200,
};

test('Genreverse starts station from recommendations', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-radio' });
  await installPlayerStubs(page);

  await page.route('**/api/genres', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        electronic: { id: 'electronic', name: 'Electronic', color: '#000', image: '/genres/genre_electronic_1781783267241.png' },
      }),
    });
  });
  await page.route('**/api/recommendations*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracks: [TRACK, { ...TRACK, provider_id: '555002', title: 'Track 2' }],
      }),
    });
  });
  await page.route('**/api/lyrics**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lyrics: [] }) });
  });

  await page.goto('/genreverse');
  await page.locator('.radio-page').getByText('Electronic', { exact: true }).first().click();
  const startBtn = page.getByRole('button', { name: /Start Radio|Запустить радио/i });
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  const recPromise = page.waitForResponse((r) => r.url().includes('/api/recommendations') && r.status() === 200);
  await startBtn.click();
  await recPromise;
  await expect(page.getByRole('heading', { name: /Up Next on Your Station|Дальше на вашей станции/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('main').getByText('Radio Track')).toBeVisible();
});
