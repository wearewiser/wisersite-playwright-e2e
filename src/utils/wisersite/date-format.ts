/**
 * Conversions between ISO dates (`YYYY-MM-DD`, `YYYY-MM-01` month keys) and the display formats
 * the wisersite admin UI renders. Parsing only — no date arithmetic (see `date-window.ts`).
 */

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthIndexOf(isoDate: string): number {
  return Number(isoDate.slice(5, 7)) - 1;
}

/** `"16 Sep 2026"` (the date-range picker's `d MMM yyyy`) -> `"2026-09-16"`. */
export function parseDisplayDate(text: string): string {
  const [day, month, year] = text.trim().split(' ');
  const index = MONTH_SHORT.indexOf(month ?? '');
  if (!day || !year || index < 0) {
    throw new Error(`Unrecognised date display: "${text}"`);
  }
  return `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** `"2026-09-16"` -> `"16 Sep 2026"`. */
export function formatDisplayDate(isoDate: string): string {
  return `${Number(isoDate.slice(8, 10))} ${MONTH_SHORT[monthIndexOf(isoDate)]} ${isoDate.slice(0, 4)}`;
}

/** `"21 Jul 2026 – 31 Jul 2026"` (the picker's trigger text) -> an ISO window. */
export function parseDisplayDateRange(text: string): { startDate: string; endDate: string } {
  const [start, end] = text.split(/[–-]/).map((part) => part.trim());
  if (!start || !end) {
    throw new Error(`Could not parse a date range from "${text}"`);
  }
  return { startDate: parseDisplayDate(start), endDate: parseDisplayDate(end) };
}

/** A chart's month axis label, `"Sep 25"` -> month key `"2025-09-01"`. */
export function parseMonthLabel(text: string): string {
  const [month, year] = text.trim().split(' ');
  const index = MONTH_SHORT.indexOf(month ?? '');
  if (!year || index < 0) {
    throw new Error(`Unrecognised month label: "${text}"`);
  }
  return `20${year}-${String(index + 1).padStart(2, '0')}-01`;
}

/** Month key `"2026-07-01"` -> the chart's month axis label `"Jul 26"`. */
export function formatMonthLabel(month: string): string {
  return `${MONTH_SHORT[monthIndexOf(month)]} ${month.slice(2, 4)}`;
}

/** `"2026-07-21"` -> `"July, 2026"`, as the calendar names each month panel. */
export function formatLongMonthYear(isoDate: string): string {
  return `${MONTH_LONG[monthIndexOf(isoDate)]}, ${isoDate.slice(0, 4)}`;
}

/** `"July, 2026"` -> `"2026-07"`, or `null` when the text isn't that shape. */
export function parseLongMonthYear(text: string): string | null {
  const [, month, year] = /(\w+), (\d{4})/.exec(text) ?? [];
  const index = MONTH_LONG.indexOf(month ?? '');
  return year && index >= 0 ? `${year}-${String(index + 1).padStart(2, '0')}` : null;
}

/** `"2026-07-21"` -> `"July 21st, 2026"`, the tail of each calendar day's accessible name. */
export function formatLongDate(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  const suffix =
    day % 100 >= 11 && day % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${MONTH_LONG[monthIndexOf(isoDate)]} ${day}${suffix}, ${isoDate.slice(0, 4)}`;
}
