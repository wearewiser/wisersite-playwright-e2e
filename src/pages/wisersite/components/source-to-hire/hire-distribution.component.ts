import { expect, type Locator, type Page } from '@playwright/test';
import { WIDGET_HEADINGS } from '../../../../constants/wisersite/source-to-hire.constants';
import type { HireDistributionSegment } from '../../../../types/wisersite/source-to-hire.types';
import { ownHitPoint } from '../../../../utils/dom/hit-point';
import { parseLocaleCount } from '../../../../utils/format/locale-number';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';

/**
 * "Hire Distribution" (WP23-157): a donut of hires per source with a centre readout, a legend,
 * and a screen-reader table (`Category | Share | Value`). Removed entirely when there are no
 * hires in the window.
 */
export class HireDistributionWidget {
  readonly heading: Locator;
  /** The whole card — ring, centre readout, legend and its accessible table. */
  readonly root: Locator;
  readonly table: Locator;
  /** The ring's segment arcs, in rank (legend) order. */
  readonly segments: Locator;
  readonly legendItems: Locator;
  /** The centre readout while a segment is probed: `[value] [share · name]`. */
  readonly centreReadout: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: WIDGET_HEADINGS.hireDistribution,
      exact: true,
    });
    this.root = this.heading.locator('xpath=ancestor::*[.//table][1]');
    this.table = this.root.getByRole('table');
    this.segments = this.root.locator('svg g path');
    this.legendItems = this.root.locator('ul > li');
    this.centreReadout = this.root.getByRole('status');
  }

  /** The resting centre total, e.g. "12". */
  centreText(text: string): Locator {
    return this.root.getByText(text, { exact: true }).first();
  }

  /** Segments as listed in the donut's accessible table — steadier than reading SVG arcs. */
  async readSegments(): Promise<HireDistributionSegment[]> {
    return (await snapshotTableBodyRows(this.table)).map((row) => ({
      source: row.rowHeader ?? '',
      share: row.cells[0] ?? '',
      hires: parseLocaleCount(row.cells[1]),
    }));
  }

  /** Each legend row's source name and chip colour (the colour its segment is drawn in). */
  async readLegendColours(): Promise<{ source: string; color: string | null }[]> {
    return this.legendItems.evaluateAll((items) =>
      items.map((item) => {
        const spans = Array.from(item.querySelectorAll('span'));
        const chip = spans.find((span) => span.style.backgroundColor);
        // Legend row: [chip] [label] [share] [value] — the label is the first leaf span with text.
        const label = spans.find(
          (span) => span !== chip && !span.querySelector('span') && span.textContent?.trim(),
        );
        return {
          source: label?.textContent?.trim() ?? '',
          color: chip?.style.backgroundColor ?? null,
        };
      }),
    );
  }

  /**
   * Moves the real mouse onto one segment. An arc's bounding-box centre often lands in the
   * ring's hole or on a neighbour, so it aims at a point where the arc itself is on top.
   */
  async hoverSegment(index: number): Promise<void> {
    await this.segments.nth(index).scrollIntoViewIfNeeded();
    const position = await ownHitPoint(this.segments.nth(index));
    if (!position) throw new Error(`Hire Distribution segment ${index} has no hoverable point`);
    await this.segments.nth(index).hover({ position });
  }

  async readCentreReadout(): Promise<{ value: string; caption: string }> {
    await expect(this.centreReadout).toBeVisible();
    const [value, caption] = await this.centreReadout.locator('span').allTextContents();
    return { value: (value ?? '').trim(), caption: (caption ?? '').trim() };
  }
}
