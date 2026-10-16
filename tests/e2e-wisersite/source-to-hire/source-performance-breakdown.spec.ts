import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { SUSPECTED_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  GLOBAL_PRESETS,
  SOURCE_PERFORMANCE_COLUMNS,
  WIDGET_TIMEOUT_MS,
  WIDGET_TIME_PERIODS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  SOURCE_PERFORMANCE_SORT_VALUE,
  expectedApplicationsBySourceRows,
  expectedSourcePerformanceRows,
  rowsBySource,
  widgetMonthPresetDefectApplies,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import {
  expectedHiresTrendTable,
  plottedSources,
} from '../../../src/expectations/wisersite/hires-trend.expectations';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import { isSorted } from '../../../src/utils/sort';
import {
  details,
  markLimitedByData,
  markSuspectedDefect,
} from '../../../src/utils/playwright/test-annotations';
import {
  hiresTrendMonthWindow,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';

/**
 * WP23-159 — Source to Hire > Show Source Performance Breakdown (excl. cost per hire).
 *
 * AC 1 contained date control: Match Global Date Picker by default, or Last 30 days / 3 / 6 /
 * 12 months; AC 2 one row per source with application total, screened, hires and conversion
 * rate (no cost per hire); AC 3 ordered by application total high-to-low by default, sortable
 * by every column; AC 4 native source names, default order matches the top 6 elsewhere, and
 * no source with 0 applications.
 *
 * AC 1 lists the widget's own periods with the same labels as the global picker, so each one
 * is expected to cover the same window as the global preset of that name. The app starts its
 * own "Last 3/6/12 months" on the 1st of a calendar month instead: suspected new defect, not
 * yet in KNOWN-DEFECTS.md, so those tests fail until it is logged or the PO accepts calendar
 * months (docs/test-plans/WP23-62.md D-3).
 */

/** The widget's own periods other than "Match Global", paired with the preset they mirror. */
const LOCAL_PERIODS = WIDGET_TIME_PERIODS.filter((period) => period.value !== 'match-global').map(
  (period) => ({
    value: period.value,
    preset: GLOBAL_PRESETS.find((preset) => preset === period.label)!,
  }),
);

test.describe('WP23-159 Source Performance Breakdown', () => {
  test(
    'rows match the warehouse for the global window, ordered by application total by default',
    details({
      ac: [
        'WP23-159 AC 2.1',
        'WP23-159 AC 2.2',
        'WP23-159 AC 2.3',
        'WP23-159 AC 2.4',
        'WP23-159 AC 3.1',
        'WP23-159 AC 4.2',
        'WP23-159 AC 4.3',
      ],
      title: 'Rows match the database, most applications first, no empty sources',
      what: 'Every row and figure is compared with the database for the last 12 months.',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
      const widget = sourceToHirePage.sourcePerformance;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      const window = await sourceToHirePage.dateRange.getActiveRange();
      const expected = expectedSourcePerformanceRows(
        await sourceToHireRepository.getBySource(window.startDate, window.endDate),
      );
      test.skip(expected.length === 0, 'No applications in the last 12 months to tabulate.');

      await widget.waitForRows();
      await expect(widget.timePeriodSelect).toHaveValue('match-global');
      await expect
        .poll(async () => rowsBySource(await widget.readRows()), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(rowsBySource(expected));

      const rows = await widget.readRows();
      console.log('Source Performance Breakdown %o:', window, rows);
      expect(
        isSorted(
          rows.map((row) => row.applications),
          'desc',
        ),
      ).toBe(true);
      await expect(widget.columnHeader('Application total')).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      // AC 4.3: never a zero-application source.
      expect(rows.every((row) => row.applications > 0)).toBe(true);
    },
  );

  test(
    'has exactly the source / applications / screened / hires / conversion rate columns (no cost per hire)',
    details({
      ac: ['WP23-159 AC 1', 'WP23-159 AC 2'],
      title: 'Has exactly the right columns and period options',
      what: 'Source, applications, screened, hires and conversion rate. Cost per hire is out of scope.',
    }),
    async ({ sourceToHirePage }) => {
      const widget = sourceToHirePage.sourcePerformance;
      await sourceToHirePage.summary.waitForLoaded();
      expect(await widget.readColumnHeaders()).toEqual(SOURCE_PERFORMANCE_COLUMNS);
      await expect(widget.timePeriodSelect.locator('option')).toHaveText(
        WIDGET_TIME_PERIODS.map((option) => option.label),
      );
    },
  );

  for (const column of SOURCE_PERFORMANCE_COLUMNS) {
    test(
      `sorts by "${column}": first click high-to-low, second click low-to-high`,
      details({
        ac: ['WP23-159 AC 3.2'],
        title: 'Every column can be sorted both ways',
        what: 'Clicking a column header sorts high-to-low, and clicking again sorts low-to-high, without changing any figures.',
        variant: column,
      }),
      async ({ sourceToHirePage, sourceToHireRepository }) => {
        const widget = sourceToHirePage.sourcePerformance;
        const sortValue = SOURCE_PERFORMANCE_SORT_VALUE[column];
        await sourceToHirePage.summary.waitForLoaded();
        await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
        const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
        const expected = expectedSourcePerformanceRows(
          await sourceToHireRepository.getBySource(startDate, endDate),
        );
        test.skip(expected.length < 2, 'Fewer than two sources — nothing to sort.');
        // Wait for the 12-month rows: the previous preset's rows stay on screen until they arrive.
        await expect
          .poll(async () => rowsBySource(await widget.readRows()), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(rowsBySource(expected));
        const before = await widget.readRows();
        if (new Set(before.map(sortValue)).size === 1) {
          markLimitedByData(`Every row has the same "${column}", so the sort order can't be seen.`);
        }

        // "Application total" is the default sort (already descending), so its first click flips
        // it to ascending — every other column starts high-to-low on its first click.
        const directions: ('desc' | 'asc')[] =
          column === 'Application total' ? ['asc', 'desc'] : ['desc', 'asc'];

        for (const direction of directions) {
          await widget.sortBy(column);
          await expect(widget.columnHeader(column)).toHaveAttribute(
            'aria-sort',
            direction === 'asc' ? 'ascending' : 'descending',
          );
          const rows = await widget.readRows();
          console.log(`Sorted by ${column} ${direction}:`, rows.map(sortValue));
          expect(isSorted(rows.map(sortValue), direction)).toBe(true);
          // Sorting reorders rows; it never adds, drops or changes them.
          expect(rowsBySource(rows)).toEqual(rowsBySource(before));
        }
      },
    );
  }

  for (const { value, preset } of LOCAL_PERIODS) {
    test(
      `the widget's own "${preset}" period matches the warehouse and leaves the rest of the board on the global window`,
      details({
        ac: ['WP23-159 AC 1', `WP23-159 AC 1.${GLOBAL_PRESETS.indexOf(preset) + 1}`],
        title:
          'The widget’s own period uses the right dates and doesn’t affect the rest of the page',
        what: 'Each option should cover the same dates as the global preset with the same name.',
        variant: preset,
      }),
      async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
        const widget = sourceToHirePage.sourcePerformance;
        await sourceToHirePage.summary.waitForLoaded();
        await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
        const globalRange = await sourceToHirePage.dateRange.getActiveRange();
        const globalSummary = await sourceToHireRepository.getSummary(
          globalRange.startDate,
          globalRange.endDate,
        );
        const globalHasRows =
          (await sourceToHireRepository.getBySource(globalRange.startDate, globalRange.endDate))
            .length > 0;

        const localWindow = resolveGlobalPreset(preset);
        const expected = expectedSourcePerformanceRows(
          await sourceToHireRepository.getBySource(localWindow.startDate, localWindow.endDate),
        );
        console.log(
          'Global %o vs widget-local %s %o — SQL:',
          globalRange,
          preset,
          localWindow,
          expected,
        );

        await widget.setTimePeriod(value);

        // The widget asked the server for exactly the window the ticket describes. If it asked
        // for the calendar-month window instead, that is suspected defect QA-WP23-62-1: label and
        // rethrow. Any other mismatch fails unlabelled.
        try {
          await expect
            .poll(() => widgetRequests.last('sourcePerformanceBreakdown'))
            .toEqual(localWindow);
        } catch (error) {
          const requested = widgetRequests.last('sourcePerformanceBreakdown');
          if (widgetMonthPresetDefectApplies(preset, localWindow, requested)) {
            markSuspectedDefect(SUSPECTED_DEFECTS.widgetMonthPresets);
          }
          throw error;
        }
        if (expected.length === 0) {
          await expect(widget.emptyState).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
        } else {
          await expect
            .poll(async () => rowsBySource(await widget.readRows()), { timeout: WIDGET_TIMEOUT_MS })
            .toEqual(rowsBySource(expected));
        }

        // Contained: the global filter, the KPI row and Applications by Source stay on the global window.
        const { summary } = sourceToHirePage;
        expect(await sourceToHirePage.dateRange.getActiveRange()).toEqual(globalRange);
        await expect(summary.applications.value).toHaveText(
          formatLocaleCount(globalSummary.applications),
        );
        await expect(summary.screened.value).toHaveText(formatLocaleCount(globalSummary.screened));
        await expect(summary.hires.value).toHaveText(formatLocaleCount(globalSummary.hires));
        if (globalHasRows) {
          expect(widgetRequests.last('applicationsBySource')).toEqual(globalRange);
        }
      },
    );
  }

  test(
    'applying a new global range puts the widget back on "Match Global Date Picker"',
    details({
      ac: ['WP23-159 AC 1'],
      title: 'Changing the global dates resets the widget to “Match Global Date Picker”',
    }),
    async ({ sourceToHirePage, widgetRequests, sourceToHireRepository }) => {
      const widget = sourceToHirePage.sourcePerformance;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      await widget.setTimePeriod('last-30-days');
      await expect(widget.timePeriodSelect).toHaveValue('last-30-days');

      await sourceToHirePage.selectGlobalDatePreset('Last 6 months');
      const globalRange = await sourceToHirePage.dateRange.getActiveRange();
      await expect(widget.timePeriodSelect).toHaveValue('match-global');
      await expect
        .poll(() => widgetRequests.last('sourcePerformanceBreakdown'))
        .toEqual(globalRange);

      const expected = expectedSourcePerformanceRows(
        await sourceToHireRepository.getBySource(globalRange.startDate, globalRange.endDate),
      );
      if (expected.length === 0) {
        await expect(widget.emptyState).toBeVisible();
      } else {
        await expect
          .poll(async () => rowsBySource(await widget.readRows()), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(rowsBySource(expected));
      }
    },
  );

  test(
    'in default order, the first six rows are the same sources as Applications by Source (WP23-156 AC 1.1.2, AC 3.1)',
    details({
      ac: ['WP23-159 AC 3.1', 'WP23-156 AC 1.1.2'],
      title: 'The top six rows match Applications by Source',
      what: 'Both rank sources by applications, so the top six should be the same.',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
      const { sourcePerformance, applicationsBySource } = sourceToHirePage;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
      const bySource = await sourceToHireRepository.getBySource(startDate, endDate);
      test.skip(bySource.length === 0, 'No applications in the last 12 months.');
      // Wait for both widgets to show the 12-month data: the previous preset's rows stay on
      // screen until the new ones arrive.
      await expect
        .poll(async () => rowsBySource(await sourcePerformance.readRows()), {
          timeout: WIDGET_TIMEOUT_MS,
        })
        .toEqual(rowsBySource(expectedSourcePerformanceRows(bySource)));
      // Counts in order, not names: a tie at the 6th place may break either way (ticket silent).
      await expect
        .poll(async () => (await applicationsBySource.readRows()).map((row) => row.applications), {
          timeout: WIDGET_TIMEOUT_MS,
        })
        .toEqual(expectedApplicationsBySourceRows(bySource).map((row) => row.applications));

      const table = await sourcePerformance.readRows();
      const top6 = await applicationsBySource.readRows();
      // Compare figures rather than names-in-order: equal application totals may tie-break
      // differently between the two widgets, and the ticket doesn't specify a tie-break.
      expect(table.slice(0, 6).map((row) => row.applications)).toEqual(
        top6.map((row) => row.applications),
      );
      const tieAtCutoff = table.length > 6 && table[5]!.applications === table[6]!.applications;
      if (!tieAtCutoff) {
        expect(new Set(table.slice(0, 6).map((row) => row.source))).toEqual(
          new Set(top6.map((row) => row.source)),
        );
      }
    },
  );

  test(
    'in default order, the first six rows are the sources Hires Trend by Source plots (AC 4.1)',
    details({
      ac: ['WP23-159 AC 4.1'],
      title: 'The top six rows match the sources shown in Hires Trend',
    }),
    async ({ sourceToHirePage, hiresTrendRepository, sourceToHireRepository }) => {
      const { sourcePerformance, hiresTrend } = sourceToHirePage;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      // Both widgets on "Match Global Date Picker", so they cover the same period.
      const expectedTrend = expectedHiresTrendTable({
        rows: await hiresTrendRepository.getMonthlyHiresBySource(),
        window: hiresTrendMonthWindow(
          'match-global',
          await sourceToHirePage.dateRange.getActiveRange(),
        ),
        comparisonMonths: null,
      });
      test.skip(
        expectedTrend === null,
        'No hires in the last 12 months, so Hires Trend by Source plots no sources to match against.',
      );

      // Wait for both widgets to show the 12-month data, not the previous preset's.
      const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
      await expect
        .poll(async () => rowsBySource(await sourcePerformance.readRows()), {
          timeout: WIDGET_TIMEOUT_MS,
        })
        .toEqual(
          rowsBySource(
            expectedSourcePerformanceRows(
              await sourceToHireRepository.getBySource(startDate, endDate),
            ),
          ),
        );
      await expect
        .poll(() => hiresTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expectedTrend);
      const table = await sourcePerformance.readRows();
      expect(new Set(table.slice(0, 6).map((row) => row.source))).toEqual(
        new Set(plottedSources(expectedTrend!)),
      );
    },
  );
});
