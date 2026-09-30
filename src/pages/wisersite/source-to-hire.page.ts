import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { AdminSidebar } from './components/admin-sidebar.component';

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

/** Parses the DateRangePicker's display format ("d MMM yyyy", e.g. "16 Sep 2026") to ISO. */
function parseDisplayDate(text: string): string {
  const [day, month, year] = text.trim().split(' ');
  if (!day || !month || !year) {
    throw new Error(`Unrecognised date display: "${text}"`);
  }
  const mm = MONTHS[month];
  if (!mm) {
    throw new Error(`Unrecognised month abbreviation: "${month}"`);
  }
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

/** Matches a calendar day option's accessible name by its ordinal, e.g. `5` -> /\b5th\b/. */
function dayOrdinalPattern(day: number): RegExp {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return new RegExp(`\\b${day}${suffix}\\b`);
}

/** Parses the Hires-by-Month table's row headers ("Sep 25") to `YYYY-MM-01`. */
function parseMonthLabel(text: string): string {
  const [month, year] = text.trim().split(' ');
  const mm = month ? MONTHS[month] : undefined;
  if (!mm || !year) {
    throw new Error(`Unrecognised month label: "${text}"`);
  }
  return `20${year}-${mm}-01`;
}

/** One row of the "Applications by Source" bar list or "Source Performance Breakdown" table. */
export type SourceRow = {
  source: string;
  applications: number;
  screened?: number;
  hires?: number;
  /** Whichever percentage label the widget shows — "Hire Rate" or "Conversion Rate". */
  rateLabel: string;
};

export type GlobalPresetLabel = 'Last 30 days' | 'Last 3 months' | 'Last 6 months' | 'Last 12 months';

export type WidgetPresetValue =
  | 'match-global'
  | 'last-30-days'
  | 'last-3-months'
  | 'last-6-months'
  | 'last-12-months';

/**
 * The Source to Hire admin dashboard (/admin/source-to-hire): the summary KPI row, the
 * "Applications by Source" bar list, "Hires Trend by Source" chart, and "Source Performance
 * Breakdown" table — plus the global date filter and each widget's own date-range override.
 */
export class SourceToHirePage extends BasePage {
  protected readonly path = '/admin/source-to-hire';

  readonly sidebar: AdminSidebar;
  readonly applicationsValue: Locator;
  readonly screenedValue: Locator;
  readonly hiresValue: Locator;
  readonly avgHirePeriodValue: Locator;
  private readonly dateRangeTrigger: Locator;
  private readonly dateRangePopover: Locator;
  private readonly applicationsBySourceTable: Locator;
  private readonly sourcePerformanceTable: Locator;
  private readonly hiresByMonthTable: Locator;

  constructor(page: Page) {
    super(page);
    this.sidebar = new AdminSidebar(page);
    this.applicationsValue = this.tileValue('Total Applications');
    this.screenedValue = this.tileValue('Total Screened');
    this.hiresValue = this.tileValue('Total Hires');
    this.avgHirePeriodValue = this.tileValue('Average Hire Period');
    this.dateRangeTrigger = page.locator('button', {
      hasText: /\d{1,2} \w{3} \d{4}\s*[–-]\s*\d{1,2} \w{3} \d{4}/,
    });
    this.dateRangePopover = page.getByRole('dialog', { name: 'Select date range' });

    // Neither of these two tables has a helpful accessible name of its own, so they're
    // identified by a column/caption that's unique to them (confirmed against the real
    // accessibility tree, not guessed from source — see sources-to-hire-tests.MD).
    this.applicationsBySourceTable = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Hire rate', exact: true }) });
    this.sourcePerformanceTable = page.getByRole('table', { name: 'Source Performance Breakdown' });
    this.hiresByMonthTable = page
      .getByRole('table')
      .filter({ has: page.locator('caption', { hasText: 'Hires by Month' }) });
  }

  /**
   * Each SummaryKpiTile renders `<p>{label}</p>` then a sibling `<p>{value}</p>` — both are
   * `p` descendants of the same tile root, in that order. CSS module class names are hashed
   * at build time, so this walks the DOM by label text instead of a class name.
   */
  private tileValue(label: string): Locator {
    return this.page.locator('p', { hasText: label }).locator('xpath=..').locator('p').nth(1);
  }

  /**
   * The container a widget's heading and its own controls (e.g. its "Time period" override)
   * share as a common ancestor — confirmed against the real DOM to be the heading's immediate
   * parent, not a class name (hashed at build time).
   */
  private widgetHeaderContainer(heading: string): Locator {
    // The exact DOM depth between the heading and its widget's `<select>` isn't stable
    // (accessibility-tree "parent" is not the same thing as a DOM XPath ancestor level), so
    // walk up to the nearest real ancestor that actually contains a `<select>` at all, rather
    // than guessing a fixed number of `..` hops.
    return this.page
      .getByRole('heading', { level: 3, name: heading, exact: true })
      .locator('xpath=ancestor::*[.//select][1]');
  }

  /**
   * Reaches the board the way a user would: through the admin sidebar's Analytics group
   * rather than a direct `goto`.
   */
  async openFromSidebar(): Promise<void> {
    await this.sidebar.navigateTo('Analytics', 'Source to Hire');
    await expect(this.page).toHaveURL(/\/analytics\/source-to-hire$/, { timeout: 45_000 });
  }

  /** Opens the global date filter and applies a preset, waiting for the popover to close. */
  async selectGlobalDatePreset(preset: GlobalPresetLabel): Promise<void> {
    await this.dateRangeTrigger.first().click();
    await this.dateRangePopover.getByRole('button', { name: preset, exact: true }).click();
    await this.dateRangePopover.getByRole('button', { name: 'Apply', exact: true }).click();
    await this.dateRangePopover.waitFor({ state: 'hidden' });
  }

  async selectLast12MonthsPreset(): Promise<void> {
    await this.selectGlobalDatePreset('Last 12 months');
  }

  /**
   * Opens the global date filter and clicks two day cells within the first visible month
   * panel to set an arbitrary custom range (not a preset) — e.g. `setCustomGlobalDateRange(5,
   * 15)` picks the 5th and 15th of whichever month the panel currently shows. Callers should
   * put the picker in a known state (e.g. `selectGlobalDatePreset('Last 12 months')`) first,
   * since the calendar always opens showing `[startMonth, startMonth + 1]` of whatever range
   * is currently active.
   */
  async setCustomGlobalDateRange(startDay: number, endDay: number): Promise<void> {
    await this.dateRangeTrigger.first().click();
    // Days are `option`s inside a `listbox` per month (e.g. accessible name "Choose Friday,
    // September 5th, 2025"), not a `grid` of `button`s — confirmed against the real
    // accessibility tree, not guessed. Matching on the ordinal ("5th") rather than the full
    // name avoids needing to know which month/year is currently displayed.
    const firstMonthListbox = this.dateRangePopover.getByRole('listbox').first();
    await firstMonthListbox.getByRole('option', { name: dayOrdinalPattern(startDay) }).click();
    await firstMonthListbox.getByRole('option', { name: dayOrdinalPattern(endDay) }).click();
    await this.dateRangePopover.getByRole('button', { name: 'Apply', exact: true }).click();
    await this.dateRangePopover.waitFor({ state: 'hidden' });
  }

  /** Reads the currently-applied global date filter directly off its trigger button. */
  async getActiveDateRange(): Promise<{ startDate: string; endDate: string }> {
    const text = (await this.dateRangeTrigger.first().textContent()) ?? '';
    const [start, end] = text.split(/[–-]/).map((part) => part.trim());
    if (!start || !end) {
      throw new Error(`Could not parse date range from trigger text: "${text}"`);
    }
    return { startDate: parseDisplayDate(start), endDate: parseDisplayDate(end) };
  }

  /**
   * The per-widget date-range override — a real `<select>` accessibly named "Time period" (the
   * visible "Match Global Date Picker" text is its currently-selected *option*, not the
   * combobox's own name). Found on Hires Trend by Source and Source Performance Breakdown, not
   * on Applications by Source, which has no date control of its own.
   */
  async setWidgetDatePreset(heading: string, preset: WidgetPresetValue): Promise<void> {
    await this.widgetHeaderContainer(heading)
      .getByRole('combobox', { name: 'Time period' })
      .selectOption(preset);
  }

  /**
   * Waits for Source Performance Breakdown's own (independent) fetch to finish rendering data
   * rows. Each widget on this page fetches its own data separately — the KPI tiles resolving
   * (via `applicationsValue` losing its "—" placeholder) does not mean this table has too, so
   * reading its rows right after changing the date range without this wait is a race.
   */
  async waitForSourcePerformanceRows(): Promise<void> {
    // A transient "row 1 has *a* cell" state (e.g. a single-cell loading placeholder row) can
    // satisfy a weaker wait and then disappear before the real read happens — this genuinely
    // flaked in practice. A real data row always has exactly 5 cells (source, applications,
    // screened, hires, conversion rate), so require that specific shape instead.
    await expect(this.sourcePerformanceTable.getByRole('row').nth(1).getByRole('cell')).toHaveCount(
      5,
      { timeout: 15_000 },
    );
  }

  /** As {@link waitForSourcePerformanceRows}, for the "Applications by Source" bar list. */
  async waitForApplicationsBySourceRows(): Promise<void> {
    // A real data row is [bar graphic, applications, hire rate] = 3 cells, same reasoning as
    // waitForSourcePerformanceRows.
    await expect(this.applicationsBySourceTable.getByRole('row').nth(1).getByRole('cell')).toHaveCount(
      3,
      { timeout: 15_000 },
    );
  }

  /** Rows of the "Applications by Source" table (top 6, ranked by applications desc). */
  async getApplicationsBySourceRows(): Promise<SourceRow[]> {
    const rows = this.applicationsBySourceTable.getByRole('row');
    const rowCount = await rows.count();
    const result: SourceRow[] = [];
    for (let i = 1; i < rowCount; i += 1) {
      const row = rows.nth(i);
      const source = (await row.getByRole('rowheader').innerText()).trim();
      const cells = await row.getByRole('cell').allInnerTexts();
      // cells: [bar graphic (empty), applications, hire rate]
      result.push({ source, applications: Number(cells[1]?.trim()), rateLabel: (cells[2] ?? '').trim() });
    }
    return result;
  }

  /**
   * Rows of the "Source Performance Breakdown" table. Returns `[]` for the
   * "No source data for this period" empty state (that row has no `cell`s to read).
   */
  async getSourcePerformanceRows(): Promise<SourceRow[]> {
    const rows = this.sourcePerformanceTable.getByRole('row');
    const rowCount = await rows.count();
    const result: SourceRow[] = [];
    for (let i = 1; i < rowCount; i += 1) {
      const cells = await rows.nth(i).getByRole('cell').allInnerTexts();
      if (cells.length < 5) continue;
      result.push({
        source: cells[0]!.trim(),
        applications: Number(cells[1]!.trim()),
        screened: Number(cells[2]!.trim()),
        hires: Number(cells[3]!.trim()),
        rateLabel: cells[4]!.trim(),
      });
    }
    return result;
  }

  /** Clicks a Source Performance Breakdown column header to toggle its sort direction. */
  async sortSourcePerformanceBy(
    column: 'Source' | 'Application total' | 'Screened applications' | 'Total hires' | 'Conversion rate',
  ): Promise<void> {
    await this.sourcePerformanceTable.getByRole('button', { name: column, exact: true }).click();
  }

  /** Whether "Source Performance Breakdown" is showing its no-data empty state. */
  getSourcePerformanceEmptyState(): Locator {
    return this.sourcePerformanceTable.getByText('No source data for this period');
  }

  /** Whether "Applications by Source" is rendered at all (it disappears entirely when empty). */
  getApplicationsBySourceSection(): Locator {
    return this.page.getByRole('heading', { level: 3, name: 'Applications by Source', exact: true });
  }

  /** Whether "Hires Trend by Source" is showing its no-data empty state. */
  getHiresTrendEmptyState(): Locator {
    return this.page.getByText('No data for this period');
  }

  /**
   * The screen-reader-only data table backing the "Hires Trend by Source" chart — more
   * reliable to assert against than the SVG/canvas chart itself. Returns
   * `{ [month]: { [sourceChannel]: hires | null } }` ('No data' cells map to `null`).
   */
  async getHiresByMonthTable(): Promise<Record<string, Record<string, number | null>>> {
    const sourceColumns = (await this.hiresByMonthTable.getByRole('columnheader').allInnerTexts())
      .slice(1) // first columnheader is "Month"
      .map((text) => text.trim());

    const rows = this.hiresByMonthTable.getByRole('row');
    const rowCount = await rows.count();
    const result: Record<string, Record<string, number | null>> = {};
    for (let i = 1; i < rowCount; i += 1) {
      const row = rows.nth(i);
      const month = parseMonthLabel(await row.getByRole('rowheader').innerText());
      const values = await row.getByRole('cell').allInnerTexts();
      const bySource: Record<string, number | null> = {};
      sourceColumns.forEach((sourceChannel, index) => {
        const value = values[index]?.trim();
        bySource[sourceChannel] = value === 'No data' || value === undefined ? null : Number(value);
      });
      result[month] = bySource;
    }
    return result;
  }
}
