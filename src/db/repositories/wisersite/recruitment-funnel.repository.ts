import { APPLY_START_EVENT } from '../../../constants/wisersite/recruitment-funnel.constants';
import type { DateWindow } from '../../../types/wisersite/source-to-hire.types';
import type { TenantSqlClient } from '../../wisersite-db-client';
import type {
  ApplyStartSourceRow,
  AtsApplicationRow,
  AtsStageRow,
  FeedSpan,
  GaDailyTotals,
  TrafficSourceRow,
} from './recruitment-funnel.repository.types';

const TRAFFIC = '"analytics"."gold_agg_daily_traffic"';
const CONVERSIONS = '"analytics"."gold_fct_conversions"';
const ATS = '"analytics"."gold_fct_ats_applications"';
const ATS_STAGE = '"analytics"."gold_dim_ats_stage"';

const num = (value: unknown): number => Number(value ?? 0);

/**
 * Independent, SELECT-only read path onto the three warehouse feeds behind the Recruitment
 * Funnel board (/analytics/recruitment-funnel, epic WP23-61): GA4 traffic (Reach = users,
 * Career Site Views = pageviews), GA4 `apply_start` events (Application Started) and ATS
 * applications (Application Submitted → Hired). Feeds per WP23-85 NOTE 2.1's mapping sheet
 * (AC silent on table names: per app `getRecruitmentFunnel.ts`). Returns raw rows; every rule
 * (classification, exclusive stage, shares) lives in `src/expectations/`.
 */
export class RecruitmentFunnelRepository {
  constructor(private readonly db: TenantSqlClient) {}

  /** Users and pageviews per channel group + source, days inside `window` (both inclusive). */
  async getTrafficBySource({ startDate, endDate }: DateWindow): Promise<TrafficSourceRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT default_channel_group AS channel_group, source,
              COALESCE(SUM(users), 0)::bigint AS users,
              COALESCE(SUM(pageviews), 0)::bigint AS pageviews
         FROM ${TRAFFIC}
        WHERE session_date BETWEEN $1::date AND $2::date
        GROUP BY 1, 2`,
      [startDate, endDate],
    );
    return rows.map((row) => ({
      channelGroup: (row.channel_group as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      users: num(row.users),
      pageviews: num(row.pageviews),
    }));
  }

  /** `apply_start` events per channel group + source, event days inside `window`. */
  async getApplyStartsBySource({ startDate, endDate }: DateWindow): Promise<ApplyStartSourceRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT default_channel_group AS channel_group, source, COUNT(*)::bigint AS events
         FROM ${CONVERSIONS}
        WHERE event_date BETWEEN $1::date AND $2::date
          AND event_name = $3
        GROUP BY 1, 2`,
      [startDate, endDate, APPLY_START_EVENT],
    );
    return rows.map((row) => ({
      channelGroup: (row.channel_group as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      events: num(row.events),
    }));
  }

  /**
   * Every non-deleted application created inside `window` (internal ones included: the board
   * counts all applications, WP23-417), with the day each stage was reached, so expectations
   * can place it at the furthest stage reached by any date (WP23-85 AC 5 / NOTE 2.2).
   */
  async getApplications({ startDate, endDate }: DateWindow): Promise<AtsApplicationRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT to_char(application_created_date, 'YYYY-MM-DD') AS created_date,
              source_system, source_type, source_channel,
              furthest_stage_order,
              to_char(reached_in_review_date, 'YYYY-MM-DD') AS reached_in_review_date,
              to_char(reached_interview_date, 'YYYY-MM-DD') AS reached_interview_date,
              to_char(confirmed_observed_date, 'YYYY-MM-DD') AS confirmed_observed_date,
              to_char(reached_hired_date, 'YYYY-MM-DD') AS reached_hired_date,
              to_char(first_observed_date, 'YYYY-MM-DD') AS first_observed_date,
              COALESCE(is_hired, false) AS is_hired
         FROM ${ATS}
        WHERE application_created_date BETWEEN $1::date AND $2::date
          AND NOT is_deleted`,
      [startDate, endDate],
    );
    return rows.map((row) => ({
      createdDate: row.created_date as string,
      sourceSystem: (row.source_system as string | null) ?? null,
      sourceType: (row.source_type as string | null) ?? null,
      sourceChannel: (row.source_channel as string | null) ?? null,
      furthestStageOrder: row.furthest_stage_order === null ? null : num(row.furthest_stage_order),
      reachedInReviewDate: (row.reached_in_review_date as string | null) ?? null,
      reachedInterviewDate: (row.reached_interview_date as string | null) ?? null,
      confirmedObservedDate: (row.confirmed_observed_date as string | null) ?? null,
      reachedHiredDate: (row.reached_hired_date as string | null) ?? null,
      firstObservedDate: (row.first_observed_date as string | null) ?? null,
      isHired: row.is_hired === true,
    }));
  }

  /**
   * Each feed's row count, first and last day and hours since its last load (database clock).
   * Drives which windows are empty, before a feed starts, or after a stale feed stopped
   * (WP23-85 AC 2.1 / 2.3, WP23-358).
   */
  async getFeedSpans(): Promise<FeedSpan[]> {
    const spanSql = (table: string, date: string, where: string) =>
      `SELECT COUNT(*)::bigint AS total_rows,
              to_char(MIN(${date}), 'YYYY-MM-DD') AS first_day,
              to_char(MAX(${date}), 'YYYY-MM-DD') AS last_day,
              EXTRACT(EPOCH FROM (now() - MAX(_loaded_at))) / 3600 AS hours_since_load
         FROM ${table} WHERE ${where}`;
    const feeds = [
      { feed: 'traffic', sql: spanSql(TRAFFIC, 'session_date', 'TRUE'), params: [] },
      {
        feed: 'conversions',
        sql: spanSql(CONVERSIONS, 'event_date', 'event_name = $1'),
        params: [APPLY_START_EVENT],
      },
      { feed: 'ats', sql: spanSql(ATS, 'application_created_date', 'NOT is_deleted'), params: [] },
    ] as const;
    return Promise.all(
      feeds.map(async ({ feed, sql, params }) => {
        const row = await this.db.queryOne<Record<string, unknown>>(sql, [...params]);
        return {
          feed,
          totalRows: num(row?.total_rows),
          firstDay: (row?.first_day as string | null) ?? null,
          lastDay: (row?.last_day as string | null) ?? null,
          hoursSinceLoad:
            row?.hours_since_load === null || row?.hours_since_load === undefined
              ? null
              : num(row.hours_since_load),
        };
      }),
    );
  }

  /** The ATS stage dimension, in display order (WP23-132 AC 1.1.2 stage transitions). */
  async getAtsStages(): Promise<AtsStageRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT stage_order, stage_label, display_order FROM ${ATS_STAGE} ORDER BY display_order`,
    );
    return rows.map((row) => ({
      stageOrder: num(row.stage_order),
      stageLabel: String(row.stage_label),
      displayOrder: num(row.display_order),
    }));
  }

  /** GA4 users and `apply_start` events per day inside `window`, for window searches. */
  async getGaDailyTotals({ startDate, endDate }: DateWindow): Promise<GaDailyTotals[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
              COALESCE((SELECT SUM(users) FROM ${TRAFFIC} t WHERE t.session_date = d::date), 0) AS users,
              (SELECT COUNT(*) FROM ${CONVERSIONS} c
                WHERE c.event_date = d::date AND c.event_name = $3) AS apply_starts
         FROM generate_series($1::date, $2::date, interval '1 day') AS d
        ORDER BY 1`,
      [startDate, endDate, APPLY_START_EVENT],
    );
    return rows.map((row) => ({
      day: row.day as string,
      users: num(row.users),
      applyStarts: num(row.apply_starts),
    }));
  }
}
