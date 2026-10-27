// @ts-check
import { test, expect } from '../fixtures.js';

test.describe('Run flow — execution, async state and failure handling', () => {
  test('happy path: every node succeeds, in order, and the response is shown @smoke', async ({ builder, executor }) => {
    await builder.run('What is Lamatic?');
    await builder.expectRunFinished('success');

    for (const id of ['trigger', 'generateText_1', 'response']) {
      await expect(builder.nodeStatus(id)).toHaveAttribute('data-status', 'success');
    }
    // Trigger runs locally; the executor is called once per downstream node, in topological order.
    expect(executor.calls.map((c) => c.nodeId)).toEqual(['generateText_1', 'response']);
    expect(executor.calls[0].input).toBe('What is Lamatic?');
    await expect(builder.finalOutput).toHaveText('Answer to: What is Lamatic?');
  });

  test('long-running node shows a running state, and Run is disabled meanwhile', async ({ builder, executor }) => {
    executor.use((req) => (req.kind === 'generateText'
      ? { delayMs: 1500, body: { status: 'success', output: 'slow answer', tokens: 5 } }
      : { body: { status: 'success', output: req.input } }));

    await builder.run();
    await expect(builder.nodeStatus('generateText_1')).toHaveAttribute('data-status', 'running');
    await expect(builder.runButton).toBeDisabled();
    await expect(builder.runStatus).toHaveAttribute('data-status', 'running');

    await builder.expectRunFinished('success');
    await expect(builder.runButton).toBeEnabled();
  });

  test('double-clicking Run does not start two executions', async ({ builder, executor }) => {
    executor.use((req) => ({ delayMs: 300, body: { status: 'success', output: req.input } }));
    await builder.runButton.dblclick();
    await builder.expectRunFinished('success');
    expect(executor.calls.filter((c) => c.nodeId === 'generateText_1')).toHaveLength(1);
  });

  test('a failing node stops the run and downstream nodes are skipped', async ({ builder, executor, page }) => {
    const slack = await builder.insertOnEdge('generateText_1', 'response', 'slack');
    // The exact failure seen in Lamatic Studio when an LLM has no credentials.
    executor.use((req) => (req.kind === 'generateText'
      ? { body: { status: 'failed', error: 'LLM node failed: Missing credentials key.' } }
      : { body: { status: 'success', output: req.input } }));

    await builder.run();
    await builder.expectRunFinished('failed');

    await expect(builder.nodeStatus('generateText_1')).toHaveText('Error Found');
    await expect(builder.nodeStatus(slack)).toHaveAttribute('data-status', 'skipped');
    await expect(builder.nodeStatus('response')).toHaveAttribute('data-status', 'skipped');
    await expect(page.getByTestId('run-log')).toContainText('Missing credentials key');
    // Skipped nodes must not be executed at all.
    expect(executor.calls.map((c) => c.nodeId)).toEqual(['generateText_1']);
    await expect(builder.finalOutput).toHaveCount(0);
  });

  test('HTTP 500 from the executor fails the node with a readable error', async ({ builder, executor, page }) => {
    executor.use(() => ({ status: 500, body: { message: 'internal' } }));
    await builder.run();
    await builder.expectRunFinished('failed');
    await expect(page.getByTestId('run-log')).toContainText('Executor returned HTTP 500');
  });

  test('a dropped connection fails loudly instead of being silently simulated', async ({ builder, executor, page }) => {
    executor.use(() => ({ abort: true }));
    await builder.run();
    await builder.expectRunFinished('failed');
    await expect(page.getByTestId('run-log')).toContainText('Network error while calling executor');
  });

  test('malformed JSON from the executor is handled', async ({ builder, executor, page }) => {
    executor.use(() => ({ rawBody: '{"status": "succ' }));
    await builder.run();
    await builder.expectRunFinished('failed');
    await expect(page.getByTestId('run-log')).toContainText('Malformed response from executor');
  });

  test('validation blocks a run with a disconnected node, and nothing executes', async ({ builder, executor }) => {
    const orphan = await builder.dragFromPalette('code', { x: 800, y: 300 });
    await builder.run();

    await expect(builder.validationErrors).toContainText('"Code" is not connected to the trigger');
    await expect(builder.page.getByTestId(`node-invalid-${orphan}`)).toBeVisible();
    await expect(builder.runStatus).toHaveAttribute('data-status', 'idle');
    expect(executor.calls).toHaveLength(0);
  });

  test('validation blocks a run when an AI node has an empty prompt', async ({ builder, executor }) => {
    const panel = await builder.openConfig('generateText_1');
    await panel.getByLabel('User prompt').fill('   ');
    await builder.run();
    await expect(builder.validationErrors).toContainText('"Generate Text" has an empty prompt');
    expect(executor.calls).toHaveLength(0);
  });

  test('branching flow: both branches run before the response', async ({ builder, executor }) => {
    const slack = await builder.dragFromPalette('slack', { x: 900, y: 250 });
    await builder.connect('trigger', slack);
    await builder.connect(slack, 'response');

    await builder.run();
    await builder.expectRunFinished('success');
    const order = executor.calls.map((c) => c.nodeId);
    expect(order.at(-1)).toBe('response');
    expect(order).toEqual(expect.arrayContaining(['generateText_1', slack]));
    // The response received both parents' outputs.
    expect(executor.calls.at(-1).input).toHaveLength(2);
  });
});
