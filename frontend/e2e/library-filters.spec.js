import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs } from './helpers.js';

const LIBRARY = [
  {
    id: 1,
    provider: 'tidal',
    provider_id: '91001',
    title: 'Slow Jam',
    artists_json: '["DJ One"]',
    cover_url: 'https://via.placeholder.com/64',
    key: '8A',
    bpm: 90,
    source_url: 'https://tidal.com/track/91001',
  },
  {
    id: 2,
    provider: 'tidal',
    provider_id: '91002',
    title: 'Fast Beat',
    artists_json: '["DJ Two"]',
    cover_url: 'https://via.placeholder.com/64',
    key: '12B',
    bpm: 128,
    source_url: 'https://tidal.com/track/91002',
  },
];

test.beforeEach(async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);
  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY) });
  });
});

test('DJ filters panel opens with glass styling', async ({ page }) => {
  await page.goto('/library');
  await page.getByTestId('library-dj-filters-btn').click();
  await expect(page.getByTestId('library-dj-filters')).toBeVisible();
});

test('library search filters tracks', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByText('Fast Beat')).toBeVisible({ timeout: 15_000 });
  await page.getByPlaceholder(/search library/i).fill('Fast');
  await expect(page.getByText('Fast Beat')).toBeVisible();
  await expect(page.getByText('Slow Jam')).toHaveCount(0);
});

test('track rows do not show lossless quality badge', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByText('Slow Jam')).toBeVisible({ timeout: 15_000 });
  const row = page.locator('.glass-panel').filter({ hasText: 'Slow Jam' });
  await expect(row.getByText('FLAC')).toHaveCount(0);
  await expect(row.getByText('LOSSLESS')).toHaveCount(0);
});
