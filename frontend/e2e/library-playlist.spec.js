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

  // installApiStubs registers a catch-all **/api/library handler that returns
  // '[]' for ALL methods — it would shadow the test's POST handler below.
  // Unroute the generic one so our method-aware handler is the only one.
  await page.unroute('**/api/library');
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
  await expect(page.getByTestId('player-track-title')).toContainText('E2E Library Track', { timeout: 15_000 });

  // Set up the POST listener BEFORE the click — the like action can fire the
  // POST within milliseconds, racing with waitForResponse-after-click.
  const postResponse = page.waitForResponse(
    (r) => r.url().includes('/api/library') && r.request().method() === 'POST' && r.ok(),
    { timeout: 20_000 },
  );
  await page.getByTestId('player-like-btn').click();
  await postResponse;

  await page.goto('/library');
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
  await installPlayerStubs(page, { searchTracks: tracks });

  // Replace the default stream mock from installPlayerStubs with a logging one.
  // page.route runs handlers in registration order — the first fulfill() wins,
  // so the default routeStream handler would shadow this one without the unroute.
  await page.unroute('**/api/stream/**');
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
  await startSearchPlayback(page, { providerId: '9001', query: 'e2e', title: 'Track One' });

  await page.waitForResponse((r) => r.url().includes('/api/stream/') && r.url().includes('9001') && r.ok(), { timeout: 20_000 });

  // Set up the next-stream listener BEFORE the click — the player can preload
  // the next track's stream URL within milliseconds of the next-button click,
  // and waitForResponse-after-click races with that fetch.
  const nextStream = page.waitForResponse(
    (r) => r.url().includes('/api/stream/') && r.url().includes('9002') && r.ok(),
    { timeout: 20_000 },
  );
  await page.getByTestId('player-next-btn').click();
  await nextStream;

  expect(streamLog.some((u) => u.includes('/9001'))).toBeTruthy();
  expect(streamLog.some((u) => u.includes('/9002'))).toBeTruthy();
});
