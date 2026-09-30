import type { TenantSqlClient } from '../../wisersite-db-client';
import type {
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
   * Per-`source_channel` application/screened/hire counts for the window — backs both
   * "Applications by Source" (top 6 by applications) and "Source Performance Breakdown"
   * (all rows) in the app, which both render `getSourcePerformanceBreakdown`'s output.
   * Same cohort exclusions as `getSummary`; drops blank channels and zero-application rows,
   * same as the app's `shapeSourcePerformanceBreakdown`.
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
    const applications = Number(row.applications);
    const hires = Number(row.hires);
    const hireRate = applications > 0 ? (hires / applications) * 100 : 0;
    return {
      sourceChannel: row.source_channel,
      applications,
      screened: Number(row.screened),
      hires,
      hireRateLabel: `${hireRate.toFixed(1)}%`,
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
