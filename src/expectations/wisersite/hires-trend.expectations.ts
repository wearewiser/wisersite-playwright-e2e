import type { HiresTrendDayRow } from '../../db/repositories/wisersite/hires-trend.repository.types';
import type {
  DateWindow,
  HiresByMonthTable,
  MonthBucket,
} from '../../types/wisersite/source-to-hire.types';
import {
  groupByMonthBucket,
  monthBuckets,
  monthOf,
  priorMonthBuckets,
} from '../../utils/wisersite/date-window';

const PRIOR_SUFFIX = ' (prior)';

/** Hires per source in each bucket; a source with no applications in a bucket is absent. */
function hiresBySourcePerBucket(
  rows: readonly HiresTrendDayRow[],
  buckets: readonly MonthBucket[],
): Map<string, number>[] {
  return groupByMonthBucket(rows, buckets).map((bucketRows) => {
    const bySource = new Map<string, number>();
    for (const row of bucketRows) {
      bySource.set(row.sourceChannel, (bySource.get(row.sourceChannel) ?? 0) + row.hires);
    }
    return bySource;
  });
}

/**
 * Independent oracle for the Hires Trend by Source chart (WP23-158), written from the ticket
 * rather than imported from the plugin:
 *
 * - one point per month `window` touches, each counting only the window's days in that month
 *   (WP23-419 D-1, fixed b31efaa);
 * - plots the top 6 sources by hires within the window (sources with no hires there are not
 *   plotted; ties break alphabetically);
 * - a month/source with no applications at all is a gap ("No data"), not a 0;
 * - a comparison adds one `"<source> (prior)"` series per plotted source, each month reading the
 *   same days `comparisonMonths` earlier (`priorMonthBuckets`) — unless the prior window starts
 *   in a month before the earliest month of the chart's data, or every prior point is a gap
 *   (AC 5: no comparison line). A source whose own prior points are all gaps gets no prior
 *   column.
 *
 * Returns the chart's accessible table shape: `{ [month]: { [seriesLabel]: hires | null } }`,
 * or `null` when the chart should show its "No data for this period" empty state.
 */
export function expectedHiresTrendTable({
  rows,
  window,
  comparisonMonths,
  topN = 6,
}: {
  /** The chart's whole payload (see `HiresTrendRepository`). */
  rows: HiresTrendDayRow[];
  window: DateWindow;
  /** `null` for "No comparison". */
  comparisonMonths: 3 | 6 | 12 | null;
  topN?: number;
}): HiresByMonthTable | null {
  const buckets = monthBuckets(window);
  const byBucket = hiresBySourcePerBucket(rows, buckets);

  const totals = new Map<string, number>();
  for (const bySource of byBucket) {
    for (const [source, hires] of bySource) totals.set(source, (totals.get(source) ?? 0) + hires);
  }
  const top = [...totals.entries()]
    .filter(([, hires]) => hires > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([source]) => source);
  if (top.length === 0) return null;

  const table: HiresByMonthTable = {};
  buckets.forEach((bucket, index) => {
    table[bucket.month] = Object.fromEntries(
      top.map((source) => [source, byBucket[index]!.get(source) ?? null]),
    );
  });

  if (comparisonMonths != null) {
    const priorBuckets = priorMonthBuckets(window, comparisonMonths);
    const earliestMonth = rows.reduce<string | null>(
      (min, row) => (!min || monthOf(row.day) < min ? monthOf(row.day) : min),
      null,
    );
    const priorStartsBeforeHistory =
      earliestMonth !== null && priorBuckets[0]!.month < earliestMonth;
    if (!priorStartsBeforeHistory) {
      const priorByBucket = hiresBySourcePerBucket(rows, priorBuckets);
      // A prior line with no point at all isn't drawn or listed (AC silent: per app
      // `LineGraph.tsx:222-224`, which keeps only series with a value).
      const withPrior = top.filter((source) =>
        priorByBucket.some((bySource) => bySource.has(source)),
      );
      if (withPrior.length > 0) {
        buckets.forEach((bucket, index) => {
          table[bucket.month] = {
            ...table[bucket.month],
            ...Object.fromEntries(
              withPrior.map((source) => [
                `${source}${PRIOR_SUFFIX}`,
                priorByBucket[index]!.get(source) ?? null,
              ]),
            ),
          };
        });
      }
    }
  }

  return table;
}

/** WP23-158 AC 1.3 / 2.1: the sources a table plots as solid lines (comparison columns excluded). */
export function plottedSources(table: HiresByMonthTable): string[] {
  return Object.keys(Object.values(table)[0] ?? {}).filter(
    (label) => !label.endsWith(PRIOR_SUFFIX),
  );
}

/** WP23-158 AC 3 / AC 5: whether a table carries any comparison ("<source> (prior)") columns. */
export function hasComparisonSeries(table: HiresByMonthTable): boolean {
  return Object.keys(Object.values(table)[0] ?? {}).some((label) => label.endsWith(PRIOR_SUFFIX));
}

/** WP23-158 AC 4: what the hover tooltip lists for `month`: each series' hires, or "No data". */
export function expectedTooltipRows(
  table: HiresByMonthTable,
  month: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(table[month] ?? {}).map(([series, hires]) => [
      series,
      hires === null ? 'No data' : String(hires),
    ]),
  );
}
