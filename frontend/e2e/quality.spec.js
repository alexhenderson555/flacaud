import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '999001',
  title: 'Hi-Res Test Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/999001',
  quality: 'HI_RES',
  duration_s: 180,
};

test('quality selector shows actual MAX badge for HI_RES', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-quality' });
  await page.addInitScript(() => {
    localStorage.setItem('tidal-playback-quality', 'HI_RES');
    sessionStorage.setItem('tidal-playback-quality', 'HI_RES');
  });
  await installPlayerStubs(page, {
    searchTracks: [TRACK],
    qualityPayload: {
      available: ['LOW', 'HIGH', 'LOSSLESS', 'HI_RES'],
      max_quality: 'HI_RES',
      actual: { HI_RES: 'HI_RES_LOSSLESS', LOSSLESS: 'LOSSLESS', HIGH: 'HIGH', LOW: 'LOW' },
    },
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '999001', query: 'hi res', title: 'Hi-Res Test Track' });

  await expect(page.getByText('MAX').first()).toBeVisible({ timeout: 10000 });
});
