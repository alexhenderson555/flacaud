import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, routeQualityAvailable, SEARCH_INPUT } from './helpers.js';

const TRACK_NO_MAX = {
  provider: 'tidal',
  provider_id: '93001',
  title: 'No Max Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  duration_s: 180,
};

test.beforeEach(async ({ page }) => {
  await installE2EAuth(page);
  await page.addInitScript(() => {
    localStorage.setItem('tidal-playback-quality', 'HI_RES');
  });
  await installApiStubs(page);
  await page.route('**/api/auth/media-token', async (r) => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 't', expires_in: 3600 }) });
  });
  await routeQualityAvailable(page, {
    available: ['LOW', 'HIGH', 'LOSSLESS'],
    max_quality: 'LOSSLESS',
    actual: { LOSSLESS: 'LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' },
  });
  await page.route('**/api/stream/**', async (r) => {
    await r.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.alloc(128) });
  });
  await page.route('**/api/search', async (r) => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK_NO_MAX], has_more: false }),
    });
  });
});

test('MAX button disabled when track has no hi-res', async ({ page }) => {
  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('no max');
  await page.waitForTimeout(700);
  await page.getByTitle('Play Preview').first().click();
  await expect(page.getByTestId('quality-HI_RES')).toHaveAttribute('data-available', 'false', { timeout: 15000 });
  await expect(page.getByTestId('quality-LOSSLESS')).toHaveAttribute('data-available', 'true');
});
