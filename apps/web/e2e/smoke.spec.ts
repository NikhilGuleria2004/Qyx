import { test, expect } from '@playwright/test';

test.describe('Smoke suite', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('app shell renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=#engineering')).toBeVisible();
  });

  test('command palette opens', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('text=Type a command or search...')).toBeVisible();
  });
});
