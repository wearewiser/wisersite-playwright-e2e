import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import type { SourceToHireRepository } from '../../../src/db/repositories/wisersite/source-to-hire.repository';
import type { SourceBreakdown } from '../../../src/db/repositories/wisersite/source-to-hire.repository.types';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedHireDistributionReadout,
  expectedHireDistributionSegments,
  sourcesWithHires,
  totalHires,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import type { SourceToHirePage } from '../../../src/pages/wisersite/source-to-hire.page';
import { colourToken } from '../../../src/utils/dom/css';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';

/**
 * WP23-157 — Source to Hire > Show Hire Distribution.
 *
 * AC 1.1 the global date picker drives it; 1.2 a donut of hires for **all** sources with
 * hires (confirmed dynamic, not capped at a top N), colour-coded to match each source's
 * colour in Applications by Source; 2 hovering a segment shows that source's hires — the
 * centre readout becomes "total from source", "% of total hires · source name"; 3 no data for
 * the period -> the widget is not displayed.
 */

/** Applies the widest global preset that has any hires per Postgres; `[]` when none does. */
async function selectPresetWithHires(
  sourceToHirePage: SourceToHirePage,
  sourceToHireRepository: SourceToHireRepository,
): Promise<SourceBreakdown[]> {
  await sourceToHirePage.summary.waitForLoaded();
  for (const preset of [...GLOBAL_PRESETS].reverse()) {
    await sourceToHirePage.selectGlobalDatePreset(preset);
    const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
    const withHires = sourcesWithHires(
      await sourceToHireRepository.getBySource(startDate, endDate),
    );
    if (withHires.length > 0) return withHires;
  }
  return [];
}

test.describe('WP23-157 Hire Distribution', () => {
  for (const preset of GLOBAL_PRESETS) {
    test(`"${preset}": one segment per source with hires, matching the warehouse (or hidden when none)`, async ({
      sourceToHirePage,
      widgetRequests,
      sourceToHireRepository,
    }) => {
      const widget = sourceToHirePage.hireDistribution;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset(preset);
      const window = await sourceToHirePage.dateRange.getActiveRange();
      const bySource = await sourceToHireRepository.getBySource(window.startDate, window.endDate);
      const expected = expectedHireDistributionSegments(bySource);
      console.log('Hire Distribution %o — SQL:', window, expected);

      if (expected.length === 0) {
        // AC 3: no hires in the window -> the widget does not display (no empty card either).
        // Wait for its own fetch first so "absent" is not just "not loaded yet".
        await expect.poll(() => widgetRequests.last('hireDistribution')).toEqual(window);
        await expect(widget.heading).toHaveCount(0);
        return;
      }

      await expect(widget.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
      await expect
        .poll(() => widget.readSegments(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
      // The resting centre readout is the total number of hires.
      await expect(widget.centreText(formatLocaleCount(totalHires(bySource)))).toBeVisible();
    });
  }

  test("hovering a segment shows that source's hires, its share of all hires and its name", async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    const widget = sourceToHirePage.hireDistribution;
    const withHires = await selectPresetWithHires(sourceToHirePage, sourceToHireRepository);
    test.skip(
      withHires.length === 0,
      'No global preset has any hires in Postgres — the donut never renders.',
    );

    await expect(widget.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
    const total = totalHires(withHires);
    for (const [index, row] of withHires.entries()) {
      await widget.hoverSegment(index);
      expect(await widget.readCentreReadout()).toEqual(expectedHireDistributionReadout(row, total));
    }
  });

  test('each source is drawn in the same colour it has in Applications by Source', async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    const { hireDistribution, applicationsBySource } = sourceToHirePage;
    const withHires = await selectPresetWithHires(sourceToHirePage, sourceToHireRepository);
    test.skip(
      withHires.length === 0,
      'No global preset has any hires in Postgres — the donut never renders.',
    );

    await expect(hireDistribution.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
    await applicationsBySource.waitForRows();

    const donutColours = await hireDistribution.readLegendColours();
    // Both bar shades are mixed from the source's one base colour token.
    const barColours = Object.fromEntries(
      (await applicationsBySource.readBars()).map((bar) => [
        bar.source,
        colourToken(bar.fills[0]?.color),
      ]),
    );
    console.log('Donut legend colours:', donutColours);
    console.log('Applications by Source base colours:', barColours);

    const shared = donutColours.filter(({ source }) => source in barColours);
    test.skip(shared.length === 0, 'No source appears in both widgets for this window.');
    for (const { source, color } of shared) {
      expect(
        color,
        `"${source}" colour differs between Hire Distribution and Applications by Source`,
      ).toBe(barColours[source]);
    }
  });
});
