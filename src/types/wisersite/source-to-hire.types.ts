/**
 * Shapes shared by the Source to Hire page objects, expectations and specs. Kept apart from the
 * page objects so a spec or an expectation can name a type without importing a page class.
 */

export type DateWindow = { startDate: string; endDate: string };

/** The global date filter's presets, by their visible button label. */
export type GlobalPresetLabel =
  'Last 30 days' | 'Last 3 months' | 'Last 6 months' | 'Last 12 months';

/** A widget's own "Time period" `<select>` option values. */
export type WidgetPresetValue =
  'match-global' | 'last-30-days' | 'last-3-months' | 'last-6-months' | 'last-12-months';

/** Hires Trend by Source's "Comparison" `<select>` option values. */
export type HiresTrendComparisonValue = 'none' | '3-months' | '6-months' | '12-months';

export type SourcePerformanceColumn =
  'Source' | 'Application total' | 'Screened applications' | 'Total hires' | 'Conversion rate';

export type SummaryTileLabel =
  'Total Applications' | 'Total Screened' | 'Total Hires' | 'Average Hire Period';

/** One row of the "Applications by Source" bar list or "Source Performance Breakdown" table. */
export type SourceRow = {
  source: string;
  applications: number;
  screened?: number;
  hires?: number;
  /** Whichever percentage label the widget shows — "Hire rate" or "Conversion rate". */
  rateLabel: string;
};

/** The painted bars of one Applications by Source row (applications, then screens on top). */
export type ApplicationsBySourceBars = {
  source: string;
  /** `--bar-color` / `--bar-width` of each fill, in DOM (series) order. */
  fills: { color: string | null; width: number }[];
};

/** One Hire Distribution donut segment, as listed in its accessible table. */
export type HireDistributionSegment = { source: string; share: string; hires: number };

/** What one summary KPI tile is showing, read straight off the DOM. */
export type SummaryTileReading = {
  label: string;
  value: string;
  delta: { direction: string; value: string } | null;
  comparisonLabel: string | null;
  sparklineLabel: string | null;
  /** The delta badge's tone (green / red / white), or `null` when there is no badge. */
  tone: 'positive' | 'negative' | 'neutral' | null;
};

/** The Hires Trend chart's accessible table: `{ [month]: { [seriesLabel]: hires | null } }`. */
export type HiresByMonthTable = Record<string, Record<string, number | null>>;
