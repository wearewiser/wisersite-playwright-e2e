import type { FunnelFeed } from '../../../types/wisersite/recruitment-funnel.types';

/** GA4 traffic for one channel group + source over a window. */
export type TrafficSourceRow = {
  channelGroup: string | null;
  source: string | null;
  users: number;
  pageviews: number;
};

/** `apply_start` events for one channel group + source over a window. */
export type ApplyStartSourceRow = {
  channelGroup: string | null;
  source: string | null;
  events: number;
};

/** One non-deleted ATS application created in a window, with the dates its stages were reached. */
export type AtsApplicationRow = {
  createdDate: string;
  sourceSystem: string | null;
  sourceType: string | null;
  sourceChannel: string | null;
  furthestStageOrder: number | null;
  reachedInReviewDate: string | null;
  reachedInterviewDate: string | null;
  confirmedObservedDate: string | null;
  reachedHiredDate: string | null;
  firstObservedDate: string | null;
  isHired: boolean;
};

/** A feed's span and last load, as the warehouse holds it. */
export type FeedSpan = {
  feed: FunnelFeed;
  totalRows: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Hours since the feed's latest `_loaded_at`, on the database clock; null when never loaded. */
  hoursSinceLoad: number | null;
};

/** A row of `gold_dim_ats_stage`. */
export type AtsStageRow = { stageOrder: number; stageLabel: string; displayOrder: number };

/** Per-day totals of the two GA4 feeds, for window searches. */
export type GaDailyTotals = { day: string; users: number; applyStarts: number };
