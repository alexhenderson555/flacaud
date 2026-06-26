import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, startSearchPlayback } from './helpers.js';

const TRACKS = [
  {
    provider: 'tidal',
    provider_id: '72001',
    title: 'First In Queue',
    artists: ['Alpha'],
    cover_url: 'https://via.placeholder.com/64',
    quality: 'LOSSLESS',
    duration_s: 180,
  },
  {
    provider: 'tidal',
    provider_id: '72002',
    title: 'Second In Queue',
    artists: ['Beta'],
    cover_url: 'https://via.placeholder.com/64',
    quality: 'LOSSLESS',
    duration_s: 180,
  },
];

test('player advances to next track in search queue', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: TRACKS });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '72001', query: 'queue next', title: 'First In Queue' });
  await page.getByTestId('search-play-72002').click();

  // Validate through queue panel: second track should become active now playing.
  await page.getByTestId('player-queue-btn').click();
  const panel = page.getByTestId('playback-queue-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('Now Playing')).toBeVisible();
  await expect(panel.getByText('Second In Queue')).toBeVisible();
});

test('player next button switches to following track', async ({ page }) => {
  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: TRACKS });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '72001', query: 'queue next', title: 'First In Queue' });
  const nextBtn = page.getByTestId('player-next-btn');
  await nextBtn.click();

  // After pressing Next, queue panel should show second track as Now Playing.
  await page.getByTestId('player-queue-btn').click();
  const panel = page.getByTestId('playback-queue-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('Now Playing')).toBeVisible();
  await expect(panel.getByText('Second In Queue')).toBeVisible({ timeout: 12_000 });
});
