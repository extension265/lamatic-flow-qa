# Test strategy — visual flow builder

## 1. What I observed in Lamatic Studio

I explored an existing flow ("QA test": Chat Widget → Generate Text → Chat Response) read-only before writing anything:

- **Library.** The canvas is React Flow. Nodes carry `data-testid="rf__node-<id>"` and edges carry `rf__edge-<source>-<target>`. Handles expose `data-handleid` / `data-handlepos`.
- **Adding nodes.** New steps are added through a **hover-revealed "+" on edges** (`aria-label="Insert step here"`, `opacity-0 group-hover:opacity-100`). It opens a searchable picker grouped as Recently Used / AI / Data / Logic / Apps. Core nodes are auto-laid-out top-to-bottom and are not draggable. Only sticky notes are draggable.
- **Node hover toolbar.** Each node has three actions: `run-tests`, `open-node-config`, `open-node-menu`.
- **Node status.** Badges show *Test Successful* or *Error Found*. The LLM node in the test flow failed with a missing-credentials error, shown as JSON `{status, output, input}` under **Raw Output**.
- **Config window.** Tabs for Config / Schema / Logs / Raw. Prompts use variable chips such as `Chat Widget: chatMessage`.

The demo app copies these behaviours, so the test design maps directly onto Studio.

## 2. Risk-based priorities

| Risk | Impact | Likelihood | Where it is tested |
|---|---|---|---|
| Flow graph saved wrong (lost edge, wrong id, stale config) | Customer agent breaks silently | Medium | graph assertions in every spec, reload tests |
| Invalid graph accepted (cycle, orphan, empty prompt) | Runtime failure / infinite loop | Medium | `connections`, `run-flow` validation, unit |
| Failure in step N reported as success, or downstream steps still run | Wrong answers to customers, extra cost | Medium | `run-flow` failure, skip, network and 5xx cases |
| Non-deterministic AI output breaks the flow (bad JSON, missing keys) | Broken integrations | High | `ai-quality` schema tests |
| Data leakage (PII, system prompt via injection) | Security / compliance incident | Medium | `ai-quality` guardrail tests, unit golden cases |
| Canvas interaction regressions (drag, drop, zoom, hover-only controls) | Builders can't build | High (UI changes often) | `canvas`, `connections`, `insert-step`, visual |
| Accessibility regressions | Excludes users; enterprise deals | Medium | axe scans, keyboard flow |
| Browser differences in drag-and-drop | Some users can't build | Medium | Chromium / Firefox / WebKit matrix |

## 3. Layers

1. **Unit (`node --test`, < 1s).** Pure graph rules and guardrails. Runs first and fails fast.
2. **E2E (Playwright, 3 browsers).** User journeys against a built app with a scripted executor.
3. **Visual (Chromium).** Canvas states where layout *is* the behaviour.
4. **Accessibility (axe + keyboard).**
5. **Post-deploy smoke and a 6-hourly synthetic run** on the live URL.

## 4. Testing non-deterministic output

- **Assert properties, not strings.** Check that the output is non-empty, grounded in the input, has the right schema, stays within token and latency budgets, and contains no leaks.
- **Script the model at the boundary.** Intercept `api/execute` to reproduce the rare cases on demand: malformed JSON, injected instructions, PII.
- **Repeat runs.** The same input runs several times and every run must pass the property checks.
- **Next step at Lamatic.** Golden datasets per agent, scored in CI with thresholds. Prompt and model changes are gated on the eval score the same way code is gated on tests.

## 5. Exit criteria for a release

- Unit and E2E are green on all three browsers. No unreviewed visual diffs. Zero new axe violations.
- Flaky tests are quarantined with an owner and a ticket, never retried silently.
- Post-deploy smoke is green on the live URL.

## 6. Exploratory charters (manual)

- Build a 15-node flow quickly using only the keyboard. Do focus and layout hold up?
- Insert steps while a run is in progress. Is the run's state still consistent?
- Paste a 50k-character prompt and emoji or RTL text into the config fields.
- Use two tabs on the same flow. Which save wins, and is it obvious to the user?
- Zoom to 10%, then 400%, and drop and connect nodes at the extremes.
