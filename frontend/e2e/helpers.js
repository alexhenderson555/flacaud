/** Mock /api/auth/me so validateSession() resolves truthy in vite preview (no backend). */
export async function routeAuthMe(page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ username: 'e2e', effective_plan: 'pro', daily_limit: 9999, downloads_today: 0, subscription_expires_at: null }),
    }),
  );
}

/** Shared Playwright setup for authenticated app shell. */
export async function installE2EAuth(page, { token = 'e2e-token', library = null, lang = 'en' } = {}) {
  await routeAuthMe(page);
  await page.addInitScript(
    ({ token: t, library: lib, lang: lng }) => {
      window.__E2E_DISABLE_AUTOSAVE__ = true;
      localStorage.setItem('tidal-token', t);
      localStorage.setItem('tidal-lang', lng);
      if (lib) localStorage.setItem('tidal-library', JSON.stringify(lib));
    },
    { token, library, lang },
  );
}

export async function installApiStubs(page) {
  await routeAuthMe(page);
  await page.route('**/api/library', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/playlists', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/downloads', async (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

/** Register quality routes: catch-all first, /available last (Playwright LIFO). */
export async function routeQualityAvailable(page, payload) {
  await page.route('**/api/quality/**', async (r) => {
    if (r.request().url().includes('/available')) return;
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quality: 'LOSSLESS' }) });
  });
  await page.route('**/api/quality/**/available', async (r) => {
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
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
    await page.route('**/api/search', async (r) => {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tracks: searchTracks, has_more: false }),
      });
    });
  }
}

export const SEARCH_INPUT = /search by title|поиск по названию/i;
