import { test, expect } from '@playwright/test';

const TRACK = {
  provider: 'tidal',
  provider_id: '555001',
  title: 'Radio Track',
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
};

test('My Vibe starts station from ai-playlist fallback', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-radio');
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
  await page.route('**/api/ai-playlist', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK, { ...TRACK, provider_id: '555002', title: 'Track 2' }] }),
    });
  });
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mt' }) });
  });
  await page.route('**/api/quality/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOSSLESS' }) });
  });
  await page.route('**/api/stream/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mp4',
      body: Buffer.alloc(64, 1),
      headers: { 'Content-Length': '64', 'X-Actual-Quality': 'LOSSLESS' },
    });
  });
  await page.route('**/api/lyrics**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lyrics: [] }) });
  });
  await page.route('**/api/image-proxy**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(8) });
  });

  await page.goto('/radio');
  const aiPromise = page.waitForResponse((r) => r.url().includes('/api/ai-playlist') && r.status() === 200);
  await page.getByRole('button', { name: /Start Radio/i }).click();
  await aiPromise;
  await expect(page.getByRole('heading', { name: 'Up Next on Your Station' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('main').getByText('Radio Track')).toBeVisible();
});
