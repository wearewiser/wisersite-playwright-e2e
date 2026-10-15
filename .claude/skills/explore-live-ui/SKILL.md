---
name: explore-live-ui
description: Explore a wisersite analytics board live at localhost:3000 before writing locators — logs in, opens the route, optionally applies a global preset, custom range or widget select, and dumps the accessibility tree, every /api/widgets request with its params, persisted localStorage and a screenshot. Use to confirm the real DOM/aria contract and request params, and to catch divergence from the code reading, before designing scenarios or writing page objects.
---

# Explore the live UI (read-only)

The app must already be running (`WISERSITE_BASE_URL`, default `http://localhost:3000`). Uses
this repo's `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Never save, publish or edit anything in
the admin. Changing the global date filter is fine: it only writes this browser's localStorage.

## 1. Scripted dump: start here

```bash
mkdir -p /tmp/<KEY>-explore
node .claude/skills/explore-live-ui/scripts/explore.cjs --path /analytics/source-to-hire \
  --out /tmp/<KEY>-explore > /tmp/<KEY>-explore/ui-default.txt
```

| Flag | Effect |
|---|---|
| `--path` (required) | Board route. Routes are `/analytics/<board>`, **not** `/admin/...` |
| `--preset "Last 6 months"` | Opens the global picker, clicks the preset, Apply |
| `--range 2026-07-21:2026-07-31` | Picks a custom range day by day in the calendar, Apply |
| `--select "<h3 heading>\|<combobox name>=<option value>"` | Changes a widget-local select; repeatable |
| `--hover "<css/role selector>"` | Hovers the first match before the snapshot (tooltips, readouts) |
| `--compare-presets "<h3 heading>\|<combobox name>\|<widget key>"` | Applies each global preset and each of the widget's own period options, and prints a table of the window the widget requested for each, flagging `DIFFERENT` where a widget option and the global preset share a label but not the dates. Also prints the option labels |
| `--headed` | Watch it run |

Output: final URL + HTTP status + `<h1>`, the aria tree from the board heading down (calendar
day options filtered out), widget requests **in order** (de-duplicated), localStorage, and a
full-page screenshot path. Run it once per state you care about (default, each preset, a
narrow custom range, an empty window, each local select) and keep the outputs. They are the
evidence for the scenario matrix.

The first hit on a route can take 30–60 s (Next.js dev compiles it on demand). Use a 240000 ms
Bash timeout.

**Run `--compare-presets` once for every widget with its own period control** (e.g.
`"Source Performance Breakdown|Time period|sourcePerformanceBreakdown"`). Every `DIFFERENT` row
is a discrepancy candidate for `design-test-scenarios`: same label, different window (this is
how WP23-159's calendar-month "Last 3 months" should have been caught). A widget that sends no
dates (e.g. a fixed 36-month fetch) shows `?..?`; record what it does instead.

## 2. Interactive: when the dump isn't enough

Use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_hover`, `browser_network_requests`, `browser_evaluate`; load them with `ToolSearch`
"+playwright browser") for hover states, tooltips, sorting, keyboard focus, or anything
multi-step. Log in at `/admin` first. Read state with
`browser_evaluate` (computed styles, `--bar-width`, `aria-sort`, `localStorage`), never by
mutating it.

## What to confirm and record (`/tmp/<KEY>-explore/ui-notes.md`)

1. **Route and gate**: real URL, heading text/level, sidebar entry, behaviour without permission
   if the ticket covers it.
2. **Requests**: which widgets send the global `startDate`/`endDate`, which send their own
   window or nothing, extra params (`minDate`/`maxDate`), what refetches on each control, and
   what does **not** (contained local controls).
3. **Accessible contract per widget**: heading, tables and their names, row/column headers,
   sr-only tables behind charts, `role="status"` readouts, `aria-label`s carrying state,
   combobox names and option **values** (for `selectOption`). Prefer these for locators; note
   where a widget has no accessible handle and needs a structural fallback.
4. **States seen on current data**: loading copy, "No data for this period", widget removed
   entirely, "—" placeholders, 0.0% rates. Tie each one to the data profile.
5. **Persistence**: localStorage keys and shape. Does a reload keep the filter? Do local
   selects persist or reset?
6. **Divergences**: anything that differs from `map-feature-code` or the ticket (copy, order,
   rounding, a param not sent). These become discrepancy rows in `design-test-scenarios`.
7. **Copy vs the ticket**: put every visible label the ACs quote or name (option labels,
   captions, column headers, empty-state text) side by side with the AC wording in a table.
   Any difference ("Compare 3 months" vs "vs 3 months ago") is a discrepancy candidate, even
   when it looks cosmetic: the tests must not adopt the app's wording silently.
8. **Same label, same meaning**: the `--compare-presets` table for each widget period control.

Spot-check one or two numbers from the dump against `profile-tenant-data` ad-hoc SQL now. A
mismatch here is cheaper to understand than a failing test later.
