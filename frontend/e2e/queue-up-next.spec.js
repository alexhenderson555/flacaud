import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACKS = [
  { provider: 'tidal', provider_id: '71001', title: 'Queue One', artists: ['A'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
  { provider: 'tidal', provider_id: '71002', title: 'Queue Two', artists: ['B'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
  { provider: 'tidal', provider_id: '71003', title: 'Queue Three', artists: ['C'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
];

test('player shows up next track label when queue has next item', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: TRACKS });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '71001', query: 'queue', title: 'Queue One' });
  await expect(page.getByTestId('player-up-next')).toContainText('Queue Two', { timeout: 15000 });
});

test('queue panel lists now playing and up next sections', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: TRACKS });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '71001', query: 'queue', title: 'Queue One' });
  await page.getByTestId('player-queue-btn').click();
  const panel = page.getByTestId('playback-queue-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await expect(panel.getByText('Now Playing')).toBeVisible();
  await expect(panel.getByText('Up Next', { exact: true })).toBeVisible();
  await expect(panel.getByText('Queue Two')).toBeVisible();
  await expect(panel.getByText('Queue Three')).toBeVisible();
});
