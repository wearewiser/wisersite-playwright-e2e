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
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Next.js dev mode compiles routes on demand — a route hit for the first time in a while
  // can take much longer than Playwright's 30s default test timeout to even render.
  timeout: 60_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-wisersite' }],
  ],

  use: {
    baseURL: wisersiteEnv.WISERSITE_BASE_URL,
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
