import { test, expect } from '@playwright/test';

/**
 * Smoke test — verifies the dev server boots and the root route renders.
 *
 * Intentionally minimal: this exists to prove the Playwright setup is wired
 * correctly end-to-end. Expand with real flows (auth, dashboard, kanban) in
 * dedicated specs as the suite grows.
 */
test.describe('smoke', () => {
  test('root page loads without server error and renders content', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto('/');

    // Did not 5xx (a 200 OK, 3xx redirect to /login, or other non-server-error is fine).
    expect(response, 'navigation response should exist').not.toBeNull();
    const status = response!.status();
    expect(status, `unexpected server error status ${status}`).toBeLessThan(500);

    // Page rendered *something* — body has non-empty content.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length, 'page body should not be empty').toBeGreaterThan(0);

    // No critical console errors. We filter benign noise (favicon, hydration warnings
    // from extensions) to keep this test signal-only — tighten over time as needed.
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !/favicon/i.test(err) &&
        !/Failed to load resource.*404/i.test(err),
    );
    expect(criticalErrors, `console errors: ${criticalErrors.join(' | ')}`).toHaveLength(0);
  });
});
