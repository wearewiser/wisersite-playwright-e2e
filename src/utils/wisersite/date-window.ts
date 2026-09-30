const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Date arithmetic mirroring wisersite-and-payload-plugin's own date-window helpers
 * (`src/utils/analytics/date/{utcDate,nthDayDate,nthMonthDate,resolveGlobalDatePreset}.ts` and
 * `src/widgets/SourcePerformanceBreakdown/resolveLocalDateWindow.ts`). Written independently —
 * not imported from that repo — so a test comparing against these dates is a genuine check of
 * the app's date math, not the app confirming its own arithmetic against itself.
 *
 * Two different "today"s are in play, matching the app exactly:
 * - The global date-range picker anchors to the **local** calendar day (`localTodayIso`).
 * - Each widget's own "Match Global Date Picker" override anchors to the **UTC** calendar day
 *   of the instant (`utcTodayIso`) — see `resolveLocalDateWindow.ts`'s `toIsoDate(now)`.
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
 * Feb, not 3 Mar) — same rule as the plugin's `nthMonthDate`.
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

export type DateWindow = { startDate: string; endDate: string };

/** Matches `resolveGlobalDatePreset` — the page-level date-range picker's presets. */
export function resolveGlobalPreset(
  preset: 'Last 30 days' | 'Last 3 months' | 'Last 6 months' | 'Last 12 months',
  now: Date = new Date(),
): DateWindow {
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

/**
 * Matches `resolveLocalDateWindow` — the per-widget "Match Global Date Picker" override found
 * on Hires Trend by Source and Source Performance Breakdown. Deliberately does not implement
 * `match-global`: the caller already has the active global range in that case.
 */
export function resolveWidgetLocalPreset(
  preset: 'Last 30 days' | 'Last 3 months' | 'Last 6 months' | 'Last 12 months',
  now: Date = new Date(),
): DateWindow {
  const endDate = utcTodayIso(now);
  if (preset === 'Last 30 days') {
    const start = new Date(now.getTime() - 29 * MS_PER_DAY);
    return { startDate: toIsoDate(start), endDate };
  }
  const monthsBack = preset === 'Last 3 months' ? 3 : preset === 'Last 6 months' ? 6 : 12;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));
  return { startDate: toIsoDate(start), endDate };
}
