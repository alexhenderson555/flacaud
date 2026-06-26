import { test, expect } from '@playwright/test';
import { installApiStubs, installE2EAuth } from './helpers.js';

const TASK_ID = 'e2e-sync-task';
const ACCESS_TOKEN = 'e2e-sync-access';

const PREVIEW = {
  task_id: TASK_ID,
  source_title: 'E2E YT Playlist',
  source_kind: 'playlist',
  total: 1,
  source_total: 1,
  tracks: [{
    provider: 'tidal',
    provider_id: 'sync-001',
    title: 'Synced Track',
    artists: ['Artist'],
    match_score: 0.92,
    duration_s: 210,
    cover_url: 'https://via.placeholder.com/64',
  }],
};

test('sync page previews playlist and imports to library', async ({ page }) => {
  await installE2EAuth(page);
  await installApiStubs(page);

  await page.route('**/api/transfer/preview', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ task_id: TASK_ID, access_token: ACCESS_TOKEN }),
    });
  });

  await page.route(`**/api/transfer/tasks/${TASK_ID}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        task_id: TASK_ID,
        status: 'done',
        preview: PREVIEW,
      }),
    });
  });

  await page.route('**/api/transfer/import', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        added_to_library: 1,
        already_in_library: 0,
        total_tracks: 1,
      }),
    });
  });

  await page.goto('/sync');
  await page.getByTestId('sync-platform-ytmusic').click();
  await page.getByTestId('sync-url-input').fill('https://music.youtube.com/playlist?list=PLtest');
  await page.getByTestId('sync-preview-btn').click();
  await expect(page.getByTestId('sync-preview-row')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Synced Track')).toBeVisible();
  await page.getByTestId('sync-import-btn').click();
  await expect(page.locator('.sync-result p')).toContainText(/Done — 1 new in library/i, { timeout: 15_000 });
});
