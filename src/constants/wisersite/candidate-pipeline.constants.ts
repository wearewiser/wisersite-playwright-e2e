import type {
  PipelineBySourceColumn,
  PipelineTrendComparisonValue,
} from '../../types/wisersite/candidate-pipeline.types';
import type { WidgetPresetValue } from '../../types/wisersite/source-to-hire.types';

/** The board's route, relative to `WISERSITE_BASE_URL`. */
export const CANDIDATE_PIPELINE_PATH = '/analytics/candidate-pipeline';

/**
 * The board's `<h1>` (per the design, WP23-188) and its sidebar entry under Analytics. The
 * sidebar and breadcrumb keep the shorter "Pipeline".
 */
export const CANDIDATE_PIPELINE_HEADING = 'Candidate Pipeline';
export const CANDIDATE_PIPELINE_NAV = { group: 'Analytics', link: 'Pipeline' } as const;

/** Widget headings (level 3). */
export const PIPELINE_WIDGET_HEADINGS = {
  pipelineTrend: 'Pipeline Trend',
  rejectionReasons: 'Rejection Reasons',
  pipelineBySource: 'Pipeline by Source',
} as const;

/** `/api/widgets/:key` of each widget. */
export const PIPELINE_WIDGET_KEYS = {
  pipelineTrend: 'pipelineTrend',
  rejectionReasons: 'rejectionReasons',
  pipelineBySource: 'pipelineBySource',
} as const;

/**
 * WP23-93 AC 1.2 as changed after the ticket (PO, 2026-10-21): the chart's own "Time period"
 * options, in order, the first being the default. They replace the ticket's Month / Quarter /
 * 6 month timescales. Each "Last …" option covers the same dates as the page preset with the same
 * label (WP23-419).
 */
export const PIPELINE_TREND_TIME_PERIODS: readonly {
  value: WidgetPresetValue;
  label: string;
}[] = [
  { value: 'match-global', label: 'Match Global Date Picker' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-6-months', label: 'Last 6 months' },
  { value: 'last-12-months', label: 'Last 12 months' },
];

/** Days per point when the chart plots weeks ("Last 30 days": W1 … W5, the last one shorter). */
export const PIPELINE_TREND_WEEK_LENGTH_DAYS = 7;

/** The trend's own "Time period" value that follows the global filter (the app's default). */
export const MATCH_GLOBAL_PERIOD = 'match-global';

/**
 * WP23-93 AC 1.3 comparison options. Labels are the app's copy, which words the AC's
 * "vs 3, 6, or 12 months previous" differently (D-4, PO to confirm).
 */
export const PIPELINE_TREND_COMPARISONS: readonly {
  value: PipelineTrendComparisonValue;
  label: string;
  months: 3 | 6 | 12 | null;
}[] = [
  { value: 'none', label: 'No comparison', months: null },
  { value: '3-months', label: 'Compare 3 months', months: 3 },
  { value: '6-months', label: 'Compare 6 months', months: 6 },
  { value: '12-months', label: 'Compare 12 months', months: 12 },
];

/** WP23-93 AC 1.1: the three series the chart plots, by legend / column label. */
export const PIPELINE_TREND_SERIES = ['Applied', 'Rejected', 'Confirmed'] as const;

/** Suffix the chart adds to a comparison series' label, e.g. "Applied (prior)". */
export const PRIOR_SERIES_SUFFIX = ' (prior)';

/** Caption that names the trend chart's screen-reader table ("Candidates by Month. …"). */
export const PIPELINE_TREND_TABLE_CAPTION = 'Candidates by';

/** Copy shown by the trend when nothing in the window has data. */
export const PIPELINE_TREND_EMPTY_MESSAGE = 'No data for this period';

/** WP23-94 AC 1.1.2.2 ("no data"): the rejection donut's empty state (copy since WP23-328). */
export const REJECTION_REASONS_EMPTY_MESSAGE = 'No data for this period';

/** Caption under the rejection donut's resting centre total. */
export const REJECTION_REASONS_TOTAL_CAPTION = 'rejections';

/** WP23-94 AC 1.1.2 / WP23-198 AC 2.1: at most this many categories / sources. */
export const PIPELINE_TOP_N = 6;

/**
 * WP23-198 AC 2.1.1–2.1.8 columns, in AC order, by the app's header labels. The AC's "stage 2
 * interview" (AC 2.1.4) has no column (D-8; accepted as E2E-2026-10-21 D-2, not tested).
 */
export const PIPELINE_BY_SOURCE_COLUMNS: readonly PipelineBySourceColumn[] = [
  'Source',
  'Applied',
  'Screening',
  'Stage 1 interview',
  'Offered',
  'Confirmed',
  'Rejected',
  'Conv. rate',
];

/** The Pipeline by Source filter: its "all" option and the message when nothing matches. */
export const ALL_SOURCES_LABEL = 'All Sources';
export const NO_FILTER_RESULTS_MESSAGE = 'No results match your filters';

/** Label of the summary row in the table footer. */
export const TOTAL_ROW_LABEL = 'Total';
