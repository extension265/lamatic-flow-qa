// @ts-check
import { test, expect } from '../fixtures.js';

test.describe('Node configuration panel', () => {
  test('clicking a node opens its config with the right fields', async ({ builder }) => {
    const panel = await builder.openConfig('generateText_1');
    await expect(panel.getByLabel('Model')).toHaveValue('gpt-4o-mini');
    await expect(panel.getByLabel('System prompt')).toBeVisible();
    await expect(panel.getByLabel('User prompt')).toHaveValue('{{trigger.chatMessage}}');
  });

  test('edits are saved into the flow definition', async ({ builder }) => {
    const panel = await builder.openConfig('generateText_1');
    await panel.getByLabel('Model').selectOption('claude-sonnet');
    await panel.getByLabel('User prompt').fill('Summarise: {{trigger.chatMessage}}');
    await panel.getByLabel('Node name').fill('Summariser');

    await expect(builder.node('generateText_1')).toContainText('Summariser');
    const node = (await builder.getFlow()).nodes.find((n) => n.id === 'generateText_1');
    expect(node.data.label).toBe('Summariser');
    expect(node.data.config).toMatchObject({ model: 'claude-sonnet', userPrompt: 'Summarise: {{trigger.chatMessage}}' });
  });

  test('config survives a reload', async ({ builder, page }) => {
    const panel = await builder.openConfig('generateText_1');
    await panel.getByLabel('System prompt').fill('You are terse.');
    await page.reload();
    const again = await builder.openConfig('generateText_1');
    await expect(again.getByLabel('System prompt')).toHaveValue('You are terse.');
  });

  test('Escape and the close button both close the panel', async ({ builder, page }) => {
    let panel = await builder.openConfig('generateText_1');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    panel = await builder.openConfig('response');
    await panel.getByRole('button', { name: 'Close configuration' }).click();
    await expect(panel).toBeHidden();
  });

  test('deleting the node that is open in the panel closes the panel', async ({ builder, page }) => {
    const id = await builder.dragFromPalette('wait', { x: 750, y: 300 });
    const panel = await builder.openConfig(id);
    await builder.node(id).hover();
    await page.getByRole('button', { name: 'Delete Wait' }).click();
    await expect(panel).toBeHidden();
  });

  // Regression: the panel narrows the canvas, and used to cover a node near the right edge.
  test('opening the panel keeps the configured node visible', async ({ builder }) => {
    const pane = await builder.pane.boundingBox();
    if (!pane) throw new Error('missing pane');
    const id = await builder.dragFromPalette('wait', { x: pane.width - 130, y: 300 });
    await builder.openConfig(id);
    await builder.expectOnCanvas(builder.node(id));
  });

  test('Raw Output tab shows the node result after a run', async ({ builder }) => {
    await builder.run('Hello');
    await builder.expectRunFinished('success');
    const panel = await builder.openConfig('generateText_1');
    await panel.getByRole('tab', { name: 'Raw Output' }).click();
    const raw = JSON.parse(await panel.getByTestId('raw-output').innerText());
    expect(raw).toMatchObject({ status: 'success', output: 'Answer to: Hello', tokens: 42 });
    expect(raw.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
