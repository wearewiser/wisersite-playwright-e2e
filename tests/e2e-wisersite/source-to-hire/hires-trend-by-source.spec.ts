import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  HIRES_TREND_COMPARISONS,
  WIDGET_TIMEOUT_MS,
  WIDGET_TIME_PERIODS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedHiresTrendTable,
  expectedTooltipRows,
  hasComparisonSeries,
  plottedSources,
} from '../../../src/expectations/wisersite/hires-trend.expectations';
import { formatMonthLabel } from '../../../src/utils/wisersite/date-format';
import { hiresTrendMonthWindow } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-158 — Source to Hire > Hires Trend by Source.
 *
 * AC 1 the widget's own date range (Match Global Date Picker / Last 30 days / 3 / 6 / 12
 * months), defaulting to Match Global, showing the top 6 sources; AC 2 one hires series per
 * source over time; AC 3 No comparison (default) / vs 3 / 6 / 12 months ago as dashed lines;
 * AC 4 hovering shows the raw hires per source for the nearest month plus a vertical marker;
 * AC 5 no comparison line when there isn't enough history for it. The widget's period
 * overrules the global filter but is contained — it never changes the rest of the board.
 *
 * The chart is asserted through the screen-reader table it renders beside the SVG.
 */

test.describe('WP23-158 Hires Trend by Source', () => {
  test('offers the specified period and comparison options, defaulting to Match Global / No comparison', async ({
    sourceToHirePage,
  }) => {
    const { hiresTrend } = sourceToHirePage;
    await sourceToHirePage.summary.waitForLoaded();

    await expect(hiresTrend.timePeriodSelect.locator('option')).toHaveText(
      WIDGET_TIME_PERIODS.map((option) => option.label),
    );
    await expect(hiresTrend.timePeriodSelect).toHaveValue('match-global');
    await expect(hiresTrend.comparisonSelect.locator('option')).toHaveText(
      HIRES_TREND_COMPARISONS.map((option) => option.label),
    );
    await expect(hiresTrend.comparisonSelect).toHaveValue('none');
  });

  for (const { value: timePeriod } of WIDGET_TIME_PERIODS) {
    test(`period "${timePeriod}": plotted hires match the warehouse with and without each comparison`, async ({
      sourceToHirePage,
      hiresTrendRepository,
    }) => {
      const { hiresTrend } = sourceToHirePage;
      await sourceToHirePage.summary.waitForLoaded();
      // Pin the global range so "match-global" has a deterministic month span.
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      const window = hiresTrendMonthWindow(
        timePeriod,
        await sourceToHirePage.dateRange.getActiveRange(),
      );
      const rows = await hiresTrendRepository.getMonthlyHiresBySource();

      await hiresTrend.setTimePeriod(timePeriod);

      for (const comparison of HIRES_TREND_COMPARISONS) {
        await test.step(`comparison "${comparison.value}"`, async () => {
          await hiresTrend.setComparison(comparison.value);
          const expected = expectedHiresTrendTable({
            rows,
            window,
            comparisonMonths: comparison.months,
          });
          console.log(
            'Hires Trend (%s, %s) months %s..%s — SQL-derived table:',
            timePeriod,
            comparison.value,
            window.startMonth,
            window.endMonth,
            expected,
          );

          if (expected === null) {
            await expect(hiresTrend.emptyState).toBeVisible();
            return;
          }

          await expect
            .poll(() => hiresTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
            .toEqual(expected);

          // AC 1.3: at most 6 sources plotted, each with its own legend toggle.
          const sources = plottedSources(expected);
          expect(sources.length).toBeLessThanOrEqual(6);
          if (sources.length > 1) {
            await expect(hiresTrend.legendButtons).toHaveText(sources);
          }
        });
      }
    });
  }

  test("changing the widget's own period leaves the global filter and the rest of the board alone", async ({
    sourceToHirePage,
    widgetRequests,
  }) => {
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    const globalRange = await sourceToHirePage.dateRange.getActiveRange();
    const tilesBefore = await sourceToHirePage.summary.readTiles();
    const summaryRequestBefore = widgetRequests.last('sourceToHireSummary');

    await sourceToHirePage.hiresTrend.setTimePeriod('last-30-days');
    await sourceToHirePage.hiresTrend.setComparison('3-months');

    expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(globalRange);
    await expect(sourceToHirePage.sourcePerformance.timePeriodSelect).toHaveValue('match-global');
    expect(await sourceToHirePage.summary.readTiles()).toEqual(tilesBefore);
    expect(widgetRequests.last('sourceToHireSummary')).toEqual(summaryRequestBefore);
  });

  test('hovering the chart shows the raw hires per source for the month under the pointer', async ({
    sourceToHirePage,
    hiresTrendRepository,
  }) => {
    const { hiresTrend } = sourceToHirePage;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    await hiresTrend.setTimePeriod('last-12-months');
    const window = hiresTrendMonthWindow(
      'last-12-months',
      await sourceToHirePage.dateRange.getActiveRange(),
    );
    const expected = expectedHiresTrendTable({
      rows: await hiresTrendRepository.getMonthlyHiresBySource(),
      window,
      comparisonMonths: null,
    });
    test.skip(
      expected === null,
      'No hires in the last 12 months — the chart shows its empty state, nothing to hover.',
    );

    for (const [edge, month] of [
      ['start', window.startMonth],
      ['end', window.endMonth],
    ] as const) {
      await hiresTrend.hoverPlot(edge);
      expect(await hiresTrend.readTooltip()).toEqual({
        month: formatMonthLabel(month),
        rows: expectedTooltipRows(expected!, month),
      });
    }
  });

  test('no comparison line when the comparison period runs past the earliest available history', async ({
    sourceToHirePage,
    hiresTrendRepository,
  }) => {
    const { hiresTrend } = sourceToHirePage;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    await hiresTrend.setTimePeriod('last-12-months');
    await hiresTrend.setComparison('12-months');

    const rows = await hiresTrendRepository.getMonthlyHiresBySource();
    const window = hiresTrendMonthWindow(
      'last-12-months',
      await sourceToHirePage.dateRange.getActiveRange(),
    );
    const withoutComparison = expectedHiresTrendTable({ rows, window, comparisonMonths: null });
    test.skip(
      withoutComparison === null,
      'No hires in the last 12 months — nothing is plotted at all.',
    );
    test.skip(
      hasComparisonSeries(expectedHiresTrendTable({ rows, window, comparisonMonths: 12 })!),
      'This tenant has enough history for a 12-month comparison, so AC 5 does not apply.',
    );

    await expect
      .poll(() => hiresTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
      .toEqual(withoutComparison);
    expect(hasComparisonSeries(await hiresTrend.readTable())).toBe(false);
  });
});
