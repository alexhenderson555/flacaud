import { test, expect } from '@playwright/test';
import { routeAuthMe } from './helpers.js';

test('stem splitter starts job and shows stems when done', async ({ page }) => {
  const jobId = `e2e-stem-${Date.now()}`;

  await routeAuthMe(page);

  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-stem');
    window.__E2E_DISABLE_AUTOSAVE__ = true;
  });

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
        tracks: [
          { title: 'Vocals', stem: 'vocals', file_token: 'v1' },
          { title: 'Instrumental', stem: 'instrumental', file_token: 'i1' },
        ],
      }),
    });
  });

  await page.goto('/splitter');
  await page.getByPlaceholder(/paste tidal|url/i).fill('https://tidal.com/track/123');
  await page.getByRole('button', { name: /Split Track/i }).click();

  await expect(page.getByText(/Vocals|Instrumental/i).first()).toBeVisible({ timeout: 15000 });
});
