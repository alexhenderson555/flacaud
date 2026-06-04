import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, routeMediaToken, routeStream, routeQualityAvailable, SEARCH_INPUT } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '999001',
  title: 'Hi-Res Test Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/999001',
  quality: 'HI_RES',
  duration: 180,
};

test('quality selector shows actual MAX badge for HI_RES', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-quality' });
  await page.addInitScript(() => {
    localStorage.setItem('tidal-playback-quality', 'HI_RES');
  });
  await installApiStubs(page);
  await routeMediaToken(page);
  await routeStream(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK], has_more: false }),
    });
  });
  await routeQualityAvailable(page, {
    available: ['LOW', 'HIGH', 'LOSSLESS', 'HI_RES'],
    max_quality: 'HI_RES',
    actual: { HI_RES: 'HI_RES_LOSSLESS', LOSSLESS: 'LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' },
  });
  await page.route('**/api/quality/**', async (route) => {
    if (route.request().url().includes('/available')) return;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'HI_RES_LOSSLESS' }) });
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mp4',
      body: Buffer.alloc(128, 1),
      headers: { 'Content-Length': '128', 'X-Actual-Quality': 'HI_RES_LOSSLESS' },
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('hi res');
  await page.waitForTimeout(700);

  await page.getByTitle('Play Preview').first().click();
  await page.waitForTimeout(1200);

  await expect(page.getByText('MAX').first()).toBeVisible({ timeout: 10000 });
});
