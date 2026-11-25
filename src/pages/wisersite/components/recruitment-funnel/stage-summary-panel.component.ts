import type { Locator } from '@playwright/test';
import type { StageSummaryPanelReading } from '../../../../types/wisersite/recruitment-funnel.types';

/**
 * The pinned stage's summary under the ribbon (WP23-86 AC 1, new design WP23-591): a
 * `role="group"` named "Stage summary: <Stage>" with the stage's category, `<h3>` name,
 * candidates, arrival line, a source breakdown list (each source a disclosure button that
 * expands into its individual sources) and the stage-flow boxes, plus a "Full stage detail"
 * button that swaps the summary for the full detail. Hovering a stage opens nothing.
 */
export class StageSummaryPanel {
  readonly root: Locator;
  readonly heading: Locator;
  /** Opens the stage's full detail in place of this summary (absent on a stage without data). */
  readonly fullDetailButton: Locator;

  constructor(widgetRoot: Locator) {
    this.root = widgetRoot.getByRole('group', { name: /^Stage summary: / });
    this.heading = this.root.getByRole('heading', { level: 3 });
    this.fullDetailButton = this.root.getByRole('button', {
      name: 'Full stage detail',
      exact: true,
    });
  }

  /**
   * The expand / collapse button of a source in the breakdown (WP23-86 AC 3, 3.1). Its name
   * is "<Source> <count> <share>", so it's matched on the source name followed by a space.
   */
  expandControl(source: string): Locator {
    return this.root.getByRole('button', { name: new RegExp(`^${source} `) });
  }

  /**
   * An individual source listed under an expanded source, by its exact name. The innermost
   * list item holding the name, as the sub-source list sits inside its source's item.
   */
  sourceItem(name: string): Locator {
    return this.root
      .getByRole('listitem')
      .filter({ has: this.root.page().getByText(name, { exact: true }) })
      .last();
  }

  /** The count shown in an individual source's item, matched as a whole figure. */
  sourceCount(name: string, count: string): Locator {
    return this.sourceItem(name).getByText(count, { exact: true });
  }

  /**
   * Reads the panel in one in-page pass. Paragraphs run: category, then either "Candidates at
   * stage" / figure / arrival line (stage with data) or the note shown instead of metrics.
   * Sources are the top-level list's items, read from their buttons (count and share), plus
   * the individual sources of any expanded one. The stage-flow boxes have no roles, so they're
   * parsed from the panel's text (less the full-detail button).
   */
  async read(): Promise<StageSummaryPanelReading> {
    return this.root.evaluate((el) => {
      const text = (node: Element | null | undefined) => node?.textContent?.trim() ?? '';
      const leaves = (node: Element) =>
        Array.from(node.querySelectorAll('span'))
          .filter((span) => span.children.length === 0)
          .map((span) => text(span))
          .filter(Boolean);
      const paragraphs = Array.from(el.querySelectorAll(':scope p')).map((p) => text(p));
      const hasMetrics = paragraphs[1] === 'Candidates at stage';
      const list = el.querySelector('ul');
      const items = list ? Array.from(list.children).filter((c) => c.tagName === 'LI') : [];
      const sources = items.map((li) => {
        const [source = '', count = '', share = ''] = leaves(li.querySelector('button') ?? li);
        return { source, count, share };
      });
      const subSources = items.flatMap((li) =>
        Array.from(li.querySelectorAll('ul > li')).map((sub) => {
          const [source = '', count = '', share = ''] = leaves(sub);
          return { source, count, share };
        }),
      );
      // The stage-flow text, without the "Full stage detail" button that follows it.
      const flowText = el.cloneNode(true) as Element;
      for (const button of Array.from(flowText.querySelectorAll('button'))) {
        if (text(button) === 'Full stage detail') button.remove();
      }
      const all = (flowText.textContent ?? '').replace(/\s+/g, ' ');
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
        subSources,
        flow: flowMatch
          ? { fromPrevious: flowMatch[1]!, cumulative: flowMatch[2]!, drop: flowMatch[3]! }
          : null,
      };
    });
  }
}
