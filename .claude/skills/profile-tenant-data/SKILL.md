---
name: profile-tenant-data
description: Profile the tenant Postgres analytics warehouse read-only — date span, counts per month and per source, zero-valued measures — to decide which acceptance criteria are actually exercisable on current data and which will only hit empty states. Also runs one-off read-only queries. Use before designing scenarios and whenever a test result depends on what data exists.
---

# Profile the tenant warehouse (read-only)

```bash
node .claude/skills/profile-tenant-data/scripts/profile.cjs              # default ATS profile
node .claude/skills/profile-tenant-data/scripts/profile.cjs "SELECT ..."  # ad-hoc, JSON rows
```

Uses this repo's `.env` (`TENANT_SQL_*`). The connection is read-only at session level, every
statement runs in a `READ ONLY` transaction, and the extended protocol rejects multi-statement
strings. So pass **one statement per call**, and expect Postgres to refuse any write ("cannot
execute DELETE in a read-only transaction"). Never work around that; this is real shared demo
data the suite doesn't own.

The default profile prints: today's date (server), the `analytics.gold_*` tables, and for
`gold_fct_ats_applications` (cohort: `NOT is_deleted AND NOT internal_application`) the overall
span, per-month and per-source applications / screened / hires.

## Turn the profile into test decisions

Write a short "data reality" section into the scenario matrix
(`docs/test-plans/<KEY>.md`) answering:

- **Which global presets have data?** Compare each preset window (Last 30 days / 3 / 6 / 12
  months, relative to *today*) with the data span. Empty presets exercise empty states.
- **Which measures are all zero?** E.g. 0 hires → donut hidden, trend chart empty, average
  hire period "—", hover/colour/tooltip scenarios can't execute. List them as data gaps with
  what data would unlock them.
- **Edge cases reachable?** Ties at a top-N cutoff, exactly N sources, a source with 0
  screens, history long enough for a 12-month comparison, etc.
- **Will it drift?** Data near a moving boundary (e.g. `minDate = today − 90`) changes daily —
  tests must compute windows from today / from request params, never hard-code dates.

## Writing the oracle query

When a test needs expected values, add a repository method under
`src/db/repositories/wisersite/` (SELECT only) mirroring the app's cohort filters from
`map-feature-code` — same table, same exclusions, same date inclusivity — but written from
scratch. Prototype it here first with the ad-hoc mode, and compare against what the UI shows
during `explore-live-ui`.
