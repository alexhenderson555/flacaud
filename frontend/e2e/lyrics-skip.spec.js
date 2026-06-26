import { test, expect } from '@playwright/test';
import {
  installE2EAuth,
  installApiStubs,
  routeMediaToken,
  routeQualityAvailable,
  routeSearchTracks,
  routeStream,
  startSearchPlayback,
} from './helpers.js';

const TRACK_A = {
  provider: 'tidal',
  provider_id: '88001',
  title: 'Track A',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  duration_s: 180,
};

const TRACK_B = {
  ...TRACK_A,
  provider_id: '88002',
  title: 'Track B',
};

test('karaoke fetch survives quick skip when second track has lyrics', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);
  await routeMediaToken(page);
  await routeQualityAvailable(page, {
    available: ['LOW'],
    max_quality: 'LOW',
    actual: { LOW: 'LOW' },
  });
  await routeStream(page);

  await routeSearchTracks(page, (query) => (/track b/i.test(query) ? [TRACK_B] : [TRACK_A]));

  await page.route('**/api/lyrics**', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const providerId = params.get('provider_id') || '';
    const title = params.get('title') || '';
    const lines = providerId === '88002' || title === 'Track B'
      ? [{ time: 0, text: 'Second track lyric' }]
      : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lyrics: lines }),
    });
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '88001', query: 'track a', title: 'Track A' });
  await startSearchPlayback(page, { providerId: '88002', query: 'track b', title: 'Track B' });
  await expect(page.getByTestId('player-track-title')).toContainText('Track B', { timeout: 15_000 });
  await page.keyboard.press('k');
  await expect(page.locator('.karaoke-mode')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Second track lyric')).toBeVisible({ timeout: 15_000 });
});
