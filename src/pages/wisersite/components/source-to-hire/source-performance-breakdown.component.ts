import { expect, type Locator, type Page } from '@playwright/test';
import {
  NO_SOURCE_DATA_MESSAGE,
  WIDGET_HEADINGS,
  WIDGET_TIMEOUT_MS,
} from '../../../../constants/wisersite/source-to-hire.constants';
import type {
  SourcePerformanceColumn,
  SourceRow,
  WidgetPresetValue,
} from '../../../../types/wisersite/source-to-hire.types';
import { parseLocaleCount } from '../../../../utils/format/locale-number';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';

/**
 * "Source Performance Breakdown" (WP23-159): a sortable table — source, application total,
 * screened, hires, conversion rate — with its own "Time period" select.
 */
export class SourcePerformanceBreakdownWidget {
  readonly heading: Locator;
  readonly timePeriodSelect: Locator;
  readonly table: Locator;
  readonly columnHeaders: Locator;
  readonly emptyState: Locator;
  private readonly bodyRows: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: WIDGET_HEADINGS.sourcePerformanceBreakdown,
      exact: true,
    });
    // The header shares its nearest `<select>`-holding ancestor with the "Time period" control.
    this.timePeriodSelect = this.heading
      .locator('xpath=ancestor::*[.//select][1]')
      .getByRole('combobox', { name: 'Time period' });
    this.table = page.getByRole('table', { name: WIDGET_HEADINGS.sourcePerformanceBreakdown });
    this.columnHeaders = this.table.getByRole('columnheader');
    this.emptyState = this.table.getByText(NO_SOURCE_DATA_MESSAGE);
    this.bodyRows = this.table.locator('tbody').getByRole('row');
  }

  /** A column header — carries `aria-sort` (`ascending` / `descending` / `none`). */
  columnHeader(column: SourcePerformanceColumn): Locator {
    return this.table.getByRole('columnheader', { name: column, exact: true });
  }

  async setTimePeriod(value: WidgetPresetValue): Promise<void> {
    await this.timePeriodSelect.selectOption(value);
  }

  /** Clicks a column title — first click sorts high-to-low, the next low-to-high. */
  async sortBy(column: SourcePerformanceColumn): Promise<void> {
    await this.table.getByRole('button', { name: column, exact: true }).click();
  }

  /**
   * Waits for a real 5-cell data row. A transient single-cell loading/empty row can satisfy a
   * weaker wait and vanish before the read.
   */
  async waitForRows(): Promise<void> {
    await expect(this.bodyRows.first().getByRole('cell')).toHaveCount(5, {
      timeout: WIDGET_TIMEOUT_MS,
    });
  }

  async readColumnHeaders(): Promise<string[]> {
    return (await this.columnHeaders.allTextContents()).map((text) => text.trim());
  }

  /** Rows in display order; `[]` for the empty state (a single spanning cell). */
  async readRows(): Promise<SourceRow[]> {
    return (await snapshotTableBodyRows(this.table))
      .filter((row) => row.cells.length >= 5)
      .map(({ cells }) => ({
        source: cells[0]!,
        applications: parseLocaleCount(cells[1]),
        screened: parseLocaleCount(cells[2]),
        hires: parseLocaleCount(cells[3]),
        rateLabel: cells[4]!,
      }));
  }
}
