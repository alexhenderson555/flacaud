import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '88001',
  title: 'Test Lyric Song',
  artists: ['Lyric Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 180,
};

test('karaoke mode shows fetched lines on K', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: [TRACK] });
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
  await startSearchPlayback(page, { providerId: '88001', query: 'lyric', title: 'Test Lyric Song' });
  await page.keyboard.press('k');
  await expect(page.locator('.karaoke-mode')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Second line here')).toBeVisible();
});
