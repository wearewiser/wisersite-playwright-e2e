# wisersite-playwright-e2e

Playwright + TypeScript E2E suite for the analytics dashboards in `../wisersite-and-payload-plugin`.
Tests drive the live admin UI and compare it against independent, read-only SQL on the tenant
Postgres warehouse. See `README.md` for setup and the folder layout.

## Hard rules

- **Never `git commit` or `git push` unless the user explicitly asks in that message.** Leave
  changes uncommitted and say so.
- **Read-only outside this repo**: Postgres `SELECT` only (it's real, shared demo data), Jira
  read only (no comments or transitions), never edit `../wisersite-and-payload-plugin`, never
  save content in the live admin.
- Expected values come from warehouse SQL + the ticket's rules, **never** from the app's API or
  imported app code. App code is only for learning semantics (filters, rounding, windows).
- No hard-coded dates or data values. Compute windows relative to today or from the request
  params. Branch or skip on what Postgres says exists, with a reason.
- Never weaken an assertion to match app behaviour, and never hide a bug behind `test.fail()`.
  A test that hits a known defect fails red and is labelled with `markKnownDefect()`
  (`src/utils/playwright/test-annotations.ts`) using the ID from
  `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`. A suspected new defect fails
  unlabelled and is reported.

## Strict page-object model

- Page (`src/pages/wisersite/<board>.page.ts`): route, `<h1>`, page-level flows, and one
  component per widget. Nothing else.
- Component (`src/pages/wisersite/components/<board>/<widget>.component.ts`): locators and
  user behaviour only.
- Everything else has its own home: `constants/`, `types/`, `utils/`, `network/`,
  `expectations/` (SQL rows → expected UI), `db/repositories/` (SELECT-only oracles).
- Specs hold test flow and assertions only. Every test declares the ACs it asserts and a
  plain-language title with `details({ ac, title, what, variant })`
  (`src/utils/playwright/test-annotations.ts`); an empty-state-only path calls
  `markLimitedByData()`. Browser-free rule checks live in `tests/rules/`.
- Locators: role + exact name first, then the accessible table/status/combobox inside the
  widget root. Never hashed CSS-module classes. Read charts through their screen-reader tables.

## Commands

```bash
npm run typecheck
npx eslint src tests --ext .ts             # 0 errors and 0 warnings
npx prettier --write src tests docs        # not `npm run format`: it rewrites every .md file
npx playwright test -c playwright.wisersite.config.ts <spec> --reporter=list
npm run test:headed:retry                  # headed, with retries: the QA review run
npm run test:rules                         # browser-free rule checks (no app needed)
npm run test:tz:london -- <spec>           # also :utc / :auckland, for date-sensitive specs
node .claude/skills/write-e2e-tests/scripts/check-oracle-independence.cjs --strict
node .claude/skills/stabilize-e2e-tests/scripts/check-defect-labels.cjs --strict
```

The app must already be running at `WISERSITE_BASE_URL` (default `http://localhost:3000`);
global setup stops the run with an `ENVIRONMENT:` error when it isn't. Board routes are
`/analytics/<board>`, not `/admin/...`.

## Agent and skills (`.claude/`)

To write tests from Jira, use the **`e2e-test-author`** agent with an epic or ticket key (e.g.
`WP23-62`). It runs these skills in order, and each one can also be used on its own:
`fetch-jira-tickets` → `map-feature-code` → `profile-tenant-data` → `explore-live-ui` →
`design-test-scenarios` (writes `docs/test-plans/<KEY>.md`, mandatory before any code) →
`write-e2e-tests` → `stabilize-e2e-tests` → a self-review with `qa-review-report` →
`qa-business-report`. Scratch output goes to `/tmp/<KEY>-explore/`, never into the repo.

To review tests, use the **`qa-test-reviewer`** agent with an epic/ticket key, a spec path, or
nothing (whole suite); say "re-review" to check which earlier findings are fixed. It runs the
suite with `npm run test:headed:retry`, maps every AC to the tests that assert it, audits test
quality, spot-checks values with saved SQL, and writes an HTML review to `reports/qa-review/`
(skill: `qa-review-report`) and a plain-language business report to `reports/business/`
(skill: `qa-business-report`). It doesn't edit any tests. `reports/` is gitignored and, unlike
`test-results/`, never emptied by Playwright.

Defects: logged ones are in `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`;
ones this suite found that aren't logged yet go in `docs/suspected-defects.md`. IDs for both
live in `src/constants/wisersite/known-defects.constants.ts`.
