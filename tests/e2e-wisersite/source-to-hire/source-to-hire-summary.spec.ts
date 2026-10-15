import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import type { SourceToHireRepository } from '../../../src/db/repositories/wisersite/source-to-hire.repository';
import {
  GLOBAL_PRESETS,
  SUMMARY_TILE_LABELS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  SPARKLINE_LABEL,
  TREND_TONE,
  comparisonGateDefectApplies,
  expectedSummaryTileReadings,
  formatHirePeriod,
  isComparisonAvailable,
  trendStateFor,
  type ComparisonPreset,
  type TrendState,
} from '../../../src/expectations/wisersite/summary-tiles.expectations';
import type { WidgetRequestTracker } from '../../../src/network/wisersite/widget-request-tracker';
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
  intersectRanges,
  type WindowTotals,
} from '../../../src/utils/wisersite/comparison-window';
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
 * the selected window or the one before it falls outside the tenant's data, and "no change"
 * reads 0% / neutral.
 *
 * "Available data" (AC 5) is the warehouse's first to last application date. Where the app's
 * own gate (today−90 fallback range) gives a different answer, the test fails and is labelled
 * `known-defect: WP23-213 D-1`.
 */

/**
 * Checks all four tiles against the warehouse for the board's current window, and against the
 * previous window when AC 5 allows a comparison.
 */
async function expectTilesToMatchWarehouse(
  sourceToHirePage: SourceToHirePage,
  widgetRequests: WidgetRequestTracker,
  sourceToHireRepository: SourceToHireRepository,
  comparisonPreset: ComparisonPreset,
): Promise<{ comparisonAvailable: boolean }> {
  const window = await sourceToHirePage.dateRange.getActiveRange();
  // oracle-ok: the board's bounds only decide the WP23-213 D-1 label, never an expected value.
  const { minDate, maxDate } = await widgetRequests.waitForLast('sourceToHireSummary');
  const span = await sourceToHireRepository.getDataSpan();
  const previous = previousWindow(window);
  const comparisonAvailable = isComparisonAvailable(window, previous, span);
  if (comparisonGateDefectApplies(window, previous, span, { minDate, maxDate })) {
    markKnownDefect(KNOWN_DEFECTS.comparisonGate);
  }

  const expected = expectedSummaryTileReadings({
    current: await sourceToHireRepository.getSummary(window.startDate, window.endDate),
    previous: comparisonAvailable
      ? await sourceToHireRepository.getSummary(previous.startDate, previous.endDate)
      : null,
    comparisonPreset,
  });
  console.log(
    'Summary tiles %o, previous %o, warehouse data %o, board range %o, comparable: %s',
    window,
    previous,
    span,
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

      const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
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
    async ({ sourceToHirePage }) => {
      await sourceToHirePage.summary.waitForLoaded();
      expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(
        resolveGlobalPreset('Last 30 days'),
      );
    },
  );

  for (const preset of GLOBAL_PRESETS) {
    test(
      `"${preset}": headline stats, deltas, caption and graph state all match the warehouse`,
      details({
        ac: ['WP23-87 AC 1', 'WP23-87 AC 2.1', 'WP23-87 AC 3.1', 'WP23-87 AC 3.2', 'WP23-87 AC 5'],
        title: 'Each date preset shows the right numbers, % change and colour',
        what: 'Picks each preset and compares the numbers, the “vs previous …” wording and the colour with the rules in the ticket.',
        variant: preset,
      }),
      async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
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
      },
    );
  }

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

      const { comparisonAvailable } = await expectTilesToMatchWarehouse(
        sourceToHirePage,
        widgetRequests,
        sourceToHireRepository,
        'custom',
      );
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
    },
  );

  test(
    'a custom range that runs past the last day of data shows no comparison, neutral graph (AC 5.1)',
    details({
      ac: ['WP23-87 AC 5.1'],
      title: 'Custom range: no comparison when the range runs past the end of the data',
      what: 'The ticket says a partly-covered range shows no comparison.',
    }),
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      await sourceToHirePage.summary.waitForLoaded();
      const span = await sourceToHireRepository.getDataSpan();
      test.skip(!span, 'The warehouse has no applications.');

      // 11 days straddling the last day of data; the previous 11 days are inside the data.
      const startDate = nthDayDate(span!.maxDate, -5);
      const endDate = nthDayDate(span!.maxDate, 5);
      test.skip(endDate > localTodayIso(), `${startDate}..${endDate} would end in the future.`);
      test.skip(
        previousWindow({ startDate, endDate }).startDate < span!.minDate,
        `The data span ${span!.minDate}..${span!.maxDate} is too short for a previous period inside it.`,
      );
      await sourceToHirePage.setCustomGlobalDateRange(startDate, endDate);

      const { comparisonAvailable } = await expectTilesToMatchWarehouse(
        sourceToHirePage,
        widgetRequests,
        sourceToHireRepository,
        'custom',
      );
      expect(comparisonAvailable).toBe(false);
    },
  );

  // AC 3: one custom range per colour band of Total Applications, chosen from the warehouse.
  // Both periods must sit inside the data and inside the board's range, so WP23-213 D-1 doesn't
  // decide the outcome and the band itself is what gets checked.
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
        const span = await sourceToHireRepository.getDataSpan();
        // oracle-ok: the board's bounds only narrow where a window is picked, so WP23-213 D-1
        // can't decide the outcome; expected values still come from the warehouse.
        const { minDate, maxDate } = await widgetRequests.waitForLast('sourceToHireSummary');
        const bounds =
          span && minDate && maxDate ? intersectRanges(span, { minDate, maxDate }) : null;
        test.skip(
          !bounds,
          `The warehouse data (${span?.minDate}..${span?.maxDate}) and the board's range (${minDate}..${maxDate}) don't overlap.`,
        );
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
        const { comparisonAvailable } = await expectTilesToMatchWarehouse(
          sourceToHirePage,
          widgetRequests,
          sourceToHireRepository,
          'custom',
        );
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
      what: 'Picks a period with no applications and checks the whole page reacts correctly.',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
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
    },
  );
});
