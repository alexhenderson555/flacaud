import { test, expect } from '@playwright/test';

test('download toast shows progress bar while job runs', async ({ page }) => {
  const jobId = `e2e-toast-${Date.now()}`;
  let pollCount = 0;

  await page.addInitScript(
    ({ id }) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      localStorage.setItem('tidal-token', 'e2e-ui-token');
      localStorage.setItem('tidal-queue-jobs', JSON.stringify([id]));
    },
    { id: jobId },
  );

  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: jobId,
          status: 'queued',
          tracks: [{ title: 'E2E Toast Track', status: 'queued', provider_id: '1', provider: 'tidal' }],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    pollCount += 1;
    const progress =
      pollCount === 1
        ? { bytes_written: 200_000, bytes_total: 1_000_000, status: 'downloading' }
        : pollCount === 2
          ? { bytes_written: 700_000, bytes_total: 1_000_000, status: 'downloading' }
          : { bytes_written: 1_000_000, bytes_total: 1_000_000, status: 'done', file_token: 'fake-token' };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: pollCount >= 3 ? 'done' : 'running',
        tracks: [
          {
            title: 'E2E Toast Track',
            provider: 'tidal',
            provider_id: '1',
            ...progress,
          },
        ],
      }),
    });
  });

  await page.goto('/search');

  const toast = page.getByTestId('download-toast');
  await expect(toast).toBeVisible({ timeout: 15_000 });

  const status = page.getByTestId('download-toast-status');
  await expect(status).toContainText(/Downloading/i);

  const bar = page.getByTestId('download-toast-progress-bar');
  await expect(bar).toBeVisible();

  await expect
    .poll(async () => {
      const width = await bar.evaluate((el) => el.style.width);
      return parseInt(width, 10) || 0;
    })
    .toBeGreaterThan(50);
});

test('clicking download on search starts toast with progress', async ({ page }) => {
  const jobId = `e2e-click-${Date.now()}`;
  let pollCount = 0;

  await page.addInitScript(() => {
    window.__E2E_DISABLE_AUTOSAVE__ = true;
    localStorage.setItem('tidal-token', 'e2e-ui-token');
    localStorage.removeItem('tidal-queue-jobs');
  });

  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracks: [
          {
            provider: 'tidal',
            provider_id: '999001',
            title: 'E2E Click Track',
            artists: ['E2E'],
            source_url: 'https://tidal.com/track/999001',
            quality: 'LOSSLESS',
            cover_url: 'https://via.placeholder.com/64',
          },
        ],
      }),
    });
  });

  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job_id: jobId, status: 'queued', tracks: [] }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    pollCount += 1;
    const pct = pollCount === 1 ? 25 : pollCount === 2 ? 60 : 100;
    const done = pct === 100;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: done ? 'done' : 'running',
        tracks: [
          {
            title: 'E2E Click Track',
            provider: 'tidal',
            provider_id: '999001',
            status: done ? 'done' : 'downloading',
            bytes_written: pct * 10_000,
            bytes_total: 1_000_000,
            file_token: done ? 'tok' : null,
          },
        ],
      }),
    });
  });

  await page.route('**/api/downloads', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/search');
  await page.getByPlaceholder(/search|поиск/i).fill('e2e');
  await page.waitForTimeout(800);

  await page.getByTitle('Download').first().click();

  const toast = page.getByTestId('download-toast');
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('download-toast-status')).toContainText(/Downloading/i);
  await expect(page.getByTestId('download-toast-progress-bar')).toBeVisible();
});
