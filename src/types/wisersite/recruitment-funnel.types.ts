/**
 * Shapes shared by the Recruitment Funnel page objects, expectations and specs (epic WP23-61).
 */

export type FunnelStageKey =
  | 'reach'
  | 'careerSiteViews'
  | 'applicationStarted'
  | 'applicationSubmitted'
  | 'passedScreening'
  | 'interviewed'
  | 'offerExtended'
  | 'hired';

export type FunnelFeed = 'traffic' | 'conversions' | 'ats';

export type FunnelSourceGroup = 'jobBoards' | 'social' | 'referral' | 'organic' | 'other';

export type FunnelStageDefinition = {
  key: FunnelStageKey;
  label: string;
  category: 'Awareness' | 'Consideration' | 'Evaluation' | 'Decision';
  feed: FunnelFeed;
  atsOrder: number | null;
};

export type HeadlineTileLabel =
  'Overall Conversion' | 'Biggest Drop-off' | 'Best Conversion Source';

export type SourceCounts = Record<FunnelSourceGroup, number>;

/** Whether a feed can answer for a window, and if not why (WP23-85 AC 2.3, WP23-358). */
export type FeedState = 'available' | 'syncing' | 'beforeDataStart' | 'awaitingData';

/** One stage's expected volume, split by source group. */
export type ExpectedStage = {
  key: FunnelStageKey;
  label: string;
  category: string;
  state: FeedState;
  counts: SourceCounts;
  total: number;
  /** The feed's first day, for a `beforeDataStart` stage. */
  dataFrom?: string;
};

/** One row of the funnel's screen-reader table, as text. */
export type FunnelTableRow = {
  stage: string;
  total: string;
  shareOfFirst: string;
  /** Visible source columns, in column order. */
  sources: string[];
};

/** The funnel table: its source column headers and body rows. */
export type FunnelTable = { sourceColumns: string[]; rows: FunnelTableRow[] };

/** The hover summary of one stage, read off its tooltip. */
export type StageHoverReading = {
  category: string;
  stage: string;
  /** "Candidates at stage" figure, or null when the stage shows a note instead. */
  candidates: string | null;
  /** The line under the figure: "x% arrived from …", "Top of funnel — entry point" or "—". */
  arrival: string | null;
  /** The note shown in place of the metrics (zero / no-data stages). */
  note: string | null;
  sources: { source: string; count: string; share: string }[];
  flow: { fromPrevious: string; cumulative: string; drop: string } | null;
};

/** The expected hover summary metrics of one stage with data. */
export type ExpectedStageHover = {
  stage: string;
  candidates: string;
  sources: { source: string; count: string; share: string }[];
};

/** Stage-flow text a stage should show, per the ACs. */
export type ExpectedStageFlow = {
  stage: string;
  /** % arrived from the previous stage; null for Reach (no %). */
  arrived: string | null;
  fromPrevious: string;
  drop: string;
  cumulative: string;
};

/** The summary block of the full stage detail. */
export type StageSummaryReading = {
  candidates: string;
  arrived: string;
  lost: string;
};

/** One source-performance row of the full stage detail. */
export type SourcePerformanceRow = {
  source: string;
  candidates: string;
  share: string;
  toNext: string;
  subSources: { source: string; candidates: string; share: string }[];
};

/** What a headline tile shows; null when the tile is absent. */
export type HeadlineTileReading = { label: string; value: string; caption: string } | null;

/** The weekly conversion chart of the full stage detail. */
export type ConversionChartReading = {
  heading: string;
  weeks: { weekStart: string; percent: string }[];
};
