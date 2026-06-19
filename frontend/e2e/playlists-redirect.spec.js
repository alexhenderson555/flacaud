import { test, expect } from '@playwright/test';
import { installE2EAuth, installPlayerStubs } from './helpers.js';

test('/playlists page loads for authenticated users', async ({ page }) => {
  await installE2EAuth(page, { token: 'e2e-pl-token' });
  await installPlayerStubs(page);

  await page.goto('/playlists');
  await expect(page).toHaveURL(/\/playlists/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: /My Playlists|Мои Плейлисты/i })).toBeVisible();
});
