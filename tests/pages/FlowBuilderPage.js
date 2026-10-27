// @ts-check
import { expect } from '@playwright/test';

/**
 * Page object for the flow builder.
 *
 * Selector strategy: React Flow renders stable test ids for every node and edge
 * (`rf__node-<id>`, `rf__edge-<source>-<target>`). Lamatic Studio uses the same
 * library and exposes the same ids, so these locators transfer to the real product.
 * Canvas coordinates are always read from boundingBox() at runtime — never
 * hard-coded — because zoom and pan move everything.
 */
export class FlowBuilderPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.pane = page.locator('.react-flow__pane');
    this.viewport = page.locator('.react-flow__viewport');
    this.runButton = page.getByTestId('run-flow');
    this.runStatus = page.getByTestId('run-status');
    this.toast = page.getByTestId('toast');
    this.picker = page.getByRole('dialog', { name: 'Insert step' });
    this.validationErrors = page.getByTestId('validation-errors');
    this.finalOutput = page.getByTestId('final-output');
    this.triggerInput = page.getByTestId('trigger-input');
  }

  async goto() {
    await this.page.goto('./');
    await expect(this.node('trigger')).toBeVisible();
    await expect(this.node('response')).toBeVisible();
  }

  node(id) { return this.page.getByTestId(`rf__node-${id}`); }
  // Assert edges with toBeAttached(), not toBeVisible(): a perfectly vertical edge
  // is an SVG path with zero width, which Playwright treats as "hidden".
  edge(source, target) { return this.page.getByTestId(`rf__edge-${source}-${target}`); }
  nodeStatus(id) { return this.page.getByTestId(`node-status-${id}`); }
  allNodes() { return this.page.locator('.react-flow__node'); }
  allEdges() { return this.page.locator('.react-flow__edge'); }

  /** The real graph, read from the app (not inferred from pixels). */
  async getFlow() {
    return this.page.evaluate(() => /** @type {any} */ (window).__flowApi.getFlow());
  }

  async nodeIds() { return (await this.getFlow()).nodes.map((n) => n.id); }

  /**
   * HTML5 drag from the sidebar palette onto the canvas.
   * Returns the id of the node that was created.
   * @param {string} kind
   * @param {{x:number,y:number}} at position relative to the canvas pane
   */
  async dragFromPalette(kind, at) {
    const before = new Set(await this.nodeIds());
    await this.page.getByTestId(`palette-${kind}`).dragTo(this.pane, { targetPosition: at });
    await expect.poll(async () => (await this.nodeIds()).length).toBe(before.size + 1);
    const created = (await this.nodeIds()).find((id) => !before.has(id));
    if (!created) throw new Error(`No node created for ${kind}`);
    return created;
  }

  /** Drag from a node's output handle to another node's input handle with real mouse events. */
  async connect(sourceId, targetId) {
    const from = await this.center(this.node(sourceId).locator('.react-flow__handle.source'));
    const to = await this.center(this.node(targetId).locator('.react-flow__handle.target'));
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
    await this.page.mouse.move(to.x, to.y, { steps: 8 });
    await this.page.mouse.up();
  }

  /** Drag a node by its body to a new spot on screen (delta in px). */
  async moveNode(id, dx, dy) {
    const c = await this.center(this.node(id).locator('.node-label'));
    await this.page.mouse.move(c.x, c.y);
    await this.page.mouse.down();
    await this.page.mouse.move(c.x + dx, c.y + dy, { steps: 12 });
    await this.page.mouse.up();
  }

  /** Hover the edge's hit zone so the hidden "+" appears, then open the picker. */
  async openInsertPicker(source, target) {
    const zone = this.page.getByTestId(`edge-plus-zone-${source}-${target}`);
    const plus = zone.getByRole('button', { name: 'Insert step here' });
    await zone.hover();
    await expect(plus).toHaveCSS('opacity', '1');
    await plus.click();
    await expect(this.picker).toBeVisible();
  }

  /** Insert a node of `kind` between source and target; returns the new id. */
  async insertOnEdge(source, target, kind, { search } = {}) {
    const before = new Set(await this.nodeIds());
    await this.openInsertPicker(source, target);
    if (search) await this.picker.getByRole('textbox', { name: 'Search nodes' }).fill(search);
    await this.picker.getByTestId(`picker-item-${kind}`).click();
    await expect(this.picker).toBeHidden();
    const created = (await this.nodeIds()).find((id) => !before.has(id));
    if (!created) throw new Error(`No node inserted for ${kind}`);
    return created;
  }

  async selectNode(id) {
    await this.node(id).locator('.node-label').click();
  }

  async openConfig(id) {
    await this.selectNode(id);
    const panel = this.page.getByRole('dialog', { name: /^Configure / });
    await expect(panel).toBeVisible();
    return panel;
  }

  async deleteSelected() {
    await this.page.locator('.react-flow__pane').focus().catch(() => {});
    await this.page.keyboard.press('Delete');
  }

  async run(message) {
    if (message !== undefined) await this.triggerInput.fill(message);
    await this.runButton.click();
  }

  async expectRunFinished(status) {
    await expect(this.runStatus).toHaveAttribute('data-status', status, { timeout: 15_000 });
  }

  async zoomOut(times = 1) {
    for (let i = 0; i < times; i++) await this.page.getByRole('button', { name: 'Zoom Out' }).click();
  }

  async fitView() { await this.page.getByRole('button', { name: 'Fit View' }).click(); }

  /**
   * Assert the element lies inside the visible canvas pane. toBeInViewport() is not
   * enough: it checks the page viewport, and the run panel below the canvas is still
   * inside that while covering whatever React Flow renders beneath the pane.
   */
  async expectOnCanvas(locator) {
    const pane = await this.pane.boundingBox();
    if (!pane) throw new Error('Canvas pane has no bounding box');
    await expect.poll(async () => {
      const box = await locator.boundingBox();
      return !!box && box.x >= pane.x && box.y >= pane.y
        && box.x + box.width <= pane.x + pane.width && box.y + box.height <= pane.y + pane.height;
    }, { message: 'element is inside the visible canvas pane' }).toBe(true);
  }

  async center(locator) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (!box) throw new Error('Element has no bounding box');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
}
