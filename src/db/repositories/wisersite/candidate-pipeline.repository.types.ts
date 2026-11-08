/** Pipeline status volumes summed over one day (`day` = `YYYY-MM-DD`). */
export type DailyStatusVolumes = {
  day: string;
  applied: number;
  rejected: number;
  confirmed: number;
};

/** Rejections in a window for one reason bucket. */
export type RejectionReasonCount = { category: string; rejections: number };

/** Rejections in a window: every rejection, and the ones with a reason bucket, by bucket. */
export type RejectionsInWindow = { total: number; byReason: RejectionReasonCount[] };

/** Rejected applications per day, dated two ways (the ticket doesn't say which, D-2). */
export type DailyRejections = { day: string; byRejectionDate: number; byApplicationDate: number };

/** One source channel's pipeline counts over a window (WP23-198 AC 2.1). */
export type PipelineSourceCounts = {
  source: string;
  applications: number;
  screened: number;
  stage1Interview: number;
  offered: number;
  confirmed: number;
  rejected: number;
};

/**
 * Rejected applications created in one past calendar month (`month` = `YYYY-MM-01`), split by
 * whether they were rejected by the month's end or after it.
 */
export type MonthlyRejectionCap = { month: string; byMonthEnd: number; afterMonthEnd: number };
