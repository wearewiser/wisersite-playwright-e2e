import { test, type TestDetails } from '@playwright/test';

/**
 * Annotation types the suite writes and the reports read (`qa-review-report`,
 * `qa-business-report`, `ac-coverage.cjs`). Keep these strings in sync with those scripts.
 */
export const ANNOTATION = {
  /** Acceptance criterion the test asserts, e.g. "WP23-87 AC 5.1". One per AC. */
  ac: 'ac',
  /** Plain-language name of the check, for business readers. Tests sharing it are grouped. */
  title: 'title',
  /** Plain-language sentence: what the check does. */
  what: 'what',
  /** Which variant of a grouped check this is, e.g. "Last 30 days". */
  variant: 'variant',
  /** The test hit a logged defect (ID from KNOWN-DEFECTS.md). It still fails red. */
  knownDefect: 'known-defect',
  /** The test hit a suspected defect in `docs/suspected-defects.md`. It still fails red. */
  suspectedDefect: 'suspected-defect',
  /** The test passed, but today's data could only exercise the zero / empty case. */
  limitedByData: 'limited-by-data',
} as const;

/**
 * Static details for `test(title, details({...}), body)`: one `@<TICKET>` tag per ticket and the
 * annotations the coverage and business reports group by. Every test in this suite declares
 * the ACs it asserts this way.
 */
export function details({
  ac,
  title,
  what,
  variant,
}: {
  ac: string[];
  title: string;
  what?: string;
  variant?: string;
}): TestDetails {
  const tickets = [...new Set(ac.map((id) => id.split(' ')[0]!))];
  return {
    tag: tickets.map((ticket) => `@${ticket}`),
    annotation: [
      ...ac.map((id) => ({ type: ANNOTATION.ac, description: id })),
      { type: ANNOTATION.title, description: title },
      ...(what ? [{ type: ANNOTATION.what, description: what }] : []),
      ...(variant ? [{ type: ANNOTATION.variant, description: variant }] : []),
    ],
  };
}

function annotate(type: string, description: string): void {
  test.info().annotations.push({ type, description });
}

/**
 * Labels the running test with a logged defect it is expected to hit. The test still runs its
 * AC assertions and still fails red while the defect is open; the label only says the failure
 * is a known bug (`<ID>: <summary>`, ID from KNOWN-DEFECTS.md), not a new one. A labelled test
 * that passes means the defect may be fixed: remove the label.
 */
export function markKnownDefect(description: string): void {
  annotate(ANNOTATION.knownDefect, description);
}

/**
 * Like `markKnownDefect`, for a defect not yet logged in KNOWN-DEFECTS.md but recorded in
 * `docs/suspected-defects.md`. Swap it for `markKnownDefect` once the defect is logged.
 */
export function markSuspectedDefect(description: string): void {
  annotate(ANNOTATION.suspectedDefect, description);
}

/**
 * Says this run only proved the zero / empty case because of today's data (e.g. 0 hires). The
 * reports show the test as "partly verified" rather than fully verified. Call it from the
 * data-driven branch that took the empty path, with the reason in data terms.
 */
export function markLimitedByData(reason: string): void {
  annotate(ANNOTATION.limitedByData, reason);
}
