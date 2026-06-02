import { test, expect } from '@playwright/test';

const TOP = {
  provider: 'tidal',
  provider_id: '770001',
  title: 'Artist Top Hit',
  artists: ['Star Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration: 200,
};

test('artist page shows top tracks and play state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-artist');
    window.__E2E_DISABLE_AUTOSAVE__ = true;
  });

  await page.route('**/api/artist/12345', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artist: { id: 12345, name: 'Star Artist', picture_url: 'https://via.placeholder.com/300' },
        albums: [],
        top_tracks: [TOP],
      }),
    });
  });
  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mt' }) });
  });
  await page.route('**/api/quality/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOSSLESS' }) });
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.alloc(64, 1), headers: { 'Content-Length': '64' } });
  });

  await page.goto('/artist/12345');
  await expect(page.getByText('Artist Top Hit')).toBeVisible({ timeout: 10000 });

  const row = page.locator('.glass-panel').filter({ hasText: 'Artist Top Hit' });
  await row.locator('button.btn-secondary').click();
  await expect(page.getByTestId('player-transport-btn')).toBeVisible();
});
