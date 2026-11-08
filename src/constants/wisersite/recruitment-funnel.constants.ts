import type {
  FunnelFeed,
  FunnelSourceGroup,
  FunnelStageDefinition,
  HeadlineTileLabel,
} from '../../types/wisersite/recruitment-funnel.types';

/** The board's route, relative to `WISERSITE_BASE_URL`. */
export const RECRUITMENT_FUNNEL_PATH = '/analytics/recruitment-funnel';

/** The board's `<h1>`. */
export const RECRUITMENT_FUNNEL_HEADING = 'Funnel Data';

/** The funnel widget's `<h3>` (its accessible name also carries the "About this chart" button). */
export const FUNNEL_WIDGET_HEADING = 'Recruitment Funnel';

/** Accessible name of the funnel's screen-reader table. */
export const FUNNEL_TABLE_NAME = 'Recruitment funnel by stage and source';

/** Widget keys of `/api/widgets/:key` on this board. */
export const FUNNEL_WIDGET_KEYS = {
  funnel: 'funnelRecruitment',
  overallConversion: 'funnelOverallConversion',
  biggestDropOff: 'funnelBiggestDropOff',
  bestConversionSource: 'funnelBestConversionSource',
} as const;

/**
 * WP23-85 AC 1.1.1–1.1.8 stages in funnel order and WP23-86 AC 1.1 categories (awareness,
 * consideration, evaluation, decision), with the feed each is counted from (AC silent on feeds:
 * per app `src/widgets/RecruitmentFunnel/stages.ts`, and the ticket's mapping sheet). Labels are
 * the app's Title Case of the AC's names. `atsOrder` is the ATS stage order
 * (`gold_dim_ats_stage.stage_order`) an ATS stage maps to.
 */
export const FUNNEL_STAGES: readonly FunnelStageDefinition[] = [
  { key: 'reach', label: 'Reach', category: 'Awareness', feed: 'traffic', atsOrder: null },
  {
    key: 'careerSiteViews',
    label: 'Career Site Views',
    category: 'Awareness',
    feed: 'traffic',
    atsOrder: null,
  },
  {
    key: 'applicationStarted',
    label: 'Application Started',
    category: 'Consideration',
    feed: 'conversions',
    atsOrder: null,
  },
  {
    key: 'applicationSubmitted',
    label: 'Application Submitted',
    category: 'Consideration',
    feed: 'ats',
    atsOrder: 1,
  },
  {
    key: 'passedScreening',
    label: 'Passed Screening',
    category: 'Evaluation',
    feed: 'ats',
    atsOrder: 2,
  },
  { key: 'interviewed', label: 'Interviewed', category: 'Evaluation', feed: 'ats', atsOrder: 3 },
  {
    key: 'offerExtended',
    label: 'Offer Extended',
    category: 'Decision',
    feed: 'ats',
    atsOrder: 4,
  },
  { key: 'hired', label: 'Hired', category: 'Decision', feed: 'ats', atsOrder: 5 },
];

/** WP23-85 AC 1.2.1–1.2.4: the four charted sources, by chip label, in key order. */
export const CHARTED_SOURCES: readonly {
  group: Exclude<FunnelSourceGroup, 'other'>;
  label: string;
}[] = [
  { group: 'jobBoards', label: 'Job Boards' },
  { group: 'social', label: 'Social' },
  { group: 'referral', label: 'Referral' },
  { group: 'organic', label: 'Organic' },
];

/** Every source group a stage total is made of: the four charted ones plus Other (D-15). */
export const ALL_SOURCE_GROUPS: readonly FunnelSourceGroup[] = [
  'jobBoards',
  'social',
  'referral',
  'organic',
  'other',
];

/** Accessible name of the source chips group (WP23-307). */
export const SOURCE_FILTER_GROUP_NAME = 'Filter by source';

/** The headline tiles (WP23-132 AC 1.1.1–1.1.3), by their visible label. */
export const HEADLINE_TILE_LABELS: readonly HeadlineTileLabel[] = [
  'Overall Conversion',
  'Biggest Drop-off',
  'Best Conversion Source',
];

/** The GA4 event Application Started counts (AC silent: per app `getRecruitmentFunnel.ts`). */
export const APPLY_START_EVENT = 'apply_start';

/**
 * A feed with no load for this long and nothing in the window is "re-syncing", not zero
 * (WP23-85 AC 2.3; AC silent on the threshold: per app `getRecruitmentFunnel.ts` STALE_AFTER_HOURS).
 */
export const STALE_FEED_HOURS = 48;

/**
 * Smallest cohort a stage transition or source may win a headline tile from (WP23-132; AC silent:
 * per app `src/widgets/funnel/minCohort.ts`).
 */
export const HEADLINE_MIN_COHORT = 10;

/** Weeks in the full stage detail's conversion chart (WP23-295 AC 6.1). */
export const CONVERSION_CHART_WEEKS = 8;

/** Individual sources listed per category before the rest fold into one row (AC silent: per app). */
export const MAX_SUB_SOURCES = 5;
export const OTHER_SUB_SOURCES_LABEL = 'Other sources';

/**
 * App copy for stage states and banners. The tickets give no wording except WP23-86 AC 6 ("No
 * data for this period", D-12) and AC 2.1.1's "prompting the user to widen the date range";
 * the rest is the app's (AC silent), agreed in WP23-354 / WP23-358.
 */
export const FUNNEL_COPY = {
  /** WP23-86 AC 6's required wording for a stage with no candidates (D-12). */
  noDataForPeriod: 'No data for this period',
  noValue: '—',
  noDataNote: 'No data',
  zeroNote: 'None at stage',
  zeroDetail: 'Nobody reached this stage in these dates.',
  syncingDetail: 'Data unavailable while we re-sync this stage.',
  syncingBannerTitle: 'We’re just catching up',
  widenBannerBody:
    'There is not enough data in this date range to display the funnel. Widen the date range to view it.',
  defaultCaption:
    'Ribbon thickness is volume at each stage, split into bands by source. Click a source in the key to filter; hover a stage to magnify it, click to pin its full detail.',
  /** Shown on the pinned stage's header in place of "Explore" (WP23-86 AC 2.1). */
  pinnedMarker: 'Pinned',
  firstStageArrival: 'Top of funnel — entry point',
} as const;

/** Each feed's name in the "… data starts on <date>." sentence (WP23-358; app copy). */
export const FEED_DATA_NAME: Record<FunnelFeed, string> = {
  traffic: 'Website traffic',
  conversions: 'Application tracking',
  ats: 'ATS',
};

/**
 * How far the page clock is stepped after a hover before asserting no hover panel appeared: well
 * past the funnel's hover-intent delay (AC silent: per app `RibbonFunnel.tsx` HOVER_INTENT_MS,
 * 50 ms), so an "absent" check runs after the panel would have shown.
 */
export const HOVER_SETTLE_MS = 500;

/** How long a widget's fetch may take to render after the board changes. */
export const FUNNEL_WIDGET_TIMEOUT_MS = 20_000;

/** Custom ranges the picker accepts (AC silent: per app `validateCustomDateRange.ts`). */
export const MIN_CUSTOM_RANGE_DAYS = 7;

/** How far back the window searches look for a window with the data a scenario needs. */
export const WINDOW_SEARCH_DAYS = 400;
