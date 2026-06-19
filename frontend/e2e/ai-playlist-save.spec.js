import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs } from './helpers.js';

const AI_TRACK = {
  provider: 'tidal',
  provider_id: '9001',
  title: 'AI Track One',
  artists: ['AI Artist'],
  cover_url: 'https://via.placeholder.com/64',
  source_url: 'https://tidal.com/track/9001',
};

test('AI playlist save creates playlist via API', async ({ page }) => {
  let playlists = [];

  await installE2EAuth(page, { token: 'e2e-ai-token' });
  await installPlayerStubs(page);
  await page.addInitScript(() => {
    localStorage.setItem('tidal-guest-merged', '1');
  });

  await page.route('**/api/playlists', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlists) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const created = { id: 7, name: body.name, tracks_json: '[]' };
      playlists = [created];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/playlists/7', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/ai-playlist', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [AI_TRACK] }),
    });
  });

  await page.goto('/search');
  await page.getByRole('button', { name: /AI Playlist|ИИ Плейлист/i }).click();
  await page.getByPlaceholder(/Describe the vibe|Опишите вайб/i).fill('late night coding');
  await page.getByRole('button', { name: /Generate Playlist|Сгенерировать/i }).click();
  await expect(page.getByText('AI Track One')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Save Playlist|Сохранить плейлист/i }).click();
  await expect.poll(() => playlists.length).toBe(1);
});
