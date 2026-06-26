import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK_NO_MAX = {
  provider: 'tidal',
  provider_id: '93001',
  title: 'No Max Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  duration_s: 180,
};

test('Lossless tier available when track max is CD quality only', async ({ page }) => {
  await installE2EAuth(page);
  await page.addInitScript(() => {
    localStorage.setItem('tidal-playback-quality', 'LOSSLESS');
    sessionStorage.setItem('tidal-playback-quality', 'LOSSLESS');
  });
  await installPlayerStubs(page, {
    searchTracks: [TRACK_NO_MAX],
    qualityPayload: {
      available: ['LOW', 'HIGH', 'LOSSLESS'],
      max_quality: 'LOSSLESS',
      actual: { LOSSLESS: 'LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' },
    },
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '93001', query: 'no max', title: 'No Max Track' });
  await expect(page.getByTestId('quality-LOSSLESS')).toHaveAttribute('data-available', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('quality-HIGH')).toHaveAttribute('data-available', 'true');
  await expect(page.getByTestId('quality-LOSSLESS')).toHaveClass(/is-active/);
});
