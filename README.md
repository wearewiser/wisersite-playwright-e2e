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
  config/wisersite.env.ts       Zod-validated env config (base URL, TENANT_SQL_*, admin creds)
  db/
    wisersite-db-client.ts      Read-only pg Pool wrapper (TenantSqlClient)
    repositories/wisersite/     One repository per widget, queries the warehouse directly
  pages/
    base.page.ts                Shared page behaviour (goto, waitForLoad)
    wisersite/                  Page objects: admin login, one per analytics dashboard page
  fixtures/wisersite.fixtures.ts  Custom `test` wiring the DB client + page objects together,
                                   including a fixture that logs into /admin once per test

tests/
  wisersite-global-setup.ts     Confirms the warehouse is reachable before the suite starts
  e2e-wisersite/*.spec.ts       The tests

playwright.wisersite.config.ts
```

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
npm run test:headed  # watch it run
npm run test:ui       # Playwright's UI mode
npm run test:debug    # step through with the inspector
npm run test:report   # open the last HTML report
```

## Adding a new widget's coverage

1. Add a repository under `src/db/repositories/wisersite/<widget>.repository.ts` querying the
   relevant `analytics.gold_*` table(s) — check the plugin's own
   `src/widgets/<Widget>/get<Widget>.ts` for exact date-window/exclusion-filter semantics before
   writing an independent query.
2. Add a page object under `src/pages/wisersite/<widget>.page.ts` extending `BasePage`, targeting
   whatever admin route hosts that widget (`/admin/source-to-hire`, `/admin/candidate-pipeline`,
   `/admin/analytics`, ...).
3. Wire both into `src/fixtures/wisersite.fixtures.ts`.
4. Write the spec under `tests/e2e-wisersite/`, comparing the UI to the repository's result for
   the same active date window (see `source-to-hire-summary.spec.ts` for the pattern).

See `PLAN.md` for the researched list of which widgets are Postgres-backed (in scope) vs.
Mongo-backed (out of scope).
