import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  PIPELINE_TREND_COMPARISONS,
  PIPELINE_TREND_TIME_PERIODS,
} from '../../../src/constants/wisersite/candidate-pipeline.constants';
import {
  GLOBAL_PRESETS,
  MONTH_PRESET_LENGTH,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedPipelineTrendTable,
  expectedPipelineTrendWeeklyTable,
} from '../../../src/expectations/wisersite/pipeline-trend.expectations';
import { CandidatePipelinePage } from '../../../src/pages/wisersite/candidate-pipeline.page';
import type { GlobalPresetLabel } from '../../../src/types/wisersite/source-to-hire.types';
import { details, markLimitedByData } from '../../../src/utils/playwright/test-annotations';
import { nthMonthDate, resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-93 — Candidate Pipeline > Pipeline Trend.
 *
 * AC 1 on the Pipeline page, AC 1.1 a graph of applied / rejected / confirmed over time; AC 1.2
 * the chart's own time periods, changed after the ticket from Month / Quarter / 6 month to Match
 * Global Date Picker (default) / Last 30 days / Last 3, 6, 12 months, each "Last …" covering the
 * same dates as the page preset with that name (PO 2026-10-21, WP23-419); AC 1.3 a comparison
 * vs 3 / 6 / 12 months earlier, off by default; AC 1.3.1 no comparison without enough history;
 * AC 1.4 shown within 1 s of selecting the page.
 *
 * Values are read from the chart's screen-reader table and compared with monthly sums from the
 * warehouse (test plan S-93-*; D-1 time periods, D-4 labels, D-5/D-6 measures and cohort).
 */

test.describe('WP23-93 Pipeline Trend', () => {
  test(
    'S-93-00: the Pipeline page reached from the sidebar shows the Pipeline Trend chart',
    details({
      ac: ['WP23-93 AC 1'],
      title: 'The chart is on the Pipeline page',
      what: 'Opens Analytics → Pipeline from the menu and finds the Pipeline Trend chart.',
    }),
    async ({ adminPage }) => {
      const board = new CandidatePipelinePage(adminPage);
      await board.openFromSidebar();
      await expect(board.heading).toBeVisible();
      await expect(board.pipelineTrend.heading).toBeVisible();
      await board.waitForCharts();
    },
  );

  for (const preset of GLOBAL_PRESETS) {
    test(
      `S-93-01: "${preset}": applied, rejected and confirmed per month match the warehouse`,
      details({
        ac: ['WP23-93 AC 1.1'],
        title: 'The chart shows the right applied, rejected and confirmed numbers',
        what: 'For each date range at the top of the page, every month’s three figures match the database.',
        variant: preset,
      }),
      async ({ candidatePipelinePage, candidatePipelineRepository }) => {
        const { pipelineTrend } = candidatePipelinePage;
        await candidatePipelinePage.waitForCharts();
        await candidatePipelinePage.selectGlobalDatePreset(preset);
        // By default ("Match Global Date Picker") the chart follows the page dates: the preset's
        // dates on the user's calendar, not the date button's text (WP23-419 D-3).
        const window = resolveGlobalPreset(preset);
        const expected = expectedPipelineTrendTable({
          daily: await candidatePipelineRepository.getDailyStatusVolumes(
            window.startDate,
            window.endDate,
          ),
          window,
          comparisonMonths: null,
          firstDay: await candidatePipelineRepository.getFirstStatusVolumeDay(),
        });
        console.log(
          'Pipeline Trend %s months %o — SQL-derived table: %o',
          preset,
          window,
          expected,
        );

        if (expected === null) {
          markLimitedByData(
            'No pipeline activity in these months: only the empty chart was checked.',
          );
          await expect(pipelineTrend.emptyState).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
          return;
        }
        await expect
          .poll(() => pipelineTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      },
    );
  }

  test(
    'S-93-02: the Time period control offers Match Global Date Picker, Last 30 days and Last 3, 6 and 12 months, Match Global first',
    details({
      ac: ['WP23-93 AC 1.2'],
      title: 'The chart offers the agreed time periods, following the page dates by default',
      what: 'Checks the chart’s Time period list is exactly the five agreed options and that “Match Global Date Picker” is selected when the page opens. These options replaced the ticket’s Month / Quarter / 6 month.',
    }),
    async ({ candidatePipelinePage }) => {
      const { pipelineTrend } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      expect(await pipelineTrend.readTimePeriodOptions()).toEqual(
        PIPELINE_TREND_TIME_PERIODS.map((option) => option.label),
      );
      expect(await pipelineTrend.readSelectedTimePeriod(), 'default time period').toBe(
        PIPELINE_TREND_TIME_PERIODS[0]?.label,
      );
    },
  );

  for (const { value, label } of PIPELINE_TREND_TIME_PERIODS.slice(1)) {
    test(
      `S-93-03: Time period "${label}": the chart covers the same dates as the page's "${label}" and matches the warehouse`,
      details({
        ac: ['WP23-93 AC 1.1', 'WP23-93 AC 1.2'],
        title: 'Each time period shows the right dates and numbers',
        what: 'Picks the period in the chart’s own Time period list and checks every point’s applied, rejected and confirmed figures against the database, over the same dates as the page preset with the same name.',
        variant: label,
      }),
      async ({ candidatePipelinePage, candidatePipelineRepository }) => {
        const { pipelineTrend } = candidatePipelinePage;
        await candidatePipelinePage.waitForCharts();
        // The same dates as the page preset of the same name, on the user's calendar (WP23-419).
        const range = resolveGlobalPreset(label as GlobalPresetLabel);
        const months = MONTH_PRESET_LENGTH[label as GlobalPresetLabel];
        const daily = await candidatePipelineRepository.getDailyStatusVolumes(
          range.startDate,
          range.endDate,
        );
        const expected = months
          ? expectedPipelineTrendTable({
              daily,
              window: range,
              comparisonMonths: null,
              firstDay: await candidatePipelineRepository.getFirstStatusVolumeDay(),
            })
          : expectedPipelineTrendWeeklyTable({ daily, window: range });
        console.log('Pipeline Trend period %s %o — SQL-derived table: %o', label, range, expected);

        await pipelineTrend.setTimePeriod(value);
        await expect(pipelineTrend.timePeriodSelect).toHaveValue(value);
        if (expected === null) {
          markLimitedByData(
            'No pipeline activity in this period: only the empty chart was checked.',
          );
          await expect(pipelineTrend.emptyState).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
          return;
        }
        await expect
          .poll(() => pipelineTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      },
    );
  }

  test(
    'S-93-04: comparison offers 3, 6 and 12 months and is off by default',
    details({
      ac: ['WP23-93 AC 1.3'],
      title: 'The comparison options are 3, 6 and 12 months, off by default',
      what: '“No comparison” is selected when the page opens.',
    }),
    async ({ candidatePipelinePage }) => {
      const { pipelineTrend } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      expect(await pipelineTrend.readComparisonOptions()).toEqual(
        PIPELINE_TREND_COMPARISONS.map((option) => option.label),
      );
      await expect(pipelineTrend.comparisonSelect).toHaveValue('none');
    },
  );

  for (const preset of GLOBAL_PRESETS) {
    test(
      `S-93-05: "${preset}": each comparison shows the earlier months when there is history, and nothing otherwise`,
      details({
        ac: ['WP23-93 AC 1.3', 'WP23-93 AC 1.3.1'],
        title:
          'Comparisons show the right earlier figures, or nothing when there isn’t enough history',
        what: 'Tries 3, 6 and 12 months back for each date range and checks the dotted figures against the database.',
        variant: preset,
      }),
      async ({ candidatePipelinePage, widgetRequests, candidatePipelineRepository }) => {
        const { pipelineTrend } = candidatePipelinePage;
        await candidatePipelinePage.waitForCharts();
        await candidatePipelinePage.selectGlobalDatePreset(preset);
        // By default ("Match Global Date Picker") the chart follows the page dates: the preset's
        // dates on the user's calendar, not the date button's text (WP23-419 D-3).
        const window = resolveGlobalPreset(preset);
        // From the earliest day a comparison (at most 12 months back) can read.
        const daily = await candidatePipelineRepository.getDailyStatusVolumes(
          nthMonthDate(window.startDate, -12),
          window.endDate,
        );
        const firstDay = await candidatePipelineRepository.getFirstStatusVolumeDay();

        for (const { value, months } of PIPELINE_TREND_COMPARISONS.filter((c) => c.months)) {
          await test.step(`comparison "${value}"`, async () => {
            // Without history the expected table has no "(prior)" columns, which is also what
            // the chart showed before the switch: let the change settle before reading.
            const beforeSwitch = widgetRequests.mark();
            await pipelineTrend.setComparison(value);
            await expect(pipelineTrend.comparisonSelect).toHaveValue(value);
            await widgetRequests.waitForQuiet(beforeSwitch);
            const expected = expectedPipelineTrendTable({
              daily,
              window,
              comparisonMonths: months,
              firstDay,
            });
            console.log('Pipeline Trend %s / %s — SQL-derived table: %o', preset, value, expected);
            if (expected === null) {
              markLimitedByData(
                'No pipeline activity in these months: only the empty chart was checked.',
              );
              await expect(pipelineTrend.emptyState).toBeVisible();
              return;
            }
            await expect
              .poll(() => pipelineTrend.readTable(), { timeout: WIDGET_TIMEOUT_MS })
              .toEqual(expected);
          });
        }
      },
    );
  }
});
