// @ts-check
import { defineConfig, devices } from '@playwright/test';

// 127.0.0.1, not localhost: must match the preview server's IPv4 bind (see vite.config.js).
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const isCI = !!process.env.CI;
// Optional: point Chromium at a custom binary (used where the Playwright CDN is blocked).
const chromiumLaunch = process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry in CI. A test that passes on retry is reported as "flaky", not hidden.
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  // Visual baselines are OS/browser specific. Missing ones are recorded on first run
  // (in CI: run the workflow with "update_snapshots" to record and commit them).
  updateSnapshots: 'missing',
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ...(isCI ? [['github']] : []),
  ],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.NO_VIDEO ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: chromiumLaunch },
    },
    // Per-project worker caps (inside the global pool). Measured on a 10-core laptop
    // (i7-1255U): WebKit at 6 workers timed out on 35 of 50 tests; at 2 or 3 workers,
    // none. Playwright's Windows WebKit is CPU-heavy (each action ~0.3–0.7s with
    // tracing vs ~10ms in Chromium), so oversubscribing it starves every worker.
    // Firefox alone is fine at 6 workers, but run alongside WebKit at 3 workers a
    // content process stalled for 22s mid-click (1 in 477 under --repeat-each=3; 0 in
    // 50 repeats in isolation). Capping both at 2 keeps the heavy engines off each other.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@visual/,
      workers: 2,
    },
    // WebKit's per-action cost is ~2–3× Chromium's even at 2 workers (p95 test time
    // 15.6s vs 5.5s over 477 runs). The longest journeys (5 inserts; two axe scans)
    // reached 30s, so WebKit gets a 60s test budget. Assertion timeouts stay at 5s,
    // so a real hang still fails.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@visual/,
      workers: 2,
      timeout: 60_000,
    },
  ],
  // Builds and serves the app unless BASE_URL points at a deployed environment.
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run build && npm run preview', url: BASE_URL, reuseExistingServer: !isCI, timeout: 120_000 },
});
