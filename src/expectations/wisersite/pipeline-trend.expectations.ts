import {
  PIPELINE_TREND_SERIES,
  PIPELINE_TREND_WEEK_LENGTH_DAYS,
  PRIOR_SERIES_SUFFIX,
} from '../../constants/wisersite/candidate-pipeline.constants';
import type { DailyStatusVolumes } from '../../db/repositories/wisersite/candidate-pipeline.repository.types';
import type { MonthlySeriesTable } from '../../types/wisersite/candidate-pipeline.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import {
  groupByMonthBucket,
  monthBuckets,
  monthOf,
  nthDayDate,
  priorMonthBuckets,
} from '../../utils/wisersite/date-window';

type SeriesKey = 'applied' | 'rejected' | 'confirmed';

const SERIES_KEYS: Record<(typeof PIPELINE_TREND_SERIES)[number], SeriesKey> = {
  Applied: 'applied',
  Rejected: 'rejected',
  Confirmed: 'confirmed',
};

/** Applied / Rejected / Confirmed summed over `rows`; every series `null` when there are none. */
function seriesTotals(rows: readonly DailyStatusVolumes[]): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(SERIES_KEYS).map(([label, key]) => [
      label,
      rows.length === 0 ? null : rows.reduce((sum, row) => sum + row[key], 0),
    ]),
  );
}

/**
 * WP23-93 AC 1.3 / 1.3.1: whether a comparison `months` back has enough history to be shown.
 * The ticket doesn't define "sufficient": the prior window must not start in a month before the
 * month the chart's data starts in (AC silent: per app `shapePipelineTrend.ts`
 * `shouldEmitComparison`).
 */
export function hasComparisonHistory({
  window,
  months,
  firstDay,
}: {
  window: DateWindow;
  months: number;
  firstDay: string | null;
}): boolean {
  if (!firstDay) return false;
  return priorMonthBuckets(window, months)[0]!.month >= monthOf(firstDay);
}

/**
 * WP23-93 AC 1.1 (+ AC 1.3 with `comparisonMonths`): the trend chart's table for `window`, one
 * row per month it touches with Applied / Rejected / Confirmed, each month counting only the
 * window's days (WP23-419 D-1, fixed b31efaa); a month with no daily row is `null` ("No data").
 * With a comparison that has history (`hasComparisonHistory`), each series gets a
 * "<label> (prior)" column holding the same days `comparisonMonths` earlier
 * (`priorMonthBuckets`); without history, or with no prior data at all, no prior columns
 * (AC 1.3.1). `daily` must cover the
 * prior window too. Returns `null` when no day in the window has data: the chart's empty state.
 */
export function expectedPipelineTrendTable({
  daily,
  window,
  comparisonMonths,
  firstDay,
}: {
  daily: DailyStatusVolumes[];
  window: DateWindow;
  comparisonMonths: number | null;
  firstDay: string | null;
}): MonthlySeriesTable | null {
  const buckets = monthBuckets(window);
  const current = groupByMonthBucket(daily, buckets);
  if (current.every((rows) => rows.length === 0)) return null;

  const priorGroups =
    comparisonMonths !== null &&
    hasComparisonHistory({ window, months: comparisonMonths, firstDay })
      ? groupByMonthBucket(daily, priorMonthBuckets(window, comparisonMonths))
      : null;
  // Prior lines with no point at all aren't drawn or listed (AC silent: per app
  // `LineGraph.tsx:222-224`, which keeps only series with a value).
  const prior = priorGroups?.some((rows) => rows.length > 0) ? priorGroups : null;

  const table: MonthlySeriesTable = {};
  buckets.forEach((bucket, index) => {
    const row = seriesTotals(current[index]!);
    if (prior) {
      for (const [label, value] of Object.entries(seriesTotals(prior[index]!))) {
        row[`${label}${PRIOR_SERIES_SUFFIX}`] = value;
      }
    }
    table[bucket.month] = row;
  });
  return table;
}

/**
 * WP23-93 AC 1.1 on the chart's own "Last 30 days" (AC 1.2 as changed): the table for `window`
 * in weeks, `W1` … from the window's first day, 7 days each and the last one shorter (AC silent
 * on the grain: per app `shapePipelineTrend.ts` `weekBuckets`). A week with no daily row is
 * `null` ("No data"). Returns `null` when no day in the window has data: the chart's empty state.
 */
export function expectedPipelineTrendWeeklyTable({
  daily,
  window,
}: {
  daily: DailyStatusVolumes[];
  window: DateWindow;
}): MonthlySeriesTable | null {
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const table: MonthlySeriesTable = {};
  let anyData = false;
  let week = 0;
  for (
    let weekStart = window.startDate;
    weekStart <= window.endDate;
    weekStart = nthDayDate(weekStart, PIPELINE_TREND_WEEK_LENGTH_DAYS)
  ) {
    week += 1;
    const rows: DailyStatusVolumes[] = [];
    for (let offset = 0; offset < PIPELINE_TREND_WEEK_LENGTH_DAYS; offset += 1) {
      const day = nthDayDate(weekStart, offset);
      const row = day <= window.endDate ? byDay.get(day) : undefined;
      if (row) rows.push(row);
    }
    anyData ||= rows.length > 0;
    table[`W${week}`] = seriesTotals(rows);
  }
  return anyData ? table : null;
}
