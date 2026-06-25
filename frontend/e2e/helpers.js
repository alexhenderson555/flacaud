/** Mock /api/auth/me so validateSession() resolves truthy in vite preview (no backend). */
export async function routeAuthMe(page, { djEnabled = false, plan = 'pro' } = {}) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        username: 'e2e',
        effective_plan: plan,
        dj_enabled: djEnabled,
        daily_limit: 9999,
        downloads_today: 0,
        subscription_expires_at: null,
      }),
    }),
  );
}

export async function routeAuthRefresh(page, { token = 'e2e-refreshed' } = {}) {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token, token_type: 'bearer' }),
    }),
  );
}

export async function routeImageProxy(page) {
  await page.route('**/api/image-proxy**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(8) });
  });
}

/** Shared Playwright setup for authenticated app shell. */
export async function installE2EAuth(page, { token = 'e2e-token', library = null, lang = 'en', djEnabled = false } = {}) {
  await routeAuthMe(page, { djEnabled });
  await routeAuthRefresh(page, { token });
  await page.addInitScript(
    ({ token: t, library: lib, lang: lng }) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      sessionStorage.setItem('tidal-token', t);
      localStorage.setItem('tidal-token', t);
      localStorage.setItem('tidal-lang', lng);
      localStorage.removeItem('tidal-current-track');
      localStorage.removeItem('tidal-current-playlist');
      localStorage.removeItem('tidal-current-index');
      sessionStorage.removeItem('tidal_search_realResults');
      if (lib) localStorage.setItem('tidal-library', JSON.stringify(lib));
    },
    { token, library, lang },
  );
}

export async function installApiStubs(page, { djEnabled = false } = {}) {
  await routeAuthMe(page, { djEnabled });
  await routeAuthRefresh(page);
  await routeImageProxy(page);
  await page.route('**/api/library', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/library/**', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/playlists', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/playlists/**', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/downloads', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/tracks/meta**', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      const ids = body?.ids || [];
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tracks: ids.map((id) => ({
            provider_id: id,
            duration_s: 200,
            cover_url: 'https://via.placeholder.com/64',
            artists: ['Artist'],
          })),
        }),
      });
      return;
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/track/**', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

/** Register quality routes for probe + per-tier lookups. */
export async function routeQualityAvailable(page, payload) {
  await page.route('**/api/quality/**', async (r) => {
    const url = r.request().url();
    if (url.includes('/available')) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
      return;
    }
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quality: payload?.actual?.LOSSLESS || payload?.actual?.HI_RES || 'LOSSLESS' }),
    });
  });
}

export async function routeStream(page, size = 128) {
  await page.route('**/api/stream/**', async (r) => {
    await r.fulfill({
      status: 200,
      contentType: 'audio/mp4',
      body: Buffer.alloc(size, 1),
      headers: { 'Content-Length': String(size) },
    });
  });
}

export async function routeMediaToken(page) {
  await page.route('**/api/auth/media-token', async (r) => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'e2e', expires_in: 3600 }) });
  });
}

export async function routeSearchTracks(page, handler) {
  await page.route('**/api/search**', async (route) => {
    const req = route.request();
    let query;
    if (req.method() === 'POST') {
      try {
        query = req.postDataJSON()?.query || '';
      } catch {
        query = '';
      }
    } else {
      query = new URL(req.url()).searchParams.get('q') || '';
    }
    const tracks = typeof handler === 'function' ? handler(query) : handler;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: tracks || [], has_more: false }),
    });
  });
}

/** Default player API stubs for search → play flows. */
export async function installPlayerStubs(page, { qualityPayload, searchTracks } = {}) {
  await installApiStubs(page);
  await routeMediaToken(page);
  await routeQualityAvailable(page, qualityPayload ?? {
    available: ['LOW', 'HIGH', 'LOSSLESS'],
    max_quality: 'LOSSLESS',
    actual: { LOW: 'LOW', HIGH: 'HIGH', LOSSLESS: 'LOSSLESS' },
  });
  await routeStream(page);
  if (searchTracks) {
    await routeSearchTracks(page, searchTracks);
  }
}

/** Search, click play on a track, wait until the player bar shows the track. */
export async function startSearchPlayback(page, { providerId, query, title }) {
  await page.getByPlaceholder(SEARCH_INPUT).fill(query);
  await page.waitForTimeout(700);
  const playBtn = page.getByTestId(`search-play-${providerId}`);
  await playBtn.click();
  const trackTitle = title || query;
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-testid="player-track-title"]');
      return el?.textContent?.includes(expected);
    },
    trackTitle,
    { timeout: 12_000 },
  );
  const transport = page.getByTestId('player-transport-btn');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await playBtn.getAttribute('data-play-state');
    if (state === 'pause') return;
    await transport.click();
    await page.waitForTimeout(300);
  }
}

export async function getMainAudioSrc(page) {
  return page.evaluate(() => {
    const el = document.querySelector('audio[data-testid="player-audio-main"]')
      || [...document.querySelectorAll('audio')].find((a) => a.src?.includes('/api/stream/'));
    return el?.src || '';
  });
}

export function stripStreamCacheBuster(url) {
  if (!url) return url;
  try {
    const u = new URL(url, 'http://localhost');
    u.searchParams.delete('_rn');
    u.searchParams.delete('mt');
    return `${u.pathname}${u.search}`;
  } catch {
    return url
      .replace(/([?&])_rn=[^&]*/g, '$1')
      .replace(/([?&])mt=[^&]*/g, '$1')
      .replace(/[?&]$/, '');
  }
}

/** Seed BPM/Camelot cache used by Set DJ insights. */
export async function seedTrackFeatures(page, featuresByProviderId) {
  await page.addInitScript((store) => {
    const key = 'tidal-track-features';
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    Object.entries(store).forEach(([id, feat]) => {
      existing[id] = {
        bpm: feat.bpm,
        camelotKey: feat.camelotKey,
        musicalKey: feat.musicalKey || 'Cm',
        analyzed: true,
      };
    });
    localStorage.setItem(key, JSON.stringify(existing));
  }, featuresByProviderId);
}

export const SEARCH_INPUT = /search by title|поиск по названию/i;
