# Flow Builder · Playwright Quality Suite

A React Flow workflow builder modelled on Lamatic Studio's editor, plus the test system I would build around it: unit gate → cross-browser E2E → visual + accessibility → AI-output checks → post-deploy smoke. Every run is visible from a single button.

**Author:** Saikat Ganguly · Senior Automation QA Engineer

---

## Run it in one click

| Where | How |
|---|---|
| **Local, live dashboard** | `npm run dashboard` → open <http://localhost:4400> → **▶ Run tests**. Each test streams in live with its current step. Tick *Show browser* to watch the browser drive the canvas. When the run finishes, a link opens the full HTML report (traces, screenshots). |
| **GitHub Actions** | Actions → **Quality gate** → **Run workflow**. You pick the browsers. The merged report is published to GitHub Pages at `/report`, next to the live app. |
| **Playwright UI mode** | `npm run test:e2e:ui` for step-by-step debugging with time travel. |

## Setup

```bash
npm install
npx playwright install          # chromium, firefox, webkit
npm run dev                     # app on http://localhost:5173
npm test                        # unit gate + full E2E suite
```

## What is being tested

The app copies the parts of Lamatic Studio that are hard to test:

- **Two ways to add nodes.**
  - HTML5 drag-and-drop from a palette.
  - Lamatic's own pattern: a hidden **"+"** on each edge (`aria-label="Insert step here"`). It opens a searchable, categorised picker (AI / Data / Logic / Apps) and splits the edge A → new → B.
- **Graph rules.** Handle-to-handle connections, rejection of cycles / self-loops / duplicates, trigger and response nodes that cannot be deleted, undo/redo, and persistence across reloads.
- **Node config panel.** Prompts, model, schema. A **Raw Output** tab shows `{status, output, error, tokens, latencyMs}`, mirroring Studio.
- **Flow execution.** Runs in topological order with *running / success / Error Found / skipped* states. Each node calls `POST api/execute`. Tests intercept that call to script success, latency, HTTP 500, dropped connections, malformed JSON and bad AI output.
- **AI guardrails.**
  - JSON-schema enforcement for *Generate JSON*.
  - PII redaction on the response.
  - A block when a response would leak a system prompt (prompt injection).

## Suite map (55 E2E tests per browser + 13 unit tests)

Firefox and WebKit run 52 of the 55: the three `@visual` screenshot tests are Chromium-only.

| Spec | Covers |
|---|---|
| `canvas.spec.js` | Palette drag-and-drop, drop position under zoom, unique ids, moving nodes, undo/redo, reload persistence, corrupt-storage recovery |
| `connections.spec.js` | Handle drag with real mouse events, zoomed connections, cycle / self / duplicate rejection, cascade delete, protected nodes |
| `insert-step.spec.js` | Hover-revealed "+", edge split, auto-layout order, picker search / empty state / Escape, building a whole workflow from inserts, canvas following a growing chain |
| `config.spec.js` | Field rendering, edits saved into the flow definition, reload persistence, close behaviour, configured node kept visible, Raw Output after a run |
| `run-flow.spec.js` | Happy path order and payloads, long-running state, double-click guard, mid-flow failure → skipped downstream, HTTP 500, network drop, malformed JSON, pre-run validation, branching |
| `ai-quality.spec.js` | Property checks on non-deterministic LLM output (grounding, token and latency budgets) across repeated runs, JSON schema, PII redaction on/off, prompt-injection leak block |
| `visual-a11y.spec.js` | Canvas, failed-run and picker screenshots (`@visual`, Chromium); axe WCAG 2 A/AA scans; keyboard-only insert flow |
| `tests/unit/graph.test.js` | Cycle detection, connection rules, edge split, topological order, validation, golden cases for PII redaction, drag-payload fallback |

## Design decisions

- **Assert on the graph, not only on pixels.** The app exposes a read-only `window.__flowApi.getFlow()`. Tests check both what is shown and the real data (`nodes`, `edges`, `config`). In production this hook would only exist in test builds.
- **Selectors come from React Flow.** Lamatic Studio uses React Flow too, so the same `data-testid="rf__node-<id>"` / `rf__edge-<src>-<tgt>` and `data-handleid` selectors exist in the real product. This suite's locators would carry over.
- **No hard-coded coordinates.** Every drag point comes from `boundingBox()` at runtime, so zoom and pan don't break tests (see the zoomed-out connection test).
- **Mock the executor, not the UI.** A fixture routes `api/execute` to a deterministic default, and each test scripts only the case it cares about. The same requests are recorded in `executor.calls`, so tests can assert execution order and payloads.
- **AI output is tested by its properties, not exact text:** grounded in the input, non-empty, within token and latency budgets, valid against a schema, and free of leaks.
- **Flake policy.** One retry in CI only. A test that passes on retry is reported as **flaky** (on the dashboard and in the CI summary), never hidden. Traces and videos are kept on failure.

## CI pipeline (`.github/workflows/quality-gate.yml`)

```
unit ──► e2e [chromium | firefox | webkit] ──► merged report ──► Pages (app + /report) ──► smoke @smoke on live URL
                                                                      ▲
schedule (every 6h) ─────────────────────────────────────────────────┘  synthetic check
```

- PRs get the unit gate and the cross-browser E2E gate. Results are written as annotations and a job summary.
- `workflow_dispatch` lets you choose browsers and **re-record visual baselines**. The bot commits the new baselines.
- After a deploy, the `@smoke` tests run against the live URL. They run again every 6 hours as a synthetic monitor.

One-time GitHub setup: **Settings → Pages → Source: GitHub Actions**, and **Settings → Actions → General → Workflow permissions: Read and write** (so the bot can commit re-recorded baselines).

## Bugs the suite caught while building

1. **Validation errors vanished instantly.** The "Needs attention" badge made the node taller. React Flow then reported a size change, and the app treated that as a flow edit and cleared validation. Fixed by clearing validation only when the graph or a node's config actually changes. *(Caught by `run-flow.spec.js › validation blocks…`)*
2. **Network failures were silently simulated.** A dropped connection fell back to the demo simulator and reported success. Fixed: only a missing backend (404/405, non-JSON) uses the simulator; real network errors fail the node. *(`run-flow.spec.js › a dropped connection fails loudly…`)*
3. **Accessibility:** connection handles had `aria-label`s on elements with no role (axe `aria-prohibited-attr`). *(`visual-a11y.spec.js`)*
4. **Test-design trap:** a perfectly vertical edge is an SVG path with zero width, which Playwright treats as *hidden*. Edge assertions use `toBeAttached()` plus graph checks.
5. **Palette drops did nothing in WebKit**, and **two layout bugs that hid nodes** on smaller viewports. See *Cross-browser notes* below.

## Cross-browser notes

Chromium passed 53/53 from the start. WebKit failed 19 tests and Firefox failed 8 or more on Windows. Every cause was found with event probes, traces and layout measurements before anything was changed. No assertion was weakened, nothing was skipped, and no retries or sleeps were added.

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | **WebKit:** every palette drop created no node (10 tests; *"expected 4 nodes, received 3"*). | `dragTo()` *does* fire `dragstart → dragenter → dragover → drop` in WebKit, with correct coordinates. But the drag pasteboard keeps only standard types (`text/plain`, `text/uri-list`, `text/html`). Data set under the custom type `application/x-lamatic-node` is gone by `drop`, so `getData()` returned `''` and the drop was ignored. | **App** (`src/flow/dnd.js`): the palette also writes the kind as prefixed `text/plain` (`lamatic-node:<kind>`). The drop reads the custom type first, falls back to the prefixed text, and validates against the catalog. Plain dragged text such as `code` never creates a node. The tests still use the real `dragTo()` in all three browsers, and unit tests cover the fallback. |
| 2 | **WebKit:** *"build a multi-step workflow via edge inserts"* timed out on `hover()`. The Run panel *"intercepts pointer events"*. | Each insert re-lays out the chain 130px further down at a fixed zoom, so the next edge's "+" ended up below the canvas, under the Run panel. React Flow content can't be scrolled into view. Chromium passed only by luck: 28px of room on the 2nd insert, and the 3rd "+" was already off-canvas at y=939 against a pane bottom of 824. | **App:** `fitView()` after every insert (React Flow 12 queues it until the new node is measured). New test: *"the canvas follows a growing chain"* does 5 inserts and asserts that each new node and its "+" are inside the pane. It fails on Chromium without the fix. |
| 3 | **WebKit:** *"deleting the node open in the panel"* timed out on `hover()`, *"config-panel intercepts pointer events"*. | Opening the config panel adds a 340px column and narrows the canvas, so a node near the right edge ends up *under the panel that configures it*. A real user on a 1366px laptop hits the same thing. | **App:** when the panel opens and the node isn't fully visible, pan (same zoom) to centre it. New test: *"opening the panel keeps the configured node visible"* fails on Chromium without the fix. |
| 4 | Why only WebKit hit #2 and #3 on this machine | Playwright's **Windows** WebKit applies the host's display scaling. This laptop uses 110% (`LogPixels=106`), so `devicePixelRatio` is 2 × 1.104 and the CSS viewport is **1304×815, not 1440×900**. That holds even with `deviceScaleFactor: 1`. Chromium and Firefox ignore host scaling when headless. | Not fixable from Playwright. Fixed in the app, not the viewport, because a smaller screen is a real condition. The new tests reproduce both bugs at 1440×900. Linux CI has no host scaling. |
| 5 | **Firefox:** intermittent `page.goto: NS_ERROR_CONNECTION_REFUSED` during `builder` setup. | `vite preview` bound `localhost`, which Node resolves to **`[::1]` only** on Windows. `127.0.0.1:4173` was refused. Firefox sometimes connects to `localhost` over IPv4, and Chromium happens to try `::1` first. | `preview.host: '127.0.0.1'` in `vite.config.js`, and `BASE_URL` set to `http://127.0.0.1:4173`. |
| 6 | **Firefox/WebKit:** 30s timeouts, 40s+ tests, timeouts in fixture set-up and teardown. Different tests failed on each run. | CPU contention, not a hang. On a 10-core i7-1255U the default 6 workers oversubscribe the CPU: WebKit at 6 workers timed out on 35/50 tests and at 2–3 workers on none. With tracing, a WebKit action costs ~0.3–0.7s against ~10ms in Chromium. The slowest tests were each worker's *first* test, when all workers launch browsers at once. One Firefox click spent 22.5s in *"performing click action"*: actionability passed in 80ms, then the content process didn't acknowledge the input. That happened only with WebKit running alongside it (1 in 477; 0 in 50 repeats in isolation). A OneDrive-synced project folder adds load, because every trace and video gets uploaded. | Per-project `workers` caps in `playwright.config.js` (Firefox 2, WebKit 2; Chromium unchanged). WebKit's p95 test time is 2.8× Chromium's (15.6s vs 5.5s), and its longest journeys (5 inserts; two axe scans) reached 30s. WebKit therefore gets a 60s *test* budget, while assertion timeouts stay at 5s so a real hang still fails. CI already runs 2 workers per browser job. Run locally from a folder that OneDrive doesn't sync. |

**Verification:** `npm test` is green on all three browsers, and `npx playwright test --repeat-each=3` gives 477/477.

## Not covered here, and how I'd extend this at Lamatic

- **Real executor.** Point `BASE_URL` at a staging Studio and swap the route mock for contract tests on the GraphQL execution API: schema, errors, auth and tenant isolation.
- **Eval gate for prompts and models.** Golden datasets scored with deterministic checks first, then LLM-as-judge where needed (Promptfoo / DeepEval). Thresholds on accuracy, tool-call correctness, latency and cost, and a block on regressions after a model version bump.
- **Load.** k6 against the execution endpoint (spike, soak), with SLOs for edge and serverless paths.
- **Production feedback loop.** Every escaped bug becomes a regression test. Track escape rate, flake rate, MTTD and MTTR.

See [`TEST_STRATEGY.md`](./TEST_STRATEGY.md) for the risk-based test plan.
