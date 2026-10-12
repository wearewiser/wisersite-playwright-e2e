# wisersite-and-payload-plugin E2E suite

Playwright + TypeScript end-to-end tests for the `wisersite-and-payload-plugin` Payload CMS
admin analytics dashboard. Tests drive the real admin UI with Playwright **and** independently
query the tenant's Postgres analytics warehouse directly, then assert the two agree — not that
the app's own API says they agree.

## Scope

- **UI**: `http://localhost:3000/admin` — the target app (`D:\Repositories\wiser-projects\wisersite-and-payload-plugin`)
  must already be running there (`pnpm dev` in that repo). This suite does not start it.
- **Data verification**: Postgres only, against the tenant analytics warehouse
  (`analytics.gold_*` tables, reached via `TENANT_SQL_*`). The plugin's primary content DB
  (MongoDB) is out of scope — this suite never connects to it.
- The warehouse is real, shared demo data, not seeded fixtures. Nothing here resets, seeds, or
  writes to it — every repository is read-only (`SELECT` only).

## Architecture

```
src/
  config/wisersite.env.ts         Zod-validated env config (base URL, TENANT_SQL_*, admin creds)
  constants/wisersite/            Fixed UI values: routes, headings, presets, option lists, columns
  types/wisersite/                Shared shapes (rows, tile readings, preset/option unions)
  db/
    wisersite-db-client.ts        Read-only pg Pool wrapper (TenantSqlClient)
    repositories/wisersite/       One repository per widget, queries the warehouse directly
  network/wisersite/              WidgetRequestTracker — records each widget's /api/widgets fetch
  expectations/wisersite/         Independent oracles: what each widget *should* show, from SQL rows
  pages/
    base.page.ts                  Shared page behaviour (goto, waitForLoad)
    wisersite/
      <board>.page.ts             One page per dashboard — composes components, page-level flows only
      components/                 Reusable components (admin sidebar, global date-range picker)
        <board>/                  One component per widget — locators + behaviour only
  utils/
    format/, dom/, playwright/    Generic helpers (locale numbers, CSS vars, atomic table snapshot)
    wisersite/                    Date arithmetic (date-window) and UI date formats (date-format)
    sort.ts
  fixtures/wisersite.fixtures.ts  Custom `test` wiring DB, network tracker and page objects together,
                                  including a fixture that logs into /admin once per test

tests/
  wisersite-global-setup.ts       Confirms the warehouse is reachable before the suite starts
  e2e-wisersite/<board>/*.spec.ts The tests, one folder per dashboard and one spec per ticket
                                  (e.g. source-to-hire/ covers epic WP23-62)

playwright.wisersite.config.ts
```

Page objects follow a strict split: **pages and components hold locators and user behaviour
only**. Parsing DOM text, formatting, date maths, request tracking and "what should this show"
logic live in `utils/`, `network/` and `expectations/`, so specs read as flow + assertions.

## Setup

```bash
npm install
cp .env.example .env      # fill in TENANT_SQL_PASSWORD and ADMIN_PASSWORD
npx playwright install    # downloads browser binaries
```

Make sure `wisersite-and-payload-plugin`'s dev server is running first:

```bash
cd D:\Repositories\wiser-projects\wisersite-and-payload-plugin
pnpm dev
```

## Running the tests

```bash
npm test             # headless
npm run test:retry   # headless, re-runs a failed test once (2 attempts total)
npm run test:headed  # watch it run
npm run test:ui       # Playwright's UI mode
npm run test:debug    # step through with the inspector
npm run test:report   # open the last HTML report
```

Retries are off by default locally, so a real failure is never masked. To opt in for any run:

```bash
npm run test:retry                                  # 1 retry
npm test -- --retries=2                             # any number, any other flags
RETRIES=1 npm run test:headed                       # same, via env var
npm run test:retry -- tests/e2e-wisersite/source-to-hire/hire-distribution.spec.ts
```

A test that only passes on its retry is reported as **flaky** (not passed) in the console and
HTML report, and its retry attempt records a trace (`trace: 'on-first-retry'`). CI keeps 2 retries.

## Adding a new widget's coverage

1. Add a repository under `src/db/repositories/wisersite/<widget>.repository.ts` querying the
   relevant `analytics.gold_*` table(s) — check the plugin's own
   `src/widgets/<Widget>/get<Widget>.ts` for exact date-window/exclusion-filter semantics before
   writing an independent query.
2. Add a component under `src/pages/wisersite/components/<board>/<widget>.component.ts`
   (locators + behaviour only) and compose it into that board's page object
   (`src/pages/wisersite/<board>.page.ts`, extending `BasePage`, e.g. `/analytics/source-to-hire`).
   Put any "what should it show" logic in `src/expectations/wisersite/`, not in the component.
3. Wire the repository (and any new page) into `src/fixtures/wisersite.fixtures.ts`.
4. Write the spec under `tests/e2e-wisersite/<board>/`, comparing the UI to the repository's result for
   the same active date window (see `source-to-hire-summary.spec.ts` for the pattern).

## Writing tests with Claude Code

`.claude/` contains an agent and skills that turn a Jira epic into verified tests in this
repo's structure (conventions are in `CLAUDE.md`). In Claude Code, ask for the
**`e2e-test-author`** agent with an epic or ticket key, e.g. "use e2e-test-author for WP23-62".
It runs these phases, and each skill also works on its own:

| Skill | Does |
|---|---|
| `fetch-jira-tickets` | Epic + every child ticket with full ACs (read-only) |
| `map-feature-code` | Route, SQL, shaping, empty states and DOM in the app repo |
| `profile-tenant-data` | What the warehouse actually holds; which ACs can be exercised (read-only SQL) |
| `explore-live-ui` | Live aria tree, widget requests and saved state at localhost:3000 |
| `design-test-scenarios` | AC → scenario matrix in `docs/test-plans/<KEY>.md` |
| `write-e2e-tests` | Specs, components, repositories, expectations |
| `stabilize-e2e-tests` | Run, diagnose, de-flake, classify failures |

`.mcp.json` registers the Atlassian and Playwright MCP servers. Approve them on first launch,
and run `/mcp` to log in to Atlassian. `.claude/settings.json` pre-approves the read-only and
test commands. `git commit` / `git push` always ask first. The agent never commits.

See `PLAN.md` for the researched list of which widgets are Postgres-backed (in scope) vs.
Mongo-backed (out of scope).
