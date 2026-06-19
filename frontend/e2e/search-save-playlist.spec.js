import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, SEARCH_INPUT } from './helpers.js';

const TRACK_A = {
  provider: 'tidal',
  provider_id: '91001',
  title: 'Search Save A',
  artists: ['Saver'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/91001',
};

const TRACK_B = {
  ...TRACK_A,
  provider_id: '91002',
  title: 'Search Save B',
};

test('search results save as playlist', async ({ page }) => {
  let playlists = [];

  await installE2EAuth(page, { token: 'e2e-search-save' });
  await installPlayerStubs(page, { searchTracks: [TRACK_A, TRACK_B] });

  await page.route('**/api/playlists', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlists) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const created = { id: 42, name: body.name, tracks_json: '[]' };
      playlists = [created];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/playlists/42', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('save test');
  await page.waitForTimeout(800);
  await expect(page.getByText('Search Save A')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('save-search-playlist-btn').click();
  await expect.poll(() => playlists.length).toBe(1);
  expect(playlists[0].name).toMatch(/save test/i);
});
