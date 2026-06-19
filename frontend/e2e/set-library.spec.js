import { test, expect } from '@playwright/test';
import { installApiStubs, installE2EAuth } from './helpers.js';

const SET_URL = 'https://soundcloud.com/e2e/demo-set';

const DEMO_SET_API_ROW = {
  id: 1,
  url: SET_URL,
  title: 'E2E Demo Set',
  track_count: 2,
  tracks_json: JSON.stringify([
    { artist: 'A', title: 'One', timestamp: '0:00' },
    { artist: 'B', title: 'Two', timestamp: '3:00' },
  ]),
};

test.describe('Set Library', () => {
  test.beforeEach(async ({ page }) => {
    await installE2EAuth(page, { token: 'e2e-sets' });
    await page.route('**/api/sets**', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([DEMO_SET_API_ROW]),
        });
        return;
      }
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(DEMO_SET_API_ROW),
        });
        return;
      }
      await route.continue();
    });
    await page.addInitScript((row) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      const setTracks = JSON.parse(row.tracks_json || '[]');
      localStorage.setItem('tidal-set-library', JSON.stringify([{
        id: `srv_${row.id}`,
        serverId: row.id,
        url: row.url,
        title: row.title,
        trackCount: row.track_count ?? setTracks.length,
        setTracks,
        savedAt: Date.now(),
      }]));
    }, DEMO_SET_API_ROW);
  });

  test('title opens analyzer view without auto-analyze', async ({ page }) => {
    await page.goto('/sets');
    await expect(page.getByTestId('set-library-row')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('set-library-title').click();
    await expect(page).toHaveURL(/\/analyzer\?url=/);
    await expect(page.getByText('One')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('analyzer-progress')).toBeHidden();
  });

  test('analyze button starts analysis', async ({ page }) => {
    const jobId = `e2e-setlib-${Date.now()}`;
    await page.route('**/api/jobs', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job_id: jobId, status: 'queued' }),
        });
        return;
      }
      await route.continue();
    });
    await page.route(`**/api/jobs/${jobId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: jobId, status: 'running', analysis: { phase: 'download', percent: 5, label: 'Downloading…' } }),
      });
    });

    await page.goto('/sets');
    await page.getByTestId('set-library-analyze').click();
    await expect(page).toHaveURL(/analyze=1/);
    await expect(page.getByTestId('analyzer-progress')).toBeVisible({ timeout: 15000 });
  });

  test('listen starts playback on library page', async ({ page }) => {
    await page.goto('/sets');
    await page.getByTestId('set-library-listen').click();
    await expect(page).toHaveURL(/\/sets$/);
    await expect(page.getByTestId('set-library-embed-anchor')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('set-embed-player')).toBeAttached({ timeout: 15000 });
    await expect(page.getByTestId('player-bar')).toHaveAttribute('data-set-mode', 'true');
  });
});
