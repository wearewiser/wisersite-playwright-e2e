import type { TenantSqlClient } from '../../wisersite-db-client';
import type { HiresTrendDayRow } from './hires-trend.repository.types';

const ATS_APPLICATIONS_TABLE = '"analytics"."gold_fct_ats_applications"';

/**
 * Independent read path for the "Hires Trend by Source" chart. The chart doesn't fetch the
 * date picker's window: it loads a fixed span (from the 1st of the month 25 months back) and
 * picks the days it plots from that, so the earliest day here is also the chart's history
 * floor for a comparison (AC silent: per app `getHiresTrendBySource`). This repository mirrors
 * that span rather than taking a date range. Internal applications count (WP23-417:
 * "applications" means all applications, Hires Trend included).
 *
 * One row per day and source with any application, so a source with applications but no hires
 * in a month is a 0, and one with no applications a gap.
 */
export class HiresTrendRepository {
  constructor(private readonly db: TenantSqlClient) {}

  async getDailyHiresBySource(): Promise<HiresTrendDayRow[]> {
    const rows = await this.db.query<{ day: string; source_channel: string; hires: number }>(
      `SELECT
         to_char(application_created_date, 'YYYY-MM-DD') AS day,
         source_channel,
         COUNT(*) FILTER (WHERE is_hired)::int AS hires
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE application_created_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '25 months')::date
         AND NOT is_deleted
         AND source_channel IS NOT NULL
         AND source_channel <> ''
       GROUP BY application_created_date, source_channel
       ORDER BY application_created_date, source_channel`,
    );
    return rows.map((row) => ({
      day: row.day,
      sourceChannel: row.source_channel,
      hires: Number(row.hires),
    }));
  }
}
