import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { PIPELINE_WIDGET_KEYS } from '../../../src/constants/wisersite/candidate-pipeline.constants';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  expectedCentreReadout,
  expectedHoverEmphasis,
  expectedRejectionReasons,
  pastMonthWhereRejectionCapMatters,
} from '../../../src/expectations/wisersite/rejection-reasons.expectations';
import { CandidatePipelinePage } from '../../../src/pages/wisersite/candidate-pipeline.page';
import { details, markLimitedByData } from '../../../src/utils/playwright/test-annotations';
import {
  latestQuietWindow,
  localTodayIso,
  nthDayDate,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';

/**
 * WP23-94 — Candidate Pipeline > Rejection Reasons.
 *
 * AC 1 on the Pipeline page; AC 1.1 a chart of rejection reasons for the dates in the global
 * date filter, with AC 1.1.1 the period's total rejections in the centre and AC 1.1.2 the top 6
 * categories (AC 1.1.2.1 all of them when there are 1–5, AC 1.1.2.2 "no data" when there are
 * none); AC 1.2 hovering a segment greys out the others (AC 1.2.1) and shows its name, count and
 * % of the period's total in the centre (AC 1.2.2); AC 1.3 shown within 1 s.
 *
 * A period's rejections are its applications rejected by the period's end (WP23-328 rule,
 * settling D-2). Test plan S-94-*.
 */

test.describe('WP23-94 Rejection Reasons', () => {
  test(
    'S-94-00: the Pipeline page reached from the sidebar shows the Rejection Reasons chart',
    details({
      ac: ['WP23-94 AC 1'],
      title: 'The chart is on the Pipeline page',
      what: 'Opens Analytics → Pipeline from the menu and finds the Rejection Reasons chart.',
    }),
    async ({ adminPage }) => {
      const board = new CandidatePipelinePage(adminPage);
      await board.openFromSidebar();
      await expect(board.rejectionReasons.heading).toBeVisible();
      await board.waitForCharts();
    },
  );

  for (const preset of GLOBAL_PRESETS) {
    test(
      `S-94-01: "${preset}": the reasons, their shares and the centre total match the rejections in that period`,
      details({
        ac: ['WP23-94 AC 1.1', 'WP23-94 AC 1.1.1', 'WP23-94 AC 1.1.2', 'WP23-94 AC 1.1.2.1'],
        title: 'The chart follows the page dates and shows the right reasons and total',
        what: 'For each date range at the top of the page, compares the reasons, their shares and the total in the centre with the rejections in the database for that period.',
        variant: preset,
      }),
      async ({ candidatePipelinePage, candidatePipelineRepository }) => {
        const { rejectionReasons } = candidatePipelinePage;
        await candidatePipelinePage.waitForCharts();
        await candidatePipelinePage.selectGlobalDatePreset(preset);
        // The preset's dates on the user's calendar, not the date button's text (WP23-419 D-3).
        const range = resolveGlobalPreset(preset);
        const expected = expectedRejectionReasons(
          await candidatePipelineRepository.getRejectionsInWindow(range.startDate, range.endDate),
        );
        console.log('Rejection Reasons %s %o — SQL-derived: %o', preset, range, expected);

        await expect
          .poll(() => rejectionReasons.readReading(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      },
    );
  }

  test(
    'S-94-02: a period with no rejections shows "No data for this period"',
    details({
      ac: ['WP23-94 AC 1.1', 'WP23-94 AC 1.1.2.2'],
      title: 'A period without rejections shows “No data”',
      what: 'Picks dates in which the database has no rejections and checks the chart says “No data”.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository }) => {
      const { rejectionReasons } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      const today = localTodayIso();
      // No rejected application created in the window, so it has no rejections (WP23-328 rule).
      const window = latestQuietWindow({
        days: await candidatePipelineRepository.getDailyRejections(),
        bounds: { startDate: nthDayDate(today, -365), endDate: today },
        isQuiet: (day) => day.byApplicationDate === 0,
        minLength: 7,
        maxLength: 31,
      });
      test.skip(
        window === null,
        'Every week of the last year has a rejection: no empty period to pick.',
      );
      const { total } = await candidatePipelineRepository.getRejectionsInWindow(
        window!.startDate,
        window!.endDate,
      );
      console.log('Rejection Reasons quiet window %o — SQL rejections: %d', window, total);
      expect(total, 'rejections in the chosen window, by SQL').toBe(0);

      await candidatePipelinePage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      await expect(rejectionReasons.emptyState).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
    },
  );

  test(
    'S-94-03: hovering each segment shows its count, share of the period and name in the centre',
    details({
      ac: ['WP23-94 AC 1.2', 'WP23-94 AC 1.2.2'],
      title: 'Hovering a segment shows that reason’s count, share and name',
      what: 'Over the last 12 months, hovers each segment and checks the figures in the centre against the database.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository }) => {
      const { rejectionReasons } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      // The widest preset: the most rejections to hover.
      await candidatePipelinePage.selectGlobalDatePreset('Last 12 months');
      const range = resolveGlobalPreset('Last 12 months');
      const expected = expectedRejectionReasons(
        await candidatePipelineRepository.getRejectionsInWindow(range.startDate, range.endDate),
      );
      test.skip(expected === null, 'No rejections in the last 12 months: nothing to hover.');
      // Hover only once the chart shows this period's reasons: every segment the database says
      // should be there, not the previous preset's (and not an empty chart).
      await expect
        .poll(() => rejectionReasons.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);

      for (const [index, { category }] of expected!.categories.entries()) {
        await test.step(`hover "${category}"`, async () => {
          await rejectionReasons.hoverSegment(index);
          await expect
            .poll(() => rejectionReasons.readCentreReadout())
            .toEqual(expectedCentreReadout(expected!, category));
        });
      }
    },
  );

  test(
    'S-94-04: hovering a segment greys out the other segments and legend rows',
    details({
      ac: ['WP23-94 AC 1.2', 'WP23-94 AC 1.2.1'],
      title: 'Hovering a segment greys out the others',
      what: 'Hovers the first segment and checks the other segments and list rows fade while it stays bright.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository }) => {
      const { rejectionReasons } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      await candidatePipelinePage.selectGlobalDatePreset('Last 12 months');
      const range = resolveGlobalPreset('Last 12 months');
      const expected = expectedRejectionReasons(
        await candidatePipelineRepository.getRejectionsInWindow(range.startDate, range.endDate),
      );
      test.skip(expected === null, 'No rejections in the last 12 months: nothing to hover.');
      // The number of segments comes from the database, and the chart must show them all
      // (this period's, not the previous preset's) before hovering.
      await expect
        .poll(() => rejectionReasons.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
      const count = expected!.categories.length;
      if (count < 2) {
        markLimitedByData(
          'Only one rejection reason on record: nothing else to grey out, so only “the hovered one stays bright” was checked.',
        );
      }

      await rejectionReasons.hoverSegment(0);
      await expect
        .poll(() => rejectionReasons.readEmphasis())
        .toEqual(expectedHoverEmphasis(count, 0));
    },
  );

  test(
    'S-94-06: a past date range counts only the rejections made by its end',
    details({
      ac: ['WP23-94 AC 1.1', 'WP23-94 AC 1.1.1'],
      title: 'A past period counts only rejections made by the end of it',
      what: 'Picks a past month where some of its applicants were only rejected after the month ended, and checks the chart leaves those out.',
    }),
    async ({ candidatePipelinePage, widgetRequests, candidatePipelineRepository }) => {
      const { rejectionReasons } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      const window = pastMonthWhereRejectionCapMatters(
        await candidatePipelineRepository.getMonthlyRejectionCap(),
      );
      test.skip(
        window === null,
        'No past month has applicants rejected after the month ended, so "rejected by the end of the period" changes nothing on this data.',
      );
      const expected = expectedRejectionReasons(
        await candidatePipelineRepository.getRejectionsInWindow(window!.startDate, window!.endDate),
      );
      console.log('Rejection Reasons past window %o — SQL-derived: %o', window, expected);

      await candidatePipelinePage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      await widgetRequests.waitForWindow(PIPELINE_WIDGET_KEYS.rejectionReasons, window!);
      await expect
        .poll(() => rejectionReasons.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
    },
  );
});
