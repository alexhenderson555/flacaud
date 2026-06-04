import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, routeMediaToken, routeStream, SEARCH_INPUT } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '888001',
  title: 'Search Play Test',
  artists: ['Test Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/888001',
  quality: 'LOSSLESS',
};

test('search play button reflects current track', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-search-token' });
  await installApiStubs(page);
  await routeMediaToken(page);
  await routeStream(page);
  await page.route('**/api/quality/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOW' }) });
  });
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK], has_more: false }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('test track');
  await page.waitForTimeout(700);

  const playBtn = page.getByTestId('search-play-888001');
  await playBtn.click();

  await expect(playBtn).toHaveAttribute('data-play-state', 'pause', { timeout: 8000 });
  await expect(page.getByTestId('player-transport-btn')).toBeVisible();
});

test('hotkey hint is present', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-hint' });
  await installApiStubs(page);
  await page.goto('/search');
  await expect(page.getByTestId('hotkey-hint')).toBeAttached();
});
