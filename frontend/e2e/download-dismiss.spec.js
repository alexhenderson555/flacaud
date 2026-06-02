import { test, expect } from '@playwright/test';

test('download toast can be dismissed', async ({ page }) => {
  const jobId = `e2e-dismiss-${Date.now()}`;

  await page.addInitScript(
    ({ id }) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      localStorage.setItem('tidal-token', 'e2e-dismiss');
      localStorage.setItem('tidal-queue-jobs', JSON.stringify([id]));
    },
    { id: jobId },
  );

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: 'running',
        tracks: [{
          title: 'Stuck Track',
          provider: 'tidal',
          provider_id: '1',
          status: 'downloading',
          bytes_written: 200_000,
          bytes_total: 1_000_000,
        }],
      }),
    });
  });

  await page.goto('/search');
  const toast = page.getByTestId('download-toast');
  await expect(toast).toBeVisible({ timeout: 15000 });

  await page.getByTestId('download-dismiss-btn').click();
  await expect(toast).not.toBeVisible({ timeout: 5000 });
});
