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
 */
export default async function globalSetup(): Promise<void> {
  const client = new TenantSqlClient();
  await client.waitUntilReady();
  await client.close();
}
