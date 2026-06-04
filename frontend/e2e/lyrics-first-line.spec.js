import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs, routeMediaToken, routeQualityAvailable, routeStream, SEARCH_INPUT } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '92001',
  title: 'Lyric Line Test',
  artists: ['Singer'],
  cover_url: 'https://via.placeholder.com/64',
  duration_s: 120,
};

const LYRICS = {
  lyrics: [
    { time: 8, text: 'Opening line before sync' },
    { time: 15, text: 'Second synced line' },
  ],
};

async function mockRoutes(page) {
  await installApiStubs(page);
  await routeMediaToken(page);
  await routeQualityAvailable(page, { available: ['LOW'], max_quality: 'LOW', actual: { LOW: 'LOW' } });
  await routeStream(page);
  await page.route('**/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tracks: [TRACK], has_more: false }),
    });
  });
  await page.route(/\/api\/lyrics/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LYRICS) });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        username: 'e2e',
        plan: 'free',
        effective_plan: 'free',
        daily_limit: 3,
        downloads_today: 0,
      }),
    });
  });
}

test('first lyric line is highlighted during intro', async ({ page }) => {
  await installE2EAuth(page);
  await mockRoutes(page);

  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('lyric');
  await page.waitForTimeout(700);
  await page.getByTitle('Play Preview').first().click();
  await expect(page.getByTestId('player-transport-btn')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('l');

  await expect(page.getByText('Opening line before sync')).toBeVisible({ timeout: 15000 });
  const active = page.getByTestId('lyric-line-active');
  await expect(active).toBeVisible({ timeout: 5000 });
  await expect(active).toContainText('Opening line before sync');
});
