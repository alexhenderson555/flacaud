import { test, expect } from '@playwright/test';
import { routeAuthMe } from './helpers.js';

test('set analyzer shows progress while job runs', async ({ page }) => {
  const jobId = `e2e-analyzer-${Date.now()}`;
  let polls = 0;

  await routeAuthMe(page);

  await page.addInitScript(() => {
    localStorage.setItem('tidal-token', 'e2e-analyzer');
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
    polls += 1;
    const running = polls < 3;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: running ? 'running' : 'done',
        tracks: running
          ? [{ title: 'Set Track', status: 'analyzing', progress: 42 }]
          : [{ title: 'Set Track', status: 'done', bpm: 128, key: '8A' }],
      }),
    });
  });

  await page.goto('/analyzer');
  await page.getByPlaceholder(/youtube|soundcloud|set url|ссылка/i).fill('https://soundcloud.com/test/set');
  await page.getByRole('button', { name: /analyze|анализ/i }).click();

  await expect(page.getByTestId('analyzer-progress')).toBeVisible({ timeout: 15000 });
});
