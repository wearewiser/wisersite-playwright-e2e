import type { TenantSqlClient } from '../../wisersite-db-client';
import type {
  DailyRejections,
  DailyStatusVolumes,
  MonthlyRejectionCap,
  PipelineSourceCounts,
  RejectionsInWindow,
} from './candidate-pipeline.repository.types';

const ATS_APPLICATIONS_TABLE = '"analytics"."gold_fct_ats_applications"';
const ATS_STAGE_TABLE = '"analytics"."gold_dim_ats_stage"';
const ATS_DAILY_STATUS_TABLE = '"analytics"."gold_agg_ats_daily_status_volumes"';

/** Bigint / numeric columns arrive as strings from `pg`. */
const toInt = (value: unknown): number => Number(value ?? 0);

/**
 * Independent, SELECT-only read path onto the warehouse for the Candidate Pipeline board
 * (/analytics/candidate-pipeline, epic WP23-65). Written from scratch on its own connection;
 * where the tickets are silent on which column or cohort to use, each method says so.
 */
export class CandidatePipelineRepository {
  constructor(private readonly db: TenantSqlClient) {}

  /**
   * WP23-93 AC 1.1: applied / rejected / confirmed per day in `startDate..endDate` (both
   * inclusive), only days that have any row (a day of zeros is 0, a day with no row is "no
   * data"). The ticket doesn't name the measures: D-5 (daily `*_observed` status counts; AC
   * silent: per app `getPipelineTrend.ts:40`). Every source channel is summed, "Internal"
   * included (D-6, settled by WP23-417: "applications" means all applications, Pipeline Trend
   * included). The specs bucket these by week or by month.
   */
  async getDailyStatusVolumes(startDate: string, endDate: string): Promise<DailyStatusVolumes[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT
         to_char(activity_date, 'YYYY-MM-DD') AS day,
         SUM(applied_observed) AS applied,
         SUM(rejected_observed) AS rejected,
         SUM(confirmed_observed) AS confirmed
       FROM ${ATS_DAILY_STATUS_TABLE}
       WHERE activity_date BETWEEN $1::date AND $2::date
       GROUP BY 1
       ORDER BY 1`,
      [startDate, endDate],
    );
    return rows.map((row) => ({
      day: String(row.day),
      applied: toInt(row.applied),
      rejected: toInt(row.rejected),
      confirmed: toInt(row.confirmed),
    }));
  }

  /**
   * WP23-93 AC 1.3.1: the first day the chart's data has any row — the history a comparison can
   * reach back to. The chart loads the last 36 months only, so that is the floor (AC silent on
   * "sufficient history": per app `getPipelineTrend.ts:43`). `null` when there is none.
   */
  async getFirstStatusVolumeDay(): Promise<string | null> {
    const row = await this.db.queryOne<{ first_day: string | null }>(
      `SELECT to_char(MIN(activity_date), 'YYYY-MM-DD') AS first_day
       FROM ${ATS_DAILY_STATUS_TABLE}
       WHERE activity_date >= (CURRENT_DATE - INTERVAL '36 months')`,
    );
    return row?.first_day ?? null;
  }

  /**
   * WP23-94 AC 1.1 / 1.1.1: the period's rejections, by the rule in the WP23-328 thread (27 Oct
   * 2026, settling D-2): applications created in `startDate..endDate` (both inclusive) and
   * rejected by the window's end (`rejected_observed_date <= endDate`), the same cohort as
   * Pipeline by Source's Rejected column. `total` counts every one; `byReason` only non-blank
   * reason buckets. Deleted applications are left out; internal ones count (WP23-417).
   */
  async getRejectionsInWindow(startDate: string, endDate: string): Promise<RejectionsInWindow> {
    const rows = await this.db.query<{ category: string | null; rejections: string }>(
      `SELECT NULLIF(btrim(rejection_reason_bucket), '') AS category, COUNT(*) AS rejections
       FROM ${ATS_APPLICATIONS_TABLE}
       WHERE is_rejected
         AND NOT is_deleted
         AND application_created_date BETWEEN $1::date AND $2::date
         AND rejected_observed_date <= $2::date
       GROUP BY 1`,
      [startDate, endDate],
    );
    return {
      total: rows.reduce((sum, row) => sum + toInt(row.rejections), 0),
      byReason: rows
        .filter((row) => row.category !== null)
        .map((row) => ({ category: row.category!, rejections: toInt(row.rejections) })),
    };
  }

  /**
   * Every calendar month fully in the past, newest first: its rejected applications split by
   * whether they were rejected by the month's end. Lets a test pick a past window where the
   * WP23-328 rule ("rejected by the window's end") changes the result.
   */
  async getMonthlyRejectionCap(): Promise<MonthlyRejectionCap[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `WITH apps AS (
         SELECT
           date_trunc('month', application_created_date)::date AS month,
           (date_trunc('month', application_created_date) + INTERVAL '1 month - 1 day')::date
             AS month_end,
           rejected_observed_date
         FROM ${ATS_APPLICATIONS_TABLE}
         WHERE is_rejected
           AND NOT is_deleted
           AND application_created_date < date_trunc('month', CURRENT_DATE)
       )
       SELECT
         to_char(month, 'YYYY-MM-DD') AS month,
         COUNT(*) FILTER (WHERE rejected_observed_date <= month_end) AS by_month_end,
         COUNT(*) FILTER (WHERE rejected_observed_date > month_end) AS after_month_end
       FROM apps
       GROUP BY month
       ORDER BY month DESC`,
    );
    return rows.map((row) => ({
      month: String(row.month),
      byMonthEnd: toInt(row.by_month_end),
      afterMonthEnd: toInt(row.after_month_end),
    }));
  }

  /**
   * Rejected applications per day, by rejection date and by application date. A window whose
   * days all have `byApplicationDate` 0 has no rejections under the WP23-328 rule (applications
   * created in the window and rejected by its end).
   */
  async getDailyRejections(): Promise<DailyRejections[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `WITH by_rejection AS (
         SELECT rejected_observed_date AS day, COUNT(*) AS n
         FROM ${ATS_APPLICATIONS_TABLE}
         WHERE is_rejected AND NOT is_deleted AND rejected_observed_date IS NOT NULL
         GROUP BY 1
       ), by_application AS (
         SELECT application_created_date AS day, COUNT(*) AS n
         FROM ${ATS_APPLICATIONS_TABLE}
         WHERE is_rejected AND NOT is_deleted
         GROUP BY 1
       )
       SELECT to_char(COALESCE(r.day, a.day), 'YYYY-MM-DD') AS day,
              COALESCE(r.n, 0) AS by_rejection_date,
              COALESCE(a.n, 0) AS by_application_date
       FROM by_rejection r FULL OUTER JOIN by_application a ON a.day = r.day
       ORDER BY 1`,
    );
    return rows.map((row) => ({
      day: String(row.day),
      byRejectionDate: toInt(row.by_rejection_date),
      byApplicationDate: toInt(row.by_application_date),
    }));
  }

  /**
   * WP23-198 AC 2.1.1–2.1.8 per source channel over `startDate..endDate` (application created
   * date, both inclusive), cohort: not deleted, non-blank channel, internal applications
   * included (WP23-417: "applications" means all applications, Pipeline by Source included).
   * Counted as each application stood at the window's end (WP23-442 option B, applied to this
   * table by WP23-521): an application first recorded after `endDate` is left out, and a stage
   * counts only if it was reached by `endDate` (each stage's reach date; Offer's is
   * `confirmed_observed_date`, AC silent: per app `atsApplications.ts` `stageAsOfSql`). For a
   * window ending today this is the same as counting to today.
   * - applications: every application (AC 2.1.1)
   * - screened: the warehouse's own `is_screened` flag, screened by the end (AC 2.1.2)
   * - stage 1 interview / offered: reached the "Interview" / "Offer" stage or beyond (AC 2.1.3,
   *   2.1.5; the stage model has one Interview stage, D-8)
   * - confirmed: hired (D-7: offered and confirmed are separate ACs; AC silent: per app
   *   `getPipelineBySource.ts:67`)
   * - rejected: `is_rejected`, rejected by the window's end (AC 2.1.7; same cohort as Rejection
   *   Reasons, WP23-328 thread)
   */
  async getPipelineBySource(startDate: string, endDate: string): Promise<PipelineSourceCounts[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `WITH stage AS (
         SELECT
           MIN(stage_order) FILTER (WHERE stage_label = 'Interview') AS interview,
           MIN(stage_order) FILTER (WHERE stage_label = 'Offer') AS offer
         FROM ${ATS_STAGE_TABLE}
       )
       SELECT
         a.source_channel AS source,
         COUNT(*) AS applications,
         COUNT(*) FILTER (
           WHERE a.is_screened AND a.reached_in_review_date <= $2::date
         ) AS screened,
         COUNT(*) FILTER (
           WHERE a.furthest_stage_order >= s.interview AND a.reached_interview_date <= $2::date
         ) AS stage1_interview,
         COUNT(*) FILTER (
           WHERE a.furthest_stage_order >= s.offer AND a.confirmed_observed_date <= $2::date
         ) AS offered,
         COUNT(*) FILTER (WHERE a.is_hired AND a.reached_hired_date <= $2::date) AS confirmed,
         COUNT(*) FILTER (WHERE a.is_rejected AND a.rejected_observed_date <= $2::date) AS rejected
       FROM ${ATS_APPLICATIONS_TABLE} a CROSS JOIN stage s
       WHERE a.application_created_date BETWEEN $1::date AND $2::date
         AND a.first_observed_date <= $2::date
         AND NOT a.is_deleted
         AND btrim(COALESCE(a.source_channel, '')) <> ''
       GROUP BY a.source_channel`,
      [startDate, endDate],
    );
    return rows.map((row) => ({
      source: String(row.source),
      applications: toInt(row.applications),
      screened: toInt(row.screened),
      stage1Interview: toInt(row.stage1_interview),
      offered: toInt(row.offered),
      confirmed: toInt(row.confirmed),
      rejected: toInt(row.rejected),
    }));
  }
}
