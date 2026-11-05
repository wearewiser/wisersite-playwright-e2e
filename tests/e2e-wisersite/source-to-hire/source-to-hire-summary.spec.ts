import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  DATE_PICKER_MONTHS_BACK,
  EMPTY_WINDOW_DAYS,
  SUMMARY_TILE_LABELS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  SPARKLINE_LABEL,
  TREND_TONE,
  expectedSummaryForWindow,
  formatHirePeriod,
  trendStateFor,
  type TrendState,
} from '../../../src/expectations/wisersite/summary-tiles.expectations';
import { SourceToHirePage } from '../../../src/pages/wisersite/source-to-hire.page';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import {
  details,
  markKnownDefect,
  markLimitedByData,
} from '../../../src/utils/playwright/test-annotations';
import {
  applicationsChangePct,
  findComparisonWindow,
  type WindowTotals,
} from '../../../src/utils/wisersite/comparison-window';
import {
  localTodayIso,
  nthDayDate,
  nthMonthDate,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';

/**
 * WP23-87 — Source to Hire > Show Summary Statistics (static graphs).
 *
 * AC 1 headline stats follow the global date filter; AC 2 deltas + preset-specific caption;
 * AC 3 green/white/red banding of the badge and the static bar graph; AC 5 no comparison when
 * the selected window or the one before it falls outside the tenant's data, and "no change"
 * reads 0% / neutral.
 *
 * "Available data" (AC 5) is the warehouse's first to last application date. (The app used to
 * gate the comparison on a today−90 fallback range instead: WP23-377, fixed 2026-11-05.)
 */

test.describe('WP23-87 Source to Hire summary statistics', () => {
  test(
    'summary tiles match the tenant warehouse for the last 12 months',
    details({
      ac: ['WP23-87 AC 1.1', 'WP23-87 AC 1.2', 'WP23-87 AC 1.3', 'WP23-87 AC 1.4'],
      title: 'Headline numbers are correct',
      what: 'For the last 12 months, all four panels show the same figures as the database.',
    }),
    async ({ adminPage, sourceToHireRepository }) => {
      // Navigate through the admin sidebar rather than the `sourceToHirePage` fixture's direct goto.
      const sourceToHirePage = new SourceToHirePage(adminPage);
      await sourceToHirePage.openFromSidebar();
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');

      const { startDate, endDate } = resolveGlobalPreset('Last 12 months');
      const expected = await sourceToHireRepository.getSummary(startDate, endDate);
      console.log('Source to Hire summary — SQL (%s to %s):', startDate, endDate, expected);
      if (expected.hires === 0) {
        markLimitedByData(
          'No hires in the last 12 months: Total Hires and Average Hire Period were only checked at 0 and "—".',
        );
      }

      const { summary } = sourceToHirePage;
      await expect(summary.applications.value).toHaveText(formatLocaleCount(expected.applications));
      await expect(summary.screened.value).toHaveText(formatLocaleCount(expected.screened));
      await expect(summary.hires.value).toHaveText(formatLocaleCount(expected.hires));
      await expect(summary.avgHirePeriod.value).toHaveText(
        formatHirePeriod(expected.avgHirePeriodDays),
      );
    },
  );

  test(
    'shows the four headline panels in order: applicants, screened, hires, average hire period',
    details({
      ac: ['WP23-87 AC 1', 'WP23-87 AC 3.2'],
      title: 'The four panels appear in the right order',
      what: 'Applicants, Screened, Hires, Average Hire Period, each with its small graph.',
    }),
    async ({ sourceToHirePage }) => {
      await sourceToHirePage.summary.waitForLoaded();
      const tiles = await sourceToHirePage.summary.readTiles();
      expect(tiles.map((tile) => tile.label)).toEqual(SUMMARY_TILE_LABELS);
      for (const tile of tiles) {
        expect(tile.sparklineLabel, `${tile.label} has no static bar graph`).not.toBeNull();
      }
    },
  );

  test(
    'defaults to "Last 30 days" on a fresh session',
    details({
      ac: ['WP23-87 AC 1'],
      title: 'The page opens on “Last 30 days”',
      what: 'A new visitor sees the last 30 days by default.',
    }),
    async ({ sourceToHirePage, widgetRequests }) => {
      await sourceToHirePage.summary.waitForLoaded();
      // The board fetches the preset's dates on the user's calendar.
      const expected = resolveGlobalPreset('Last 30 days');
      await widgetRequests.waitForWindow('sourceToHireSummary', expected);
      // Only the button's text is left to check; where it shows the server's day instead, that is
      // WP23-419 D-3.
      const shown = await sourceToHirePage.dateRange.getActiveRange();
      if (JSON.stringify(shown) !== JSON.stringify(expected)) {
        markKnownDefect(KNOWN_DEFECTS.dateButtonServerDate);
      }
      expect(shown, 'dates printed on the date button').toEqual(expected);
    },
  );

  test(
    'a custom range with both periods inside the data compares "vs previous period" (AC 2.1.4, AC 5)',
    details({
      ac: ['WP23-87 AC 2.1.4', 'WP23-87 AC 5'],
      title: 'Custom range: compares with the previous period when both periods have data',
      what: 'Chooses a custom range where both the range and the period before it have data, and expects “vs previous period”.',
    }),
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      await sourceToHirePage.summary.waitForLoaded();
      const span = await sourceToHireRepository.getDataSpan();
      test.skip(!span, 'The warehouse has no applications, so nothing can be compared.');

      // 11-day window whose previous 11 days start exactly on the first day of data.
      const startDate = nthDayDate(span!.minDate, 11);
      const endDate = nthDayDate(span!.minDate, 21);
      test.skip(
        endDate > span!.maxDate,
        `The data span ${span!.minDate}..${span!.maxDate} is under 22 days.`,
      );

      await sourceToHirePage.setCustomGlobalDateRange(startDate, endDate);
      expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual({ startDate, endDate });

      const activeRange = { startDate, endDate };
      const { expected, comparisonAvailable } = await expectedSummaryForWindow(
        sourceToHireRepository,
        activeRange,
        'custom',
      );
      await widgetRequests.waitForWindow('sourceToHireSummary', activeRange);
      console.log('Summary tiles %o vs SQL-derived (expected):', activeRange, expected);
      await expect
        .poll(() => sourceToHirePage.summary.readTiles(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
      expect(comparisonAvailable).toBe(true);
    },
  );

  test(
    'a custom range whose previous period starts before the data shows headline only, neutral graph (AC 5.2)',
    details({
      ac: ['WP23-87 AC 5.2', 'WP23-87 AC 5.2.1'],
      title: 'Custom range: no comparison when the previous period has no data',
      what: 'The headline numbers show, but no % change, and the graph is neutral.',
    }),
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      await sourceToHirePage.summary.waitForLoaded();
      const span = await sourceToHireRepository.getDataSpan();
      test.skip(!span, 'The warehouse has no applications.');

      // Starts 2 days into the data, so its 11-day predecessor starts 9 days before the data.
      const startDate = nthDayDate(span!.minDate, 2);
      const endDate = nthDayDate(span!.minDate, 12);
      test.skip(
        endDate > span!.maxDate,
        `The data span ${span!.minDate}..${span!.maxDate} is under 13 days.`,
      );
      await sourceToHirePage.setCustomGlobalDateRange(startDate, endDate);

      const activeRange = { startDate, endDate };
      const { expected, comparisonAvailable } = await expectedSummaryForWindow(
        sourceToHireRepository,
        activeRange,
        'custom',
      );
      await widgetRequests.waitForWindow('sourceToHireSummary', activeRange);
      console.log('Summary tiles %o vs SQL-derived (expected):', activeRange, expected);
      await expect
        .poll(() => sourceToHirePage.summary.readTiles(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
      expect(comparisonAvailable).toBe(false);
      for (const tile of await sourceToHirePage.summary.readTiles()) {
        expect(tile.delta, `${tile.label} should show no comparison`).toBeNull();
        expect(tile.comparisonLabel).toBeNull();
        expect(tile.sparklineLabel).toBe(SPARKLINE_LABEL.neutral);
      }
    },
  );

  // AC 3: one custom range per colour band of Total Applications, chosen from the warehouse:
  // both periods inside the data, so the comparison shows and the band itself is checked.
  const BANDS: {
    band: TrendState;
    colour: string;
    matches: (c: WindowTotals, p: WindowTotals) => boolean;
  }[] = [
    {
      band: 'positive',
      colour: 'Green',
      matches: (c, p) =>
        p.applications > 0 && trendStateFor(applicationsChangePct(c, p), true) === 'positive',
    },
    {
      band: 'neutral',
      colour: 'White',
      matches: (c, p) =>
        p.applications > 0 && trendStateFor(applicationsChangePct(c, p), true) === 'neutral',
    },
    {
      band: 'negative',
      colour: 'Red',
      matches: (c, p) =>
        p.applications > 0 && trendStateFor(applicationsChangePct(c, p), true) === 'negative',
    },
  ];
  for (const { band, colour, matches } of BANDS) {
    test(
      `a custom range where Total Applications is in the ${TREND_TONE[band]} band shows that colour and graph (AC 3)`,
      details({
        ac: ['WP23-87 AC 3.1', 'WP23-87 AC 3.2'],
        title: 'Green, white and red colours follow the rules',
        what: 'Finds real date ranges where applications rose by more than 10%, stayed within 0–10%, or fell, and checks each colour and graph.',
        variant: colour,
      }),
      async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
        await sourceToHirePage.summary.waitForLoaded();
        const bounds = await sourceToHireRepository.getDataSpan();
        test.skip(!bounds, 'The warehouse has no applications, so there is no range to pick.');
        const window = findComparisonWindow({
          days: await sourceToHireRepository.getDailyCounts(bounds!.minDate, bounds!.maxDate),
          bounds: bounds!,
          matches,
        });
        test.skip(
          !window,
          `No custom range inside ${bounds!.minDate}..${bounds!.maxDate} puts Total Applications in the ${band} band.`,
        );

        await sourceToHirePage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
        const activeRange = window!;
        const { expected, comparisonAvailable } = await expectedSummaryForWindow(
          sourceToHireRepository,
          activeRange,
          'custom',
        );
        await widgetRequests.waitForWindow('sourceToHireSummary', activeRange);
        console.log('Summary tiles %o vs SQL-derived (expected):', activeRange, expected);
        await expect
          .poll(() => sourceToHirePage.summary.readTiles(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
        expect(comparisonAvailable).toBe(true);
        const applications = (await sourceToHirePage.summary.readTiles())[0]!;
        expect(applications.tone).toBe(TREND_TONE[band]);
        expect(applications.sparklineLabel).toBe(SPARKLINE_LABEL[band]);
      },
    );
  }

  test(
    'an empty window shows zero headline stats and hides or empties every widget',
    details({
      ac: ['WP23-87 AC 1', 'WP23-156 AC 1.2', 'WP23-157 AC 3'],
      title: 'A period with no data shows zeros and hides or empties every widget',
      what: 'Picks the two weeks before the first application on record and checks the whole page reacts correctly.',
    }),
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      await sourceToHirePage.summary.waitForLoaded();
      // Two weeks ending the day before the first application on record: empty by construction,
      // and confirmed below, rather than hoping a preset is empty.
      const span = await sourceToHireRepository.getDataSpan();
      test.skip(
        !span,
        'The warehouse has no applications, so there is no data to show either way.',
      );
      const endDate = nthDayDate(span!.minDate, -1);
      const startDate = nthDayDate(endDate, -(EMPTY_WINDOW_DAYS - 1));
      test.skip(
        startDate < nthMonthDate(localTodayIso(), -DATE_PICKER_MONTHS_BACK),
        `The data starts ${span!.minDate}, further back than the date picker pages (${DATE_PICKER_MONTHS_BACK} months).`,
      );
      const window = { startDate, endDate };
      expect((await sourceToHireRepository.getSummary(startDate, endDate)).applications).toBe(0);

      await sourceToHirePage.setCustomGlobalDateRange(startDate, endDate);
      // Every widget has fetched this window, so "hidden" or "empty" isn't "not loaded yet".
      for (const key of [
        'sourceToHireSummary',
        'applicationsBySource',
        'hireDistribution',
        'sourcePerformanceBreakdown',
      ]) {
        await widgetRequests.waitForWindow(key, window);
      }
      const { summary } = sourceToHirePage;
      await expect(summary.applications.value).toHaveText('0');
      await expect(summary.screened.value).toHaveText('0');
      await expect(summary.hires.value).toHaveText('0');
      await expect(summary.avgHirePeriod.value).toHaveText(formatHirePeriod(null));
      // WP23-156 AC 1.2 / WP23-157 AC 3: both source widgets disappear rather than rendering empty.
      await expect(sourceToHirePage.applicationsBySource.heading).toHaveCount(0);
      await expect(sourceToHirePage.hireDistribution.heading).toHaveCount(0);
      await expect(sourceToHirePage.hiresTrend.emptyState).toBeVisible();
      await expect(sourceToHirePage.sourcePerformance.emptyState).toBeVisible();
    },
  );
});
