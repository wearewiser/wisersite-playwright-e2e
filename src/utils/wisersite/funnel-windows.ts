import { MIN_CUSTOM_RANGE_DAYS } from '../../constants/wisersite/recruitment-funnel.constants';
import type {
  AtsApplicationRow,
  AtsStageRow,
  FeedSpan,
  GaDailyTotals,
} from '../../db/repositories/wisersite/recruitment-funnel.repository.types';
import { expectedHeadlineTiles } from '../../expectations/wisersite/funnel-headline.expectations';
import { atsStageAsOf } from '../../expectations/wisersite/recruitment-funnel.expectations';
import type { FunnelFeed } from '../../types/wisersite/recruitment-funnel.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { nthDayDate } from './date-window';

/**
 * Custom date windows for the Recruitment Funnel's data-state scenarios (WP23-85 AC 2.x,
 * WP23-132 AC 1.2), picked from what the warehouse holds at run time. Every window is at least
 * `MIN_CUSTOM_RANGE_DAYS` long, the shortest the date picker accepts.
 */

const LENGTH = MIN_CUSTOM_RANGE_DAYS;

/** WP23-85 AC 2.1.1 / WP23-358: a two-week window ending the day before any feed's first day. */
export function beforeDataWindow(spans: FeedSpan[]): DateWindow | null {
  const firstDays = spans.map((s) => s.firstDay).filter((d): d is string => d !== null);
  if (firstDays.length === 0) return null;
  const endDate = nthDayDate(firstDays.sort()[0]!, -1);
  return { startDate: nthDayDate(endDate, -13), endDate };
}

/**
 * WP23-85 AC 2.3: a stale feed (no load for `staleHours`) and the picker-length window straight
 * after its last day, ending by `today`. Its stages can't answer there while other feeds may.
 * Null when every feed is fresh.
 */
export function afterStaleFeedWindow(
  spans: FeedSpan[],
  staleHours: number,
  today: string,
): { feed: FunnelFeed; window: DateWindow } | null {
  for (const span of spans) {
    const stale = span.hoursSinceLoad === null || span.hoursSinceLoad > staleHours;
    if (!stale || !span.lastDay) continue;
    const startDate = nthDayDate(span.lastDay, 1);
    const endDate = nthDayDate(startDate, LENGTH - 1);
    if (endDate <= today) return { feed: span.feed, window: { startDate, endDate } };
  }
  return null;
}

/** Running totals of a per-day series, so any window's sum is read in O(1). */
function prefixSums(days: GaDailyTotals[], pick: (d: GaDailyTotals) => number) {
  const index = new Map(days.map((d, i) => [d.day, i]));
  const sums = [0];
  for (const d of days) sums.push(sums.at(-1)! + pick(d));
  return (window: DateWindow) => {
    const from = index.get(window.startDate);
    const to = index.get(window.endDate);
    return from === undefined || to === undefined ? 0 : sums[to + 1]! - sums[from]!;
  };
}

/**
 * WP23-85 AC 2.2: the latest picker-length window, ending by `latestEnd`, where every feed has
 * data (GA4 users, `apply_start` events, ATS applications) and at least one ATS stage is a real
 * zero while another has candidates. Only windows whose stages read the same counted to the
 * window's end and to today qualify, so the scenario doesn't hit WP23-442 D-2. Null when none.
 */
export function partialFunnelWindow({
  applications,
  gaDaily,
  latestEnd,
  today,
  earliestEnd,
}: {
  applications: AtsApplicationRow[];
  gaDaily: GaDailyTotals[];
  latestEnd: string;
  earliestEnd: string;
  today: string;
}): DateWindow | null {
  const users = prefixSums(gaDaily, (d) => d.users);
  const starts = prefixSums(gaDaily, (d) => d.applyStarts);
  for (let end = latestEnd; end >= earliestEnd; end = nthDayDate(end, -1)) {
    const window = { startDate: nthDayDate(end, -(LENGTH - 1)), endDate: end };
    if (users(window) === 0 || starts(window) === 0) continue;
    const inWindow = applications.filter(
      (r) => r.createdDate >= window.startDate && r.createdDate <= window.endDate,
    );
    const countBy = (asOf: string) =>
      [1, 2, 3, 4, 5].map(
        (order) => inWindow.filter((r) => atsStageAsOf(r, asOf) === order).length,
      );
    const atEnd = countBy(end);
    if (!atEnd.some((n) => n === 0) || !atEnd.some((n) => n > 0)) continue;
    if (countBy(today).join() !== atEnd.join()) continue;
    return window;
  }
  return null;
}

/**
 * WP23-132 AC 1.2: the latest picker-length window, ending by `latestEnd`, where at least one
 * headline tile has no data (hidden) and at least one has data (shown). Null when none.
 */
export function partialTilesWindow({
  applications,
  stages,
  latestEnd,
  earliestEnd,
}: {
  applications: AtsApplicationRow[];
  stages: AtsStageRow[];
  latestEnd: string;
  earliestEnd: string;
}): DateWindow | null {
  for (let end = latestEnd; end >= earliestEnd; end = nthDayDate(end, -1)) {
    const window = { startDate: nthDayDate(end, -(LENGTH - 1)), endDate: end };
    const tiles = expectedHeadlineTiles(applications, window, stages);
    if (tiles.some((t) => t === null) && tiles.some((t) => t !== null)) return window;
  }
  return null;
}

/**
 * WP23-85 AC 5 / NOTE 2.2: the most recent whole calendar month, among the `monthsBack` before
 * the current one, where counting stages to the month's end differs from counting to today.
 * Falls back to last month (the two agree there) when none differs.
 */
export function pastMonthWindow(
  today: string,
  monthsBack: number,
  differs: (window: DateWindow) => boolean,
): { window: DateWindow; differs: boolean } {
  const monthStart = (offset: number) => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - offset);
    return d.toISOString().slice(0, 10);
  };
  const windowOf = (offset: number) => ({
    startDate: monthStart(offset),
    endDate: nthDayDate(monthStart(offset - 1), -1),
  });
  for (let offset = 1; offset <= monthsBack; offset += 1) {
    const window = windowOf(offset);
    if (differs(window)) return { window, differs: true };
  }
  return { window: windowOf(1), differs: false };
}

/**
 * WP23-85 AC 5 / NOTE 2.2: whether the ATS stages of `window` read differently counted to the
 * window's end and counted to `today` (applications that moved on after the window ended).
 */
export function stagesMovedOnSince(
  applications: AtsApplicationRow[],
  window: DateWindow,
  today: string,
): boolean {
  const counts = (asOf: string) =>
    [1, 2, 3, 4, 5]
      .map(
        (order) =>
          applications.filter(
            (r) =>
              r.createdDate >= window.startDate &&
              r.createdDate <= window.endDate &&
              atsStageAsOf(r, asOf) === order,
          ).length,
      )
      .join();
  return counts(window.endDate) !== counts(today);
}
