import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '888001',
  title: 'Search Play Test',
  artists: ['Test Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/888001',
  quality: 'LOSSLESS',
  duration_s: 180,
};

test('search play button reflects current track', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-search-token' });
  await installPlayerStubs(page, { searchTracks: [TRACK] });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '888001', query: 'test track', title: 'Search Play Test' });

  const playBtn = page.getByTestId('search-play-888001');
  await expect(playBtn).toHaveAttribute('data-play-state', 'pause', { timeout: 8000 });
  await expect(page.getByTestId('player-transport-btn')).toBeVisible();
});

test('hotkey hint is present', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-hint' });
  await installPlayerStubs(page, {
    searchTracks: [{
      provider: 'tidal',
      provider_id: '888002',
      title: 'Hint Track',
      artists: ['Hint Artist'],
      cover_url: 'https://via.placeholder.com/64',
      quality: 'LOSSLESS',
      duration_s: 180,
    }],
  });
  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '888002', query: 'hint', title: 'Hint Track' });
  await expect(page.getByTestId('hotkey-hint')).toBeAttached();
});
