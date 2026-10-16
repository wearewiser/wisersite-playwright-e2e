import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedApplicationsBySourceRows,
  expectedHireDistributionReadout,
  expectedHireDistributionSegments,
  totalHires,
  widestPresetWithHires,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import { colourToken } from '../../../src/utils/dom/css';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import { details, markLimitedByData } from '../../../src/utils/playwright/test-annotations';

/**
 * WP23-157 — Source to Hire > Show Hire Distribution.
 *
 * AC 1.1 the global date picker drives it; 1.2 a donut of hires for **all** sources with
 * hires (confirmed dynamic, not capped at a top N), colour-coded to match each source's
 * colour in Applications by Source; 2 hovering a segment shows that source's hires — the
 * centre readout becomes "total from source", "% of total hires · source name"; 3 no data for
 * the period -> the widget is not displayed.
 */

test.describe('WP23-157 Hire Distribution', () => {
  for (const preset of GLOBAL_PRESETS) {
    test(
      `"${preset}": one segment per source with hires, matching the warehouse (or hidden when none)`,
      details({
        ac: ['WP23-157 AC 1.1', 'WP23-157 AC 1.2', 'WP23-157 AC 3'],
        title: 'The donut shows every source with hires, or hides when there are none',
        what: 'Checked for every date preset.',
        variant: preset,
      }),
      async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
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
          markLimitedByData(
            'No hires in this window: only the "widget hidden" behaviour was checked.',
          );
          return;
        }

        await expect(widget.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
        await expect
          .poll(() => widget.readSegments(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
        // The resting centre readout is the total number of hires.
        await expect(widget.centreText(formatLocaleCount(totalHires(bySource)))).toBeVisible();
      },
    );
  }

  test(
    "hovering a segment shows that source's hires, its share of all hires and its name",
    details({
      ac: [
        'WP23-157 AC 2',
        'WP23-157 Func 1.1',
        'WP23-157 Func 1.2.1',
        'WP23-157 Func 1.2.2',
        'WP23-157 Func 1.2.3',
      ],
      title: 'Hovering a segment shows that source’s hires, share and name',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
      const widget = sourceToHirePage.hireDistribution;
      await sourceToHirePage.summary.waitForLoaded();
      const found = await widestPresetWithHires(sourceToHireRepository);
      test.skip(!found, 'No global preset has any hires in Postgres — the donut never renders.');
      await sourceToHirePage.selectGlobalDatePreset(found!.preset);
      expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(found!.window);
      const { withHires } = found!;

      await expect(widget.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
      const total = totalHires(withHires);
      for (const [index, row] of withHires.entries()) {
        await widget.hoverSegment(index);
        expect(await widget.readCentreReadout()).toEqual(
          expectedHireDistributionReadout(row, total),
        );
      }
    },
  );

  test(
    'each source is drawn in the same colour it has in Applications by Source',
    details({
      ac: ['WP23-157 AC 1.2'],
      title: 'Each source keeps the same colour as in Applications by Source',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
      const { hireDistribution, applicationsBySource } = sourceToHirePage;
      await sourceToHirePage.summary.waitForLoaded();
      const found = await widestPresetWithHires(sourceToHireRepository);
      test.skip(!found, 'No global preset has any hires in Postgres — the donut never renders.');
      await sourceToHirePage.selectGlobalDatePreset(found!.preset);
      expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(found!.window);

      await expect(hireDistribution.heading).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
      // Wait for both widgets to show this preset's data, not the previous preset's.
      const bySource = await sourceToHireRepository.getBySource(
        found!.window.startDate,
        found!.window.endDate,
      );
      await expect
        .poll(() => hireDistribution.readSegments(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expectedHireDistributionSegments(bySource));
      // Counts in order, not names: a tie at the 6th place may break either way (ticket silent).
      await expect
        .poll(async () => (await applicationsBySource.readRows()).map((row) => row.applications), {
          timeout: WIDGET_TIMEOUT_MS,
        })
        .toEqual(expectedApplicationsBySourceRows(bySource).map((row) => row.applications));

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
    },
  );
});
