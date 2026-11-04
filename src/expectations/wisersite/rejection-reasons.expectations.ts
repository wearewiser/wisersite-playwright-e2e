import { PIPELINE_TOP_N } from '../../constants/wisersite/candidate-pipeline.constants';
import type {
  MonthlyRejectionCap,
  RejectionsInWindow,
} from '../../db/repositories/wisersite/candidate-pipeline.repository.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { nthDayDate, nthMonthDate } from '../../utils/wisersite/date-window';
import type {
  CentreReadout,
  DonutEmphasis,
  RejectionReasonsReading,
} from '../../types/wisersite/candidate-pipeline.types';
import { formatLocaleCount } from '../../utils/format/locale-number';

/**
 * WP23-94 AC 1.2.2: a category's "% of total for the period", to one decimal place without a
 * trailing ".0", and "<0.1%" rather than a bare 0% for a present category (AC silent on
 * rounding: per app `DonutGraph.tsx:146-149`).
 */
export function formatRejectionShare(value: number, total: number): string {
  const share = total === 0 ? 0 : (value / total) * 100;
  return share > 0 && share < 0.1 ? '<0.1%' : `${Number(share.toFixed(1))}%`;
}

/**
 * WP23-94 AC 1.1.1 / 1.1.2 / 1.1.2.1 / 1.1.2.2: what the donut should show for a window — the
 * centre total of every rejection in the period (D-3: not just the top 6), and the top 6
 * categories by count (all of them when there are fewer), ties by name (AC silent: per app
 * `shapeRejectionReasons.ts:51`), each with its share of the period's total. `null` when there
 * are no rejections: the "No data for this period" state.
 */
export function expectedRejectionReasons(
  rejections: RejectionsInWindow,
): RejectionReasonsReading | null {
  const ranked = rejections.byReason
    .filter((row) => row.rejections > 0)
    .sort((a, b) => b.rejections - a.rejections || a.category.localeCompare(b.category))
    .slice(0, PIPELINE_TOP_N);
  if (rejections.total === 0 || ranked.length === 0) return null;
  return {
    total: formatLocaleCount(rejections.total),
    categories: ranked.map((row) => ({
      category: row.category,
      share: formatRejectionShare(row.rejections, rejections.total),
      value: formatLocaleCount(row.rejections),
    })),
  };
}

/**
 * WP23-94 AC 1.2.2: the centre readout while one category's segment is hovered — its count of
 * rejections, then "<share> · <category name>".
 */
export function expectedCentreReadout(
  expected: RejectionReasonsReading,
  category: string,
): CentreReadout {
  const row = expected.categories.find((candidate) => candidate.category === category);
  if (!row) throw new Error(`"${category}" is not among the expected categories`);
  return { value: row.value, caption: `${row.share} · ${row.category}` };
}

/**
 * WP23-94 AC 1.2.1: while one segment is hovered, it and its legend row stay at full strength
 * and every other segment and legend row is greyed out.
 */
export function expectedHoverEmphasis(count: number, hovered: number): DonutEmphasis {
  const bands = Array.from({ length: count }, (_, index) =>
    index === hovered ? ('full' as const) : ('greyed' as const),
  );
  return { segments: bands, legendRows: [...bands] };
}

/**
 * WP23-94 AC 1.1 under the WP23-328 rule: the latest past month in which some applications were
 * rejected by the month's end and some only after it, so a chart that ignored "by the window's
 * end" would show a different total. `null` when no month qualifies.
 */
export function pastMonthWhereRejectionCapMatters(
  months: readonly MonthlyRejectionCap[],
): DateWindow | null {
  const month = months.find((row) => row.byMonthEnd > 0 && row.afterMonthEnd > 0)?.month;
  return month ? { startDate: month, endDate: nthDayDate(nthMonthDate(month, 1), -1) } : null;
}
