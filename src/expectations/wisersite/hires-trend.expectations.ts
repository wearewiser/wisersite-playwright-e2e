import type { HiresTrendRow } from '../../db/repositories/wisersite/hires-trend.repository.types';
import type { HiresByMonthTable } from '../../types/wisersite/source-to-hire.types';
import { monthsInRange, nthMonthDate } from '../../utils/wisersite/date-window';

const PRIOR_SUFFIX = ' (prior)';

/**
 * Independent oracle for the Hires Trend by Source chart (WP23-158), written from the ticket
 * rather than imported from the plugin:
 *
 * - plots the top 6 sources by hires within the plotted months (sources with no hires there
 *   are not plotted; ties break alphabetically);
 * - a month/source with no applications at all is a gap ("No data"), not a 0;
 * - a comparison adds one `"<source> (prior)"` series per plotted source, each month reading
 *   the value `offset` months earlier — unless the prior window starts before the earliest
 *   month of history, or every prior point is a gap (AC 5: no comparison line).
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
  /** The chart's whole 36-month payload (see `HiresTrendRepository`). */
  rows: HiresTrendRow[];
  window: { startMonth: string; endMonth: string };
  /** `null` for "No comparison". */
  comparisonMonths: 3 | 6 | 12 | null;
  topN?: number;
}): HiresByMonthTable | null {
  const months = monthsInRange(window.startMonth, window.endMonth);
  const lookup = new Map(rows.map((row) => [`${row.month}|${row.sourceChannel}`, row.hires]));

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!months.includes(row.month)) continue;
    totals.set(row.sourceChannel, (totals.get(row.sourceChannel) ?? 0) + row.hires);
  }
  const top = [...totals.entries()]
    .filter(([, hires]) => hires > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([source]) => source);
  if (top.length === 0) return null;

  const table: HiresByMonthTable = {};
  for (const month of months) {
    table[month] = Object.fromEntries(
      top.map((source) => [source, lookup.get(`${month}|${source}`) ?? null]),
    );
  }

  if (comparisonMonths != null) {
    const earliest = rows.reduce<string | null>(
      (min, row) => (!min || row.month < min ? row.month : min),
      null,
    );
    const priorStart = nthMonthDate(window.startMonth, -comparisonMonths);
    const priorStartsBeforeHistory = earliest !== null && priorStart < earliest;
    if (!priorStartsBeforeHistory) {
      const prior: HiresByMonthTable = {};
      let anyPrior = false;
      for (const month of months) {
        const priorMonth = nthMonthDate(month, -comparisonMonths);
        prior[month] = Object.fromEntries(
          top.map((source) => {
            const value = lookup.get(`${priorMonth}|${source}`) ?? null;
            if (value !== null) anyPrior = true;
            return [`${source}${PRIOR_SUFFIX}`, value];
          }),
        );
      }
      if (anyPrior) {
        for (const month of months) table[month] = { ...table[month], ...prior[month] };
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
