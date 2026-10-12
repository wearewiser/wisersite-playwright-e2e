---
name: design-test-scenarios
description: Turn fetched Jira acceptance criteria, the app code map, the tenant data profile and live-UI notes into a reviewed scenario matrix at docs/test-plans/<KEY>.md — every AC mapped to concrete scenarios with an independent oracle, data dependency, expected outcome on current data, and every AC/app discrepancy. Use after exploration and before writing any spec; the matrix is the contract the tests must satisfy.
---

# Design test scenarios: the AC → scenario matrix

Inputs from earlier phases, all in `/tmp/<KEY>-explore/`: `tickets.md`, `code-map.md`, the
data profile, `ui-notes.md` + dumps. Output: `docs/test-plans/<KEY>.md` (committed with the
tests; one file per epic, or per ticket when handed loose tickets).

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
- **Data-dependent branches are explicit**: state what the test asserts when data exists and
  what it asserts otherwise (empty state, widget absent) or that it skips, with the message.
  Prefer asserting the empty-state path over skipping; skip only when neither path is
  observable.
- **Locator source** comes from `ui-notes.md` (role + name seen live), not from JSX.
- **Discrepancies are not resolved by the test.** If the app contradicts the AC, the scenario
  asserts the **AC** and is expected to fail. Mark it `test.fail()` only when it is logged in
  `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md` (cite the ID); otherwise
  leave the AC assertion failing and put it first in the report as a suspected new defect
  (a human decides whether it's a bug or an AC change).
- Cover the interactions the AC names: global ↔ local precedence ("contained"), reset on
  global change, persistence across reload, sort toggles, hover readouts, cross-widget
  consistency (same source colour/rate in two widgets).

## Review before coding

Re-read the matrix against `tickets.md` once, line by line. Check that every AC is accounted
for, every expected value is derivable from SQL + the rule, and no scenario depends on a date
or count that will drift. Then re-read the matrix at the start of `write-e2e-tests`.
