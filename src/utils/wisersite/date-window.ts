import type {
  DateWindow,
  GlobalPresetLabel,
  MonthBucket,
  WidgetPresetValue,
} from '../../types/wisersite/source-to-hire.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Date arithmetic for the windows the tickets name ("last 30 days", "last 3 months", "previous
 * period"). The tickets don't define month arithmetic, so where they are silent this follows the
 * app (AC silent: per app `src/utils/analytics/date/*`), written independently and never imported.
 * Where a ticket does define a window, the ticket wins (see WP23-159 AC 1 / docs/test-plans D-3).
 *
 * The global date-range picker, and every widget's own period (WP23-419), anchor to the
 * **local** calendar day (`localTodayIso`), then walk days/months as UTC milliseconds
 * (DST-safe), via the same two functions below.
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

/** A widget's own "Time period" option and the page preset with the same name. */
const WIDGET_PRESET_LABEL: Record<Exclude<WidgetPresetValue, 'match-global'>, GlobalPresetLabel> = {
  'last-30-days': 'Last 30 days',
  'last-3-months': 'Last 3 months',
  'last-6-months': 'Last 6 months',
  'last-12-months': 'Last 12 months',
};

/**
 * WP23-158 AC 1.1 / WP23-93 AC 1.2 — the days a chart covers for its own "Time period":
 * the global range for Match Global, otherwise the same dates as the page preset with that name
 * (PO 2026-10-21, WP23-419).
 */
export function widgetDayWindow(
  timePeriod: WidgetPresetValue,
  globalRange: DateWindow,
  now: Date = new Date(),
): DateWindow {
  if (timePeriod === 'match-global') return globalRange;
  return resolveGlobalPreset(WIDGET_PRESET_LABEL[timePeriod], now);
}

/**
 * The calendar months `window` touches, each clipped to the window's days: a monthly chart's
 * part first / last month counts only the days inside the range (WP23-419 D-1, fixed b31efaa).
 */
export function monthBuckets({ startDate, endDate }: DateWindow): MonthBucket[] {
  return monthsInRange(monthOf(startDate), monthOf(endDate)).map((month) => {
    const lastDay = nthDayDate(nthMonthDate(month, 1), -1);
    return {
      month,
      startDate: startDate > month ? startDate : month,
      endDate: endDate < lastDay ? endDate : lastDay,
    };
  });
}

/**
 * WP23-93 AC 1.3 / WP23-158 AC 3 "vs N months previous": `window` moved back `months` whole
 * months, bucketed the same way and paired with `window`'s buckets by index. Where the moved
 * window would end on `window`'s first day, it stops the day before (AC silent on overlap: per
 * app `priorMonthBuckets`).
 */
export function priorMonthBuckets(window: DateWindow, months: number): MonthBucket[] {
  const dayBefore = nthDayDate(window.startDate, -1);
  return monthBuckets({
    startDate: nthMonthDate(window.startDate, -months),
    endDate: nthMonthDate(window.endDate, -months),
  }).map((bucket) =>
    bucket.endDate === window.startDate ? { ...bucket, endDate: dayBefore } : bucket,
  );
}

/** `rows` that fall inside each bucket's days, one array per bucket, in bucket order. */
export function groupByMonthBucket<T extends { day: string }>(
  rows: readonly T[],
  buckets: readonly MonthBucket[],
): T[][] {
  return buckets.map((bucket) =>
    rows.filter((row) => row.day >= bucket.startDate && row.day <= bucket.endDate),
  );
}

/**
 * The latest run of at least `minLength` consecutive days inside `bounds` on which `isQuiet`
 * holds for every day, trimmed to its last `maxLength` days. Days missing from `days` count as
 * quiet. One pass over the calendar; `null` when no run is long enough.
 */
export function latestQuietWindow<T extends { day: string }>({
  days,
  bounds,
  isQuiet,
  minLength,
  maxLength,
}: {
  days: T[];
  bounds: DateWindow;
  isQuiet: (day: T) => boolean;
  minLength: number;
  maxLength: number;
}): DateWindow | null {
  const noisy = new Set(days.filter((day) => !isQuiet(day)).map((day) => day.day));
  let runEnd: string | null = null;
  let runLength = 0;
  for (let day = bounds.endDate; day >= bounds.startDate; day = nthDayDate(day, -1)) {
    if (noisy.has(day)) {
      if (runEnd && runLength >= minLength) break;
      runEnd = null;
      runLength = 0;
      continue;
    }
    runEnd ??= day;
    runLength += 1;
    if (runLength >= maxLength) break;
  }
  if (!runEnd || runLength < minLength) return null;
  return { startDate: nthDayDate(runEnd, -(Math.min(runLength, maxLength) - 1)), endDate: runEnd };
}
