/**
 * Shapes shared by the Candidate Pipeline page objects, expectations and specs. Date windows and
 * global preset labels are shared with Source to Hire (`source-to-hire.types.ts`).
 */

/** Pipeline Trend's "Comparison" `<select>` option values. */
export type PipelineTrendComparisonValue = 'none' | '3-months' | '6-months' | '12-months';

/** Inclusive month span as `YYYY-MM-01` keys. */
export type MonthWindow = { startMonth: string; endMonth: string };

/**
 * A line chart's accessible table: `{ [monthKey]: { [seriesLabel]: value | null } }`, where
 * `null` is a "No data" cell.
 */
export type MonthlySeriesTable = Record<string, Record<string, number | null>>;

/** One category of the Rejection Reasons donut, as listed in its accessible table. */
export type RejectionCategoryReading = { category: string; share: string; value: string };

/** What the Rejection Reasons donut shows at rest: the centre total and each category. */
export type RejectionReasonsReading = {
  total: string;
  categories: RejectionCategoryReading[];
};

/** The donut's centre readout while a segment is hovered: count, then "share · name". */
export type CentreReadout = { value: string; caption: string };

/** Whether an item is drawn at full strength or greyed out (by its rendered opacity). */
export type EmphasisBand = 'full' | 'greyed';

/** The emphasis of every donut segment and legend row, in legend order. */
export type DonutEmphasis = { segments: EmphasisBand[]; legendRows: EmphasisBand[] };

/** Pipeline by Source column headers (WP23-198 AC 2.1). */
export type PipelineBySourceColumn =
  | 'Source'
  | 'Applied'
  | 'Screening'
  | 'Stage 1 interview'
  | 'Offered'
  | 'Confirmed'
  | 'Rejected'
  | 'Conv. rate';

/** One Pipeline by Source row as displayed: the source name, then each column's text. */
export type PipelineBySourceDisplayRow = string[];

/** The whole table as displayed: body rows in order, and the footer's Total row. */
export type PipelineBySourceReading = {
  rows: PipelineBySourceDisplayRow[];
  total: PipelineBySourceDisplayRow | null;
};

/** `aria-sort` of each column header, by label. */
export type ColumnSortState = Record<string, string | null>;
