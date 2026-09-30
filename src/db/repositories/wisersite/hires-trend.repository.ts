import type { TenantSqlClient } from '../../wisersite-db-client';
import type { HiresTrendRawRow, HiresTrendRow } from './hires-trend.repository.types';

const ATS_APPLICATIONS_TABLE = '"analytics"."gold_fct_ats_applications"';

/**
 * Independent read path for the "Hires Trend by Source" chart. Unlike every other widget on
 * this page, the app's own `hiresTrendBySourceWidget.handle` does NOT forward the date-picker's
 * startDate/endDate to `getHiresTrendBySource` — it always fetches a fixed trailing 36 months
 * from `CURRENT_DATE` and the date picker only changes which months the chart *displays* out of
 * that fetch. This repository mirrors that fixed window rather than taking a date range, so a
 * test can filter/compare against whichever months are actually visible.
 */
export class HiresTrendRepository {
  constructor(private readonly db: TenantSqlClient) {}

  async getMonthlyHiresBySource(): Promise<HiresTrendRow[]> {
    const rows = await this.db.query<HiresTrendRawRow>(
      `SELECT
         date_trunc('month', application_created_date)::date AS month,
         source_channel,
         COUNT(*) FILTER (WHERE is_hired)::int AS hires
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE application_created_date >= (CURRENT_DATE - INTERVAL '36 months')
         AND NOT is_deleted
         AND NOT internal_application
         AND source_channel IS NOT NULL
         AND source_channel <> ''
       GROUP BY month, source_channel
       ORDER BY month, source_channel`,
    );
    return rows.map((row) => ({
      month: this.coerceMonth(row.month),
      sourceChannel: row.source_channel,
      hires: Number(row.hires),
    }));
  }

  /**
   * Mirrors the app's `coerceMonth`. `pg`'s default type parser returns a `date` column as a
   * JS `Date` (parsed at UTC midnight, per `pg-types`), not a string — reading `row.month` as a
   * string here would silently produce garbage keys (e.g. via `Date.prototype.toString()`) that
   * never match a real `YYYY-MM-01`, which is exactly the bug this mirroring avoids.
   */
  private coerceMonth(value: unknown): string {
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      return `${year}-${month}-01`;
    }
    return `${String(value).slice(0, 7)}-01`;
  }
}
