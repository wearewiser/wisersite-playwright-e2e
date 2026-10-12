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
- Never weaken an assertion to match app behaviour. Known defects get `test.fail()` with the
  ID from `../wisersite-and-payload-plugin/testing-docs/KNOWN-DEFECTS.md`.

## Strict page-object model

- Page (`src/pages/wisersite/<board>.page.ts`): route, `<h1>`, page-level flows, and one
  component per widget. Nothing else.
- Component (`src/pages/wisersite/components/<board>/<widget>.component.ts`): locators and
  user behaviour only.
- Everything else has its own home: `constants/`, `types/`, `utils/`, `network/`,
  `expectations/` (SQL rows → expected UI), `db/repositories/` (SELECT-only oracles).
- Specs hold test flow and assertions only.
- Locators: role + exact name first, then the accessible table/status/combobox inside the
  widget root. Never hashed CSS-module classes. Read charts through their screen-reader tables.

## Commands

```bash
npm run typecheck
npx eslint src tests --ext .ts
npx prettier --write src tests docs        # not `npm run format`: it rewrites every .md file
npx playwright test -c playwright.wisersite.config.ts <spec> --reporter=list
```

The app must already be running at `WISERSITE_BASE_URL` (default `http://localhost:3000`).
Board routes are `/analytics/<board>`, not `/admin/...`.

## Agent and skills (`.claude/`)

To write tests from Jira, use the **`e2e-test-author`** agent with an epic or ticket key (e.g.
`WP23-62`). It runs these skills in order, and each one can also be used on its own:
`fetch-jira-tickets` → `map-feature-code` → `profile-tenant-data` → `explore-live-ui` →
`design-test-scenarios` (writes `docs/test-plans/<KEY>.md`) → `write-e2e-tests` →
`stabilize-e2e-tests`. Scratch output goes to `/tmp/<KEY>-explore/`, never into the repo.

To review tests, use the **`qa-test-reviewer`** agent with an epic/ticket key, a spec path, or
nothing (whole suite). It runs the suite with `npm run test:headed:retry`, maps every AC to the
tests that assert it, audits test quality, spot-checks values with its own SQL, and writes an
HTML report to `test-results/qa-review/` (skill: `qa-review-report`). It doesn't edit any
tests. Playwright clears `test-results/` on every run, so copy a report out if you want to keep it.
