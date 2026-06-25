import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, SEARCH_INPUT, startSearchPlayback } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '777001',
  title: 'E2E Library Track',
  artists: ['E2E Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/777001',
  quality: 'LOSSLESS',
  duration_s: 180,
};

test('add to library from player updates library page immediately', async ({ page }) => {
  let libraryItems = [];

  await installE2EAuth(page);
  await installPlayerStubs(page, { searchTracks: [TRACK] });

  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(libraryItems) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const saved = { id: 42, ...body };
      libraryItems = [saved];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved) });
      return;
    }
    await route.continue();
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: '777001', query: 'e2e', title: 'E2E Library Track' });

  await page.goto('/library');
  await expect(page.getByText(/library is empty|ваша медиатека/i)).toBeVisible({ timeout: 10000 });

  await page.getByTestId('player-like-btn').click();
  await expect(page.getByRole('main').getByText('E2E Library Track')).toBeVisible({ timeout: 10000 });
});

test('create playlist and add track via modal', async ({ page }) => {
  let playlists = [];

  await installE2EAuth(page);

  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-pl-token');
  });

  await page.route('**/api/library', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/playlists', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playlists.map(p => ({ ...p, tracks_json: JSON.stringify(p.tracks) }))),
      });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const pl = { id: 5, name: body.name, tracks: [], tracks_json: '[]', created_at: new Date().toISOString() };
      playlists.push(pl);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pl) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const id = Number(route.request().url().split('/').pop());
      const body = route.request().postDataJSON();
      playlists = playlists.map(p => (p.id === id ? { ...p, tracks: body.tracks, tracks_json: JSON.stringify(body.tracks) } : p));
      const updated = playlists.find(p => p.id === id);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK] }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('e2e');
  await page.waitForTimeout(800);

  await page.getByTitle('Add to Playlist').first().click();
  await expect(page.getByTestId('playlist-modal')).toBeVisible();

  await page.getByTestId('playlist-name-input').fill('E2E Mix');
  await page.getByTestId('playlist-create-btn').click();

  await page.goto('/library');
  await page.getByRole('button', { name: /Playlists/i }).click();
  await expect(page.getByText('E2E Mix')).toBeVisible({ timeout: 10000 });
});

test('sequential playback requests next stream url', async ({ page }) => {
  const tracks = [
    { ...TRACK, provider_id: '9001', title: 'Track One' },
    { ...TRACK, provider_id: '9002', title: 'Track Two' },
  ];
  const streamLog = [];

  await installE2EAuth(page);

  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-play-token');
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
  await page.route('**/api/auth/media-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mtok' }) });
  });
  await page.route('**/api/quality/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOW' }) });
  });
  await page.route('**/api/stream/**', async (route) => {
    streamLog.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'audio/mp4',
      body: Buffer.alloc(128, 1),
      headers: { 'Content-Length': '128' },
    });
  });

  await page.goto('/search');
  await page.evaluate((list) => {
    window.__testPlay = (track, playlist) => {
      window.dispatchEvent(new CustomEvent('test-play', { detail: { track, playlist: playlist || [track] } }));
    };
    window.__testTracks = list;
  }, tracks);

  // Inject tracks via App context is hard — use library page play buttons with mocked data instead
  await page.route('**/api/search', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tracks }) });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('e2e');
  await page.waitForResponse((r) => r.url().includes('/api/search') && r.ok());
  await page.waitForTimeout(600);

  const playButtons = page.locator('[data-testid^="search-play-"]');
  await playButtons.nth(0).click();
  await page.waitForTimeout(1500);
  await playButtons.nth(1).click();
  await page.waitForTimeout(1500);

  expect(streamLog.some(u => u.includes('/9001'))).toBeTruthy();
  expect(streamLog.some(u => u.includes('/9002'))).toBeTruthy();
});
