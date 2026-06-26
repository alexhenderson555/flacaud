import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '92001',
  title: 'Lyric Line Test',
  artists: ['Singer'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 120,
};

test('first karaoke line is highlighted during intro', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: [TRACK] });
  await page.route('**/api/lyrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lyrics: [
          { time: 8, text: 'Opening line before sync' },
          { time: 15, text: 'Second synced line' },
        ],
      }),
    });
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '92001', query: 'lyric', title: 'Lyric Line Test' });
  await page.keyboard.press('k');

  await expect(page.locator('.karaoke-mode')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Opening line before sync')).toBeVisible({ timeout: 15000 });
  const active = page.locator('.karaoke-mode__line--active');
  await expect(active).toBeVisible({ timeout: 5000 });
  await expect(active).toContainText('Opening line before sync');
});
