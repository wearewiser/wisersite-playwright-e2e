import { expect, type Locator, type Page } from '@playwright/test';
import {
  WIDGET_HEADINGS,
  WIDGET_TIMEOUT_MS,
} from '../../../../constants/wisersite/source-to-hire.constants';
import type {
  ApplicationsBySourceBars,
  SourceRow,
} from '../../../../types/wisersite/source-to-hire.types';
import { readCssVariable } from '../../../../utils/dom/css';
import { parseLocaleCount } from '../../../../utils/format/locale-number';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';

/**
 * "Applications by Source" (WP23-156): a ranked bar table — row header = source, then the bar
 * cell, the applications figure and the hire rate. The whole card is removed (not emptied)
 * when the window has no data.
 */
export class ApplicationsBySourceWidget {
  readonly heading: Locator;
  /** The whole card: header, legend and bar table. */
  readonly root: Locator;
  readonly subtitle: Locator;
  readonly legendItems: Locator;
  /** Any `<select>`s in the card — it has none; it only follows the global date filter. */
  readonly controls: Locator;
  /** No accessible name of its own, so it's identified by its unique "Hire rate" column. */
  readonly table: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: WIDGET_HEADINGS.applicationsBySource,
      exact: true,
    });
    this.root = this.heading.locator('xpath=ancestor::*[.//table][1]');
    this.subtitle = this.root.getByText('Top 6 sources', { exact: true });
    this.legendItems = this.root.getByRole('list', { name: 'Legend' }).getByRole('listitem');
    this.controls = this.root.getByRole('combobox');
    this.table = page
      .getByRole('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Hire rate', exact: true }) });
    this.rows = this.table.locator('tbody').getByRole('row');
  }

  /** The applications figure shown on a row (0-based body row index). */
  applicationsCell(rowIndex: number): Locator {
    return this.rows.nth(rowIndex).getByRole('cell').nth(1);
  }

  /** Waits for real data rows — [bar, applications, hire rate] — rather than a loading state. */
  async waitForRows(): Promise<void> {
    await expect(this.rows.first().getByRole('cell')).toHaveCount(3, {
      timeout: WIDGET_TIMEOUT_MS,
    });
  }

  /** Rows in the order shown. */
  async readRows(): Promise<SourceRow[]> {
    return (await snapshotTableBodyRows(this.table)).map((row) => ({
      source: row.rowHeader ?? '',
      applications: parseLocaleCount(row.cells[1]),
      rateLabel: row.cells[2] ?? '',
    }));
  }

  /** Each row's painted fills (applications first, screens over it), width as % of the track. */
  async readBars(): Promise<ApplicationsBySourceBars[]> {
    return (await snapshotTableBodyRows(this.table)).map((row) => ({
      source: row.rowHeader ?? '',
      fills: row.fillStyles.map((style) => ({
        color: readCssVariable(style, '--bar-color'),
        width: Number.parseFloat(readCssVariable(style, '--bar-width') ?? 'NaN'),
      })),
    }));
  }
}
