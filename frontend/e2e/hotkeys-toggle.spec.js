import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs, SEARCH_INPUT } from './helpers.js';

const TRACK = {
  provider: 'tidal',
  provider_id: '82001',
  title: 'Hotkey Track',
  artists: ['Tester'],
  cover_url: 'https://via.placeholder.com/64',
  quality: 'LOSSLESS',
  duration_s: 200,
};

async function mockPlayerRoutes(page) {
  await installPlayerStubs(page, { searchTracks: [TRACK] });
}

test.beforeEach(async ({ page }) => {
  await installE2EAuth(page);
  await mockPlayerRoutes(page);
});

test('Q toggles queue panel open and closed', async ({ page }) => {
  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('hotkey');
  await page.waitForTimeout(700);
  await page.getByTitle('Play Preview').first().click();

  await page.keyboard.press('q');
  await expect(page.getByTestId('playback-queue-panel')).toBeVisible({ timeout: 10000 });

  await page.keyboard.press('q');
  await expect(page.getByTestId('playback-queue-panel')).toHaveCount(0, { timeout: 5000 });
});

test('Escape closes queue panel', async ({ page }) => {
  await page.goto('/search');
  await page.getByPlaceholder(SEARCH_INPUT).fill('hotkey');
  await page.waitForTimeout(700);
  await page.getByTitle('Play Preview').first().click();

  await page.keyboard.press('q');
  await expect(page.getByTestId('playback-queue-panel')).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('playback-queue-panel')).toHaveCount(0);
});

test('slash opens command palette', async ({ page }) => {
  await page.goto('/account');
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-palette')).not.toBeVisible();
});

test('Ctrl+K toggles command palette', async ({ page }) => {
  await page.goto('/account');
  await page.locator('body').click();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).not.toBeVisible();
});
