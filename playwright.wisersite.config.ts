import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { wisersiteEnv } from './src/config/wisersite.env';

/**
 * Separate Playwright config for testing wisersite-and-payload-plugin
 * (D:\Repositories\wiser-projects\wisersite-and-payload-plugin), kept apart from
 * playwright.config.ts (the bundled Employee Directory demo) so the two suites' env,
 * global setup, and DB connections never mix — critically, so this suite's global setup
 * can never accidentally run the bundled suite's schema DROP+CREATE
 * (tests/global-setup.ts -> db/schema.sql) against the tenant's real Postgres warehouse.
 *
 * Prerequisite: wisersite-and-payload-plugin's own dev server must already be running
 * (`pnpm dev` in that repo, logged in admin at http://localhost:3000/admin) — this config
 * does not start it, since it lives in a different repo/package manager.
 */
export default defineConfig({
  testDir: './tests/e2e-wisersite',
  globalSetup: require.resolve('./tests/wisersite-global-setup.ts'),

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Off locally by default so a genuine failure is never hidden behind a passing retry. Opt in
  // per run with `npm run test:retry`, `--retries=<n>`, or `RETRIES=<n>` (e.g. when the dev
  // server's on-demand compile makes a first page load time out). A test that fails and then
  // passes on retry is reported as "flaky", not "passed", and `trace: 'on-first-retry'` below
  // records a trace of the retried attempt.
  retries: process.env.RETRIES ? Number(process.env.RETRIES) : process.env.CI ? 2 : 0,
  workers: 1,
  // Next.js dev mode compiles routes on demand — a route hit for the first time in a while
  // can take much longer than Playwright's 30s default test timeout to even render.
  timeout: 60_000,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-wisersite' }]],

  use: {
    baseURL: wisersiteEnv.WISERSITE_BASE_URL,
    // `npm run test:tz:<zone>` sets both TZ (the oracle's date maths in Node) and TEST_TZ (the
    // browser), to catch the month/day-shift class of bug (KNOWN-DEFECTS TZ-1). Unset = local.
    ...(process.env.TEST_TZ ? { timezoneId: process.env.TEST_TZ } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  expect: {
    timeout: 10_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
