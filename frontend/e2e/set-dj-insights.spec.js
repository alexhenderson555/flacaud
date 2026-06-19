import { test, expect } from '@playwright/test';
import { installApiStubs, seedTrackFeatures } from './helpers.js';
import { installAnalyzerAuth, routeAnalyzerJob } from './analyzer-helpers.js';

function djSetTracks() {
  return [
    {
      artist: 'DJ A',
      title: 'Track One',
      timestamp: '0:00',
      matched_track: {
        provider: 'tidal',
        provider_id: 'dj1001',
        title: 'Track One',
        artist: 'DJ A',
        duration_s: 240,
      },
    },
    {
      artist: 'DJ B',
      title: 'Track Two',
      timestamp: '4:00',
      matched_track: {
        provider: 'tidal',
        provider_id: 'dj1002',
        title: 'Track Two',
        artist: 'DJ B',
        duration_s: 220,
      },
    },
  ];
}

test('set DJ insights show transitions when BPM/key cached', async ({ page }) => {
  const jobId = `e2e-dj-insights-${Date.now()}`;
  await installApiStubs(page, { djEnabled: true });
  await installAnalyzerAuth(page);
  await seedTrackFeatures(page, {
    dj1001: { bpm: 120, camelotKey: '8B' },
    dj1002: { bpm: 122, camelotKey: '9B' },
  });
  await routeAnalyzerJob(page, { jobId, doneAfterPolls: 1, setTracks: djSetTracks() });

  await page.goto('/analyzer?url=https%3A%2F%2Fsoundcloud.com%2Ftest%2Fset&analyze=1');
  await expect(page.getByText('Track One')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Track Two')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('set-dj-insights')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('set-dj-transitions')).toBeVisible();
  await expect(page.getByTestId('set-dj-transitions').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('set-dj-transitions').getByText('8B → 9B')).toBeVisible();
});

test('analyze batch button is visible when meta missing', async ({ page }) => {
  const jobId = `e2e-dj-analyze-${Date.now()}`;
  await installApiStubs(page, { djEnabled: true });
  await installAnalyzerAuth(page);
  await routeAnalyzerJob(page, { jobId, doneAfterPolls: 1, setTracks: djSetTracks() });

  await page.goto('/analyzer?url=https%3A%2F%2Fsoundcloud.com%2Ftest%2Fset&analyze=1');
  await expect(page.getByText('Track One')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Track Two')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('set-dj-insights')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('set-dj-analyze-batch')).toBeVisible();
});
