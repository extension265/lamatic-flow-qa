// @ts-check
import { test, expect } from '../fixtures.js';

// Mirrors Lamatic Studio's main way of adding nodes: a hidden "+" on each edge
// (aria-label "Insert step here") that opens a searchable, categorised picker.
test.describe('Insert step on an edge', () => {
  test('the + button is hidden until the edge is hovered', async ({ builder, page }) => {
    const plus = page.locator('#edge-plus-trigger-generateText_1');
    await expect(plus).toHaveCSS('opacity', '0');
    await page.getByTestId('edge-plus-zone-trigger-generateText_1').hover();
    await expect(plus).toHaveCSS('opacity', '1');
  });

  test('inserting splits the edge: A → new → B @smoke', async ({ builder }) => {
    const id = await builder.insertOnEdge('trigger', 'generateText_1', 'vectorSearch');

    const flow = await builder.getFlow();
    const pairs = flow.edges.map((e) => `${e.source}>${e.target}`).sort();
    expect(pairs).toEqual([`${id}>generateText_1`, `trigger>${id}`, 'generateText_1>response'].sort());
    await expect(builder.edge('trigger', 'generateText_1')).toHaveCount(0);
  });

  test('inserted node is laid out between its neighbours', async ({ builder }) => {
    const id = await builder.insertOnEdge('generateText_1', 'response', 'condition');
    const y = async (nid) => (await builder.node(nid).boundingBox())?.y ?? NaN;
    expect(await y('generateText_1')).toBeLessThan(await y(id));
    expect(await y(id)).toBeLessThan(await y('response'));
  });

  test('picker search filters across categories', async ({ builder }) => {
    await builder.openInsertPicker('trigger', 'generateText_1');
    const search = builder.picker.getByRole('textbox', { name: 'Search nodes' });
    await expect(search).toBeFocused();

    await search.fill('json');
    await expect(builder.picker.getByRole('button')).toHaveText([/Generate JSON/]);

    await search.fill('zzz');
    await expect(builder.picker.getByTestId('picker-empty')).toBeVisible();
  });

  test('search then pick inserts the right node', async ({ builder }) => {
    const id = await builder.insertOnEdge('trigger', 'generateText_1', 'rag', { search: 'rag' });
    expect(id).toBe('rag_1');
    await expect(builder.node(id)).toContainText('RAG');
  });

  test('Escape closes the picker without changing the flow', async ({ builder, page }) => {
    const before = await builder.getFlow();
    await builder.openInsertPicker('trigger', 'generateText_1');
    await page.keyboard.press('Escape');
    await expect(builder.picker).toBeHidden();
    expect(await builder.getFlow()).toEqual(before);
  });

  test('build a multi-step workflow only through edge inserts', async ({ builder }) => {
    const rag = await builder.insertOnEdge('trigger', 'generateText_1', 'rag');
    const cond = await builder.insertOnEdge(rag, 'generateText_1', 'condition');
    const slack = await builder.insertOnEdge('generateText_1', 'response', 'slack');

    const flow = await builder.getFlow();
    // Walk the chain from the trigger: it must be one straight line in the right order.
    const next = Object.fromEntries(flow.edges.map((e) => [e.source, e.target]));
    const chain = ['trigger'];
    while (next[chain.at(-1)]) chain.push(next[chain.at(-1)]);
    expect(chain).toEqual(['trigger', rag, cond, 'generateText_1', slack, 'response']);
  });

  // Regression: the chain used to grow below the canvas at a fixed zoom, so the next
  // "+" ended up under the run panel (WebKit after 2 inserts, every browser after 4).
  test('the canvas follows a growing chain: new node and its "+" stay on screen', async ({ builder }) => {
    let tail = 'generateText_1';
    for (const kind of ['code', 'wait', 'condition', 'slack', 'apiRequest']) {
      tail = await builder.insertOnEdge(tail, 'response', kind);
      await builder.expectOnCanvas(builder.node(tail));
      await builder.expectOnCanvas(builder.page.getByTestId(`edge-plus-zone-${tail}-response`));
    }
    expect((await builder.getFlow()).nodes).toHaveLength(8);
  });
});
