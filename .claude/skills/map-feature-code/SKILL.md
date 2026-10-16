---
name: map-feature-code
description: Map a wisersite analytics board or widget to its implementation in ../wisersite-and-payload-plugin — route, permission gate, data function and SQL, request params, shaping rules, empty states and the accessible DOM it renders — so tests can build an independent oracle and stable locators. Use before designing or writing tests for any dashboard widget.
---

# Map a feature to the app code (read-only)

The app repo is `../wisersite-and-payload-plugin` (branch is usually `develop`; note the commit
with `git log --oneline -1`). Never edit it. Produce notes per widget in
`/tmp/<KEY>-explore/code-map.md`.

## Where things live

| Concern | Path |
|---|---|
| Admin route registration | `src/index.ts` (`path: '/analytics/<board>'`) — routes are **not** under `/admin/` |
| Board view (server) | `src/views/<Board>/<Board>View.tsx` — permission gate, `minDate`/`maxDate` resolution |
| Board layout (client) | `src/views/<Board>/<Board>Dashboard/*.tsx` — which widgets, order, `hydrated` gating |
| Widget registration | `src/widgets/<Widget>/widget.ts` — `handle` shows which params reach the server |
| Data function + SQL | `src/widgets/<Widget>/get<Widget>.ts`, shared CTEs in `src/widgets/funnel/` |
| Shaping (top-N, sort, format) | `src/widgets/<Widget>/shape<Widget>.ts` |
| Client widget | `src/widgets/<Widget>/<Widget>.tsx` — what it sends, loading/denied/empty handling |
| Presentational DOM | `src/components/organisms/<Widget>/`, `src/components/molecules/{BarGraph,DonutGraph,LineGraph,DataTable,...}` |
| Date helpers | `src/utils/analytics/date/*`, `src/models/analytics/globalDatePreset.ts` |
| Known defects / QA notes | `testing-docs/KNOWN-DEFECTS.md`, `testing-docs/TESTING-NOTES.md` |

## For each widget, record

1. **Request**: endpoint `/api/widgets/<key>` and the exact query params (does it send the
   global `startDate`/`endDate`? its own local window? nothing — e.g. a fixed 36-month fetch?).
2. **SQL semantics**: table, cohort filters (`NOT is_deleted`, `NOT internal_application`),
   blank-channel handling, `BETWEEN` inclusivity, date truncation, how months are keyed.
3. **Shaping**: filters (drop zero rows?), top-N, sort key **and tie-break**, rounding and
   formatting (`toLocaleString('en-GB')`, `toFixed(1)`, `Math.round`), share/percent rules.
4. **States**: loading placeholder text, empty message vs. widget removed entirely, error copy,
   comparison gating rules (e.g. previous window must sit inside `[minDate, maxDate]`).
5. **DOM contract**: headings (level + name), tables and their accessible names/captions,
   screen-reader-only data tables behind charts (preferred over SVG), `aria-sort`,
   `role="status"` readouts, `aria-label`s carrying state (e.g. sparkline trend), inline
   `style` custom properties carrying values (`--bar-width`), select names ("Time period").
   CSS-module class names are hashed — never depend on them except as a last resort pattern.
6. **Local controls**: option values/labels, defaults, whether they reset when the global
   filter changes, whether they are contained (don't touch other widgets).
7. **Divergences from the ticket**: anything the code does differently from the AC, with
   `file:line`. These go to the scenario matrix as discrepancies. Check especially:
   - **window semantics**: does a widget's "Last 3 months" compute the same dates as the global
     preset of that name (rolling vs calendar months, UTC vs local today)?
   - **gating bounds**: where do `minDate`/`maxDate` come from, and what's the fallback when
     the analytics date-range API is missing? Bounds are the app's view, not the data's.
   - **copy**: labels and captions vs the AC's exact wording.
8. **What the oracle may borrow**: only semantics the ticket is silent on (rounding, tie-break,
   month arithmetic). Note each as "AC silent: per app `file:line`": that exact phrase is what
   `check-oracle-independence.cjs` accepts. Anything the ticket defines comes from the ticket.

Use the app's own unit tests (`*.test.ts` next to each file) to confirm edge-case intent, but
write the test oracle independently — the e2e suite must not import app code.
