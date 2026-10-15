---
name: write-e2e-tests
description: Implement Playwright specs for a wisersite analytics board from the scenario matrix in docs/test-plans/<KEY>.md, following this repo's strict page-object structure — thin page class, one component per widget, read-only SQL repositories as the oracle, expectation functions, and helpers in utils/types/constants/network. Use whenever adding or changing tests, page objects or oracles in this repo.
---

# Write the E2E tests

## 0. Gate: no plan, no code

```bash
test -f docs/test-plans/<KEY>.md || echo "STOP: run design-test-scenarios first"
```

If the plan is missing, or doesn't list every in-scope ticket from `tickets.json`, stop and run
`design-test-scenarios`. Don't write tests from tickets directly: that is how AC/app
discrepancies get coded in silently. Re-read the plan, then: each scenario ID becomes a test
(or a parametrised loop). Copy the shape of the existing Source to Hire suite; it is the
reference implementation.

## Where code goes (strict, no exceptions)

| Layer | Path | Holds |
|---|---|---|
| Spec | `tests/e2e-wisersite/<board>/<widget-or-ticket>.spec.ts` | Test flow + assertions only. Header JSDoc: ticket key, summary, ACs paraphrased |
| Rules spec | `tests/rules/<board>.rules.spec.ts` | Browser-free checks of pure expectation functions at the ticket's boundary values (`npm run test:rules`, `rules` project). Synthetic inputs only |
| Test labels | `src/utils/playwright/test-annotations.ts` | `details()`, `markKnownDefect()`, `markSuspectedDefect()`, `markLimitedByData()` |
| Defect IDs | `src/constants/wisersite/known-defects.constants.ts` | `KNOWN_DEFECTS` (from KNOWN-DEFECTS.md), `SUSPECTED_DEFECTS` (from `docs/suspected-defects.md`) |
| Page | `src/pages/wisersite/<board>.page.ts` | Extends `BasePage`: route, `<h1>`, page-level flows (global date filter), composes components |
| Component | `src/pages/wisersite/components/<board>/<widget>.component.ts` | One class per widget: `readonly` locators set in the constructor, user actions, `read*()` methods returning typed values |
| Shared component | `src/pages/wisersite/components/*.component.ts` | Reused across boards (`DateRangePicker`, `AdminSidebar`) |
| Constants | `src/constants/wisersite/<board>.constants.ts` | Route, headings, preset labels, option values, column names, timeouts |
| Types | `src/types/wisersite/<board>.types.ts` | Row / reading / segment shapes |
| Oracle SQL | `src/db/repositories/wisersite/<board>.repository.ts` (+ `.types.ts`) | SELECT-only, parameterised (`$1::date`), same cohort filters as the app, written from scratch |
| Expectations | `src/expectations/wisersite/<topic>.expectations.ts` | Pure functions: SQL rows → what the UI should show (top-N, sort, rounding, labels) |
| Utils | `src/utils/{format,dom,playwright,wisersite}/`, `src/utils/sort.ts` | Parsing/formatting, date maths, CSS helpers, table snapshots |
| Network | `src/network/wisersite/widget-request-tracker.ts` | Request params via the `widgetRequests` fixture |
| Fixtures | `src/fixtures/wisersite.fixtures.ts` | Worker-scoped repositories, test-scoped page objects |

Reuse before adding. Check `utils/`, `expectations/`, `DateRangePicker`,
`snapshotTableBodyRows`, `parseLocaleCount`/`formatLocaleCount` and `date-window.ts` first.
New board → new page + fixture entry. New widget → new component + property on the page.

## Locators

- Order: `getByRole` with exact name (heading level 3 for widget titles) → accessible table/
  status/combobox inside the widget root → `getByText` exact → structural XPath anchored on
  the heading (`ancestor::*[.//table][1]`). Never hashed CSS-module classes, never `nth`
  without a reason in a comment.
- Read charts through their sr-only tables, not SVG geometry. When SVG is the only source
  (colour, hover), say so in a JSDoc on the method.
- Scope every widget locator under its `root` so two widgets with the same control names
  (e.g. two "Time period" comboboxes) never collide.

## Every test declares what it covers

```ts
test(
  `"${preset}": headline stats … match the warehouse`,
  details({
    ac: ['WP23-87 AC 2.1', 'WP23-87 AC 5'],          // exact IDs from tickets.json
    title: 'Each date preset shows the right numbers, % change and colour', // plain language
    what: 'Picks each preset and compares … with the rules in the ticket.',
    variant: preset,                                  // groups loop iterations in reports
  }),
  async ({ sourceToHirePage }) => { … },
);
```

- `ac`: only what the test really asserts, as specific as it is (`AC 1.1.2.1`, not `AC 1`).
  Compute per-iteration IDs when each variant maps to its own AC.
- `title` / `what` / `variant` are read by business readers in `qa-business-report`: write
  them for a recruiter. No selectors, SQL, or AC numbers.
- Check with `node .claude/skills/qa-review-report/scripts/ac-coverage.cjs --tickets
  /tmp/<KEY>-explore/tickets.json`: no untagged tests, no tags that match no AC.

## Assertions and oracle

- Expected values: `repository.method(window)` → `expected*()` from `expectations/` → compare
  to `widget.read*()`. Get the window from the UI (`dateRange.getActiveRange()`) or from
  `widgetRequests.last('<key>')`, never recompute it separately and hope they agree.
- Use web-first waits: `expect.poll(() => widget.readRows(), { timeout: WIDGET_TIMEOUT_MS }).toEqual(expected)`,
  `toBeVisible`, `toHaveCount(0)`. No `waitForTimeout` in specs or page objects.
- "Absent" assertions must first prove the widget's request completed for the current
  window (`expect.poll(() => widgetRequests.last(key)).toEqual(window)`), so that absent does
  not just mean not loaded yet.
- Whole-structure equality (`toEqual` on arrays of rows) beats per-cell loops: one diff shows
  every mismatch.
- Find data before settling for empty: when a preset has none, search for a custom window
  that does (`findComparisonWindow` in `src/utils/wisersite/comparison-window.ts`, per-day
  counts from the repository) and skip only when nothing in the data qualifies.
- Data-dependent: branch to the empty-state assertion when SQL says there's no data, and call
  `markLimitedByData('<what could only be checked at zero, in data terms>')` on that path; use
  `test.skip(condition, '<why, in data terms>')` only when nothing is observable. Log the
  window and expected values with `console.log('… %o', …)` for the report.
- Never take expected values from the app's request params (`minDate`/`maxDate`, the window a
  widget sent): those are the app's opinion. They may pick a window or decide a defect label,
  with an `oracle-ok:` comment saying so.
- Known defect: assert the AC and let the test fail. Label it with
  `markKnownDefect(KNOWN_DEFECTS.<key>)` (`src/utils/playwright/test-annotations.ts`, IDs in
  `src/constants/wisersite/known-defects.constants.ts`, from
  `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`); call it conditionally when
  the defect only affects some windows. Never `test.fail()`, never assert the buggy value.
- Suspected defect (not in KNOWN-DEFECTS.md): add it to `docs/suspected-defects.md` and
  `SUSPECTED_DEFECTS`, and label the failing path with `markSuspectedDefect()`. Label only when
  the failure is that defect (e.g. in a `catch` that checks the symptom, then rethrows).
- No hard-coded dates, counts or source names derived from today's data. Literals are only
  allowed for fixed UI copy, which lives in constants.

## Done when

`npm run typecheck` is clean, `npx eslint src tests --ext .ts` has 0 errors and 0 warnings
(conditional skips/expects are allowed by config: see `.eslintrc.cjs`; anything else that warns
is real), `node .claude/skills/write-e2e-tests/scripts/check-oracle-independence.cjs --strict`
passes (cite the AC, "AC silent: per app <file:line>", or a D-ID wherever the oracle borrows
from the app; `oracle-ok: <reason>` for reviewed exceptions), `npm run test:rules` passes,
`npx prettier --write src tests docs` has been run (not `npm run format`, which rewrites every
Markdown file in the repo), and
every matrix scenario ID appears in a test title or comment. Then hand over to
`stabilize-e2e-tests`.
