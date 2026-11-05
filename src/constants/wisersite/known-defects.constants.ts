/**
 * Logged defects the suite labels with `markKnownDefect()`, by their Jira key, or by their ID in
 * `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md` when there is no ticket. The
 * tests still fail; the label tells a known bug from a new failure. Each description starts with
 * the ID and a colon: `check-defect-labels.cjs` reads it, and finds a Jira key's register row
 * through `KNOWN_DEFECT_REGISTER_ROWS`.
 */
export const KNOWN_DEFECTS = {
  /** The global date button keeps the server's dates when the user's calendar day differs. */
  dateButtonServerDate:
    "WP23-419 D-3: in a timezone whose date differs from the server's, the global date button shows the server-rendered dates while the board uses the user's own (WP23-198 AC 2.1)",
} as const;

/**
 * Suspected defects from `docs/suspected-defects.md` (not yet in KNOWN-DEFECTS.md), labelled
 * with `markSuspectedDefect()`. Move an entry to `KNOWN_DEFECTS` once it is logged.
 */
export const SUSPECTED_DEFECTS = {
  /** Source Performance Breakdown's default top six differs from the sources Hires Trend plots. */
  topSixRankingsDiffer:
    "QA-WP23-62-3: in default order, Source Performance Breakdown's top six (by applications) aren't the sources Hires Trend by Source plots (top six by hires, only sources with hires) (WP23-159 AC 4.1)",
} as const;

/**
 * The KNOWN-DEFECTS.md row for each Jira key a label uses, where the register still lists the
 * defect under its own ID. Kept here because this repo never edits the plugin's register. Drop an
 * entry once the register row carries the Jira key itself.
 */
export const KNOWN_DEFECT_REGISTER_ROWS = {} as const;
