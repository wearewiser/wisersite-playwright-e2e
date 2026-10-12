import { expect, type Locator, type Page } from '@playwright/test';
import {
  LOADING_PLACEHOLDER,
  SUMMARY_TILE_LABELS,
  WIDGET_TIMEOUT_MS,
} from '../../../../constants/wisersite/source-to-hire.constants';
import type {
  SummaryTileLabel,
  SummaryTileReading,
} from '../../../../types/wisersite/source-to-hire.types';
import { classModifier } from '../../../../utils/dom/css';

const BADGE_TONES = ['positive', 'negative', 'neutral'] as const;

/**
 * One SummaryKpiTile: `<p>{label}</p>`, then a value row holding the value `<p>` and — when
 * there is a comparison — a change block with the delta badge and its caption, then the
 * decorative bar sparkline. CSS module class names are hashed at build time, so the tile is
 * found by its label text and walked structurally from there.
 */
export class SummaryKpiTile {
  readonly root: Locator;
  readonly value: Locator;
  /** The delta badge: `[trend arrow?] <span sr-only>Up|Down|No change</span> <span>12%</span>`. */
  readonly badge: Locator;
  readonly comparisonCaption: Locator;
  readonly sparkline: Locator;

  constructor(
    page: Page,
    readonly label: SummaryTileLabel,
  ) {
    this.root = page
      .locator('p')
      .filter({ hasText: new RegExp(`^${label}$`) })
      .locator('xpath=..');
    this.value = this.root.locator('p').nth(1);
    this.badge = this.root.locator('xpath=./div[1]/div/span[1]');
    this.comparisonCaption = this.root.locator('xpath=./div[1]/div/p');
    this.sparkline = this.root.getByRole('img', { name: /^KPI bar sparkline/ });
  }

  async read(): Promise<SummaryTileReading> {
    const hasBadge = (await this.badge.count()) > 0;
    const badgeParts = hasBadge ? await this.badge.locator('span').allTextContents() : [];
    const hasCaption = (await this.comparisonCaption.count()) > 0;
    return {
      label: this.label,
      value: ((await this.value.textContent()) ?? '').trim(),
      delta: hasBadge
        ? { direction: (badgeParts[0] ?? '').trim(), value: (badgeParts[1] ?? '').trim() }
        : null,
      comparisonLabel: hasCaption
        ? ((await this.comparisonCaption.textContent()) ?? '').trim()
        : null,
      sparklineLabel: await this.sparkline.getAttribute('aria-label'),
      tone: hasBadge
        ? classModifier((await this.badge.getAttribute('class')) ?? '', BADGE_TONES)
        : null,
    };
  }
}

/** The Source to Hire summary row (WP23-87): four KPI tiles driven by the global date filter. */
export class SummaryKpiRow {
  readonly applications: SummaryKpiTile;
  readonly screened: SummaryKpiTile;
  readonly hires: SummaryKpiTile;
  readonly avgHirePeriod: SummaryKpiTile;
  readonly tiles: readonly SummaryKpiTile[];

  constructor(page: Page) {
    this.tiles = SUMMARY_TILE_LABELS.map((label) => new SummaryKpiTile(page, label));
    [this.applications, this.screened, this.hires, this.avgHirePeriod] = this.tiles as [
      SummaryKpiTile,
      SummaryKpiTile,
      SummaryKpiTile,
      SummaryKpiTile,
    ];
  }

  /** Waits until the tiles have replaced their "—" loading placeholders with real data. */
  async waitForLoaded(): Promise<void> {
    await expect(this.applications.value).not.toHaveText(LOADING_PLACEHOLDER, {
      timeout: WIDGET_TIMEOUT_MS,
    });
  }

  async readTiles(): Promise<SummaryTileReading[]> {
    const readings: SummaryTileReading[] = [];
    for (const tile of this.tiles) readings.push(await tile.read());
    return readings;
  }
}
