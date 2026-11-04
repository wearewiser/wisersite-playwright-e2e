---
name: stabilize-e2e-tests
description: Run the wisersite Playwright suite (or new specs) until results are trustworthy — typecheck, lint, run, diagnose every failure from traces/logs and live SQL, fix test bugs, repeat-run for flakiness, and classify what remains as test bug / app defect / data limitation. Use after writing or changing specs, and whenever a run fails or flakes.
---

# Run and stabilise

The app must be running at `WISERSITE_BASE_URL`. Keep all logs in `/tmp/<KEY>-explore/`.

## 0. Environment, before and after every run

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "${WISERSITE_BASE_URL:-http://localhost:3000}/admin"
```

Not 200/30x → stop: the app is down, start it (or ask the user to). The suite's global setup
also refuses to start without the app ("ENVIRONMENT: the app is not reachable…"). Check again
**after** the run: if the app died mid-run, most failures will be `net::ERR_CONNECTION_REFUSED`
on `page.goto`. Classify that run as **environment**, discard it, restart, rerun. Never report
those as test failures.

## 1. Static checks

```bash
npx prettier --write src tests >/dev/null && npm run typecheck && npx eslint src tests --ext .ts
```

0 type errors, 0 lint errors, 0 lint warnings (conditional `test.skip` and conditional expects
are allowed by `.eslintrc.cjs`, so any warning is real; don't `eslint-disable` it without a
reason). Then the static guards:

```bash
node .claude/skills/write-e2e-tests/scripts/check-oracle-independence.cjs --strict
node .claude/skills/stabilize-e2e-tests/scripts/check-defect-labels.cjs --strict
```

`check-defect-labels` reports labels whose defect is fixed or superseded in KNOWN-DEFECTS.md
(remove the label and re-check the test), suspected defects that have since been logged (move
them to `KNOWN_DEFECTS`, citing the Jira key; add the key to `KNOWN_DEFECT_REGISTER_ROWS` if the
register row has another ID), and unused constants. It resolves Jira keys through
`KNOWN_DEFECT_REGISTER_ROWS`; it never needs, and you never make, an edit to KNOWN-DEFECTS.md.
A defect the user or PO **accepts** is no longer tested: remove the test or assertion and its
label, and add it to "Known defects accepted" in `docs/suspected-defects.md`.

## 2. Run

```bash
npx playwright test -c playwright.wisersite.config.ts tests/e2e-wisersite/<board>/<file>.spec.ts \
  --reporter=list > /tmp/<KEY>-explore/run-1.log 2>&1; tail -40 /tmp/<KEY>-explore/run-1.log
```

Use a 600000 ms Bash timeout (workers = 1, first route hit compiles slowly). Run new specs
first, then the whole suite (`npm test`) to catch fixture/shared-component regressions.

## 3. Diagnose each failure. Read before you edit

- The error + the `console.log` window/expected lines in the log.
- `test-results/<test>/` → `error-context.md` (aria snapshot at failure), screenshot, video;
  trace with `npx playwright show-trace` when retried.
- Re-query the warehouse for that exact window (`profile-tenant-data` ad-hoc mode) and re-dump
  the UI in that state (`explore-live-ui`). Decide which of the three sides is wrong.

| Classification | Signs | Action |
|---|---|---|
| **Test bug** | Wrong locator / strict-mode violation, race (asserted before the widget's request), oracle filter differs from the app's documented semantics, timezone/date-boundary maths | Fix the test. Re-run |
| **App defect** | UI ≠ SQL and ≠ AC, while the oracle matches the AC and the code map; reproducible live | Keep the AC assertion. Record file:line, window, expected vs actual. Already in `KNOWN-DEFECTS.md` → let it fail, labelled with `markKnownDefect()` + ID; new → leave it failing unlabelled and report it (don't edit the app repo's docs unless asked) |
| **Data limitation** | The scenario needs data that doesn't exist (0 hires, no 12-month history) | Assert the empty-state path or `test.skip` with a data-terms reason; list it as a data gap |
| **Environment** | App down (`ERR_CONNECTION_REFUSED` / "ENVIRONMENT:" from global setup), first-compile timeout, DB unreachable | Fix the environment / rerun; never bump timeouts globally to mask it, never count it as a test result |

**Never weaken a test to make it pass**: no loosening `toEqual` to `toContain`, no deleting
the assertion, no asserting the app's value because "that's what it shows". If the oracle
itself is wrong, fix it to match the **AC** and document why in a comment.

**Fix the pattern, not the line.** A test bug, or a code-review comment citing file:line, is
one example of a pattern. Name the pattern, grep `src/` and `tests/` for every other
occurrence, fix them all, and list the extra places in your report. Then prove the fix with a
break-it run (`write-e2e-tests`, "Prove it can fail") wherever the test is meant to catch
something.

## 4. Flakiness

```bash
npx playwright test -c playwright.wisersite.config.ts <spec> --repeat-each=3 --reporter=list
```

Any spec that is not 3/3 is flaky. Typical causes here:

- **Stale reads.** After a preset or period change the widget keeps showing the *previous*
  window's rows until the refetch lands, so "wait until there are rows" (`waitForRows()`,
  `toBeVisible()`, `toHaveCount(n > 0)`) passes at once on the old content. Before reading,
  wait for the widget's request for the **new** window (`expect.poll(() =>
  widgetRequests.last(key)).toEqual(window)`), or poll the reading until it **equals** the
  expected value (`expect.poll(() => widget.readRows()).toEqual(expected)`), which an old
  reading can't satisfy. When you find one stale read, grep every spec for the same pattern.
- **Hover readouts.** Use a real mouse hover (`locator.hover({ position })`, with
  `ownHitPoint()` from `src/utils/dom/hit-point.ts` for shapes like donut arcs). Never
  `dispatchEvent('pointerover')` or other synthetic events: they pass even when a user can't
  trigger the readout.
- **State leaking** between tests through localStorage (each test gets a fresh context; don't
  share pages).
- **Moving window boundaries** (compute from the request params).

Fix the cause; never add retries or sleeps.

## 4b. Timezones (date-sensitive specs)

Any spec that computes windows, months or "today" runs under three zones as well, because
month/day-shift bugs (KNOWN-DEFECTS TZ-1) and UTC-vs-local "today" only show away from UTC:

```bash
npm run test:tz:utc -- <spec>; npm run test:tz:london -- <spec>; npm run test:tz:auckland -- <spec>
```

Each sets `TZ` (the oracle's date maths in Node) and `TEST_TZ` (the browser's `timezoneId`).
The app server keeps its own zone. A failure in one zone only is a timezone bug: in the test's
date maths (fix it) or in the app (defect, with the zone in the evidence).

**A zone run only proves something when its local date differs from the UTC date.** Auckland
at 23:44 has the same date as UTC and finds nothing. So always add the off-day run, which
picks whichever of `Pacific/Kiritimati` (UTC+14) or `Pacific/Pago_Pago` (UTC−11) is on a
different calendar day right now (at any time of day, one of them is), and checks that the
dates still differed when the run finished:

```bash
npm run test:tz:offday -- <spec>
```

It prints the zone, the local, UTC and server dates, and refuses to start with less than 30
minutes of off-day time left. In a report, a zone run whose dates matched counts as "not run".

## 5. Final state to report

Exact command(s) and counts: passed / failed (new) / failed (known defect) / skipped / flaky. For each
non-pass: classification, one line of evidence, and file:line (test or app). Re-run the full
suite once more after the last edit, and report that run, not an earlier one.
