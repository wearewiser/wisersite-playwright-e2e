import type { Locator, Page } from '@playwright/test';
import {
  FUNNEL_COPY,
  FUNNEL_STAGES,
  HOVER_SETTLE_MS,
  FUNNEL_TABLE_NAME,
  FUNNEL_WIDGET_HEADING,
  SOURCE_FILTER_GROUP_NAME,
} from '../../../../constants/wisersite/recruitment-funnel.constants';
import type { FunnelTable } from '../../../../types/wisersite/recruitment-funnel.types';
import { snapshotTableBodyRows } from '../../../../utils/playwright/table-snapshot';
import { FullStageDetail } from './full-stage-detail.component';
import { StageHoverPanel } from './stage-hover-panel.component';

/**
 * The end-to-end Recruitment Funnel widget (WP23-85, 86, 295, 307): `<h3>` "Recruitment
 * Funnel", the "Filter by source" chips, a caption, a data-state banner (`role="status"`), one
 * button per stage named "<Stage>: <value>" (the ribbon's only focusable part), the band share
 * labels, the screen-reader table behind the chart, and the hover / pinned panels under it.
 */
export class RecruitmentFunnelWidget {
  readonly heading: Locator;
  /** The widget's `<section>`; every other locator is scoped under it. */
  readonly root: Locator;
  readonly chips: Locator;
  readonly caption: Locator;
  readonly banner: Locator;
  readonly table: Locator;
  readonly stageButtons: Locator;
  /**
   * The band share labels drawn on the ribbon. They're `aria-hidden` (the table carries the
   * counts), positioned with an inline `left`, so they're found structurally: the only
   * `aria-hidden` spans with an inline position, in stage then source order.
   */
  readonly bandLabels: Locator;
  readonly hoverPanel: StageHoverPanel;
  readonly detail: FullStageDetail;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', {
      level: 3,
      name: new RegExp(`^${FUNNEL_WIDGET_HEADING}`),
    });
    this.root = this.heading.locator('xpath=ancestor::section[1]');
    this.chips = this.root.getByRole('group', { name: SOURCE_FILTER_GROUP_NAME, exact: true });
    this.caption = this.root.getByRole('paragraph').filter({
      hasText: /^(Ribbon thickness|Showing )/,
    });
    this.banner = this.root.getByRole('status');
    this.table = this.root.getByRole('table', { name: FUNNEL_TABLE_NAME, exact: true });
    this.stageButtons = this.root.getByRole('button', {
      name: new RegExp(`^(${FUNNEL_STAGES.map((s) => s.label).join('|')}): `),
    });
    this.bandLabels = this.root.locator('span[aria-hidden="true"][style*="left"]');
    this.hoverPanel = new StageHoverPanel(this.root);
    this.detail = new FullStageDetail(this.root);
  }

  /** A stage's button, e.g. "Passed Screening: 940". */
  stageButton(stage: string): Locator {
    return this.root.getByRole('button', { name: new RegExp(`^${stage}: `) });
  }

  /** A source chip in the key. */
  chip(label: string): Locator {
    return this.chips.getByRole('button', { name: label, exact: true });
  }

  /** The "Pinned" marker on the pinned stage's header (aria-hidden; the button is aria-pressed). */
  get pinnedMarker(): Locator {
    return this.root.getByText(FUNNEL_COPY.pinnedMarker, { exact: false });
  }

  async hoverStage(stage: string): Promise<void> {
    await this.stageButton(stage).hover();
  }

  /**
   * Hovers a stage and steps the page clock past the hover-intent delay, so a following "no hover
   * panel" check runs after the panel would have appeared. Needs `takeOverClock()` first.
   */
  async hoverStageAndLetIntentElapse(stage: string): Promise<void> {
    await this.stageButton(stage).hover();
    await this.page.clock.runFor(HOVER_SETTLE_MS);
  }

  /** Hands the page's timers to the test (Playwright clock), for `hoverStageAndLetIntentElapse`. */
  async takeOverClock(): Promise<void> {
    await this.page.clock.install();
  }

  /** Pins a stage the way a mouse user does: a click on its column. */
  async pinStage(stage: string): Promise<void> {
    await this.stageButton(stage).click();
  }

  /** Clicks a source chip with the mouse. */
  async clickSource(label: string): Promise<void> {
    await this.chip(label).click();
  }

  /** Toggles a source chip from the keyboard: Tab focus lands on it, Enter presses it. */
  async pressSourceWithKeyboard(label: string): Promise<void> {
    await this.chip(label).focus();
    await this.page.keyboard.press('Enter');
  }

  /** Each stage's headline value, from its button name ("Reach: 35,064" → "35,064"), in order. */
  async readStageValues(): Promise<string[]> {
    return (
      await this.stageButtons.evaluateAll((buttons) =>
        buttons.map((b) => b.getAttribute('aria-label') ?? ''),
      )
    ).map((name) => name.slice(name.indexOf(': ') + 2));
  }

  /** The screen-reader table: its source columns and every stage row. */
  async readTable(): Promise<FunnelTable> {
    const headers = (await this.table.getByRole('columnheader').allTextContents()).map((h) =>
      h.trim(),
    );
    const rows = (await snapshotTableBodyRows(this.table)).map((row) => {
      const [total = '', shareOfFirst = '', ...sources] = row.cells;
      return { stage: row.rowHeader ?? '', total, shareOfFirst, sources };
    });
    return { sourceColumns: headers.slice(3), rows };
  }

  async readBandLabels(): Promise<string[]> {
    return (await this.bandLabels.allTextContents()).map((t) => t.trim());
  }

  /** Rendered background of each chip's colour dot, in chip order. */
  async readChipColours(): Promise<string[]> {
    return this.chips.getByRole('button').evaluateAll((buttons) =>
      buttons.map((b) => {
        const dot = b.querySelector('span');
        return dot ? getComputedStyle(dot).backgroundColor : '';
      }),
    );
  }
}
