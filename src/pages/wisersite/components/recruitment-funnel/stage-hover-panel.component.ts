import type { Locator } from '@playwright/test';
import type { StageHoverReading } from '../../../../types/wisersite/recruitment-funnel.types';

/**
 * The stage summary shown while a stage is hovered or focused (WP23-86 AC 1): a `role="tooltip"`
 * panel under the ribbon with the stage's category, `<h3>` name, candidates, arrival line,
 * source breakdown list and stage-flow boxes. The widget's "About this chart" note is also a
 * tooltip, so the panel is the tooltip holding a level-3 heading.
 */
export class StageHoverPanel {
  readonly root: Locator;
  readonly heading: Locator;

  constructor(widgetRoot: Locator) {
    this.root = widgetRoot
      .getByRole('tooltip')
      .filter({ has: widgetRoot.page().getByRole('heading', { level: 3 }) });
    this.heading = this.root.getByRole('heading', { level: 3 });
  }

  /**
   * A source in the breakdown list, by its exact name: a category, or one of its individual
   * sources once expanded (WP23-86 AC 3). The innermost match, in case sources nest in their
   * category's item.
   */
  sourceItem(name: string): Locator {
    return this.root
      .getByRole('listitem')
      .filter({ has: this.root.page().getByText(name, { exact: true }) })
      .last();
  }

  /** The expand / collapse control on a source category in the breakdown (WP23-86 AC 3, 3.1). */
  expandControl(category: string): Locator {
    return this.sourceItem(category).getByRole('button');
  }

  /**
   * Anything in the panel that could expand or collapse: a button, or any element carrying
   * `aria-expanded`. None at all means the panel has no expand control in any form.
   */
  get expandControls(): Locator {
    return this.root.locator('button, [aria-expanded]');
  }

  /** The count shown in a source's item, matched as a whole figure ("3" doesn't match "403"). */
  sourceCount(name: string, count: string): Locator {
    return this.sourceItem(name).getByText(count, { exact: true });
  }

  /**
   * Reads the panel in one in-page pass. Paragraphs run: category, then either "Candidates at
   * stage" / figure / arrival line (stage with data) or the note shown instead of metrics. The
   * stage-flow boxes have no roles, so they're parsed from the panel's text.
   */
  async read(): Promise<StageHoverReading> {
    return this.root.evaluate((el) => {
      const text = (node: Element | null | undefined) => node?.textContent?.trim() ?? '';
      const paragraphs = Array.from(el.querySelectorAll('p')).map((p) => text(p));
      const hasMetrics = paragraphs[1] === 'Candidates at stage';
      const sources = Array.from(el.querySelectorAll('li')).map((li) => {
        const leaves = Array.from(li.querySelectorAll('span'))
          .filter((span) => span.children.length === 0)
          .map((span) => text(span))
          .filter(Boolean);
        return { source: leaves[0] ?? '', count: leaves[1] ?? '', share: leaves[2] ?? '' };
      });
      const all = (el.textContent ?? '').replace(/\s+/g, ' ');
      const flowMatch =
        /From previous\s?(\S+)\s?(?:lost|gained|entry point)\s?Cumul\.\s?(\S+)\s?Drop\s?(\S+)/.exec(
          all,
        );
      return {
        category: paragraphs[0] ?? '',
        stage: text(el.querySelector('h3')),
        candidates: hasMetrics ? (paragraphs[2] ?? null) : null,
        arrival: hasMetrics ? (paragraphs[3] ?? null) : null,
        note: hasMetrics ? null : (paragraphs[1] ?? null),
        sources,
        flow: flowMatch
          ? { fromPrevious: flowMatch[1]!, cumulative: flowMatch[2]!, drop: flowMatch[3]! }
          : null,
      };
    });
  }
}
