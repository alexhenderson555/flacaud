import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, routeQualityAvailable, SEARCH_INPUT } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '88001',
  title: 'Test Lyric Song',
  artists: ['Lyric Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 180,
};

test('lyrics panel shows fetched lines', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK], has_more: false }),
    });
  });
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e', expires_in: 3600 }) });
  });
  await routeQualityAvailable(page, {
    available: ['LOW'],
    max_quality: 'LOW',
    actual: { LOW: 'LOW' },
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.alloc(64), headers: { 'Content-Length': '64' } });
  });
  await page.route('**/api/lyrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lyrics: [
          { time: 0, text: 'First line of the song' },
          { time: 5.5, text: 'Second line here' },
        ],
      }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('lyric');
  await page.waitForTimeout(800);
  await page.getByTitle('Play Preview').first().click();
  await page.keyboard.press('l');
  await expect(page.getByText('First line of the song')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Second line here')).toBeVisible();
});
