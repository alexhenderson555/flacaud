import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '93001',
  title: 'Karaoke Track',
  artists: ['Viz Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 200,
};

test.describe('Karaoke overlay', () => {
  test.beforeEach(async ({ page }) => {
    await installE2EAuth(page, { token: 'e2e-party' });
    await installPlayerStubs(page, { searchTracks: [TRACK] });
    await page.route('**/api/lyrics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lyrics: [
            { time: 0, text: 'Line one' },
            { time: 5, text: 'Line two' },
          ],
        }),
      });
    });
  });

  test('karaoke mode opens with cover background', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/search');
    await startSearchPlayback(page, { providerId: '93001', query: 'karaoke', title: 'Karaoke Track' });

    await page.keyboard.press('k');
    await expect(page.locator('.karaoke-mode')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.karaoke-mode__line').first()).toBeVisible();
  });
});
