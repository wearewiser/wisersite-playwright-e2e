---
name: qa-review-report
description: Senior QA review of this repo's Playwright suite against its Jira tickets — runs the specs with `npm run test:headed:retry`, maps every acceptance criterion to the tests that really assert it (from the tests' AC tags), audits assertion quality, oracle independence, vacuous passes, defect labels, flakiness and page-object rules, independently re-derives a sample of expected values with saved SQL, and renders an HTML report into reports/qa-review/. Also re-reviews: given a previous review, says which findings are fixed. Use to review tests written by e2e-test-author (or by hand) before they are trusted or merged.
---

# QA review and HTML report

Scratch goes to `/tmp/<SCOPE>-review/` (`<SCOPE>` = epic/ticket key, or `suite` for everything).
The report goes to `reports/qa-review/<YYYY-MM-DD>-<SCOPE>.html` (gitignored; Playwright never
empties it, unlike `test-results/`).

You are **reviewing**, not fixing: don't edit `src/`, `tests/`, `docs/` or config. Every
problem becomes a finding with a file:line and a recommendation.

**Re-review mode.** Given a previous `review.json` (path from the user, or the latest in
`/tmp/<SCOPE>-review/`), copy it to `review.previous.json`, then do the steps below with
the previous findings as the starting list. Set each finding's `status` to `fixed`,
`partially-fixed`, `open` or `new`, with a one-line `statusNote` of evidence. Set top-level
`"previousReview": "<path, date, verdict>"`. Replay the saved spot checks first (step 4).

## 1. Gather the contract

- Tickets: `fetch-jira-tickets` → `/tmp/<SCOPE>-explore/tickets.md` + `tickets.json`, then
  `validate-tickets.cjs`. Reuse them if they're from today and valid.
- Scope with no key: collect keys from the tests' tags (`grep -rhoE "@WP23-[0-9]+" …` or the
  `ac` annotations) and from the specs, then fetch those plus their epic, so tickets with **no**
  spec still show up.
- Test plan: `docs/test-plans/<KEY>.md`. `docs/` is gitignored and stays on the author's
  machine, so a missing plan is **not** a finding: note "test plan not available (local only)"
  and judge AC coverage from the tickets and the tests' AC tags instead.
- Defect registers: `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md` and
  `docs/suspected-defects.md` (local only, like the test plan; when it's absent, take suspected
  defects from `SUSPECTED_DEFECTS` in `src/constants/wisersite/known-defects.constants.ts`).
- Semantics: `map-feature-code` only where you need to judge whether an oracle is right.

## 2. Run the suite

**Environment first.** `curl -s -o /dev/null -w '%{http_code}' --max-time 10 $WISERSITE_BASE_URL/admin`
must be 200/30x before **and after** each run. If the app is down: do the static review, mark
the run as not executed, verdict at most `approve-with-comments`. If it died mid-run (failures
are `net::ERR_CONNECTION_REFUSED`; the report builder shows them as "environment"), discard
the run, restart the app (or ask the user), rerun.

Main run, always with the headed retry script and JSON alongside list (600000 ms timeout):

```bash
mkdir -p /tmp/<SCOPE>-review
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/<SCOPE>-review/run-main.json \
  npm run test:headed:retry -- <spec paths, or nothing for the whole suite> --reporter=list,json \
  > /tmp/<SCOPE>-review/run-main.log 2>&1; tail -40 /tmp/<SCOPE>-review/run-main.log
```

- `test:headed:retry` = headed + retries (see `package.json`), so a test that only passes on a
  retry shows as **flaky**, not passed. Flaky is a finding, never "fine".
- Flakiness repeat, **headless** to save time (headed adds minutes and finds nothing new;
  use `--headed` only if the user asks), no retries so every attempt counts:

  ```bash
  PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/<SCOPE>-review/run-repeat.json \
    npm test -- <flaky or suspicious specs> --repeat-each=3 --reporter=list,json \
    > /tmp/<SCOPE>-review/run-repeat.log 2>&1
  ```

  Suspicious = anything touching hover, localStorage, date boundaries, or that failed once.
- Timezones, for date-sensitive specs: `npm run test:tz:london -- <spec>` and
  `npm run test:tz:auckland -- <spec>` (headless). A zone-only failure is a finding.
- Playwright empties `test-results/` at the start of **every** run. Copy what you need
  (`error-context.md`, screenshots) to `/tmp/<SCOPE>-review/` before the next run, and build
  the report only after the last run.
- Static checks (read-only; don't run prettier `--write`):

  ```bash
  npm run typecheck && npx eslint src tests --ext .ts
  node .claude/skills/write-e2e-tests/scripts/check-oracle-independence.cjs
  node .claude/skills/stabilize-e2e-tests/scripts/check-defect-labels.cjs
  ```

## 3. Review checklist

Start from the coverage map, then read the specs to confirm it:

```bash
node .claude/skills/qa-review-report/scripts/ac-coverage.cjs \
  --tickets /tmp/<SCOPE>-explore/tickets.json --results /tmp/<SCOPE>-review/run-main.json \
  --json /tmp/<SCOPE>-review/coverage.json
```

Record each check (`pass` / `warn` / `fail` / `n/a`) with one line of evidence. Anything
`warn`/`fail` also gets a finding.

**A. Coverage and traceability**
1. Every ticket in scope (status Done / In QA / similar) has at least one spec; Closed /
   Won't Do tickets are not tested, or the reason is written down.
2. Every AC has a test that **asserts** it (coverage map status `asserted`), not one that merely
   touches the widget. The map trusts tags, so read the test body for each AC and say where
   a tag over-claims (a finding: the tag must match what's asserted).
3. Every test has `details({ ac, title, … })`; no untagged tests and no tags that match no AC
   (both listed by `ac-coverage.cjs`). Spec comments cite AC numbers that exist.
4. The test plan matrix exists and agrees with the specs (scenarios marked as implemented
   really are; AC/app discrepancies listed there have a test or a reason).
5. Ticket notes, Q&A and comments (often the real spec) are reflected in tests.
6. Non-functional ACs are covered or explicitly out of scope: permissions/access gate
   (`canViewAnalytics`, 403 vs 404), empty states, loading, persistence across reload,
   accessibility (screen-reader tables, accessible names), formatting (locale numbers, %,
   rounding).

**B. Is it tested right — assertion quality**
7. **Oracle independence**: expected values come from repositories in `src/db/repositories/`
   and functions in `src/expectations/`, never from `/api/widgets` responses, the app's own
   request params (`minDate`/`maxDate`, a widget's window) or imported app code.
   `check-oracle-independence.cjs` must be clean; read each `oracle-ok:` exception and each
   "AC silent: per app" citation and agree with it, or raise a finding.
8. **Oracle correctness**: the SQL cohort/filters/window match the ticket and the app's
   documented semantics (deleted / internal applications, inclusive end date, timezone, the
   source mapping, top-N + tie-break, rounding).
9. **Vacuous passes**: a test that passes without checking anything on current data — loops
   over an empty array, `if (rows.length) expect(...)`, comparing `[]` with `[]`, only
   `toBeVisible()`, or every preset hitting the empty state. Such a path must call
   `markLimitedByData()` (reports show "limited"); a vacuous path without the label is a
   finding. Check the author searched for a window with data before settling for empty.
10. **Weak matchers**: `toContain` / `toBeGreaterThan(0)` / `toBeTruthy` / regex where the AC
    gives an exact value; soft assertions; tolerance without a stated reason.
11. **Strong negatives**: hidden/empty states asserted positively (the widget is absent *and*
    SQL says no data), not just "no error".
12. **No hard-coded dates or data values** — windows from today or request params; grep for
    `20\d\d-\d\d` and literal counts.
13. **Skips** (`test.skip`, `test.fixme`): each has a data-terms reason and is decided from
    Postgres at runtime. A skip that always fires on this tenant = untested AC (list it).
14. **Defect labels**: tests that hit a logged defect fail red with `markKnownDefect()` citing
    an open KNOWN-DEFECTS.md ID; tests that hit an unlogged one fail red with
    `markSuspectedDefect()` and a row in `docs/suspected-defects.md`. Any `test.fail()` = finding
    (it hides bugs). A labelled test that passes, or a label `check-defect-labels.cjs` flags =
    finding. An unlabelled failure is a new problem until shown otherwise. An app/AC mismatch
    the suite works around instead of asserting the AC = blocker.
15. **Waits**: assertions wait for the widget's request for the new window (request tracker)
    before reading; no `waitForTimeout`, no sleeps, no retries used as a fix.
16. **Isolation**: no order dependence, no shared page across tests, localStorage filter state
    doesn't leak.

**C. Edge cases and boundaries** — present, or listed as a gap with the data that would unlock it
17. Window boundaries (first/last day inclusive), month edges and the TZ-1 class of
    timezone shift (the `test:tz:*` runs), custom range vs presets, widget-local period vs
    global filter with the **same label meaning the same dates** (`explore-live-ui
    --compare-presets`).
18. Zero / single / many: 0 hires, one source, exactly N and N+1 sources at a top-N cutoff,
    ties, a source with 0 in one measure, very large numbers (locale separators).
19. Percent and averages: division by zero shows "—", rounding matches the AC, previous-period
    comparison availability. Boundary values the UI can't reach on current data are listed as
    gaps with the data that would unlock them.

**D. Execution health**
20. Main run counts; every failure classified (test bug / app defect / data limitation /
    environment) with evidence from the log, `error-context.md` and, where it matters, SQL.
21. Flaky tests (passed on retry or not 3/3 in the repeat run), with the likely cause.
22. Duration outliers (> 30 s per test) and why. A slow oracle helper (e.g. a window search
    that rescans per-day rows for every candidate) is a test bug.
23. Typecheck clean, lint 0 errors and 0 warnings, oracle and defect-label checks clean.

**E. Structure (CLAUDE.md rules)**
24. Page = route, `<h1>`, page flows, one component per widget. Component = locators +
    behaviour only. Specs = flow + assertions only. Helpers live in constants/types/utils/
    network/expectations.
25. Locators: role + exact name, accessible table/status/combobox inside the widget root;
    no hashed CSS-module classes, no `nth()` without a reason; charts read through their
    screen-reader tables.
26. UI only: every test opens the board in the browser and asserts what a user sees. A test
    that only calls expectation or utility functions, or a spec outside `tests/e2e-wisersite/`,
    is a finding.
27. Readability: test names state the behaviour and the AC; `title`/`what` read well for
    business readers; failure messages identify the window and expected vs actual values.

## 4. Independent spot checks (saved, replayable)

For each ticket, re-derive 1–3 expected values **yourself** with a fresh query written from the
AC, not copied from the repository. Prefer a window that has data. Save every query:

```bash
node .claude/skills/qa-review-report/scripts/replay-spot-checks.cjs save \
  /tmp/<SCOPE>-review/spot-checks <ticket>-<metric>-<window> "SELECT ..."
```

and add `<name>.md` with the window, metric, UI value and the suite oracle's value. Compare
the three. A three-way disagreement is the most valuable finding a review can produce. In
re-review mode, start with `replay-spot-checks.cjs replay /tmp/<SCOPE>-review/spot-checks`.
Where an AC has no test, you may confirm the behaviour live with `explore-live-ui` /
Playwright MCP (read-only, never save anything) so the gap finding says what the app does.

## 5. Verdict

- `changes-requested`: any blocker — an AC with no real assertion while the ticket is in
  scope, a non-independent oracle, an assertion weakened to match a defect, a failing test
  that is a test bug, an oracle that is wrong.
- `approve-with-comments`: no blockers, but majors (flaky, vacuous-on-current-data, weak
  matchers, missing edge cases, missing test plan, structure violations).
- `approve`: only minors/nits.

Severity: **blocker** (the suite gives false confidence about an AC), **major** (coverage or
reliability gap), **minor** (maintainability, weak edge case), **nit** (style).

## 6. Build the reports

Write `/tmp/<SCOPE>-review/review.json`:

```json
{
  "title": "QA review — Source to Hire (WP23-62)",
  "scope": "WP23-62",
  "reviewedAt": "2026-10-12T14:00:00Z",
  "previousReview": "optional, re-review mode: path, date, verdict",
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
    "detail": "...", "evidence": "log excerpt / SQL result", "recommendation": "...",
    "status": "re-review only: fixed | partially-fixed | open | new", "statusNote": "evidence"
  }],
  "checks": [{ "area": "A. Coverage", "check": "Every AC asserted", "result": "pass | warn | fail | n/a", "evidence": "..." }],
  "spotChecks": [{ "ticket": "WP23-87", "window": "Last 3 months", "metric": "Total applications", "ui": "54", "sql": "54", "oracle": "54", "match": true }],
  "dataGaps": ["What can't be exercised on today's data, and what data would unlock it"],
  "notTested": ["What this review did not cover, and why"],
  "environment": { "App URL": "...", "App commit": "git -C ../wisersite-and-payload-plugin rev-parse --short HEAD", "Suite commit": "...", "Node": "...", "Playwright": "...", "DB today": "..." },
  "commands": ["exact commands run"]
}
```

Seed `tickets[].acs[].status` from `coverage.json`, then correct it from what you read.

Render (the first `--results` is the main run used for the headline tiles):

```bash
node .claude/skills/qa-review-report/scripts/build-report.cjs \
  --review /tmp/<SCOPE>-review/review.json \
  --results "Main run (test:headed:retry)=/tmp/<SCOPE>-review/run-main.json" \
  --results "Repeat x3 (headless)=/tmp/<SCOPE>-review/run-repeat.json" \
  --out reports/qa-review/<YYYY-MM-DD>-<SCOPE>.html
```

The builder splits failures into new / known defect / suspected defect / environment, and
passes into passed / limited by data. Counts come from Playwright's JSON, so don't restate
different numbers in `summary`. Open the HTML once to make sure it rendered.

Then build the business report from the same main run with the `qa-business-report` skill
(`reports/business/…`), so stakeholders get the plain-language view of the same results.
