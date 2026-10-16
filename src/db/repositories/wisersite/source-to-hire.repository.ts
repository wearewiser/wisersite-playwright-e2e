import type { TenantSqlClient } from '../../wisersite-db-client';
import type {
  DailyCounts,
  DailyCountsRow,
  DataSpan,
  SourceBreakdown,
  SourceBreakdownRawRow,
  SourceToHireSummary,
  SourceToHireSummaryRow,
} from './source-to-hire.repository.types';

const ATS_APPLICATIONS_TABLE = '"analytics"."gold_fct_ats_applications"';

/**
 * Independent read path onto `analytics.gold_fct_ats_applications` for the Source to Hire
 * summary row shown at /admin/source-to-hire. Same cohort semantics as the app's own
 * getSourceToHireSummary (src/widgets/SourceToHireSummary/getSourceToHireSummary.ts) —
 * not applications-are-deleted, not internal — but written from scratch against a
 * separate connection, so a test comparing the UI to this is a genuine check against the
 * warehouse, not the app confirming its own query against itself.
 */
export class SourceToHireRepository {
  constructor(private readonly db: TenantSqlClient) {}

  async getSummary(startDate: string, endDate: string): Promise<SourceToHireSummary> {
    const row = await this.db.queryOne<SourceToHireSummaryRow>(
      `SELECT
         COUNT(*)::int AS applications,
         COUNT(*) FILTER (WHERE is_screened)::int AS screened,
         COUNT(*) FILTER (WHERE is_hired)::int AS hires,
         AVG(days_to_hire_observed) FILTER (WHERE is_hired) AS avg_hire_period_days
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE application_created_date BETWEEN $1::date AND $2::date
         AND NOT is_deleted
         AND NOT internal_application`,
      [startDate, endDate],
    );
    return this.mapRow(row);
  }

  /**
   * First and last `application_created_date` in the cohort — the "available data" WP23-87 AC 5
   * gates comparisons on. Taken from the warehouse itself, not from the `minDate`/`maxDate` the
   * board sends (on an environment without the analytics date-range API those are a today−90
   * fallback, not the data). `null` when the cohort is empty.
   */
  async getDataSpan(): Promise<DataSpan | null> {
    const row = await this.db.queryOne<{ min_date: string | null; max_date: string | null }>(
      `SELECT
         to_char(MIN(application_created_date), 'YYYY-MM-DD') AS min_date,
         to_char(MAX(application_created_date), 'YYYY-MM-DD') AS max_date
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE NOT is_deleted
         AND NOT internal_application`,
    );
    if (!row?.min_date || !row.max_date) return null;
    return { minDate: row.min_date, maxDate: row.max_date };
  }

  /**
   * Applications / screened / hires per day with any applications, same cohort as `getSummary`.
   * Lets a test pick a custom window that lands in a specific WP23-87 AC 3 band from what the
   * warehouse holds, instead of hard-coding dates.
   */
  async getDailyCounts(startDate: string, endDate: string): Promise<DailyCounts[]> {
    const rows = await this.db.query<DailyCountsRow>(
      `SELECT
         to_char(application_created_date, 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS applications,
         COUNT(*) FILTER (WHERE is_screened)::int AS screened,
         COUNT(*) FILTER (WHERE is_hired)::int AS hires
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE application_created_date BETWEEN $1::date AND $2::date
         AND NOT is_deleted
         AND NOT internal_application
       GROUP BY application_created_date
       ORDER BY application_created_date`,
      [startDate, endDate],
    );
    return rows.map((row) => ({
      day: row.day,
      applications: Number(row.applications),
      screened: Number(row.screened),
      hires: Number(row.hires),
    }));
  }

  /**
   * Per-`source_channel` application/screened/hire counts for the window — backs both
   * "Applications by Source" (top 6 by applications) and "Source Performance Breakdown"
   * (all rows) in the app, which both render `getSourcePerformanceBreakdown`'s output.
   * Same cohort exclusions as `getSummary`. Drops zero-application rows (WP23-159 AC 4.3) and
   * blank channels (AC silent; ticket thread: nulls are stored but excluded from the UI).
   */
  async getBySource(startDate: string, endDate: string): Promise<SourceBreakdown[]> {
    const rows = await this.db.query<SourceBreakdownRawRow>(
      `WITH apps AS (
         SELECT source_channel, is_screened, is_hired
         FROM ${ATS_APPLICATIONS_TABLE}
         WHERE application_created_date BETWEEN $1::date AND $2::date
           AND NOT is_deleted
           AND NOT internal_application
       )
       SELECT
         source_channel,
         COUNT(*)::int AS applications,
         COUNT(*) FILTER (WHERE is_screened)::int AS screened,
         COUNT(*) FILTER (WHERE is_hired)::int AS hires
       FROM apps
       WHERE source_channel IS NOT NULL
         AND source_channel <> ''
       GROUP BY source_channel
       HAVING COUNT(*) > 0
       ORDER BY applications DESC`,
      [startDate, endDate],
    );
    return rows.map((row) => this.mapBreakdownRow(row));
  }

  private mapBreakdownRow(row: SourceBreakdownRawRow): SourceBreakdown {
    return {
      sourceChannel: row.source_channel,
      applications: Number(row.applications),
      screened: Number(row.screened),
      hires: Number(row.hires),
    };
  }

  private mapRow(row: SourceToHireSummaryRow | null): SourceToHireSummary {
    if (!row) {
      return { applications: 0, screened: 0, hires: 0, avgHirePeriodDays: null };
    }
    return {
      applications: Number(row.applications),
      screened: Number(row.screened),
      hires: Number(row.hires),
      avgHirePeriodDays: row.avg_hire_period_days == null ? null : Number(row.avg_hire_period_days),
    };
  }
}
