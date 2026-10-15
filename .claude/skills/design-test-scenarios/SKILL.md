---
name: design-test-scenarios
description: Turn fetched Jira acceptance criteria, the app code map, the tenant data profile and live-UI notes into a reviewed scenario matrix at docs/test-plans/<KEY>.md — every AC mapped to concrete scenarios with an independent oracle, data dependency, expected outcome on current data, and every AC/app discrepancy. Use after exploration and before writing any spec; the matrix is the contract the tests must satisfy.
---

# Design test scenarios: the AC → scenario matrix

Inputs from earlier phases, all in `/tmp/<KEY>-explore/`: `tickets.md` + `tickets.json`
(validated), `code-map.md`, the data profile, `ui-notes.md` + dumps (including the
`--compare-presets` tables). Output: `docs/test-plans/<KEY>.md` (committed with the tests; one
file per epic, or per ticket when handed loose tickets), plus `docs/test-plans/<KEY>.business.json`
(area names/intros and attention cards for `qa-business-report`).

**This file is mandatory.** `write-e2e-tests` refuses to start without it, and every AC ID in
it must exist in `tickets.json`: the specs' `ac` annotations and the coverage map join on them.

## Template

```markdown
# <KEY> <epic summary>: test plan

App commit: <sha> (../wisersite-and-payload-plugin) · Data profiled: <YYYY-MM-DD> · Board: /analytics/<board>

## Scope
| Ticket | Summary | Status | In scope? | Spec file |

## Data reality (from profile-tenant-data)
Span, which presets have data, which measures are all zero, reachable edge cases, drift risks.

## Scenario matrix
| ID | Ticket / AC | Scenario | Oracle | Data needed | Expected on current data | Locator source |
|---|---|---|---|---|---|---|
| S-157-01 | WP23-157 AC 1.2 | Each global preset: one segment per source with hires | SQL getBySource → sources with hires>0, sorted by hires desc, name asc | Hires > 0 in window | Hidden (0 hires in every preset) → asserts AC 3 path | sr-only table `Category / Share / Value` |

## Discrepancies (AC vs app vs data)
| ID | AC says | App does (file:line) | Seen live | Test treatment |

## Not tested
| AC | Why | What would unlock it |
```

## Rules for each scenario

- **One observable claim per scenario**, phrased as Given window / When action / Then value.
  "Widget works" is not a scenario.
- **Every AC appears** in the matrix, the Discrepancies table, or Not tested, with a reason.
  Cite ACs as numbered in `fetch-jira-tickets` (`WP23-87 AC 2.1.3`).
- **Oracle is independent**: warehouse SQL (a repository method) + pure expectation code that
  re-implements the ticket's rule (top-N, sort + tie-break, rounding, share). Never "whatever
  `/api/widgets/...` returns", and never imported app code. Where the AC is silent and the code
  decides (e.g. tie-break), say "per app code `file:line`, AC silent".
- **Windows are relative**: name the preset or a rule ("the widest preset with hires", "the
  board's `minDate`..today"), never a literal date. Custom-range scenarios compute dates from
  today or from the data span at runtime.
- **Look for data before settling for an empty state.** Presets are only four windows; the
  warehouse usually has data somewhere. For each scenario that needs data, search for a custom
  range that has it (by SQL over `getDailyCounts`-style per-day counts; see
  `src/utils/wisersite/comparison-window.ts` `findComparisonWindow`, which picked the
  green/white/red AC 3 windows), within the data span and the board's selectable range. Only
  when no window anywhere has the data is the scenario empty-state-only, and then say so.
- **Data-dependent branches are explicit**: state what the test asserts when data exists and
  what it asserts otherwise (empty state, widget absent) or that it skips, with the message.
  Prefer asserting the empty-state path over skipping; skip only when neither path is
  observable. Mark every empty-state-only scenario: the test calls `markLimitedByData()`
  on that path so reports show it as "partly verified", never as plain green.
- **Locator source** comes from `ui-notes.md` (role + name seen live), not from JSX.
- **Discrepancies are not resolved by the test.** If the app contradicts the AC, the scenario
  asserts the **AC** and fails. Label it `known-defect` (`markKnownDefect()`) when it is
  logged in `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md` (cite the ID).
  Otherwise add a row to `docs/suspected-defects.md` (next `QA-<KEY>-<n>` ID) and label it
  `suspected-defect` (`markSuspectedDefect()`); put it first in the report as a suspected new
  defect
  (a human decides whether it's a bug or an AC change).
- **Copy and window discrepancies from exploration** (`ui-notes.md` copy table and
  `--compare-presets` `DIFFERENT` rows) each get a Discrepancies row with a D-ID. A constant
  that holds app copy differing from the AC cites that D-ID in its comment.
- **Tag each scenario with exact AC IDs**, as sub-specific as the scenario really asserts. A
  scenario that only proves the parent ("AC 1") must not claim the children ("AC 1.3"); the
  coverage map counts a broad tag for the parent only.
- Cover the interactions the AC names: global ↔ local precedence ("contained"), reset on
  global change, persistence across reload, sort toggles, hover readouts, cross-widget
  consistency (same source colour/rate in two widgets).

## Review before coding

Re-read the matrix against `tickets.md` once, line by line. Check that every AC is accounted
for, every expected value is derivable from SQL + the rule, and no scenario depends on a date
or count that will drift. Then re-read the matrix at the start of `write-e2e-tests`.
