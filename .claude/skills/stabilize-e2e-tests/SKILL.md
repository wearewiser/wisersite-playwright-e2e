---
name: stabilize-e2e-tests
description: Run the wisersite Playwright suite (or new specs) until results are trustworthy — typecheck, lint, run, diagnose every failure from traces/logs and live SQL, fix test bugs, repeat-run for flakiness, and classify what remains as test bug / app defect / data limitation. Use after writing or changing specs, and whenever a run fails or flakes.
---

# Run and stabilise

The app must be running at `WISERSITE_BASE_URL`. Keep all logs in `/tmp/<KEY>-explore/`.

## 1. Static checks

```bash
npx prettier --write src tests >/dev/null && npm run typecheck && npx eslint src tests --ext .ts
```

0 type errors, 0 lint errors. Existing warnings for data-driven `test.skip` / conditionals
are accepted; don't add `eslint-disable` to hide new ones without a reason.

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
| **App defect** | UI ≠ SQL and ≠ AC, while the oracle matches the AC and the code map; reproducible live | Keep the AC assertion. Record file:line, window, expected vs actual. Already in `KNOWN-DEFECTS.md` → `test.fail()` + ID; new → report it (don't edit the app repo's docs unless asked) |
| **Data limitation** | The scenario needs data that doesn't exist (0 hires, no 12-month history) | Assert the empty-state path or `test.skip` with a data-terms reason; list it as a data gap |
| **Environment** | App down, first-compile timeout, DB unreachable | Fix the environment / rerun; never bump timeouts globally to mask it |

**Never weaken a test to make it pass**: no loosening `toEqual` to `toContain`, no deleting
the assertion, no asserting the app's value because "that's what it shows". If the oracle
itself is wrong, fix it to match the **AC** and document why in a comment.

## 4. Flakiness

```bash
npx playwright test -c playwright.wisersite.config.ts <spec> --repeat-each=3 --reporter=list
```

Any spec that is not 3/3 is flaky. Typical causes here: reading a widget before its refetch
for the new window landed (poll on `widgetRequests.last(key)` first), hover readouts (use
`dispatchEvent('pointerover')` as in `HireDistributionWidget`), localStorage filter leaking
between tests (each test gets a fresh context; don't share pages), and data near a moving
window boundary (compute from the request params). Fix the cause; never add retries or sleeps.

## 5. Final state to report

Exact command(s) and counts: passed / failed / skipped / flaky / expected-fail. For each
non-pass: classification, one line of evidence, and file:line (test or app). Re-run the full
suite once more after the last edit, and report that run, not an earlier one.
