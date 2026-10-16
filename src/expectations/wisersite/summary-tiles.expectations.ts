import type { SourceToHireRepository } from '../../db/repositories/wisersite/source-to-hire.repository';
import type {
  DataSpan,
  SourceToHireSummary,
} from '../../db/repositories/wisersite/source-to-hire.repository.types';
import type { DateWindow, SummaryTileReading } from '../../types/wisersite/source-to-hire.types';
import { formatLocaleCount } from '../../utils/format/locale-number';
import { previousWindow } from '../../utils/wisersite/date-window';

/**
 * Independent oracle for what each Source to Hire summary tile should show (WP23-87), built
 * from the ticket's rule sheet rather than imported from the plugin:
 *
 * | Metric              | Logic rule          | Red      | Neutral    | Green    |
 * | ------------------- | ------------------- | -------- | ---------- | -------- |
 * | Total Applications  | higher = better     | < 0%     | 0–10%      | > 10%    |
 * | Total Screened      | higher = better     | < 0%     | 0–10%      | > 10%    |
 * | Total Hires         | higher = better     | < 0%     | 0–10%      | > 10%    |
 * | Average Hire Period | lower = better      | > 5%     | -5% to +5% | < -5%    |
 *
 * plus AC 5: no comparison unless both the selected window and the one before it are fully
 * inside the tenant's data (first to last application in the warehouse), and "no change"
 * reads as `0%` in the neutral band.
 */

export type TrendState = 'positive' | 'negative' | 'neutral' | 'falsePositive' | 'falseNegative';

export type SummaryTileKey = 'applications' | 'screened' | 'hires' | 'avgHirePeriod';

export type ExpectedTile = {
  key: SummaryTileKey;
  label: string;
  value: string;
  /** `null` when no delta badge should render at all (no comparison / undefined %). */
  delta: { direction: 'Up' | 'Down' | 'No change'; value: string } | null;
  comparisonLabel: string | null;
  trendState: TrendState;
};

export const SUMMARY_TILES: { key: SummaryTileKey; label: string; higherIsBetter: boolean }[] = [
  { key: 'applications', label: 'Total Applications', higherIsBetter: true },
  { key: 'screened', label: 'Total Screened', higherIsBetter: true },
  { key: 'hires', label: 'Total Hires', higherIsBetter: true },
  { key: 'avgHirePeriod', label: 'Average Hire Period', higherIsBetter: false },
];

/** The sparkline's accessible name for each state — the "graph" half of AC 3. */
export const SPARKLINE_LABEL: Record<TrendState, string> = {
  positive: 'KPI bar sparkline — Value rises, rising is good',
  negative: 'KPI bar sparkline — Value falls, rising is good',
  falsePositive: 'KPI bar sparkline — Value rises, but rising is bad',
  falseNegative: 'KPI bar sparkline — Value falls, and falling is good',
  neutral: 'KPI bar sparkline — No meaningful movement',
};

/** Green / red / white per AC 3 — false-negative is good (green), false-positive bad (red). */
export const TREND_TONE: Record<TrendState, 'positive' | 'negative' | 'neutral'> = {
  positive: 'positive',
  falseNegative: 'positive',
  negative: 'negative',
  falsePositive: 'negative',
  neutral: 'neutral',
};

/** AC 2's caption wording, keyed by whichever global preset (or custom range) is active. */
export const COMPARISON_LABEL = {
  'Last 30 days': 'vs previous 30 days',
  'Last 3 months': 'vs previous 3 months',
  'Last 6 months': 'vs previous 6 months',
  'Last 12 months': 'vs previous 12 months',
  custom: 'vs previous period',
} as const;

export type ComparisonPreset = keyof typeof COMPARISON_LABEL;

function read(counts: SourceToHireSummary, key: SummaryTileKey): number | null {
  return key === 'avgHirePeriod' ? counts.avgHirePeriodDays : counts[key];
}

function formatValue(key: SummaryTileKey, value: number | null): string {
  if (value == null) return '—';
  if (key !== 'avgHirePeriod') return formatLocaleCount(value);
  const rounded = Math.round(value);
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

/** % change; both zero is a real 0% (AC 5.3), a zero baseline with movement has no %. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** WP23-87 AC 3.1: the colour band for a % change, per the rule table above. */
export function trendStateFor(pct: number | null, higherIsBetter: boolean): TrendState {
  if (pct == null) return 'neutral';
  if (higherIsBetter) {
    if (pct < 0) return 'negative';
    if (pct > 10) return 'positive';
    return 'neutral';
  }
  if (pct > 5) return 'falsePositive';
  if (pct < -5) return 'falseNegative';
  return 'neutral';
}

function insideRange(window: DateWindow, minDate?: string, maxDate?: string): boolean {
  if (!minDate || !maxDate || minDate > maxDate) return false;
  return window.startDate >= minDate && window.endDate <= maxDate;
}

/**
 * AC 5.1: a selected window that is totally or partially outside the available data shows no
 * comparison. AC 5.2: data for the selected window but not for the one before it shows the
 * headline only. So a comparison needs both windows inside `span` (`getDataSpan()`, from the
 * warehouse, never from the app's request).
 */
export function isComparisonAvailable(
  current: DateWindow,
  previous: DateWindow,
  span: DataSpan | null,
): boolean {
  return (
    insideRange(current, span?.minDate, span?.maxDate) &&
    insideRange(previous, span?.minDate, span?.maxDate)
  );
}

/**
 * Whether known defect WP23-213 D-1 changes the outcome for this window. The app shows a
 * comparison when the previous window is inside the `minDate`/`maxDate` it sends, and on this
 * environment those are a today−90 fallback, not the data. Used only to label the failure as
 * a known defect; the expected values always come from `isComparisonAvailable`.
 */
export function comparisonGateDefectApplies(
  current: DateWindow,
  previous: DateWindow,
  span: DataSpan | null,
  boardRange: { minDate?: string; maxDate?: string },
): boolean {
  const appShowsComparison = insideRange(previous, boardRange.minDate, boardRange.maxDate);
  return appShowsComparison !== isComparisonAvailable(current, previous, span);
}

/**
 * WP23-87 AC 1–3 and AC 5: the four tiles' value, delta, caption and colour. AC silent on
 * rounding: per app `KpiTile` whole-number % and whole days.
 */
export function expectedSummaryTiles({
  current,
  previous,
  comparisonPreset,
}: {
  current: SourceToHireSummary;
  /** `null` when AC 5 says there is no comparison (`isComparisonAvailable`). */
  previous: SourceToHireSummary | null;
  comparisonPreset: ComparisonPreset;
}): ExpectedTile[] {
  return SUMMARY_TILES.map(({ key, label, higherIsBetter }) => {
    const curr = read(current, key);
    const prev = previous ? read(previous, key) : null;
    const pct = curr != null && prev != null ? pctChange(curr, prev) : null;
    const delta =
      pct == null
        ? null
        : {
            direction:
              pct > 0 ? ('Up' as const) : pct < 0 ? ('Down' as const) : ('No change' as const),
            value: pct === 0 ? '0%' : `${Math.round(Math.abs(pct))}%`,
          };
    return {
      key,
      label,
      value: formatValue(key, curr),
      delta,
      comparisonLabel: delta ? COMPARISON_LABEL[comparisonPreset] : null,
      trendState: trendStateFor(pct, higherIsBetter),
    };
  });
}

/**
 * WP23-87 AC 3.1 / 3.2: the same expectation in the shape `SummaryKpiRow.readTiles()` returns:
 * the trend state becomes the sparkline's accessible name and, with a delta, the badge's tone.
 */
export function expectedSummaryTileReadings(
  args: Parameters<typeof expectedSummaryTiles>[0],
): SummaryTileReading[] {
  return expectedSummaryTiles(args).map((tile) => ({
    label: tile.label,
    value: tile.value,
    delta: tile.delta,
    comparisonLabel: tile.comparisonLabel,
    sparklineLabel: SPARKLINE_LABEL[tile.trendState],
    tone: tile.delta ? TREND_TONE[tile.trendState] : null,
  }));
}

/**
 * WP23-87 AC 1–3 and AC 5 for one window, from the warehouse: the four tiles the board should
 * show, whether AC 5 allows a comparison, and the previous window and data span that decided it
 * (the inputs `comparisonGateDefectApplies` needs to label WP23-213 D-1).
 */
export async function expectedSummaryForWindow(
  repository: Pick<SourceToHireRepository, 'getSummary' | 'getDataSpan'>,
  window: DateWindow,
  comparisonPreset: ComparisonPreset,
): Promise<{
  expected: SummaryTileReading[];
  comparisonAvailable: boolean;
  previous: DateWindow;
  span: DataSpan | null;
}> {
  const span = await repository.getDataSpan();
  const previous = previousWindow(window);
  const comparisonAvailable = isComparisonAvailable(window, previous, span);
  const expected = expectedSummaryTileReadings({
    current: await repository.getSummary(window.startDate, window.endDate),
    previous: comparisonAvailable
      ? await repository.getSummary(previous.startDate, previous.endDate)
      : null,
    comparisonPreset,
  });
  return { expected, comparisonAvailable, previous, span };
}

/** WP23-87 AC 1.4: the headline text for an average hire period (`null` -> "—"). */
export function formatHirePeriod(days: number | null): string {
  return formatValue('avgHirePeriod', days);
}
