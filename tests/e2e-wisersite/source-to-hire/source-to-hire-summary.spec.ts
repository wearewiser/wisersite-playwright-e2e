import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import type { SourceToHireRepository } from '../../../src/db/repositories/wisersite/source-to-hire.repository';
import {
  GLOBAL_PRESETS,
  SUMMARY_TILE_LABELS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  SPARKLINE_LABEL,
  expectedSummaryTileReadings,
  formatHirePeriod,
  isComparisonAvailable,
  type ComparisonPreset,
} from '../../../src/expectations/wisersite/summary-tiles.expectations';
import type { WidgetRequestTracker } from '../../../src/network/wisersite/widget-request-tracker';
import { SourceToHirePage } from '../../../src/pages/wisersite/source-to-hire.page';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import {
  localTodayIso,
  nthDayDate,
  previousWindow,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';

/**
 * WP23-87 — Source to Hire > Show Summary Statistics (static graphs).
 *
 * AC 1 headline stats follow the global date filter; AC 2 deltas + preset-specific caption;
 * AC 3 green/white/red banding of the badge and the static bar graph; AC 5 no comparison when
 * the previous window falls outside the tenant's data, and "no change" reads 0% / neutral.
 */

/**
 * Checks all four tiles against the warehouse for the board's current window — and, when the
 * previous window is inside the tenant data range the board sent, against that window too.
 */
async function expectTilesToMatchWarehouse(
  sourceToHirePage: SourceToHirePage,
  widgetRequests: WidgetRequestTracker,
  sourceToHireRepository: SourceToHireRepository,
  comparisonPreset: ComparisonPreset,
): Promise<{ comparisonAvailable: boolean }> {
  const window = await sourceToHirePage.dateRange.getActiveRange();
  const { minDate, maxDate } = await widgetRequests.waitForLast('sourceToHireSummary');
  const previous = previousWindow(window);
  const comparisonAvailable = isComparisonAvailable(previous, { minDate, maxDate });

  const expected = expectedSummaryTileReadings({
    current: await sourceToHireRepository.getSummary(window.startDate, window.endDate),
    previous: comparisonAvailable
      ? await sourceToHireRepository.getSummary(previous.startDate, previous.endDate)
      : null,
    comparisonPreset,
  });
  console.log(
    'Summary tiles %o, previous %o, data range %o, comparable: %s',
    window,
    previous,
    { minDate, maxDate },
    comparisonAvailable,
  );
  console.log('  SQL-derived (expected):', expected);

  await expect
    .poll(() => sourceToHirePage.summary.readTiles(), { timeout: WIDGET_TIMEOUT_MS })
    .toEqual(expected);
  return { comparisonAvailable };
}

test.describe('WP23-87 Source to Hire summary statistics', () => {
  test('summary tiles match the tenant warehouse for the last 12 months', async ({
    adminPage,
    sourceToHireRepository,
  }) => {
    // Navigate through the admin sidebar rather than the `sourceToHirePage` fixture's direct goto.
    const sourceToHirePage = new SourceToHirePage(adminPage);
    await sourceToHirePage.openFromSidebar();
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');

    const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
    const expected = await sourceToHireRepository.getSummary(startDate, endDate);
    console.log('Source to Hire summary — SQL (%s to %s):', startDate, endDate, expected);

    const { summary } = sourceToHirePage;
    await expect(summary.applications.value).toHaveText(formatLocaleCount(expected.applications));
    await expect(summary.screened.value).toHaveText(formatLocaleCount(expected.screened));
    await expect(summary.hires.value).toHaveText(formatLocaleCount(expected.hires));
    await expect(summary.avgHirePeriod.value).toHaveText(
      formatHirePeriod(expected.avgHirePeriodDays),
    );
  });

  test('shows the four headline panels in order: applicants, screened, hires, average hire period', async ({
    sourceToHirePage,
  }) => {
    await sourceToHirePage.summary.waitForLoaded();
    const tiles = await sourceToHirePage.summary.readTiles();
    expect(tiles.map((tile) => tile.label)).toEqual(SUMMARY_TILE_LABELS);
    for (const tile of tiles) {
      expect(tile.sparklineLabel, `${tile.label} has no static bar graph`).not.toBeNull();
    }
  });

  test('defaults to "Last 30 days" on a fresh session', async ({ sourceToHirePage }) => {
    await sourceToHirePage.summary.waitForLoaded();
    expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(
      resolveGlobalPreset('Last 30 days'),
    );
  });

  for (const preset of GLOBAL_PRESETS) {
    test(`"${preset}": headline stats, deltas, caption and graph state all match the warehouse`, async ({
      sourceToHirePage,
      widgetRequests,
      sourceToHireRepository,
    }) => {
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset(preset);

      // Confirm the independent date math agrees with the window the app resolved first,
      // before trusting it to build the SQL windows.
      expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(
        resolveGlobalPreset(preset),
      );

      await expectTilesToMatchWarehouse(
        sourceToHirePage,
        widgetRequests,
        sourceToHireRepository,
        preset,
      );
    });
  }

  test('a custom range whose previous period is inside the data range compares "vs previous period"', async ({
    sourceToHirePage,
    widgetRequests,
    sourceToHireRepository,
  }) => {
    await sourceToHirePage.summary.waitForLoaded();
    const { minDate } = await widgetRequests.waitForLast('sourceToHireSummary');
    test.skip(!minDate, 'The board sent no tenant data range, so no comparison can ever show.');

    // 11-day window whose previous 11 days start exactly on the first day of available data.
    const startDate = nthDayDate(minDate!, 11);
    const endDate = nthDayDate(minDate!, 21);
    test.skip(endDate > localTodayIso(), `${startDate}..${endDate} would end in the future.`);

    await sourceToHirePage.setCustomGlobalDateRange(startDate, endDate);
    expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual({ startDate, endDate });

    const { comparisonAvailable } = await expectTilesToMatchWarehouse(
      sourceToHirePage,
      widgetRequests,
      sourceToHireRepository,
      'custom',
    );
    expect(comparisonAvailable).toBe(true);
  });

  test('a custom range whose previous period starts before the data range shows headline only, neutral graph', async ({
    sourceToHirePage,
    widgetRequests,
    sourceToHireRepository,
  }) => {
    await sourceToHirePage.summary.waitForLoaded();
    const { minDate } = await widgetRequests.waitForLast('sourceToHireSummary');
    test.skip(!minDate, 'The board sent no tenant data range.');

    // Starts 2 days into the data range, so its 11-day predecessor starts 9 days before it.
    await sourceToHirePage.setCustomGlobalDateRange(
      nthDayDate(minDate!, 2),
      nthDayDate(minDate!, 12),
    );

    const { comparisonAvailable } = await expectTilesToMatchWarehouse(
      sourceToHirePage,
      widgetRequests,
      sourceToHireRepository,
      'custom',
    );
    expect(comparisonAvailable).toBe(false);
    for (const tile of await sourceToHirePage.summary.readTiles()) {
      expect(tile.delta, `${tile.label} should show no comparison`).toBeNull();
      expect(tile.comparisonLabel).toBeNull();
      expect(tile.sparklineLabel).toBe(SPARKLINE_LABEL.neutral);
    }
  });

  test('an empty window shows zero headline stats and hides or empties every widget', async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    await sourceToHirePage.summary.waitForLoaded();
    // Ask Postgres which preset is empty rather than hard-coding one, so this stays correct if
    // the demo data ever moves.
    let emptyPreset: (typeof GLOBAL_PRESETS)[number] | undefined;
    for (const preset of GLOBAL_PRESETS) {
      const { startDate, endDate } = resolveGlobalPreset(preset);
      if ((await sourceToHireRepository.getSummary(startDate, endDate)).applications === 0) {
        emptyPreset = preset;
        break;
      }
    }
    test.skip(!emptyPreset, 'Every global preset currently has applications in Postgres.');

    await sourceToHirePage.selectGlobalDatePreset(emptyPreset!);
    const { summary } = sourceToHirePage;
    await expect(summary.applications.value).toHaveText('0');
    await expect(summary.screened.value).toHaveText('0');
    await expect(summary.hires.value).toHaveText('0');
    await expect(summary.avgHirePeriod.value).toHaveText(formatHirePeriod(null));
    // WP23-156 / WP23-157: both source widgets disappear rather than rendering empty.
    await expect(sourceToHirePage.applicationsBySource.heading).toHaveCount(0);
    await expect(sourceToHirePage.hireDistribution.heading).toHaveCount(0);
    await expect(sourceToHirePage.hiresTrend.emptyState).toBeVisible();
    await expect(sourceToHirePage.sourcePerformance.emptyState).toBeVisible();
  });
});
