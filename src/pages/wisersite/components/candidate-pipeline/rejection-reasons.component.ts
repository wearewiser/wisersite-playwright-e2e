import type { Locator, Page } from '@playwright/test';
import { widgetCard } from '../../../../utils/dom/widget-card';
import {
  PIPELINE_WIDGET_HEADINGS,
  REJECTION_REASONS_EMPTY_MESSAGE,
  REJECTION_REASONS_TOTAL_CAPTION,
} from '../../../../constants/wisersite/candidate-pipeline.constants';
import type {
  CentreReadout,
  DonutEmphasis,
  RejectionReasonsReading,
} from '../../../../types/wisersite/candidate-pipeline.types';
import { ownHitPoint } from '../../../../utils/dom/hit-point';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';

/**
 * "Rejection Reasons" (WP23-94): a donut of rejections by reason with the total in the centre,
 * a legend, and a screen-reader table (`Category | Share | Value`). Shows "No data for this period" when there
 * is nothing to draw.
 */
export class RejectionReasonsWidget {
  readonly heading: Locator;
  /** The whole card: ring, centre, legend and accessible table, or the empty line. */
  readonly root: Locator;
  readonly table: Locator;
  readonly emptyState: Locator;
  /** The chart, or its empty state: whichever means the widget has rendered. */
  readonly content: Locator;
  /** The resting centre total: the value printed above the "rejections" caption. */
  readonly centreTotal: Locator;
  /** The centre readout while a segment is hovered: `[count] [share · name]`. */
  readonly centreReadout: Locator;
  /** The ring's segment arcs, in legend order (the grey track is outside the `<g>` groups). */
  readonly segments: Locator;
  readonly legendRows: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: PIPELINE_WIDGET_HEADINGS.rejectionReasons,
      exact: true,
    });
    this.root = widgetCard(this.heading);
    this.table = this.root.getByRole('table');
    this.emptyState = this.root.getByText(REJECTION_REASONS_EMPTY_MESSAGE, { exact: true });
    this.content = this.table.or(this.emptyState);
    this.centreTotal = this.root
      .getByText(REJECTION_REASONS_TOTAL_CAPTION, { exact: true })
      .locator('xpath=preceding-sibling::span[1]');
    this.centreReadout = this.root.getByRole('status');
    this.segments = this.root.locator('svg g path');
    this.legendRows = this.root.getByRole('listitem');
  }

  /**
   * What the donut shows at rest: the centre total and each category from the accessible table.
   * `null` when the widget shows its "No data for this period" state.
   */
  async readReading(): Promise<RejectionReasonsReading | null> {
    if ((await this.table.count()) === 0) return null;
    return {
      total: ((await this.centreTotal.textContent()) ?? '').trim(),
      categories: (await snapshotTableBodyRows(this.table)).map((row) => ({
        category: row.rowHeader ?? '',
        share: row.cells[0] ?? '',
        value: row.cells[1] ?? '',
      })),
    };
  }

  /**
   * Moves the real mouse onto one segment (legend order). An arc's box centre is usually the
   * ring's hole, so it aims at a point where the arc itself is on top. SVG is the only handle
   * for this: the arcs have no accessible name.
   */
  async hoverSegment(index: number): Promise<void> {
    const segment = this.segments.nth(index);
    await segment.scrollIntoViewIfNeeded();
    const position = await ownHitPoint(segment);
    if (!position) throw new Error(`Rejection Reasons segment ${index} has no hoverable point`);
    await segment.hover({ position });
  }

  /**
   * The centre readout while a segment is hovered; `null` until it shows. Read it with a poll,
   * so the wait lives in the spec.
   */
  async readCentreReadout(): Promise<CentreReadout | null> {
    if (!(await this.centreReadout.isVisible())) return null;
    const [value, caption] = await this.centreReadout.locator('span').allTextContents();
    return { value: (value ?? '').trim(), caption: (caption ?? '').trim() };
  }

  /**
   * Whether each segment and legend row is drawn at full strength or greyed out, from its
   * rendered opacity (multiplied by its ancestors' up to the chart; under 0.95 = greyed). Read
   * from computed styles, never class names; SVG is the only source for the segments.
   */
  async readEmphasis(): Promise<DonutEmphasis> {
    const bands = (elements: Element[], stopAt: string) =>
      elements.map((element) => {
        let opacity = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
          if (node.matches(stopAt)) break;
        }
        return opacity >= 0.95 ? ('full' as const) : ('greyed' as const);
      });
    return {
      segments: await this.segments.evaluateAll(bands, 'svg'),
      legendRows: await this.legendRows.evaluateAll(bands, 'ul'),
    };
  }
}
