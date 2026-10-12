import type {
  GlobalPresetLabel,
  HiresTrendComparisonValue,
  SourcePerformanceColumn,
  SummaryTileLabel,
  WidgetPresetValue,
} from '../../types/wisersite/source-to-hire.types';

/** The board's route, relative to `WISERSITE_BASE_URL`. */
export const SOURCE_TO_HIRE_PATH = '/analytics/source-to-hire';

/** Widget headings — also the `/api/widgets/:key` each one fetches. */
export const WIDGET_HEADINGS = {
  applicationsBySource: 'Applications by Source',
  hireDistribution: 'Hire Distribution',
  hiresTrendBySource: 'Hires Trend by Source',
  sourcePerformanceBreakdown: 'Source Performance Breakdown',
} as const;

export const GLOBAL_PRESETS: readonly GlobalPresetLabel[] = [
  'Last 30 days',
  'Last 3 months',
  'Last 6 months',
  'Last 12 months',
];

export const SUMMARY_TILE_LABELS: readonly SummaryTileLabel[] = [
  'Total Applications',
  'Total Screened',
  'Total Hires',
  'Average Hire Period',
];

/** A widget's own "Time period" options, value -> visible label (WP23-158 / WP23-159 AC 1). */
export const WIDGET_TIME_PERIODS: readonly { value: WidgetPresetValue; label: string }[] = [
  { value: 'match-global', label: 'Match Global Date Picker' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-6-months', label: 'Last 6 months' },
  { value: 'last-12-months', label: 'Last 12 months' },
];

/** Hires Trend by Source's comparison options (WP23-158 AC 3). */
export const HIRES_TREND_COMPARISONS: readonly {
  value: HiresTrendComparisonValue;
  label: string;
  months: 3 | 6 | 12 | null;
}[] = [
  { value: 'none', label: 'No comparison', months: null },
  { value: '3-months', label: 'Compare 3 months', months: 3 },
  { value: '6-months', label: 'Compare 6 months', months: 6 },
  { value: '12-months', label: 'Compare 12 months', months: 12 },
];

export const SOURCE_PERFORMANCE_COLUMNS: readonly SourcePerformanceColumn[] = [
  'Source',
  'Application total',
  'Screened applications',
  'Total hires',
  'Conversion rate',
];

/** Empty-state copy shown by the chart widgets, and by Source Performance Breakdown. */
export const NO_DATA_MESSAGE = 'No data for this period';
export const NO_SOURCE_DATA_MESSAGE = 'No source data for this period';

/** Loading placeholder every summary tile shows until its data arrives. */
export const LOADING_PLACEHOLDER = '—';

/** How long a widget's own fetch may take to render after the board changes. */
export const WIDGET_TIMEOUT_MS = 15_000;

/** Next.js dev mode compiles a route on its first hit — far slower than a normal load. */
export const FIRST_LOAD_TIMEOUT_MS = 45_000;
