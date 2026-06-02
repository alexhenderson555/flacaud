import { test, expect } from '@playwright/test';

const TRACK = {
  provider: 'tidal',
  provider_id: '888001',
  title: 'Search Play Test',
  artists: ['Test Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/888001',
  quality: 'LOSSLESS',
};

test('search play button reflects current track', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-search-token');
    window.__E2E_DISABLE_AUTOSAVE__ = true;
  });

  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/playlists', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK], has_more: false }),
    });
  });
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mtok' }) });
  });
  await page.route('**/api/quality/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOW' }) });
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mp4',
      body: Buffer.alloc(128, 1),
      headers: { 'Content-Length': '128' },
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(/search|поиск/i).fill('test track');
  await page.waitForTimeout(700);

  const playBtn = page.getByTestId('search-play-888001');
  await playBtn.click();

  await expect(playBtn).toHaveAttribute('data-play-state', 'pause', { timeout: 8000 });
  await expect(page.getByTestId('player-transport-btn')).toBeVisible();
});

test('hotkey hint is present', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tidal-token', 'e2e-hint'));
  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/search');
  await expect(page.getByTestId('hotkey-hint')).toBeAttached();
});
