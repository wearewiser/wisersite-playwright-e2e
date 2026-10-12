---
name: write-e2e-tests
description: Implement Playwright specs for a wisersite analytics board from the scenario matrix in docs/test-plans/<KEY>.md, following this repo's strict page-object structure — thin page class, one component per widget, read-only SQL repositories as the oracle, expectation functions, and helpers in utils/types/constants/network. Use whenever adding or changing tests, page objects or oracles in this repo.
---

# Write the E2E tests

Re-read `docs/test-plans/<KEY>.md` first. Each scenario ID becomes a test (or a parametrised
loop). Copy the shape of the existing Source to Hire suite; it is the reference implementation.

## Where code goes (strict, no exceptions)

| Layer | Path | Holds |
|---|---|---|
| Spec | `tests/e2e-wisersite/<board>/<widget-or-ticket>.spec.ts` | Test flow + assertions only. Header JSDoc: ticket key, summary, ACs paraphrased |
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
- Data-dependent: branch to the empty-state assertion when SQL says there's no data; use
  `test.skip(condition, '<why, in data terms>')` only when nothing is observable. Log the
  window and expected values with `console.log('… %o', …)` for the report.
- Known defect: assert the AC and wrap with `test.fail()` plus a comment citing the
  `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md` ID. Never assert the buggy value.
- No hard-coded dates, counts or source names derived from today's data. Literals are only
  allowed for fixed UI copy, which lives in constants.

## Done when

`npm run typecheck` is clean, `npx eslint src tests --ext .ts` has 0 errors,
`npx prettier --write src tests docs` has been run (not `npm run format`, which rewrites every
Markdown file in the repo), and
every matrix scenario ID appears in a test title or comment. Then hand over to
`stabilize-e2e-tests`.
