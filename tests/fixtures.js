// @ts-check
import { test as base, expect } from '@playwright/test';
import { FlowBuilderPage } from './pages/FlowBuilderPage.js';

/**
 * @typedef {{ status?: number, body?: any, rawBody?: string, delayMs?: number, abort?: boolean }} MockReply
 * @typedef {(req: { nodeId: string, kind: string, config: any, input: any }) => MockReply | Promise<MockReply>} MockHandler
 */

/** Deterministic default executor: every node succeeds and echoes a predictable output. */
export const defaultHandler = ({ kind, input }) => {
  switch (kind) {
    case 'generateText': return { body: { status: 'success', output: `Answer to: ${input}`, tokens: 42 } };
    case 'generateJSON': return { body: { status: 'success', output: '{"intent":"question","confidence":0.92}', tokens: 18 } };
    default: return { body: { status: 'success', output: input } };
  }
};

/**
 * Fixtures
 *  - builder:  page object, app loaded on a fresh context (empty localStorage)
 *  - executor: controls POST api/execute. Every test starts with the deterministic
 *              default; call executor.use(handler) to script failures, latency, etc.
 *              executor.calls records every request for assertions.
 */
export const test = base.extend({
  executor: async ({ page }, use) => {
    /** @type {MockHandler} */
    let handler = defaultHandler;
    /** @type {any[]} */
    const calls = [];
    await page.route('**/api/execute', async (route) => {
      const req = route.request().postDataJSON();
      calls.push(req);
      const reply = await handler(req);
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      if (reply.abort) return route.abort('connectionreset');
      await route.fulfill({
        status: reply.status ?? 200,
        contentType: 'application/json',
        body: reply.rawBody ?? JSON.stringify(reply.body),
      });
    });
    await use({
      calls,
      /** @param {MockHandler} h */
      use: (h) => { handler = h; },
    });
  },

  builder: async ({ page, executor }, use) => { // eslint-disable-line no-unused-vars
    const builder = new FlowBuilderPage(page);
    await builder.goto();
    await use(builder);
  },
});

export { expect };
