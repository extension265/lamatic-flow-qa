// @ts-check
import { test, expect } from '../fixtures.js';

/**
 * No horizontal overflow: content is no wider than the viewport, and the page cannot
 * be scrolled sideways. The width is compared with the exact (possibly fractional)
 * visual viewport: Playwright's Windows WebKit applies host display scaling, giving
 * e.g. a 339.62px viewport where innerWidth truncates to 339 but scrollWidth rounds
 * to 340. On integer viewports this is exactly scrollWidth <= innerWidth.
 * @param {import('@playwright/test').Page} page
 */
async function expectNoHorizontalOverflow(page) {
  const m = await page.evaluate(() => {
    window.scrollTo(1000, 0);
    const r = { scrollWidth: document.documentElement.scrollWidth, viewport: Math.ceil(window.visualViewport?.width ?? window.innerWidth), scrollX: window.scrollX };
    window.scrollTo(0, 0);
    return r;
  });
  expect(m.scrollWidth, 'page is wider than the viewport').toBeLessThanOrEqual(m.viewport);
  expect(m.scrollX, 'page scrolls sideways').toBe(0);
}

test.describe('Phone width (375×812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow, Test flow is reachable and a run succeeds @smoke', async ({ builder, executor }) => {
    await expectNoHorizontalOverflow(builder.page);
    await expect(builder.runButton).toBeVisible();
    await expect(builder.runButton).toBeInViewport({ ratio: 1 });

    await builder.run('What is Lamatic?'); // a real click: fails if anything covers the button
    await builder.expectRunFinished('success');
    expect(executor.calls.map((c) => c.nodeId)).toEqual(['generateText_1', 'response']);
    await expect(builder.finalOutput).toHaveText('Answer to: What is Lamatic?');
    await expectNoHorizontalOverflow(builder.page);
  });

  test('the palette sits behind a "Nodes" toggle and still drops nodes', async ({ builder, page }) => {
    const toggle = page.getByRole('button', { name: 'Nodes', exact: true });
    const palette = page.getByRole('complementary', { name: 'Node palette' });
    await expect(palette).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(palette).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expectNoHorizontalOverflow(page);

    // Drop to the right of the 220px drawer; the drawer closes so the new node is visible.
    const id = await builder.dragFromPalette('code', { x: 285, y: 200 });
    await expect(palette).toBeHidden();
    await expect(builder.node(id)).toBeVisible();
  });

  test('the run panel stacks into one column', async ({ builder, page }) => {
    const input = await page.locator('.run-input').boundingBox();
    const status = await builder.runStatus.boundingBox();
    if (!input || !status) throw new Error('run panel not rendered');
    expect(status.y).toBeGreaterThanOrEqual(input.y + input.height);
    expect(Math.abs(status.x - input.x)).toBeLessThan(2);
  });
});

test('the "Nodes" toggle does not exist on desktop', async ({ builder, page }) => {
  await expect(page.getByRole('button', { name: 'Nodes', exact: true })).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Node palette' })).toBeVisible();
});
