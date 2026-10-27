// @ts-check
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures.js';

test.describe('Visual regression @visual', () => {
  // Baselines are Linux/Chromium (same as CI). Update with: npm run test:e2e -- --update-snapshots
  test('default flow renders as expected @visual', async ({ builder, page }) => {
    await expect(page.getByLabel('Flow canvas')).toHaveScreenshot('default-flow.png');
  });

  test('failed run state renders as expected @visual', async ({ builder, executor, page }) => {
    executor.use((req) => (req.kind === 'generateText'
      ? { body: { status: 'failed', error: 'LLM node failed: Missing credentials key.' } }
      : { body: { status: 'success', output: req.input } }));
    await builder.run();
    await builder.expectRunFinished('failed');
    await expect(page.getByLabel('Flow canvas')).toHaveScreenshot('failed-run.png');
  });

  test('insert-step picker renders as expected @visual', async ({ builder }) => {
    await builder.openInsertPicker('trigger', 'generateText_1');
    await expect(builder.picker).toHaveScreenshot('insert-picker.png');
  });
});

test.describe('Accessibility', () => {
  const scan = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);

  test('builder has no WCAG A/AA violations', async ({ builder, page }) => {
    const { violations } = await scan(page).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });

  test('picker and config panel have no WCAG A/AA violations', async ({ builder, page }) => {
    await builder.openInsertPicker('trigger', 'generateText_1');
    let { violations } = await scan(page).include('[role=dialog][aria-label="Insert step"]').analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');

    await builder.openConfig('generateText_1');
    ({ violations } = await scan(page).include('.config-panel').analyze());
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test('the insert flow works with the keyboard only', async ({ builder, page }) => {
    // Tab to the hidden "+" — focus must reveal it.
    const plus = page.locator('#edge-plus-trigger-generateText_1');
    await plus.focus();
    await expect(plus).toHaveCSS('opacity', '1');
    await page.keyboard.press('Enter');
    await expect(builder.picker).toBeVisible();
    await page.keyboard.type('wait');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(builder.node('wait_1')).toBeVisible();
  });
});
