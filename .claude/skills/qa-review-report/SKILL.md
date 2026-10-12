---
name: qa-review-report
description: Senior QA review of this repo's Playwright suite against its Jira tickets — runs the specs with `npm run test:headed:retry`, maps every acceptance criterion to the tests that really assert it, audits assertion quality, oracle independence, vacuous passes, skips/known-defect handling, flakiness and page-object rules, independently re-derives a sample of expected values with SQL, and renders an HTML report into test-results/qa-review/. Use to review tests written by e2e-test-author (or by hand) before they are trusted or merged.
---

# QA review and HTML report

Scratch goes to `/tmp/<SCOPE>-review/` (`<SCOPE>` = epic/ticket key, or `suite` for everything).
The final report goes to `test-results/qa-review/<YYYY-MM-DD>-<SCOPE>.html`.

You are **reviewing**, not fixing: don't edit `src/`, `tests/`, `docs/` or config. Every
problem becomes a finding with a file:line and a recommendation.

## 1. Gather the contract

- Tickets: `fetch-jira-tickets` → `/tmp/<SCOPE>-explore/tickets.md` (reuse it if it's already
  there and from today). Number every AC (`WP23-157 AC 1.2`). Note Jira status.
- Scope with no key: collect keys from the specs (`grep -rhoE 'WP23-[0-9]+' tests | sort -u`)
  and fetch those, plus their epic, so tickets with **no** spec still show up.
- Test plan: `docs/test-plans/<KEY>.md`. Missing plan = a finding (the matrix is the contract
  the author is supposed to write).
- Known defects: `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`.
- Semantics: `map-feature-code` only where you need to judge whether an oracle is right.

## 2. Run the suite

Always with the headed retry script, JSON reporter alongside list (use a 600000 ms timeout):

```bash
mkdir -p /tmp/<SCOPE>-review
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/<SCOPE>-review/run-main.json \
  npm run test:headed:retry -- <spec paths, or nothing for the whole suite> --reporter=list,json \
  > /tmp/<SCOPE>-review/run-main.log 2>&1; tail -40 /tmp/<SCOPE>-review/run-main.log
```

- `test:headed:retry` = headed + `--retries=1`, so a test that only passes on its retry shows
  as **flaky**, not passed. Flaky is a finding, never "fine".
- Then repeat each flaky or suspicious spec (also any spec touching hover, localStorage or
  date boundaries) headed, 3×:

  ```bash
  PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/<SCOPE>-review/run-repeat.json \
    npm run test:headed:retry -- <spec> --repeat-each=3 --reporter=list,json \
    > /tmp/<SCOPE>-review/run-repeat.log 2>&1
  ```

- Playwright empties `test-results/` at the start of **every** run. Copy anything you want
  to keep (e.g. `error-context.md`) to `/tmp/<SCOPE>-review/` before the next run, and build
  the report only after the last run.
- Static checks too: `npm run typecheck` and `npx eslint src tests --ext .ts` (read-only; don't
  run prettier `--write`).
- App down (`curl -s -o /dev/null -w '%{http_code}' $WISERSITE_BASE_URL/admin` not 200/30x):
  do the static review, mark the run section as not executed, verdict at most
  `approve-with-comments`.

## 3. Review checklist

Record each as a check (`pass` / `warn` / `fail` / `n/a`) with one line of evidence. Anything
`warn`/`fail` also gets a finding.

**A. Coverage and traceability**
1. Every ticket in scope (status Done / In QA / similar) has at least one spec; Closed /
   Won't Do tickets are not tested, or the reason is written down.
2. Every AC maps to at least one test that **asserts** it, not one that merely touches the
   widget. Read the test body; don't trust the title or comment.
3. Every test traces back to an AC or a documented discrepancy (no orphan tests); spec
   comments cite AC numbers that exist in the ticket.
4. The test plan matrix exists and agrees with the specs (scenarios marked as implemented
   really are; AC/app discrepancies listed there have a test or a reason).
5. Ticket notes / Q&A (often the real spec) are reflected in tests.
6. Non-functional ACs are covered or explicitly out of scope: permissions/access gate
   (`canViewAnalytics`, 403 vs 404), empty states, loading, persistence across reload,
   accessibility (screen-reader tables, accessible names), formatting (locale numbers, %,
   rounding).

**B. Is it tested right — assertion quality**
7. **Oracle independence**: expected values come from repositories in `src/db/repositories/`
   and functions in `src/expectations/`, never from `/api/widgets` responses or imported app
   code. Grep for imports from `../wisersite-and-payload-plugin` and for assertions against
   intercepted response bodies.
8. **Oracle correctness**: the SQL cohort/filters/window match the ticket and the app's
   documented semantics (deleted / internal applications, inclusive end date, timezone, the
   source mapping, top-N + tie-break, rounding).
9. **Vacuous passes**: a test that passes without checking anything on current data — loops
   over an empty array, `if (rows.length) expect(...)`, comparing `[]` with `[]`, only
   `toBeVisible()`, or every preset hitting the empty state. Say which ACs are proven only
   by the empty-state path on today's data.
10. **Weak matchers**: `toContain` / `toBeGreaterThan(0)` / `toBeTruthy` / regex where the AC
    gives an exact value; soft assertions; tolerance without a stated reason.
11. **Strong negatives**: hidden/empty states asserted positively (the widget is absent *and*
    SQL says no data), not just "no error".
12. **No hard-coded dates or data values** — windows from today or request params; grep for
    `20\d\d-\d\d` and literal counts.
13. **Skips** (`test.skip`, `test.fixme`): each has a data-terms reason and is decided from
    Postgres at runtime. A skip that always fires on this tenant = untested AC (list it).
14. **Known defects**: every `test.fail()` cites an ID from KNOWN-DEFECTS.md that is still
    open. A defect marked fixed there but still `test.fail()` = finding. An app/AC mismatch
    the suite works around instead of asserting the AC = blocker.
15. **Waits**: assertions wait for the widget's request for the new window (request tracker)
    before reading; no `waitForTimeout`, no sleeps, no retries used as a fix.
16. **Isolation**: no order dependence, no shared page across tests, localStorage filter state
    doesn't leak.

**C. Edge cases and boundaries** — present, or listed as a gap with the data that would unlock it
17. Window boundaries (first/last day inclusive), month edges and the TZ-1 class of
    timezone shift, custom range vs presets, widget-local period vs global filter.
18. Zero / single / many: 0 hires, one source, exactly N and N+1 sources at a top-N cutoff,
    ties, a source with 0 in one measure, very large numbers (locale separators).
19. Percent and averages: division by zero shows "—", rounding matches the AC, previous-period
    comparison availability.

**D. Execution health**
20. Main run counts; every failure classified (test bug / app defect / data limitation /
    environment) with evidence from the log, `error-context.md` and, where it matters, SQL.
21. Flaky tests (passed on retry or not 3/3 in the repeat run), with the likely cause.
22. Duration outliers (> 30 s per test) and why.
23. Typecheck and lint clean; new lint warnings justified.

**E. Structure (CLAUDE.md rules)**
24. Page = route, `<h1>`, page flows, one component per widget. Component = locators +
    behaviour only. Specs = flow + assertions only. Helpers live in constants/types/utils/
    network/expectations.
25. Locators: role + exact name, accessible table/status/combobox inside the widget root;
    no hashed CSS-module classes, no `nth()` without a reason; charts read through their
    screen-reader tables.
26. Readability: test names state the behaviour and the AC; failure messages identify the
    window and the expected vs actual values.

## 4. Independent spot checks

For each ticket, re-derive 1–3 expected values **yourself** with a fresh query
(`profile-tenant-data` ad-hoc mode, one SELECT per call) written from the AC, not copied from
the repository. Prefer a window that has data. Compare with the UI value (from the run log or
`explore-live-ui`) and with the suite's oracle. A three-way disagreement is the most valuable
finding a review can produce. Where an AC has no test, you may confirm the behaviour live
with `explore-live-ui` / Playwright MCP (read-only, never save anything) so the gap finding
says what the app actually does.

## 5. Verdict

- `changes-requested`: any blocker — an AC with no real assertion while the ticket is in
  scope, a non-independent oracle, an assertion weakened to match a defect, a failing test
  that is a test bug, an oracle that is wrong.
- `approve-with-comments`: no blockers, but majors (flaky, vacuous-on-current-data, weak
  matchers, missing edge cases, structure violations).
- `approve`: only minors/nits.

Severity: **blocker** (the suite gives false confidence about an AC), **major** (coverage or
reliability gap), **minor** (maintainability, weak edge case), **nit** (style).

## 6. Build the report

Write `/tmp/<SCOPE>-review/review.json`:

```json
{
  "title": "QA review — Source to Hire (WP23-62)",
  "scope": "WP23-62",
  "reviewedAt": "2026-10-12T14:00:00Z",
  "verdict": "approve | approve-with-comments | changes-requested",
  "summary": "3–6 sentences: what is covered, what isn't, how reliable, the headline risks.",
  "recommendations": ["Ordered, most important first"],
  "tickets": [{
    "key": "WP23-157", "summary": "...", "status": "Done",
    "verdict": "covered | partial | not-covered | not-tested-closed",
    "specs": ["tests/e2e-wisersite/source-to-hire/hire-distribution.spec.ts"],
    "notes": "optional",
    "acs": [{
      "id": "AC 1.2", "text": "verbatim AC",
      "status": "asserted | partial | empty-state-only | skipped | known-defect | missing",
      "tests": ["hire-distribution.spec.ts:47 'Last 30 days'…"],
      "notes": "why this status"
    }]
  }],
  "findings": [{
    "id": "F-1", "severity": "blocker | major | minor | nit", "category": "vacuous-pass",
    "ticket": "WP23-157", "title": "...", "file": "tests/...spec.ts", "line": 47,
    "detail": "...", "evidence": "log excerpt / SQL result", "recommendation": "..."
  }],
  "checks": [{ "area": "A. Coverage", "check": "Every AC asserted", "result": "pass | warn | fail | n/a", "evidence": "..." }],
  "spotChecks": [{ "ticket": "WP23-87", "window": "Last 3 months", "metric": "Total applications", "ui": "54", "sql": "54", "oracle": "54", "match": true }],
  "dataGaps": ["What can't be exercised on today's data, and what data would unlock it"],
  "notTested": ["What this review did not cover, and why"],
  "environment": { "App URL": "...", "App commit": "git -C ../wisersite-and-payload-plugin rev-parse --short HEAD", "Suite commit": "...", "Node": "...", "Playwright": "...", "DB today": "..." },
  "commands": ["exact commands run"]
}
```

Then render (the first `--results` is the main run used for the headline tiles):

```bash
node .claude/skills/qa-review-report/scripts/build-report.cjs \
  --review /tmp/<SCOPE>-review/review.json \
  --results "Main run (test:headed:retry)=/tmp/<SCOPE>-review/run-main.json" \
  --results "Repeat x3=/tmp/<SCOPE>-review/run-repeat.json" \
  --out test-results/qa-review/<YYYY-MM-DD>-<SCOPE>.html
```

Pass counts are taken from Playwright's JSON, so don't restate different numbers in
`summary`. Open the HTML once (Read it, or `grep -c` the rows) to make sure it rendered.
