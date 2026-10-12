import { expect, type Locator, type Page } from '@playwright/test';
import {
  NO_DATA_MESSAGE,
  WIDGET_HEADINGS,
} from '../../../../constants/wisersite/source-to-hire.constants';
import type {
  HiresByMonthTable,
  HiresTrendComparisonValue,
  WidgetPresetValue,
} from '../../../../types/wisersite/source-to-hire.types';
import { parseLocaleCount } from '../../../../utils/format/locale-number';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';
import { parseMonthLabel } from '../../../../utils/wisersite/date-format';

/**
 * "Hires Trend by Source" (WP23-158): a line chart with its own "Comparison" and "Time period"
 * selects, an interactive legend, a hover tooltip, and a screen-reader table (one column per
 * plotted series; comparison series as "<source> (prior)").
 */
export class HiresTrendBySourceWidget {
  readonly heading: Locator;
  /**
   * The whole LineGraph: the nearest ancestor of the heading holding either the chart's data
   * table or its empty-state line (the header alone holds neither).
   */
  readonly root: Locator;
  readonly comparisonSelect: Locator;
  readonly timePeriodSelect: Locator;
  readonly emptyState: Locator;
  readonly table: Locator;
  /** One toggle per plotted source (the "×" clear button excluded). */
  readonly legendButtons: Locator;
  /** The focusable plot area the crosshair and tooltip follow. */
  readonly plot: Locator;
  readonly tooltip: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: WIDGET_HEADINGS.hiresTrendBySource,
      exact: true,
    });
    this.root = this.heading.locator(
      `xpath=ancestor::*[.//table or .//p[normalize-space()="${NO_DATA_MESSAGE}"]][1]`,
    );
    this.comparisonSelect = this.root.getByRole('combobox', { name: 'Comparison' });
    this.timePeriodSelect = this.root.getByRole('combobox', { name: 'Time period' });
    this.emptyState = this.root.getByText(NO_DATA_MESSAGE, { exact: true });
    this.table = this.root
      .getByRole('table')
      .filter({ has: page.locator('caption', { hasText: 'Hires by Month' }) });
    this.legendButtons = this.root
      .getByRole('list', { name: 'Legend' })
      .getByRole('button')
      .filter({ hasNotText: '×' });
    this.plot = this.root.getByRole('group');
    this.tooltip = this.root.getByRole('status');
  }

  async setTimePeriod(value: WidgetPresetValue): Promise<void> {
    await this.timePeriodSelect.selectOption(value);
  }

  async setComparison(value: HiresTrendComparisonValue): Promise<void> {
    await this.comparisonSelect.selectOption(value);
  }

  /** The chart's data, from its accessible table. "No data" cells read as `null`. */
  async readTable(): Promise<HiresByMonthTable> {
    const seriesLabels = (await this.table.getByRole('columnheader').allTextContents())
      .slice(1) // first column is "Month"
      .map((text) => text.trim());
    const table: HiresByMonthTable = {};
    for (const row of await snapshotTableBodyRows(this.table)) {
      table[parseMonthLabel(row.rowHeader ?? '')] = Object.fromEntries(
        seriesLabels.map((label, index) => {
          const cell = row.cells[index];
          return [label, cell === undefined || cell === 'No data' ? null : parseLocaleCount(cell)];
        }),
      );
    }
    return table;
  }

  /** Moves the mouse onto the plot near its first or last month. */
  async hoverPlot(edge: 'start' | 'end'): Promise<void> {
    const box = await this.plot.boundingBox();
    if (!box) throw new Error('Hires Trend plot has no bounding box');
    await this.plot.hover({
      position: { x: edge === 'start' ? 2 : box.width - 2, y: box.height / 2 },
    });
  }

  /** The hover tooltip: the month it refers to and one `label -> value` per series. */
  async readTooltip(): Promise<{ month: string; rows: Record<string, string> }> {
    await expect(this.tooltip).toBeVisible();
    const paragraphs = this.tooltip.locator('p');
    // First paragraph is the month; each one after it is a series row: [chip] [label] [value].
    const seriesRows = await paragraphs.evaluateAll((all) =>
      all
        .slice(1)
        .map((row) =>
          Array.from(row.querySelectorAll('span')).map((span) => span.textContent?.trim() ?? ''),
        ),
    );
    return {
      month: ((await paragraphs.first().textContent()) ?? '').trim(),
      rows: Object.fromEntries(seriesRows.map((spans) => [spans[1] ?? '', spans[2] ?? ''])),
    };
  }
}
