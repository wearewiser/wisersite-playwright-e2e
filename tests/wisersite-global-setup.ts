import { wisersiteEnv } from '../src/config/wisersite.env';
import { TenantSqlClient } from '../src/db/wisersite-db-client';

/**
 * Runs once before the wisersite-and-payload-plugin suite (see playwright.wisersite.config.ts).
 *
 * Unlike tests/global-setup.ts (the bundled Employee Directory demo), this NEVER resets or
 * seeds anything: the tenant Postgres warehouse is real, shared demo data
 * (`analytics.gold_*`), and the target app's own Mongo instance already holds the seeded
 * master user these tests log in as. This only confirms the warehouse is reachable before
 * the suite starts — running db/schema.sql-style DROP+CREATE against it would be
 * destructive to data this framework does not own.
 *
 * It also checks the app answers at WISERSITE_BASE_URL, so a stopped dev server fails the run
 * once with a clear message instead of failing every test on `ERR_CONNECTION_REFUSED`.
 * `SKIP_APP_CHECK=1` skips that (the browser-free `rules` project doesn't need the app).
 */
export default async function globalSetup(): Promise<void> {
  const client = new TenantSqlClient();
  await client.waitUntilReady();
  await client.close();
  if (!process.env.SKIP_APP_CHECK) await assertAppIsUp(wisersiteEnv.WISERSITE_BASE_URL);
}

async function assertAppIsUp(baseUrl: string): Promise<void> {
  const url = new URL('/admin', baseUrl).toString();
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status < 500) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `ENVIRONMENT: the app is not reachable at ${url} (${(error as Error).message}). ` +
        'Start it (`pnpm dev` in ../wisersite-and-payload-plugin) and run again.',
    );
  }
}
