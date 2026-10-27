// @ts-check
import { test, expect } from '../fixtures.js';

test.describe('Canvas — drag and drop', () => {
  test('starts with trigger → Generate Text → response @smoke', async ({ builder }) => {
    await expect(builder.allNodes()).toHaveCount(3);
    await expect(builder.edge('trigger', 'generateText_1')).toBeAttached();
    await expect(builder.edge('generateText_1', 'response')).toBeAttached();

    const flow = await builder.getFlow();
    expect(flow.nodes.map((n) => n.data.kind)).toEqual(['trigger', 'generateText', 'response']);
    expect(flow.edges).toHaveLength(2);
  });

  test('drag a node from the palette onto the canvas @smoke', async ({ builder }) => {
    const id = await builder.dragFromPalette('condition', { x: 700, y: 250 });

    expect(id).toBe('condition_1');
    await expect(builder.node(id)).toBeVisible();
    await expect(builder.node(id)).toContainText('Condition');
    // A dropped node is free-floating until someone connects it.
    const flow = await builder.getFlow();
    expect(flow.edges.some((e) => e.source === id || e.target === id)).toBe(false);
  });

  test('node lands where it was dropped, at any zoom level', async ({ builder }) => {
    await builder.zoomOut(2);
    const paneBox = await builder.pane.boundingBox();
    const drop = { x: 600, y: 300 };
    const id = await builder.dragFromPalette('wait', drop);

    // The node is placed so the drop point sits near its top-centre.
    const box = await builder.node(id).boundingBox();
    if (!paneBox || !box) throw new Error('missing boxes');
    const dropScreen = { x: paneBox.x + drop.x, y: paneBox.y + drop.y };
    expect(Math.abs(box.x + box.width / 2 - dropScreen.x)).toBeLessThan(box.width);
    expect(Math.abs(box.y - dropScreen.y)).toBeLessThan(80);
  });

  test('repeated drops get unique, sequential ids', async ({ builder }) => {
    const a = await builder.dragFromPalette('code', { x: 650, y: 150 });
    const b = await builder.dragFromPalette('code', { x: 650, y: 300 });
    const c = await builder.dragFromPalette('code', { x: 650, y: 450 });
    expect([a, b, c]).toEqual(['code_1', 'code_2', 'code_3']);
    expect(new Set(await builder.nodeIds()).size).toBe(6);
  });

  test('moving a node updates its stored position', async ({ builder }) => {
    const before = (await builder.getFlow()).nodes.find((n) => n.id === 'generateText_1').position;
    await builder.moveNode('generateText_1', 220, 40);
    const after = (await builder.getFlow()).nodes.find((n) => n.id === 'generateText_1').position;
    expect(after.x).toBeGreaterThan(before.x + 50);
    // Edges follow the node — still connected.
    await expect(builder.edge('trigger', 'generateText_1')).toBeAttached();
  });

  test('undo and redo a drop', async ({ builder, page }) => {
    const id = await builder.dragFromPalette('slack', { x: 700, y: 300 });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(builder.node(id)).toHaveCount(0);
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(builder.node(id)).toBeVisible();
  });

  test('flow survives a page reload', async ({ builder, page }) => {
    const id = await builder.dragFromPalette('rag', { x: 700, y: 300 });
    await builder.connect('generateText_1', id);
    await page.reload();
    await expect(builder.node(id)).toBeVisible();
    await expect(builder.edge('generateText_1', id)).toBeAttached();
  });

  test('corrupt saved data falls back to the default flow instead of a blank screen', async ({ page, builder }) => {
    await page.evaluate(() => localStorage.setItem('lamatic-flow-qa:flow:v1', '{not json'));
    await page.reload();
    await expect(builder.allNodes()).toHaveCount(3);
  });
});
