import type { Locator, Page } from '@playwright/test';
import {
  NO_FILTER_RESULTS_MESSAGE,
  PIPELINE_WIDGET_HEADINGS,
} from '../../../../constants/wisersite/candidate-pipeline.constants';
import type {
  ColumnSortState,
  PipelineBySourceColumn,
  PipelineBySourceReading,
} from '../../../../types/wisersite/candidate-pipeline.types';

/**
 * "Pipeline by Source" (WP23-198): a sortable table of pipeline counts per source with a Total
 * row in its footer, a "Filter by Sources" select, and a "N rows shown" status. Removed from
 * the board when no source has applications in the window.
 */
export class PipelineBySourceWidget {
  readonly heading: Locator;
  /** The card: header with the filter, the table, the row-count status and the footnote. */
  readonly root: Locator;
  readonly table: Locator;
  readonly columnHeaders: Locator;
  readonly sourceFilter: Locator;
  /** Screen-reader status announcing how many rows are shown. */
  readonly rowCountStatus: Locator;
  /** The body line shown when the filter excludes every row. */
  readonly noResultsMessage: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: PIPELINE_WIDGET_HEADINGS.pipelineBySource,
      exact: true,
    });
    this.root = this.heading.locator('xpath=ancestor::*[.//table][1]');
    this.table = this.root.getByRole('table', {
      name: PIPELINE_WIDGET_HEADINGS.pipelineBySource,
      exact: true,
    });
    this.columnHeaders = this.table.getByRole('columnheader');
    this.sourceFilter = this.root.getByRole('combobox', { name: 'Filter by Sources' });
    this.rowCountStatus = this.root.getByRole('status').filter({ hasText: /rows? shown$/ });
    this.noResultsMessage = this.table.getByText(NO_FILTER_RESULTS_MESSAGE, { exact: true });
  }

  /** A column header; it carries `aria-sort` (`ascending` / `descending` / `none`). */
  columnHeader(column: string): Locator {
    return this.table.getByRole('columnheader', { name: column, exact: true });
  }

  /** Clicks a column title: the first click sorts high to low, the next low to high. */
  async sortBy(column: PipelineBySourceColumn): Promise<void> {
    await this.table.getByRole('button', { name: column, exact: true }).click();
  }

  /** Picks a source (or "All Sources") in the filter, by its visible label. */
  async filterBySource(label: string): Promise<void> {
    await this.sourceFilter.selectOption({ label });
  }

  async readColumnHeaders(): Promise<string[]> {
    return (await this.columnHeaders.allTextContents()).map((text) => text.trim());
  }

  /** `aria-sort` of every column header, by its label. */
  async readSortState(): Promise<ColumnSortState> {
    return Object.fromEntries(
      await this.columnHeaders.evaluateAll((headers) =>
        headers.map((th) => [th.textContent?.trim() ?? '', th.getAttribute('aria-sort')]),
      ),
    );
  }

  /** The filter's options, by visible label, in order (the "All Sources" option first). */
  async readFilterOptions(): Promise<string[]> {
    return (await this.sourceFilter.locator('option').allTextContents()).map((t) => t.trim());
  }

  /** The label of the option the filter currently shows. */
  async readSelectedFilter(): Promise<string> {
    return this.sourceFilter.evaluate(
      (select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? '',
    );
  }

  /**
   * The table as displayed, read in one pass so a re-render can't tear it: each data row's cell
   * texts in order (a single spanning message cell is not a data row) and the footer's Total.
   */
  async readReading(): Promise<PipelineBySourceReading> {
    return this.table.evaluate((table) => {
      const cells = (row: HTMLTableRowElement) =>
        Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? '');
      const element = table as HTMLTableElement;
      const rows = Array.from(element.tBodies)
        .flatMap((body) => Array.from(body.rows))
        .filter((row) => row.cells.length > 1)
        .map(cells);
      const footer = element.tFoot?.rows[0];
      return { rows, total: footer ? cells(footer) : null };
    });
  }
}
