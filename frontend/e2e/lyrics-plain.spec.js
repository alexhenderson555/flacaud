import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '88002',
  title: 'Plain Lyric Song',
  artists: ['Plain Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 180,
};

test('karaoke shows unsynced plain text lines', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: [TRACK] });
  await page.route('**/api/lyrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lyrics: [
          { time: 0, text: 'Unsynced opening line' },
          { time: 0, text: 'Unsynced second line' },
        ],
      }),
    });
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '88002', query: 'plain', title: 'Plain Lyric Song' });
  await page.keyboard.press('k');
  await expect(page.locator('.karaoke-mode')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Unsynced second line')).toBeVisible();
});
