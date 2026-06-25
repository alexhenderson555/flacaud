import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installE2EAuth } from './helpers.js';

/** Rules that often false-positive on dark glass UIs; still catch structure/labels. */
const AXE_DISABLED = ['color-contrast', 'landmark-one-main', 'region'];

async function expectNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page })
    .disableRules(AXE_DISABLED)
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test('landing — no serious a11y violations', async ({ page }) => {
  await page.goto('/');
  await expectNoSeriousViolations(page);
});

test('terms — no serious a11y violations', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /Terms of Use|Условия/i })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('library shell — no serious a11y violations', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-a11y' });
  await page.route('**/api/playlists', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/downloads', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/library**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: /Your Library|Ваша медиатека/i })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoSeriousViolations(page);
});
