/**
 * Logged defects the suite labels with `markKnownDefect()`, by their ID in
 * `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`. The tests still fail; the
 * label tells a known bug from a new failure. Each description starts with the ID and a colon:
 * `check-defect-labels.cjs` reads it.
 */
export const KNOWN_DEFECTS = {
  /** Summary comparison gated on the app's `minDate`/`maxDate` (today−90 fallback), not the data. */
  comparisonGate:
    "WP23-213 D-1: the summary comparison is gated on the app's minDate/maxDate (today−90 fallback on this environment), not on the available data (WP23-87 AC 5)",
} as const;

/**
 * Suspected defects from `docs/suspected-defects.md` (not yet in KNOWN-DEFECTS.md), labelled
 * with `markSuspectedDefect()`. Move an entry to `KNOWN_DEFECTS` once it is logged.
 */
export const SUSPECTED_DEFECTS = {
  /** Widget-local "Last N months" starts on the 1st of a calendar month, unlike the global preset. */
  widgetMonthPresets:
    'QA-WP23-62-1: the widget\'s own "Last 3/6/12 months" starts on the 1st of a calendar month (UTC), while the global preset with the same label is rolling (WP23-159 AC 1)',
} as const;
