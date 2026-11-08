import type { Locator, Page } from '@playwright/test';
import type {
  HeadlineTileLabel,
  HeadlineTileReading,
} from '../../../../types/wisersite/recruitment-funnel.types';

/**
 * The headline stat row above the funnel (WP23-132): Overall Conversion, Biggest Drop-off and
 * Best Conversion Source. Each tile is a box of three paragraphs (label, value, caption) with no
 * accessible name of its own, so a tile is found by its exact label text. A tile with no data is
 * removed, not emptied (AC 1.2).
 */
export class HeadlineStatsRow {
  constructor(private readonly page: Page) {}

  /** A tile's label paragraph; absent when the tile is hidden. */
  label(label: HeadlineTileLabel): Locator {
    return this.page.getByRole('paragraph').filter({ hasText: new RegExp(`^${label}$`) });
  }

  /** The tile box: the label sits in the box's header row, two levels down. */
  tile(label: HeadlineTileLabel): Locator {
    return this.label(label).locator('xpath=../..');
  }

  /** What the tile shows, or null when it isn't on the page. */
  async readTile(label: HeadlineTileLabel): Promise<HeadlineTileReading> {
    if ((await this.label(label).count()) === 0) return null;
    const [, value = '', caption = ''] = (
      await this.tile(label).getByRole('paragraph').allTextContents()
    ).map((text) => text.trim());
    return { label, value, caption };
  }

  /** All three tiles, in order. */
  async readTiles(labels: readonly HeadlineTileLabel[]): Promise<HeadlineTileReading[]> {
    const tiles: HeadlineTileReading[] = [];
    for (const label of labels) tiles.push(await this.readTile(label));
    return tiles;
  }
}
