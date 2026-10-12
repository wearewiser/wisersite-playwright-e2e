/**
 * Read-only profile of the tenant analytics warehouse, or a single ad-hoc read-only query.
 *
 *   node .claude/skills/profile-tenant-data/scripts/profile.cjs            # default ATS profile
 *   node .claude/skills/profile-tenant-data/scripts/profile.cjs "SELECT ..." # one query, JSON rows
 *
 * Read-only three ways: the session defaults to read-only transactions, every query runs in an
 * explicit READ ONLY transaction, and queries use the extended protocol, which rejects
 * multi-statement strings (so "ROLLBACK; DELETE ..." can't escape the transaction).
 * Connection settings come from this repo's .env (TENANT_SQL_*).
 */
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.TENANT_SQL_HOST,
  port: Number(process.env.TENANT_SQL_PORT || 5432),
  user: process.env.TENANT_SQL_USER,
  password: process.env.TENANT_SQL_PASSWORD,
  database: process.env.TENANT_SQL_NAME,
  options: '-c default_transaction_read_only=on',
  max: 1,
});

const ATS = 'analytics.gold_fct_ats_applications';
const COHORT = 'NOT is_deleted AND NOT internal_application';

const DEFAULT_PROFILE = {
  today: `SELECT current_date::text AS today`,
  goldTables: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'analytics' AND table_name LIKE 'gold_%' ORDER BY 1`,
  atsSpan: `SELECT min(application_created_date)::text AS first_day, max(application_created_date)::text AS last_day,
              count(*)::int AS applications, count(*) FILTER (WHERE is_screened)::int AS screened,
              count(*) FILTER (WHERE is_hired)::int AS hires
            FROM ${ATS} WHERE ${COHORT}`,
  atsByMonth: `SELECT to_char(date_trunc('month', application_created_date), 'YYYY-MM') AS month,
                 count(*)::int AS applications, count(*) FILTER (WHERE is_screened)::int AS screened,
                 count(*) FILTER (WHERE is_hired)::int AS hires
               FROM ${ATS} WHERE ${COHORT} GROUP BY 1 ORDER BY 1`,
  atsBySource: `SELECT COALESCE(NULLIF(source_channel, ''), '<blank>') AS source_channel,
                  count(*)::int AS applications, count(*) FILTER (WHERE is_screened)::int AS screened,
                  count(*) FILTER (WHERE is_hired)::int AS hires
                FROM ${ATS} WHERE ${COHORT} GROUP BY 1 ORDER BY 2 DESC`,
};

async function readOnly(client, sql) {
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    return (await client.query({ text: sql, queryMode: 'extended' })).rows;
  } finally {
    await client.query('ROLLBACK');
  }
}

(async () => {
  const client = await pool.connect();
  try {
    const adHoc = process.argv[2];
    if (adHoc) {
      console.log(JSON.stringify(await readOnly(client, adHoc), null, 2));
      return;
    }
    for (const [name, sql] of Object.entries(DEFAULT_PROFILE)) {
      try {
        console.log(`\n## ${name}`);
        console.table(await readOnly(client, sql));
      } catch (error) {
        console.log(`(failed: ${error.message})`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
