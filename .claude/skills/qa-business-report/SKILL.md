---
name: qa-business-report
description: Build the business-facing HTML test coverage report for a board or epic — every automated check in plain language, grouped by area, with what it found today (Verified / Partly verified / Known issue / Needs a decision / New failure / Not run), the issues that need attention, and a one-glance status bar. Generated from a Playwright JSON run plus the tests' own title/what/variant/AC annotations and a small per-epic context file. Use after a suite run whenever product owners or stakeholders need to see what is tested.
---

# Business test coverage report

Output: `reports/business/<YYYY-MM-DD>-<scope>-test-coverage.html` (gitignored, one
self-contained file to open or attach). Nothing here touches tests, the app or Jira.

## 1. Inputs

- **A run with JSON output.** Use the latest `run-main.json` from a review, or run:

  ```bash
  PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/<SCOPE>-review/run-main.json \
    npm run test:headed:retry -- <spec paths or nothing> --reporter=list,json \
    > /tmp/<SCOPE>-review/run-main.log 2>&1
  ```

  If the run shows environment failures (app or DB down), restart the app and rerun before
  reporting. A report built on that run says "not run (environment)" for every check.
- **Annotations on every test.** Each test declares `details({ ac, title, what, variant })`
  (`src/utils/playwright/test-annotations.ts`). `title` is the plain-language name, `what` one
  sentence on what it does, `variant` the label of a grouped check ("Last 30 days"). Tests
  sharing a `title` in one area become one row with a badge per variant. Write these for a
  recruiter, not a developer: no selectors, no SQL, no AC numbers.
- **Runtime labels.** `markLimitedByData()` → Partly verified, `markKnownDefect()` → Known
  issue, `markSuspectedDefect()` → Needs a decision. Their text appears as notes, so write them
  in plain language too.
- **Context file** `docs/test-plans/<KEY>.business.json` (committed next to the test plan):
  area names and intros per ticket, the "needs attention" cards, and optional extra notes per
  check title. See the script header for the shape; `docs/test-plans/WP23-62.business.json`
  is the reference. Update the cards when defects or data change.

## 2. Build

```bash
node .claude/skills/qa-business-report/scripts/build-business-report.cjs \
  --results /tmp/<SCOPE>-review/run-main.json \
  --context docs/test-plans/<KEY>.business.json \
  --out reports/business/<YYYY-MM-DD>-<scope>-test-coverage.html
```

## 3. Check before sharing

- Screenshot it in light and dark mode (Playwright `colorScheme`) and look at it: no
  overflowing chips, notes readable, counts in the footer match the run.
- Every check has a plain title (no raw spec titles like `"last-3-months": plotted hires…`).
  A missing `title` annotation is a gap to fix in the spec.
- "New failure" or "Not run (environment)" in the report means it isn't ready for business
  readers: investigate or rerun first.
- Honesty rule: never relabel a failure or a limited pass to make the report look greener.
  The labels come from the tests; change the tests (with a reason) if they are wrong.
