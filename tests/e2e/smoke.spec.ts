import { test, expect } from '@playwright/test';

test('página raiz responde', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(500);
});
