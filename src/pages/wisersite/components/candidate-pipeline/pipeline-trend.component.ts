import type { Locator, Page } from '@playwright/test';
import { widgetCard } from '../../../../utils/dom/widget-card';
import {
  PIPELINE_TREND_EMPTY_MESSAGE,
  PIPELINE_TREND_TABLE_CAPTION,
  PIPELINE_WIDGET_HEADINGS,
} from '../../../../constants/wisersite/candidate-pipeline.constants';
import type {
  MonthlySeriesTable,
  PipelineTrendComparisonValue,
} from '../../../../types/wisersite/candidate-pipeline.types';
import type { WidgetPresetValue } from '../../../../types/wisersite/source-to-hire.types';
import { parseLocaleCount } from '../../../../utils/format/locale-number';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';
import { parseMonthLabel } from '../../../../utils/wisersite/date-format';

/** A week point's axis label on the "Last 30 days" chart. */
const WEEK_LABEL = /^W\d+$/;

/**
 * "Pipeline Trend" (WP23-93): a line chart of Applied / Rejected / Confirmed with its own
 * "Comparison" and "Time period" selects and a screen-reader table ("Candidates by Month. …"),
 * one column per plotted series, comparison series as "<label> (prior)".
 */
export class PipelineTrendWidget {
  readonly heading: Locator;
  /**
   * The whole chart: the nearest ancestor of the heading holding its data table or its empty
   * line. The nearest ancestor with a `<select>` is only the header, which holds neither.
   */
  readonly root: Locator;
  readonly comparisonSelect: Locator;
  readonly timePeriodSelect: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;
  /** The chart itself, or its empty state: whichever means the widget has rendered. */
  readonly content: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: PIPELINE_WIDGET_HEADINGS.pipelineTrend,
      exact: true,
    });
    this.root = widgetCard(this.heading);
    this.comparisonSelect = this.root.getByRole('combobox', { name: 'Comparison' });
    this.timePeriodSelect = this.root.getByRole('combobox', { name: 'Time period' });
    this.table = this.root
      .getByRole('table')
      .filter({ has: page.locator('caption', { hasText: PIPELINE_TREND_TABLE_CAPTION }) });
    this.emptyState = this.root.getByText(PIPELINE_TREND_EMPTY_MESSAGE, { exact: true });
    this.content = this.table.or(this.emptyState);
  }

  async setComparison(value: PipelineTrendComparisonValue): Promise<void> {
    await this.comparisonSelect.selectOption(value);
  }

  async setTimePeriod(value: WidgetPresetValue): Promise<void> {
    await this.timePeriodSelect.selectOption(value);
  }

  async readTimePeriodOptions(): Promise<string[]> {
    return (await this.timePeriodSelect.locator('option').allTextContents()).map((t) => t.trim());
  }

  /** The visible label of the timescale / period currently selected. */
  async readSelectedTimePeriod(): Promise<string> {
    return this.timePeriodSelect.evaluate(
      (select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? '',
    );
  }

  async readComparisonOptions(): Promise<string[]> {
    return (await this.comparisonSelect.locator('option').allTextContents()).map((t) => t.trim());
  }

  /**
   * The chart's data from its accessible table, keyed by month (`YYYY-MM-01`), or by week label
   * (`W1` …) when it plots weeks; "No data" cells read as `null`. `null` when the chart shows its
   * empty state instead.
   */
  async readTable(): Promise<MonthlySeriesTable | null> {
    if ((await this.table.count()) === 0) return null;
    const seriesLabels = (await this.table.getByRole('columnheader').allTextContents())
      .slice(1) // first column is the x axis ("Month" or "Week")
      .map((text) => text.trim());
    const table: MonthlySeriesTable = {};
    for (const row of await snapshotTableBodyRows(this.table)) {
      const axisLabel = (row.rowHeader ?? '').trim();
      table[WEEK_LABEL.test(axisLabel) ? axisLabel : parseMonthLabel(axisLabel)] =
        Object.fromEntries(
          seriesLabels.map((label, index) => {
            const cell = row.cells[index];
            return [
              label,
              cell === undefined || cell === 'No data' ? null : parseLocaleCount(cell),
            ];
          }),
        );
    }
    return table;
  }
}
