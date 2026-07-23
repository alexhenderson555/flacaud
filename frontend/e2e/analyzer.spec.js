import { test, expect } from '@playwright/test';
import { installE2EAuth } from './helpers.js';

test('set analyzer shows progress while job runs', async ({ page }) => {
  const jobId = `e2e-analyzer-${Date.now()}`;
  let polls = 0;

  await installE2EAuth(page, { token: 'e2e-analyzer' });

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

  await expect(page.getByTestId('analyzer-progress')).toBeVisible({ timeout: 15_000 });
});

test('job-status polling respects the interval instead of running away', async ({ page }) => {
  // Regression test: `t` (translate fn) was a fresh reference every render and
  // a dependency of the polling effect, so each poll's own setState calls
  // re-ran the effect and fired an immediate poll() on top of the interval --
  // a feedback loop bounded only by network speed, not ANALYZER_POLL_MS
  // (observed live as hundreds of requests/sec). Keep the job "running"
  // forever and assert polls stay roughly interval-bounded over a fixed window.
  const jobId = `e2e-analyzer-poll-rate-${Date.now()}`;
  let polls = 0;

  await installE2EAuth(page, { token: 'e2e-analyzer-poll-rate' });

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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: 'running',
        tracks: [{ title: 'Set Track', status: 'analyzing', progress: 42 }],
      }),
    });
  });

  await page.goto('/analyzer');
  await page.getByPlaceholder(/youtube|soundcloud|set url|ссылка/i).fill('https://soundcloud.com/test/poll-rate');
  await page.getByRole('button', { name: /analyze|анализ/i }).click();
  await expect(page.getByTestId('analyzer-progress')).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(3500);
  // ANALYZER_POLL_MS is 1000ms: the immediate poll + ~3 interval ticks in
  // 3.5s is at most ~5 polls under correct behavior. A runaway loop produces
  // dozens within the same window.
  expect(polls).toBeLessThanOrEqual(8);
});
