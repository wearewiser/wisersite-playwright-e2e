import type {
  DailyCounts,
  DataSpan,
} from '../../db/repositories/wisersite/source-to-hire.repository.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { nthDayDate } from './date-window';

export type WindowTotals = { applications: number; screened: number; hires: number };

/** % change in applications between two windows' totals (`previous.applications` > 0). */
export function applicationsChangePct(current: WindowTotals, previous: WindowTotals): number {
  return ((current.applications - previous.applications) / previous.applications) * 100;
}

/** Running totals per calendar day of `bounds`: entry `i` sums the days before `calendar[i]`. */
function prefixTotals(days: DailyCounts[], calendar: string[]): WindowTotals[] {
  const index = new Map(calendar.map((day, i) => [day, i]));
  const daily = calendar.map(() => ({ applications: 0, screened: 0, hires: 0 }));
  for (const day of days) {
    const i = index.get(day.day);
    if (i === undefined) continue;
    daily[i]!.applications += day.applications;
    daily[i]!.screened += day.screened;
    daily[i]!.hires += day.hires;
  }
  const prefix: WindowTotals[] = [{ applications: 0, screened: 0, hires: 0 }];
  for (const [i, totals] of daily.entries()) {
    const before = prefix[i]!;
    prefix.push({
      applications: before.applications + totals.applications,
      screened: before.screened + totals.screened,
      hires: before.hires + totals.hires,
    });
  }
  return prefix;
}

/**
 * Finds a custom window whose own totals and its previous window's totals satisfy `matches`,
 * with both windows inside `bounds`. Tries the longest windows first, latest start first, so the
 * pick is deterministic for a given dataset. `null` when nothing in `bounds` qualifies.
 * Window totals come from running totals, so a full search with no match stays O(days²).
 */
export function findComparisonWindow({
  days,
  bounds,
  minLength = 3,
  matches,
}: {
  days: DailyCounts[];
  bounds: DataSpan;
  minLength?: number;
  matches: (current: WindowTotals, previous: WindowTotals) => boolean;
}): DateWindow | null {
  const calendar: string[] = [];
  for (let day = bounds.minDate; day <= bounds.maxDate; day = nthDayDate(day, 1))
    calendar.push(day);
  const prefix = prefixTotals(days, calendar);
  // Totals of calendar days `from`..`to`, both inclusive.
  const totals = (from: number, to: number): WindowTotals => ({
    applications: prefix[to + 1]!.applications - prefix[from]!.applications,
    screened: prefix[to + 1]!.screened - prefix[from]!.screened,
    hires: prefix[to + 1]!.hires - prefix[from]!.hires,
  });

  for (let length = Math.floor(calendar.length / 2); length >= minLength; length -= 1) {
    for (let end = calendar.length - 1; end - (2 * length - 1) >= 0; end -= 1) {
      const start = end - length + 1;
      // The previous window is the `length` days just before `start` (see `previousWindow`).
      if (matches(totals(start, end), totals(start - length, start - 1))) {
        return { startDate: calendar[start]!, endDate: calendar[end]! };
      }
    }
  }
  return null;
}

/** The overlap of two inclusive ranges, or `null` when they don't meet. */
export function intersectRanges(a: DataSpan, b: DataSpan): DataSpan | null {
  const minDate = a.minDate > b.minDate ? a.minDate : b.minDate;
  const maxDate = a.maxDate < b.maxDate ? a.maxDate : b.maxDate;
  return minDate <= maxDate ? { minDate, maxDate } : null;
}
