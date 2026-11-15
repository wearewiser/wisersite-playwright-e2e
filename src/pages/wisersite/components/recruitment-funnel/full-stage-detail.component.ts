import type { Locator } from '@playwright/test';
import type {
  SourcePerformanceRow,
  StageSummaryReading,
} from '../../../../types/wisersite/recruitment-funnel.types';
import { matchTextColourToken } from '../../../../utils/dom/css';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';

/**
 * The pinned stage's full detail under the ribbon (WP23-295, inline since WP23-390): a
 * `role="dialog"` named "Full stage detail: <Stage>" with previous / next / close controls and
 * regions "Summary statistics", "Source performance", "Device split", "Why candidates leave"
 * and "Conversion to next stage".
 */
export class FullStageDetail {
  readonly root: Locator;
  readonly title: Locator;
  readonly closeButton: Locator;
  readonly previousButton: Locator;
  readonly nextButton: Locator;
  readonly summary: Locator;
  readonly sourcePerformance: Locator;
  readonly sourceTable: Locator;
  readonly deviceSplit: Locator;
  readonly leaveReasons: Locator;
  readonly conversionChart: Locator;
  /** The note shown in place of figures on a stage without data. */
  readonly note: Locator;

  constructor(widgetRoot: Locator) {
    this.root = widgetRoot.getByRole('dialog', { name: /^Full stage detail: / });
    this.title = this.root.getByRole('heading', { level: 2 });
    this.closeButton = this.root.getByRole('button', {
      name: 'Close full stage detail',
      exact: true,
    });
    this.previousButton = this.root.getByRole('button', { name: /^Previous stage/ });
    this.nextButton = this.root.getByRole('button', { name: /^Next stage/ });
    this.summary = this.root.getByRole('region', { name: 'Summary statistics', exact: true });
    this.sourcePerformance = this.root.getByRole('region', {
      name: 'Source performance',
      exact: true,
    });
    this.sourceTable = this.sourcePerformance.getByRole('table');
    this.deviceSplit = this.root.getByRole('region', { name: 'Device split', exact: true });
    this.leaveReasons = this.root.getByRole('region', {
      name: 'Why candidates leave',
      exact: true,
    });
    this.conversionChart = this.root.getByRole('region', {
      name: 'Conversion to next stage',
      exact: true,
    });
    this.note = this.root.locator('xpath=./p');
  }

  /** A source performance row, by its row header (a category or an individual source). */
  sourceRow(name: string): Locator {
    return this.sourceTable
      .getByRole('row')
      .filter({ has: this.root.page().getByRole('rowheader', { name, exact: true }) });
  }

  /**
   * Anything in the source performance table that could expand or collapse a row: a button, or
   * any element carrying `aria-expanded` (by design there is none, WP23-591).
   */
  get sourceTableExpandControls(): Locator {
    return this.sourceTable.locator('button, [aria-expanded]');
  }

  /** The figure under a summary term ("Candidates at stage", "Lost at this stage", …). */
  summaryValue(term: string): Locator {
    return this.summary.locator(
      `xpath=.//dt[normalize-space()="${term}"]/following-sibling::dd[1]`,
    );
  }

  /** "<Category> · Stage n of 8" above the title. */
  async readPhaseLine(): Promise<string> {
    return ((await this.root.locator('xpath=./header//p').first().textContent()) ?? '').trim();
  }

  /** Rendered text colour of a summary figure (the colour the user sees). */
  async readSummaryColour(term: string): Promise<string> {
    return this.summaryValue(term).evaluate((el) => getComputedStyle(el).color);
  }

  /** Whether a summary figure is painted in the board's warning tone (`--tone-warning`). */
  async summaryShowsWarningTone(term: string): Promise<boolean> {
    return (
      (await matchTextColourToken(this.summaryValue(term), { warning: '--tone-warning' })) ===
      'warning'
    );
  }

  async readSummary(): Promise<StageSummaryReading> {
    const read = async (term: string) =>
      ((await this.summaryValue(term).textContent()) ?? '').trim();
    return {
      candidates: await read('Candidates at stage'),
      arrived: await read('Arrived from previous'),
      lost: await read('Lost at this stage'),
    };
  }

  /**
   * The source performance table, sub-source rows grouped under their category. Rows carry no
   * marker of their level, so a row whose name is the next expected category starts a group
   * (`categories` in order); every other row belongs to the group above it.
   */
  async readSourcePerformance(categories: readonly string[]): Promise<SourcePerformanceRow[]> {
    const rows: SourcePerformanceRow[] = [];
    for (const row of await snapshotTableBodyRows(this.sourceTable)) {
      const [candidates = '', share = '', toNext = ''] = row.cells;
      const name = row.rowHeader ?? '';
      if (categories[rows.length] === name) {
        rows.push({ source: name, candidates, share, toNext, subSources: [] });
      } else {
        rows.at(-1)?.subSources.push({ source: name, candidates, share });
      }
    }
    return rows;
  }
}
