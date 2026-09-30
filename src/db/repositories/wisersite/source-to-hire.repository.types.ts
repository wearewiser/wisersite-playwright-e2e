/** Raw shape of one row from the Source to Hire summary query, before mapping. */
export type SourceToHireSummaryRow = {
  applications: number;
  screened: number;
  hires: number;
  avg_hire_period_days: number | string | null;
};

/** Domain shape returned by SourceToHireRepository — mirrors the UI's four KPI tiles. */
export type SourceToHireSummary = {
  applications: number;
  screened: number;
  hires: number;
  avgHirePeriodDays: number | null;
};

/** Raw shape of one row from the per-source-channel breakdown query, before mapping. */
export type SourceBreakdownRawRow = {
  source_channel: string;
  applications: number;
  screened: number;
  hires: number;
};

/**
 * Domain shape shared by the UI's "Applications by Source" bar list and "Source Performance
 * Breakdown" table — both widgets render the exact same underlying query
 * (`getSourcePerformanceBreakdown`) in the app, just as two different views.
 */
export type SourceBreakdown = {
  sourceChannel: string;
  applications: number;
  screened: number;
  hires: number;
  /** `hires / applications * 100`, formatted like the UI: one decimal place + '%'. */
  hireRateLabel: string;
};
