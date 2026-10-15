import type {
  DailyCounts,
  DataSpan,
} from '../../db/repositories/wisersite/source-to-hire.repository.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { nthDayDate, previousWindow } from './date-window';

export type WindowTotals = { applications: number; screened: number; hires: number };

/** % change in applications between two windows' totals (`previous.applications` > 0). */
export function applicationsChangePct(current: WindowTotals, previous: WindowTotals): number {
  return ((current.applications - previous.applications) / previous.applications) * 100;
}

function totalsFor(days: DailyCounts[], { startDate, endDate }: DateWindow): WindowTotals {
  const totals: WindowTotals = { applications: 0, screened: 0, hires: 0 };
  for (const day of days) {
    if (day.day < startDate || day.day > endDate) continue;
    totals.applications += day.applications;
    totals.screened += day.screened;
    totals.hires += day.hires;
  }
  return totals;
}

/**
 * Finds a custom window whose own totals and its previous window's totals satisfy `matches`,
 * with both windows inside `bounds`. Tries the longest windows first, latest start first, so the
 * pick is deterministic for a given dataset. `null` when nothing in `bounds` qualifies.
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
  for (let length = Math.floor(spanLength(bounds) / 2); length >= minLength; length -= 1) {
    for (
      let endDate = bounds.maxDate;
      nthDayDate(endDate, -(2 * length - 1)) >= bounds.minDate;
      endDate = nthDayDate(endDate, -1)
    ) {
      const current = { startDate: nthDayDate(endDate, -(length - 1)), endDate };
      if (matches(totalsFor(days, current), totalsFor(days, previousWindow(current)))) {
        return current;
      }
    }
  }
  return null;
}

function spanLength({ minDate, maxDate }: DataSpan): number {
  let length = 1;
  for (let day = minDate; day < maxDate; day = nthDayDate(day, 1)) length += 1;
  return length;
}

/** The overlap of two inclusive ranges, or `null` when they don't meet. */
export function intersectRanges(a: DataSpan, b: DataSpan): DataSpan | null {
  const minDate = a.minDate > b.minDate ? a.minDate : b.minDate;
  const maxDate = a.maxDate < b.maxDate ? a.maxDate : b.maxDate;
  return minDate <= maxDate ? { minDate, maxDate } : null;
}
