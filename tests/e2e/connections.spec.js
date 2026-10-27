// @ts-check
import { test, expect } from '../fixtures.js';

test.describe('Connections — handles and graph rules', () => {
  test('connect a dropped node by dragging between handles', async ({ builder }) => {
    const id = await builder.dragFromPalette('slack', { x: 750, y: 250 });
    await builder.connect('generateText_1', id);

    await expect(builder.edge('generateText_1', id)).toBeAttached();
    const flow = await builder.getFlow();
    expect(flow.edges).toContainEqual({ id: `generateText_1-${id}`, source: 'generateText_1', target: id });
  });

  test('connections still land correctly after zooming out', async ({ builder }) => {
    await builder.zoomOut(3);
    const id = await builder.dragFromPalette('apiRequest', { x: 750, y: 250 });
    await builder.connect('trigger', id);
    await expect(builder.edge('trigger', id)).toBeAttached();
  });

  test('rejects a connection that would create a cycle', async ({ builder }) => {
    const code = await builder.dragFromPalette('code', { x: 750, y: 200 });
    await builder.connect('generateText_1', code);
    const edgesBefore = (await builder.getFlow()).edges.length;

    await builder.connect(code, 'generateText_1'); // generateText_1 → code → generateText_1

    await expect(builder.toast).toHaveText('Connection would create a cycle');
    expect((await builder.getFlow()).edges).toHaveLength(edgesBefore);
  });

  test('rejects connecting a node to itself', async ({ builder }) => {
    const id = await builder.dragFromPalette('code', { x: 750, y: 250 });
    await builder.connect(id, id);
    await expect(builder.toast).toHaveText('A node cannot connect to itself');
    expect((await builder.getFlow()).edges).toHaveLength(2);
  });

  test('rejects a duplicate connection', async ({ builder }) => {
    await builder.connect('trigger', 'generateText_1');
    await expect(builder.toast).toHaveText('Connection already exists');
    expect((await builder.getFlow()).edges).toHaveLength(2);
  });

  test('trigger has no input handle and response has no output handle', async ({ builder }) => {
    await expect(builder.node('trigger').locator('.react-flow__handle.target')).toHaveCount(0);
    await expect(builder.node('response').locator('.react-flow__handle.source')).toHaveCount(0);
  });

  test('deleting a node removes its edges too (no dangling edges)', async ({ builder }) => {
    await builder.selectNode('generateText_1');
    await builder.deleteSelected();

    await expect(builder.node('generateText_1')).toHaveCount(0);
    const flow = await builder.getFlow();
    expect(flow.edges.filter((e) => e.source === 'generateText_1' || e.target === 'generateText_1')).toEqual([]);
    await expect(builder.allEdges()).toHaveCount(0);
  });

  test('trigger and response cannot be deleted', async ({ builder }) => {
    await builder.selectNode('trigger');
    await builder.deleteSelected();
    await builder.selectNode('response');
    await builder.deleteSelected();
    await expect(builder.node('trigger')).toBeVisible();
    await expect(builder.node('response')).toBeVisible();
  });

  test('delete from the node hover toolbar, then undo restores node and edges', async ({ builder, page }) => {
    await builder.node('generateText_1').hover();
    await page.getByRole('button', { name: 'Delete Generate Text' }).click();
    await expect(builder.node('generateText_1')).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(builder.node('generateText_1')).toBeVisible();
    expect((await builder.getFlow()).edges).toHaveLength(2);
  });
});
