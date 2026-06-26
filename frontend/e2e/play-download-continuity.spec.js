import { test, expect } from '@playwright/test';
import {
  getMainAudioSrc,
  installE2EAuth,
  installPlayerStubs,
  startSearchPlayback,
  stripStreamCacheBuster,
} from './helpers.js';

const TRACK_ID = '888002';

test('stream URL is not swapped mid-playback when download completes', async ({ page }) => {
  const jobId = `e2e-play-dl-${Date.now()}`;
  let pollCount = 0;
  let registryPublished = false;

  await installE2EAuth(page);
  await installPlayerStubs(page, {
    searchTracks: [
      {
        provider: 'tidal',
        provider_id: TRACK_ID,
        title: 'Continuity Test',
        artists: ['E2E'],
        source_url: `https://tidal.com/track/${TRACK_ID}`,
        quality: 'LOSSLESS',
        cover_url: 'https://via.placeholder.com/64',
        duration_s: 240,
      },
    ],
  });

  await page.addInitScript(() => {
    window.__E2E_DISABLE_AUTOSAVE__ = true;
    localStorage.removeItem('tidal-queue-jobs');
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
    const done = pollCount >= 2;
    if (done) registryPublished = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: done ? 'done' : 'running',
        quality: 'LOSSLESS',
        tracks: [
          {
            title: 'Continuity Test',
            provider: 'tidal',
            provider_id: TRACK_ID,
            status: done ? 'done' : 'downloading',
            bytes_written: done ? 1_000_000 : 400_000,
            bytes_total: 1_000_000,
            file_token: done ? 'tok' : null,
          },
        ],
      }),
    });
  });

  await page.route('**/api/downloads', async (route) => {
    const body = registryPublished
      ? JSON.stringify({
        [TRACK_ID]: { quality: 'LOSSLESS', path: `jobs/${TRACK_ID}.flac` },
      })
      : '{}';
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.goto('/search');
  await startSearchPlayback(page, { providerId: TRACK_ID, query: 'continuity', title: 'Continuity Test' });

  await expect(page.getByTestId('player-track-title')).toContainText('Continuity Test', { timeout: 15_000 });

  await expect
    .poll(async () => getMainAudioSrc(page), { timeout: 20_000 })
    .toContain(`/api/stream/tidal/${TRACK_ID}`);

  await page.evaluate(() => {
    const el = document.querySelector('audio[data-testid="player-audio-main"]')
      || [...document.querySelectorAll('audio')].find((a) => a.src?.includes('/api/stream/'));
    if (!el) return;
    el._e2eTime = 6;
    Object.defineProperty(el, 'currentTime', {
      get() { return this._e2eTime ?? 0; },
      set(v) { this._e2eTime = v; },
      configurable: true,
    });
    Object.defineProperty(el, 'paused', {
      get() { return false; },
      configurable: true,
    });
  });

  const srcBefore = await getMainAudioSrc(page);
  expect(srcBefore).toContain('bypass_registry=true');

  await page.getByTestId(`search-download-${TRACK_ID}`).click();
  await expect(page.getByTestId('download-toast')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(async () => registryPublished, { timeout: 12_000 })
    .toBe(true);

  await page.waitForTimeout(2000);

  const srcAfter = await getMainAudioSrc(page);
  const timeAfter = await page.evaluate(() => {
    const el = document.querySelector('audio[data-testid="player-audio-main"]')
      || [...document.querySelectorAll('audio')].find((a) => a.src?.includes('/api/stream/'));
    return el?._e2eTime ?? el?.currentTime ?? 0;
  });

  expect(stripStreamCacheBuster(srcAfter)).toBe(stripStreamCacheBuster(srcBefore));
  expect(srcAfter).toContain('bypass_registry=true');
  expect(timeAfter).toBeGreaterThanOrEqual(5.5);
});
