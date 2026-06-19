import { defineConfig } from '@playwright/test';

/** Local preview of `dist/` (includes data-testid hooks); job API is mocked in tests. */
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL,
    hasTouch: false,
    trace: 'on-first-retry',
    // The PWA service worker uses a NetworkOnly handler for /api/*, and
    // service-worker-initiated requests bypass page.route() mocks (Playwright
    // limitation) — they leak to the real backend and 502. Block SW so every
    // /api request is interceptable by the specs' route mocks.
    serviceWorkers: 'block',
  },
});
