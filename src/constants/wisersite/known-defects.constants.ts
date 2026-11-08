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
  /** Recruitment Funnel "arrived from previous" divides exclusive stage counts, so a later ATS stage can read over 100%. */
  funnelArrivalOver100:
    'WP23-357 D-1: "arrived from previous" divides one exclusive ATS stage count by the previous one, so a stage bigger than the one before reads over 100% (WP23-86 AC 1.4, WP23-295 AC 2.2)',
  /** Recruitment Funnel hover percentages under 10% show a decimal. */
  funnelHoverDecimals:
    'WP23-86 D-5: the stage hover view shows percentages under 10% with one decimal; the AC asks for whole numbers (WP23-86 AC 1.6)',
  /** A mouse click on a source chip unpins the stage. */
  funnelChipUnpins:
    'WP23-307 D-4: with a stage pinned, a mouse click on a source chip unpins it and closes its detail (WP23-307 AC 2.2)',
  /** The funnel ribbon counts ATS stages to today, not to the end of a past window. */
  funnelStagesCountedToToday:
    "WP23-442 D-2: on a range ending before today the ribbon counts each application at the stage it has reached today, not by the range's end (WP23-85 AC 5, NOTE 2.2)",
} as const;

/**
 * Suspected defects from `docs/suspected-defects.md` (not yet in KNOWN-DEFECTS.md), labelled
 * with `markSuspectedDefect()`. Move an entry to `KNOWN_DEFECTS` once it is logged.
 */
export const SUSPECTED_DEFECTS = {
  /** Source Performance Breakdown's default top six differs from the sources Hires Trend plots. */
  topSixRankingsDiffer:
    "QA-WP23-62-3: in default order, Source Performance Breakdown's top six (by applications) aren't the sources Hires Trend by Source plots (top six by hires, only sources with hires) (WP23-159 AC 4.1)",
  /** Recruitment Funnel source categories can't be expanded or collapsed (removed with WP23-390). */
  funnelNoSourceExpand:
    'QA-WP23-61-1: the full stage detail lists every individual source with no expand / collapse control on its category (WP23-86 AC 3, 3.1)',
  /** Closing the full stage detail with the mouse doesn't return to the hover view. */
  funnelMouseCloseNoHover:
    'QA-WP23-61-2: closing the full stage detail with the mouse leaves no hover view of the stage (WP23-86 AC 2.2.1)',
  /** Career Site Views shows dashes for its stage flow. */
  funnelCareerSiteViewsFlowDashed:
    'QA-WP23-61-3: Career Site Views shows "—" for arrived from previous, lost, drop and cumulative drop (WP23-86 AC 1.4, 1.6; WP23-295 AC 2.2, 2.3)',
  /** A zero stage says "Nobody reached this stage in these dates." */
  funnelZeroStageCopy:
    'QA-WP23-61-4: a stage with no candidates says "Nobody reached this stage in these dates." instead of "No data for this period" (WP23-86 AC 6)',
  /** "Lost at this stage" is drawn orange above 50%. */
  funnelLostNotNeutral:
    'QA-WP23-61-5: "Lost at this stage" is drawn in the warning colour above 50% instead of neutral styling (WP23-295 AC 2.3.1)',
} as const;

/**
 * The KNOWN-DEFECTS.md row for each Jira key a label uses, where the register still lists the
 * defect under its own ID. Kept here because this repo never edits the plugin's register. Drop an
 * entry once the register row carries the Jira key itself.
 */
export const KNOWN_DEFECT_REGISTER_ROWS = {} as const;
