import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedApplicationsBySourceRows,
  topSourcesByApplications,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import { colourToken } from '../../../src/utils/dom/css';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-156 — Source to Hire > Show Applications by Source.
 *
 * AC 1.1.1 the global date picker drives it; 1.1.2 top 6 sources by applications, the
 * applications bar (light) of the top source spans the chart with its value shown, screens
 * overlaid (mid shade, same hue); 1.1.3 applicant count + hire rate per source; 1.2 the
 * widget is not shown at all when the window has no data.
 */

test.describe('WP23-156 Applications by Source', () => {
  for (const preset of GLOBAL_PRESETS) {
    test(`"${preset}": top 6 sources, applicant counts and hire rates match the warehouse`, async ({
      sourceToHirePage,
      sourceToHireRepository,
    }) => {
      const widget = sourceToHirePage.applicationsBySource;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset(preset);

      const window = await sourceToHirePage.dateRange.getActiveRange();
      expect(window).toEqual(resolveGlobalPreset(preset));
      const expected = expectedApplicationsBySourceRows(
        await sourceToHireRepository.getBySource(window.startDate, window.endDate),
      );
      console.log('Applications by Source %o — SQL top 6:', window, expected);

      if (expected.length === 0) {
        // AC 1.2: no data -> the widget is not displayed at all (no empty card either).
        await expect(widget.heading).toHaveCount(0);
        return;
      }

      await widget.waitForRows();
      await expect.poll(() => widget.readRows(), { timeout: WIDGET_TIMEOUT_MS }).toEqual(expected);
    });
  }

  test("the top source's applications bar spans the chart and screens overlay it in the same hue", async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    const widget = sourceToHirePage.applicationsBySource;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
    const expected = topSourcesByApplications(
      await sourceToHireRepository.getBySource(startDate, endDate),
    );
    test.skip(expected.length === 0, 'No applications in the last 12 months to draw bars for.');

    await widget.waitForRows();
    await expect(widget.subtitle).toBeVisible();
    await expect(widget.legendItems).toHaveText(['Applications', 'Screens']);
    // There is no per-widget period picker — it only ever follows the global date filter.
    await expect(widget.controls).toHaveCount(0);

    await expect
      .poll(async () => (await widget.readBars()).length, { timeout: WIDGET_TIMEOUT_MS })
      .toBe(expected.length);
    const bars = await widget.readBars();
    console.log('Applications by Source bars:', JSON.stringify(bars));

    const maxApplications = expected[0]!.applications;
    bars.forEach((bar, index) => {
      const sql = expected[index]!;
      expect(bar.source).toBe(sql.sourceChannel);
      const [applicationsFill, screensFill] = bar.fills;

      // Applications bar: scaled against the top source, so the leader is exactly 100%.
      expect(applicationsFill!.width).toBeCloseTo((sql.applications / maxApplications) * 100, 5);
      if (index === 0) expect(applicationsFill!.width).toBe(100);

      if (sql.screened === 0) {
        expect(screensFill, `${sql.sourceChannel} has no screens to overlay`).toBeUndefined();
        return;
      }
      expect(screensFill!.width).toBeCloseTo((sql.screened / maxApplications) * 100, 5);

      // Light applications shade and mid screens shade are both mixed from the source's one
      // base colour token — same hue, different shade.
      const baseToken = colourToken(screensFill!.color);
      expect(baseToken, 'screens bar should be painted in a colour token').not.toBeNull();
      expect(applicationsFill!.color).toContain(baseToken!);
      expect(applicationsFill!.color).not.toBe(screensFill!.color);
    });

    // The top source's application count is written on the chart.
    await expect(widget.applicationsCell(0)).toHaveText(formatLocaleCount(maxApplications));
  });

  test('switching the global date range re-scopes the widget to the new window', async ({
    sourceToHirePage,
    widgetRequests,
    sourceToHireRepository,
  }) => {
    const widget = sourceToHirePage.applicationsBySource;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    const twelveMonths = await sourceToHirePage.dateRange.getActiveRange();
    test.skip(
      (await sourceToHireRepository.getBySource(twelveMonths.startDate, twelveMonths.endDate))
        .length === 0,
      'No applications in the last 12 months.',
    );
    await widget.waitForRows();

    await sourceToHirePage.selectGlobalDatePreset('Last 3 months');
    const threeMonths = await sourceToHirePage.dateRange.getActiveRange();
    await expect.poll(() => widgetRequests.last('applicationsBySource')).toEqual(threeMonths);

    const expected = expectedApplicationsBySourceRows(
      await sourceToHireRepository.getBySource(threeMonths.startDate, threeMonths.endDate),
    );
    if (expected.length === 0) {
      await expect(widget.heading).toHaveCount(0);
    } else {
      await expect.poll(() => widget.readRows(), { timeout: WIDGET_TIMEOUT_MS }).toEqual(expected);
    }
  });
});
