import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedHireDistributionReadout,
  expectedHireDistributionSegments,
  totalHires,
  widestPresetWithHires,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import { details, markLimitedByData } from '../../../src/utils/playwright/test-annotations';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-157 — Source to Hire > Show Hire Distribution.
 *
 * AC 1.1 the global date picker drives it; 1.2 a donut of hires for **all** sources with
 * hires (confirmed dynamic, not capped at a top N), colour-coded (each widget colours sources by
 * its own ranking: accepted as correct, WP23-500, so the colour match is not tested); 2 hovering a segment shows that source's hires — the
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
        // The preset's dates on the user's calendar; the date button can show the server's
        // (WP23-419 D-3), so the window comes from the preset and the request proves it applied.
        const window = resolveGlobalPreset(preset);
        await widgetRequests.waitForWindow('hireDistribution', window);
        const bySource = await sourceToHireRepository.getBySource(window.startDate, window.endDate);
        const expected = expectedHireDistributionSegments(bySource);
        console.log('Hire Distribution %o — SQL:', window, expected);

        if (expected.length === 0) {
          // AC 3: no hires in the window -> the widget does not display (no empty card either).
          // Its own fetch for this window has run (above), so "absent" is not "not loaded yet".
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
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      const widget = sourceToHirePage.hireDistribution;
      await sourceToHirePage.summary.waitForLoaded();
      const found = await widestPresetWithHires(sourceToHireRepository);
      test.skip(!found, 'No global preset has any hires in Postgres — the donut never renders.');
      await sourceToHirePage.selectGlobalDatePreset(found!.preset);
      await widgetRequests.waitForWindow('hireDistribution', found!.window);
      const { withHires } = found!;

      // Hover only once the donut shows this window's segments, not the previous preset's.
      await expect
        .poll(() => widget.readSegments(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expectedHireDistributionSegments(withHires));
      const total = totalHires(withHires);
      for (const [index, row] of withHires.entries()) {
        await widget.hoverSegment(index);
        await expect
          .poll(() => widget.readCentreReadout())
          .toEqual(expectedHireDistributionReadout(row, total));
      }
    },
  );
});
