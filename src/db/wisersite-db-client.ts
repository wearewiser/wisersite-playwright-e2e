import { Pool, type QueryResultRow } from 'pg';
import { wisersiteEnv } from '../config/wisersite.env';

/**
 * Read-only pg pool for wisersite-and-payload-plugin's tenant analytics warehouse
 * (`analytics.gold_*` tables in Postgres, reached via the TENANT_SQL_* local override —
 * see that repo's docs/tenant-sql-local-setup.md).
 *
 * Deliberately separate from DatabaseClient (./db-client.ts): that one owns a disposable
 * Postgres instance it resets and seeds before every run (see tests/global-setup.ts).
 * This one talks to real, shared demo data that this framework does not own — repositories
 * built on it must only ever SELECT, never reset/seed/write.
 */
export class TenantSqlClient {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: wisersiteEnv.TENANT_SQL_HOST,
      port: wisersiteEnv.TENANT_SQL_PORT,
      user: wisersiteEnv.TENANT_SQL_USER,
      password: wisersiteEnv.TENANT_SQL_PASSWORD,
      database: wisersiteEnv.TENANT_SQL_NAME,
      max: 5,
    });
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async waitUntilReady(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await this.pool.query('SELECT 1');
        return;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(
      `Tenant Postgres was not reachable at ${wisersiteEnv.TENANT_SQL_HOST}:${wisersiteEnv.TENANT_SQL_PORT} ` +
        `after ${timeoutMs}ms. Is the Auth Proxy / local override reachable? Last error: ${String(lastError)}`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
