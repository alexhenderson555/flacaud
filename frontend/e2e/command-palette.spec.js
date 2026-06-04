import { test, expect } from '@playwright/test';
import { installE2EAuth, installApiStubs } from './helpers.js';

const LIBRARY_TRACK = {
  provider: 'tidal',
  provider_id: '90001',
  title: 'Palette Gem',
  artists: ['Command Artist'],
  cover_url: 'https://via.placeholder.com/64',
  album: 'Test Album',
};

test.beforeEach(async ({ page }) => {
  await installE2EAuth(page, { library: [LIBRARY_TRACK] });
  await installApiStubs(page);
});

test('command palette lists navigation and panel toggles', async ({ page }) => {
  await page.goto('/account');
  await page.locator('body').click();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await expect(page.getByTestId('command-item-toggle-queue')).toBeVisible();
  await expect(page.getByTestId('command-item-nav-library')).toBeVisible();
  await expect(page.getByTestId('command-item-nav-analyzer')).toBeVisible();
});

test('command palette finds library track by search', async ({ page }) => {
  await page.goto('/account');
  await page.locator('body').click();
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette-input')).toBeVisible();
  await page.getByTestId('command-palette-input').fill('Palette Gem');
  await expect(page.getByTestId('command-item-lib-90001')).toBeVisible({ timeout: 10000 });
});

test('command palette navigates to library', async ({ page }) => {
  await page.goto('/account');
  await page.locator('body').click();
  await page.keyboard.press('Control+k');
  await page.getByTestId('command-palette-input').fill('my library');
  await page.getByTestId('command-item-nav-library').click();
  await expect(page).toHaveURL(/\/library/, { timeout: 10000 });
});
