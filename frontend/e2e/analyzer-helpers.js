/** Shared Playwright mocks for Set Analyzer job API. */

export function sampleSetTracks() {
  return [
    {
      artist: 'Artist A',
      title: 'First Track',
      timestamp: '0:00',
      matched_track: {
        provider: 'tidal',
        provider_id: '1001',
        title: 'First Track',
        artist: 'Artist A',
        duration_s: 245,
      },
    },
    {
      artist: 'Artist B',
      title: 'Second Track',
      timestamp: '4:05',
      matched_track: null,
    },
    {
      artist: 'Artist C',
      title: 'Third Track',
      timestamp: '8:00',
      matched_track: null,
    },
  ];
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ jobId: string, doneAfterPolls?: number, setTracks?: unknown[] }} opts
 */
export async function routeAnalyzerJob(page, { jobId, doneAfterPolls = 2, setTracks = sampleSetTracks() }) {
  let polls = 0;
  let cancelled = false;

  await page.route('**/api/jobs', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: jobId,
          status: 'running',
          job_type: 'analyze_set',
          analysis: {
            phase: 'scan',
            percent: 20,
            segments_done: 2,
            segments_total: 10,
            tracks_found: 1,
            label: 'Analyzing… 20%',
          },
          set_tracks: setTracks,
          tracks: [{ title: 'Analyzing… 20%', status: 'queued' }],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/jobs/*/cancel', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    cancelled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: 'cancelled',
        job_type: 'analyze_set',
        analysis: { phase: 'failed', percent: 40, label: 'Cancelled by user', tracks_found: 1 },
        set_tracks: setTracks.slice(0, 1),
        tracks: [{ title: 'Cancelled by user', status: 'failed', error: 'Cancelled by user' }],
      }),
    });
  });

  await page.route(`**/api/jobs/${jobId}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    polls += 1;
    if (cancelled) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: jobId,
          status: 'cancelled',
          job_type: 'analyze_set',
          tracks: [{ title: 'Cancelled by user', status: 'failed', error: 'Cancelled by user' }],
          analysis: { phase: 'failed', percent: 40, label: 'Cancelled by user', tracks_found: setTracks.length },
          set_tracks: setTracks.slice(0, 1),
        }),
      });
      return;
    }
    const running = polls < doneAfterPolls;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: jobId,
        status: running ? 'running' : 'done',
        job_type: 'analyze_set',
        tracks: running
          ? [{ title: 'Analyzing… 20%', status: 'queued' }]
          : [{ title: 'Analysis complete', status: 'done' }],
        analysis: running
          ? {
              phase: 'scan',
              percent: 20,
              segments_done: 2,
              segments_total: 10,
              tracks_found: 1,
              label: 'Analyzing… 20%',
            }
          : {
              phase: 'done',
              percent: 100,
              segments_done: 10,
              segments_total: 10,
              tracks_found: setTracks.length,
              label: 'Analysis complete',
            },
        set_tracks: running ? setTracks.slice(0, 1) : setTracks,
      }),
    });
  });
}

export async function installAnalyzerAuth(page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: 'e2e',
        effective_plan: 'pro',
        dj_enabled: true,
        daily_limit: 9999,
        downloads_today: 0,
      }),
    }),
  );
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'e2e-analyzer', token_type: 'bearer' }),
    }),
  );
  await page.addInitScript(() => {
    sessionStorage.setItem('tidal-token', 'e2e-analyzer');
    localStorage.setItem('tidal-token', 'e2e-analyzer');
    sessionStorage.removeItem('tidal-analyzer-active-job');
    window.__E2E_DISABLE_AUTOSAVE__ = true;
  });
}
