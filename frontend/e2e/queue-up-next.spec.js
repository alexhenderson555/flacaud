import { test, expect } from '@playwright/test';
import { installE2EAuth, routeQualityAvailable, SEARCH_INPUT } from './helpers.js';

const TRACKS = [
  { provider: 'tidal', provider_id: '71001', title: 'Queue One', artists: ['A'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
  { provider: 'tidal', provider_id: '71002', title: 'Queue Two', artists: ['B'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
  { provider: 'tidal', provider_id: '71003', title: 'Queue Three', artists: ['C'], cover_url: 'https://via.placeholder.com/64', quality: 'LOSSLESS', duration_s: 200 },
];

async function mockPlayerRoutes(page) {
  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/playlists', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e', expires_in: 3600 }) });
  });
  await routeQualityAvailable(page, {
    available: ['LOW', 'HIGH', 'LOSSLESS'],
    max_quality: 'LOSSLESS',
    actual: { LOW: 'LOW', HIGH: 'HIGH', LOSSLESS: 'LOSSLESS' },
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.alloc(128), headers: { 'Content-Length': '128' } });
  });
}

test('player shows up next track label when queue has next item', async ({ page }) => {
  await installE2EAuth(page);

  await mockPlayerRoutes(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: TRACKS, has_more: false }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('queue');
  await page.waitForTimeout(800);
  await page.getByTitle('Play Preview').first().click();
  await expect(page.getByTestId('player-up-next')).toContainText('Queue Two', { timeout: 15000 });
});

test('queue panel lists now playing and up next sections', async ({ page }) => {
  await installE2EAuth(page);

  await mockPlayerRoutes(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: TRACKS, has_more: false }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('queue');
  await page.waitForTimeout(800);
  await page.getByTitle('Play Preview').first().click();
  await page.getByRole('button', { name: 'Queue' }).click();
  const panel = page.getByTestId('playback-queue-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await expect(panel.getByText('Now Playing')).toBeVisible();
  await expect(panel.getByText('Up Next', { exact: true })).toBeVisible();
  await expect(panel.getByText('Queue Two')).toBeVisible();
  await expect(panel.getByText('Queue Three')).toBeVisible();
});
