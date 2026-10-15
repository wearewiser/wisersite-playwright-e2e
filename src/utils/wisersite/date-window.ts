import type {
  DateWindow,
  GlobalPresetLabel,
  WidgetPresetValue,
} from '../../types/wisersite/source-to-hire.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Date arithmetic for the windows the tickets name ("last 30 days", "last 3 months", "previous
 * period"). The tickets don't define month arithmetic, so where they are silent this follows the
 * app (AC silent: per app `src/utils/analytics/date/*`), written independently and never imported.
 * Where a ticket does define a window, the ticket wins (see WP23-159 AC 1 / docs/test-plans D-3).
 *
 * Two different "today"s are in play:
 * - The global date-range picker anchors to the **local** calendar day (`localTodayIso`).
 * - The Hires Trend chart's own periods count months back from the **UTC** month
 *   (`utcTodayIso`).
 * Both then walk days/months as UTC milliseconds (DST-safe), via the same two functions below.
 */

/** UTC calendar day of `now`, as `YYYY-MM-DD`. */
export function utcTodayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Local calendar day of `now` (the browser's own timezone), as `YYYY-MM-DD`. */
export function localTodayIso(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA');
}

function requireIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `n` whole UTC days from `date` (negative goes backwards), as `YYYY-MM-DD`. */
export function nthDayDate(date: string, n: number): string {
  return toIsoDate(new Date(requireIsoDate(date).getTime() + n * MS_PER_DAY));
}

/**
 * `n` calendar months from `date` (negative goes backwards), as `YYYY-MM-DD`. A day past the
 * end of the target month clamps to that month's last day (one month on from 31 Jan is 28/29
 * Feb, not 3 Mar). AC silent: per app `nthMonthDate`.
 */
export function nthMonthDate(date: string, n: number): string {
  const from = requireIsoDate(date);
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTargetMonth));
  return toIsoDate(target);
}

/** WP23-87 AC 2.1 / WP23-159 AC 1: the global picker's presets (AC silent on month maths: per app `resolveGlobalDatePreset`). */
export function resolveGlobalPreset(preset: GlobalPresetLabel, now: Date = new Date()): DateWindow {
  const endDate = localTodayIso(now);
  switch (preset) {
    case 'Last 30 days':
      return { startDate: nthDayDate(endDate, -29), endDate };
    case 'Last 3 months':
      return { startDate: nthMonthDate(endDate, -3), endDate };
    case 'Last 6 months':
      return { startDate: nthMonthDate(endDate, -6), endDate };
    case 'Last 12 months':
      return { startDate: nthMonthDate(endDate, -12), endDate };
  }
}

/** Inclusive number of calendar days in `window` (a one-day window is 1). */
function windowLengthInDays({ startDate, endDate }: DateWindow): number {
  return (requireIsoDate(endDate).getTime() - requireIsoDate(startDate).getTime()) / MS_PER_DAY + 1;
}

/**
 * WP23-87 AC 2 "previous period": the equal-length window ending the day before `window`
 * starts, both ends inclusive (AC silent on exact length: per app `previousWindow`). This is what the Source to Hire summary tiles compare
 * against, whichever preset (or custom range) produced `window`.
 */
export function previousWindow(window: DateWindow): DateWindow {
  const previousEnd = nthDayDate(window.startDate, -1);
  const previousStart = nthDayDate(previousEnd, -(windowLengthInDays(window) - 1));
  return { startDate: previousStart, endDate: previousEnd };
}

/** `YYYY-MM-01` keys of every month from `startMonth` to `endMonth`, inclusive. */
export function monthsInRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  for (let month = startMonth; month <= endMonth; month = nthMonthDate(month, 1)) {
    months.push(month);
  }
  return months;
}

/** `YYYY-MM-01` key of the month `date` falls in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * WP23-158 AC 1.1 (D-6: calendar months, pending PO; per app `resolveMonthWindow`) — which months the chart
 * plots for each of its own "Time period" options. `match-global` takes the months the global
 * range touches; every other option counts back from the current **UTC** month, inclusive.
 */
export function hiresTrendMonthWindow(
  timePeriod: WidgetPresetValue,
  globalRange: DateWindow,
  now: Date = new Date(),
): { startMonth: string; endMonth: string } {
  if (timePeriod === 'match-global') {
    return { startMonth: monthOf(globalRange.startDate), endMonth: monthOf(globalRange.endDate) };
  }
  const endMonth = monthOf(utcTodayIso(now));
  if (timePeriod === 'last-30-days') {
    return { startMonth: monthOf(nthDayDate(utcTodayIso(now), -29)), endMonth };
  }
  const monthsBack = timePeriod === 'last-3-months' ? 3 : timePeriod === 'last-6-months' ? 6 : 12;
  return { startMonth: nthMonthDate(endMonth, -(monthsBack - 1)), endMonth };
}
