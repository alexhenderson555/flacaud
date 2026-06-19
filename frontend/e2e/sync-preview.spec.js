import { test, expect } from '@playwright/test';
import { installApiStubs, installE2EAuth } from './helpers.js';

test('sync page accepts playlist link and starts job', async ({ page }) => {
  const jobId = 'e2e-sync-job';

  await installE2EAuth(page);
  await installApiStubs(page);

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
      body: JSON.stringify({
        job_id: jobId,
        status: 'done',
        tracks: [{ title: 'Synced Track', status: 'done' }],
      }),
    });
  });

  await page.goto('/sync');
  await page.getByText('YT Music').click();
  await page.getByPlaceholder('https://...').fill('https://music.youtube.com/playlist?list=PLtest');
  await page.getByRole('button', { name: /Start Synchronization/i }).click();
  await expect(page.getByText(/Done! Successfully synced/i)).toBeVisible({ timeout: 15000 });
});
