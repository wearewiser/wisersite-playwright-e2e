import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  GLOBAL_PRESETS,
  SOURCE_PERFORMANCE_COLUMNS,
  WIDGET_TIMEOUT_MS,
  WIDGET_TIME_PERIODS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  SOURCE_PERFORMANCE_SORT_VALUE,
  expectedSourcePerformanceRows,
  rowsBySource,
} from '../../../src/expectations/wisersite/source-breakdown.expectations';
import { formatLocaleCount } from '../../../src/utils/format/locale-number';
import { isSorted } from '../../../src/utils/sort';
import { resolveWidgetLocalPreset } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-159 — Source to Hire > Show Source Performance Breakdown (excl. cost per hire).
 *
 * AC 1 contained date control: Match Global Date Picker by default, or Last 30 days / 3 / 6 /
 * 12 months; AC 2 one row per source with application total, screened, hires and conversion
 * rate (no cost per hire); AC 3 ordered by application total high-to-low by default, sortable
 * by every column; AC 4 native source names, default order matches the top 6 elsewhere, and
 * no source with 0 applications.
 */

/** The widget's own periods other than "Match Global", paired with the preset they mirror. */
const LOCAL_PERIODS = WIDGET_TIME_PERIODS.filter((period) => period.value !== 'match-global').map(
  (period) => ({
    value: period.value,
    preset: GLOBAL_PRESETS.find((preset) => preset === period.label)!,
  }),
);

test.describe('WP23-159 Source Performance Breakdown', () => {
  test('rows match the warehouse for the global window, ordered by application total by default', async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
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
  });

  test('has exactly the source / applications / screened / hires / conversion rate columns (no cost per hire)', async ({
    sourceToHirePage,
  }) => {
    const widget = sourceToHirePage.sourcePerformance;
    await sourceToHirePage.summary.waitForLoaded();
    expect(await widget.readColumnHeaders()).toEqual(SOURCE_PERFORMANCE_COLUMNS);
    await expect(widget.timePeriodSelect.locator('option')).toHaveText(
      WIDGET_TIME_PERIODS.map((option) => option.label),
    );
  });

  for (const column of SOURCE_PERFORMANCE_COLUMNS) {
    test(`sorts by "${column}": first click high-to-low, second click low-to-high`, async ({
      sourceToHirePage,
      sourceToHireRepository,
    }) => {
      const widget = sourceToHirePage.sourcePerformance;
      const sortValue = SOURCE_PERFORMANCE_SORT_VALUE[column];
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
      test.skip(
        (await sourceToHireRepository.getBySource(startDate, endDate)).length < 2,
        'Fewer than two sources — nothing to sort.',
      );
      await widget.waitForRows();
      const before = await widget.readRows();

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
    });
  }

  for (const { value, preset } of LOCAL_PERIODS) {
    test(`the widget's own "${preset}" period matches the warehouse and leaves the rest of the board on the global window`, async ({
      sourceToHirePage,
      widgetRequests,
      sourceToHireRepository,
    }) => {
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

      const localWindow = resolveWidgetLocalPreset(preset);
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

      // The widget asked the server for exactly the window the ticket describes.
      await expect
        .poll(() => widgetRequests.last('sourcePerformanceBreakdown'))
        .toEqual(localWindow);
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
    });
  }

  test('applying a new global range puts the widget back on "Match Global Date Picker"', async ({
    sourceToHirePage,
    widgetRequests,
    sourceToHireRepository,
  }) => {
    const widget = sourceToHirePage.sourcePerformance;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    await widget.setTimePeriod('last-30-days');
    await expect(widget.timePeriodSelect).toHaveValue('last-30-days');

    await sourceToHirePage.selectGlobalDatePreset('Last 6 months');
    const globalRange = await sourceToHirePage.dateRange.getActiveRange();
    await expect(widget.timePeriodSelect).toHaveValue('match-global');
    await expect.poll(() => widgetRequests.last('sourcePerformanceBreakdown')).toEqual(globalRange);

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
  });

  test('in default order, the first six rows are the same sources as Applications by Source', async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    const { sourcePerformance, applicationsBySource } = sourceToHirePage;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
    test.skip(
      (await sourceToHireRepository.getBySource(startDate, endDate)).length === 0,
      'No applications in the last 12 months.',
    );
    await sourcePerformance.waitForRows();
    await applicationsBySource.waitForRows();

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
  });
});
