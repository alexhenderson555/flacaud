import { test, expect } from '@playwright/test';

test('share import page shows playlist preview', async ({ page }) => {
  await page.route('**/api/share/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'playlist',
        title: 'E2E Share',
        track_count: 1,
        duration_seconds: 240,
        tracks: [
          {
            provider: 'tidal',
            provider_id: '1',
            title: 'Shared Track',
            artists: ['Artist'],
            duration: 240,
          },
        ],
      }),
    });
  });

  await page.goto('/s/token-abc');
  await expect(page.getByRole('heading', { name: 'E2E Share' })).toBeVisible({ timeout: 15_000 });
});
