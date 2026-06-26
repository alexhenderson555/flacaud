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

const DEFAULT_QUALITY_PAYLOAD = {
  available: ['LOW', 'HIGH', 'LOSSLESS'],
  max_quality: 'LOSSLESS',
  probe_complete: true,
  actual: { LOW: 'LOW', HIGH: 'HIGH', LOSSLESS: 'LOSSLESS' },
};

/** Wait until auth boot finishes and the app shell is interactive. */
export async function waitForAppReady(page) {
  await page.waitForFunction(
    () => !document.querySelector('.app-container--loading'),
    { timeout: 30_000 },
  );
}

/** Shared Playwright setup for authenticated app shell. */
export async function installE2EAuth(page, { token = 'e2e-token', library = null, lang = 'en', djEnabled = false, plan = 'pro' } = {}) {
  await routeAuthMe(page, { djEnabled, plan });
  await routeAuthRefresh(page, { token });
  await page.addInitScript(
    ({ token: t, library: lib, lang: lng, plan: effectivePlan }) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      sessionStorage.setItem('tidal-token', t);
      localStorage.setItem('tidal-token', t);
      localStorage.setItem('tidal-lang', lng);
      localStorage.setItem('tidal-effective-plan', effectivePlan);
      if (!sessionStorage.getItem('e2e-player-storage-init')) {
        sessionStorage.setItem('e2e-player-storage-init', '1');
        localStorage.removeItem('tidal-current-track');
        localStorage.removeItem('tidal-current-playlist');
        localStorage.removeItem('tidal-current-index');
      }
      sessionStorage.removeItem('tidal_search_realResults');
      sessionStorage.removeItem('tidal_search_query');
      try {
        Object.keys(sessionStorage).forEach((key) => {
          if (key.startsWith('tidal-quality-probe-')) sessionStorage.removeItem(key);
        });
      } catch { /* ignore */ }
      if (lib) localStorage.setItem('tidal-library', JSON.stringify(lib));
      // Headless CI blocks real media decode; stub play() so player state advances.
      const proto = HTMLMediaElement.prototype;
      proto.play = function stubPlay() {
        try {
          this.dispatchEvent(new Event('loadedmetadata'));
          this.dispatchEvent(new Event('canplay'));
          this.dispatchEvent(new Event('playing'));
        } catch { /* ignore */ }
        return Promise.resolve();
      };
    },
    { token, library, lang, plan },
  );
}

export async function installApiStubs(page, { djEnabled = false, plan = 'pro' } = {}) {
  await routeAuthMe(page, { djEnabled, plan });
  await routeAuthRefresh(page);
  await routeImageProxy(page);
  await routeMediaToken(page);
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
            provider: 'tidal',
            provider_id: id,
            title: `Meta ${id}`,
            duration_s: 200,
            cover_url: 'https://via.placeholder.com/64',
            artists: ['Artist'],
            release_date: '2020-01-01',
            year: 2020,
          })),
        }),
      });
      return;
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/track/**', async (r) => {
    const parts = r.request().url().split('/');
    const trackId = parts[parts.length - 1]?.split('?')[0] || '0';
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'tidal',
        provider_id: trackId,
        title: `Track ${trackId}`,
        artists: ['Artist'],
        cover_url: 'https://via.placeholder.com/64',
        duration_s: 200,
        release_date: '2020-01-01',
        year: 2020,
      }),
    });
  });
}

/** Register quality routes for probe + per-tier lookups. */
export async function routeQualityAvailable(page, payload) {
  const body = { ...DEFAULT_QUALITY_PAYLOAD, ...payload };
  await page.route('**/api/quality/**', async (r) => {
    const url = r.request().url();
    if (url.includes('/available')) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }
    const tier = decodeURIComponent(r.request().url().split('/').pop()?.split('?')[0] || '');
    const actualTier = body?.actual?.[tier] || body?.actual?.LOSSLESS || body?.actual?.HI_RES || tier || 'LOSSLESS';
    const hiRes = String(actualTier).toUpperCase().includes('HI_RES')
      || (tier === 'LOSSLESS' && body?.max_quality === 'HI_RES');
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quality: actualTier,
        sample_rate: hiRes ? 96000 : 44100,
        bit_depth: hiRes ? 24 : 16,
      }),
    });
  });
}

export async function routeStream(page, size = 4096) {
  await page.route('**/api/stream/**', async (r) => {
    await r.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
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
  await routeQualityAvailable(page, qualityPayload);
  await routeStream(page);
  if (searchTracks) {
    await routeSearchTracks(page, searchTracks);
  }
}

/** Search, click play on a track, wait until playback is active. */
export async function startSearchPlayback(page, { providerId, query, title }) {
  await waitForAppReady(page);
  const playTestId = `search-play-${providerId}`;
  const trackTitle = title || query;

  const searchResponse = page.waitForResponse(
    (r) => r.url().includes('/api/search') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByPlaceholder(SEARCH_INPUT).fill(query);
  await searchResponse;
  await page.waitForTimeout(600);

  const playBtn = page.getByTestId(playTestId);
  await playBtn.waitFor({ state: 'visible', timeout: 15_000 });

  const qualityProbe = page.waitForResponse(
    (r) => r.url().includes('/api/quality/') && r.url().includes('/available') && r.ok(),
    { timeout: 25_000 },
  ).catch(() => null);

  await playBtn.click();

  await page.waitForFunction(
    ({ testId, expected }) => {
      const btn = document.querySelector(`[data-testid="${testId}"]`);
      if (btn?.getAttribute('data-play-state') === 'pause') return true;
      const titleEl = document.querySelector('[data-testid="player-track-title"]');
      if (titleEl?.textContent?.includes(expected)) return true;
      try {
        const raw = localStorage.getItem('tidal-current-track');
        if (raw && raw.includes(expected)) return true;
      } catch { /* ignore */ }
      const transport = document.querySelector('[data-testid="player-transport-btn"]');
      return transport?.getAttribute('aria-label')?.toLowerCase().includes('pause')
        || transport?.getAttribute('aria-label')?.toLowerCase().includes('пауз');
    },
    { testId: playTestId, expected: trackTitle },
    { timeout: 25_000 },
  );

  await qualityProbe;

  const transport = page.getByTestId('player-transport-btn');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await playBtn.getAttribute('data-play-state');
    if (state === 'pause') return;
    await transport.click();
    await page.waitForTimeout(300);
  }
}

export const PLAY_BTN_TITLE = /^(Play|Слушать)$/i;

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

/** Stub YouTube / SoundCloud embed APIs (no external scripts in CI). */
export async function stubSetEmbedApis(page) {
  await page.addInitScript(() => {
    window.SC = {
      Widget: () => ({
        bind(ev, cb) {
          const ready = window.SC?.Widget?.Events?.READY;
          if (ev === ready) queueMicrotask(cb);
        },
        play() {},
        pause() {},
        seekTo() {},
      }),
    };
    window.SC.Widget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause' };
    window.YT = {
      Player(_id, opts) {
        queueMicrotask(() => opts?.events?.onReady?.());
      },
      PlayerState: { PLAYING: 1, PAUSED: 2 },
    };
  });
}

export const SEARCH_INPUT = /search by title|поиск по названию/i;
