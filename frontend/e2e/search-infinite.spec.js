import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, SEARCH_INPUT } from './helpers.js';

const page1 = Array.from({ length: 50 }, (_, i) => ({
  provider: 'tidal',
  provider_id: String(700000 + i),
  title: `Track ${i + 1}`,
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
}));

const page2 = Array.from({ length: 10 }, (_, i) => ({
  provider: 'tidal',
  provider_id: String(800000 + i),
  title: `More Track ${i + 1}`,
  artists: ['Artist'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
}));

test('search loads more results on scroll', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-scroll' });
  await installApiStubs(page);

  await page.route('**/api/search', async (route) => {
    const body = route.request().postDataJSON();
    const offset = body?.offset || 0;
    if (offset === 0) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tracks: page1, has_more: true }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: page2, has_more: false }),
    });
  });

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('scroll test');
  await page.waitForTimeout(800);

  await expect(page.getByText('Track 1', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Track 50', { exact: true })).toBeVisible();

  const page2Response = page.waitForResponse(async (r) => {
    if (!r.url().includes('/api/search') || r.request().method() !== 'POST') return false;
    const body = r.request().postDataJSON();
    return body?.offset === 50;
  });
  await page.getByText(/Load more|Загрузить/i).scrollIntoViewIfNeeded();
  await page2Response;
  await expect(page.getByText('More Track 1', { exact: true })).toBeVisible({ timeout: 15000 });
});
