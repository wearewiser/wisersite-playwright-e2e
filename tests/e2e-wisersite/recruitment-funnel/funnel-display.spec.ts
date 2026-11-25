import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  CHARTED_SOURCES,
  FEED_DATA_NAME,
  FUNNEL_COPY,
  FUNNEL_STAGES,
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
  STALE_FEED_HOURS,
  WINDOW_SEARCH_DAYS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import { GLOBAL_PRESETS } from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  atsStageAsOf,
  expectedBandLabels,
  expectedFunnelTable,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import { parseLocaleCount } from '../../../src/utils/format/locale-number';
import {
  details,
  markKnownDefect,
  markLimitedByData,
} from '../../../src/utils/playwright/test-annotations';
import { formatIntlDisplayDate } from '../../../src/utils/wisersite/date-format';
import {
  localTodayIso,
  nthDayDate,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';
import {
  afterStaleFeedWindow,
  beforeDataWindow,
  partialFunnelWindow,
  pastMonthWindow,
  stagesMovedOnSince,
} from '../../../src/utils/wisersite/funnel-windows';
import { loadExpectedFunnel } from '../../../src/utils/wisersite/funnel-oracle';

/**
 * WP23-85 — Funnel > E2E funnel widget (test plan docs/test-plans/WP23-61.md, S-85-*).
 *
 * AC 1: the funnel follows the global date picker and shows, for Reach, Career Site Views,
 * Application Started, Application Submitted, Passed Screening, Interviewed, Offer Extended and
 * Hired, volumes and percentages, with each stage's breakdown by job boards / social / referral /
 * organic in its own colour. AC 2: zero everywhere with data elsewhere → prompt to widen the range
 * (2.1.1); some stages zero → still drawn, 0 shown (2.2); a stage whose data failed to sync →
 * the rest drawn plus an error message (2.3). AC 5: each candidate is counted once, at the furthest
 * stage reached during the range (NOTE 2.2). AC 3 (load time) and AC 4 (permissions) aren't tested.
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;

test.describe('WP23-85 Recruitment Funnel display', () => {
  for (const preset of GLOBAL_PRESETS) {
    test(
      `S-85-01 "${preset}": every stage's volume, share of Reach and source split match the warehouse`,
      details({
        ac: [
          'WP23-85 AC 1',
          'WP23-85 AC 1.1',
          ...FUNNEL_STAGES.map((_, i) => `WP23-85 AC 1.1.${i + 1}`),
          ...CHARTED_SOURCES.map((_, i) => `WP23-85 AC 1.2.${i + 1}`),
        ],
        title: 'Each date preset shows the right number of people at every stage, by source',
        what: 'Picks the date preset and compares every stage of the funnel (total, share of Reach and the count for each of the four sources) with the database.',
        variant: preset,
      }),
      async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
        const { funnel } = recruitmentFunnelPage;
        await recruitmentFunnelPage.selectGlobalDatePreset(preset);
        const window = resolveGlobalPreset(preset);
        await widgetRequests.waitForWindow(FUNNEL, window);

        const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
        const expected = expectedFunnelTable(stages);
        console.log('Funnel %o — expected table: %o', window, expected.rows);

        await expect
          .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      },
    );
  }

  test(
    "S-85-02 each stage's source bands are labelled with that source's share of the stage",
    details({
      ac: ['WP23-85 AC 1.2'],
      title: 'Each stage shows the percentage split by source',
      what: 'On the last 12 months, reads the percentage written on each source band of every stage and compares it with each source’s share of that stage in the database.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      await recruitmentFunnelPage.selectGlobalDatePreset('Last 12 months');
      const window = resolveGlobalPreset('Last 12 months');
      await widgetRequests.waitForWindow(FUNNEL, window);
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));

      const expected = expectedBandLabels(stages);
      console.log('Band labels expected: %o', expected);
      await expect
        .poll(() => funnel.readBandLabels(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expected);
    },
  );

  test(
    'S-85-03 the four sources are drawn in four different colours',
    details({
      ac: ['WP23-85 AC 1.2'],
      title: 'Each source has its own colour',
      what: 'Checks the key shows Job Boards, Social, Referral and Organic, each with a different colour.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await expect(funnel.chips.getByRole('button')).toHaveText(
        CHARTED_SOURCES.map((s) => s.label),
      );
      const colours = await funnel.readChipColours();
      console.log('Chip colours: %o', colours);
      expect(colours.every((c) => c !== '' && c !== 'rgba(0, 0, 0, 0)')).toBe(true);
      expect(new Set(colours).size).toBe(CHARTED_SOURCES.length);
    },
  );

  test(
    'S-85-05 a range before any data says when each feed starts',
    details({
      ac: ['WP23-85 AC 2.1.1'],
      title: 'An empty date range asks the user to widen it',
      what: 'Picks two weeks before the first day of data and checks every stage shows “—” and the message says from which date each kind of data exists.',
      variant: 'Range before the first data',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const spans = await recruitmentFunnelRepository.getFeedSpans();
      const window = beforeDataWindow(spans);
      test.skip(!window, 'No feed has any data.');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window!);

      await recruitmentFunnelPage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      await widgetRequests.waitForWindow(FUNNEL, window!);
      const { funnel } = recruitmentFunnelPage;
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));
      for (const span of spans.filter((s) => s.firstDay)) {
        await expect(funnel.banner).toContainText(formatIntlDisplayDate(span.firstDay!));
      }
      console.log(
        'Feeds start: %o',
        spans.map((s) => `${FEED_DATA_NAME[s.feed]} ${s.firstDay}`),
      );
    },
  );

  test(
    'S-85-06 a range where some stages have nobody still draws the funnel and shows 0 for them',
    details({
      ac: ['WP23-85 AC 2.2'],
      title: 'Stages with nobody show 0 and the funnel is still drawn',
      what: 'Finds a recent week where every data feed has data but at least one recruitment stage has nobody, and checks that stage shows 0, the others their numbers, and no error message.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const today = localTodayIso();
      const spans = await recruitmentFunnelRepository.getFeedSpans();
      const lastDays = spans
        .filter((s) => s.feed !== 'traffic')
        .map((s) => s.lastDay)
        .filter((d): d is string => d !== null);
      const latestEnd = [today, ...lastDays].sort()[0]!;
      const earliestEnd = nthDayDate(today, -WINDOW_SEARCH_DAYS);
      const searchRange = { startDate: nthDayDate(earliestEnd, -7), endDate: latestEnd };
      const window = partialFunnelWindow({
        applications: await recruitmentFunnelRepository.getApplications(searchRange),
        gaDaily: await recruitmentFunnelRepository.getGaDailyTotals(searchRange),
        latestEnd,
        earliestEnd,
        today,
      });
      test.skip(
        !window,
        `No week in the last ${WINDOW_SEARCH_DAYS} days has data in every feed and a recruitment stage with nobody.`,
      );
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window!);
      const expected = expectedFunnelTable(stages);
      console.log('Partial funnel %o: %o', window, expected.rows);

      await recruitmentFunnelPage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      await widgetRequests.waitForWindow(FUNNEL, window!);
      const { funnel } = recruitmentFunnelPage;
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expected);
      expect(expected.rows.some((row) => row.total.startsWith('0 ('))).toBe(true);
      await expect(funnel.banner).toHaveCount(0);
    },
  );

  test(
    'S-85-07 a stage whose data stopped syncing shows no figure, the rest are drawn, with an error message',
    details({
      ac: ['WP23-85 AC 2.3'],
      title: 'A stage that failed to sync is flagged while the rest of the funnel shows',
      what: 'Picks a week after a data feed stopped updating, and checks the stages it feeds show “—” with a message about re-syncing while the other stages show their numbers.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const found = afterStaleFeedWindow(
        await recruitmentFunnelRepository.getFeedSpans(),
        STALE_FEED_HOURS,
        localTodayIso(),
      );
      test.skip(!found, `Every data feed loaded within the last ${STALE_FEED_HOURS} hours.`);
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, found!.window);
      test.skip(
        !stages.some((s) => s.state === 'available' && s.total > 0),
        `No other feed has data in the week after the ${found!.feed} feed stopped (${found!.window.startDate}).`,
      );
      const syncing = FUNNEL_STAGES.filter((s) => s.feed === found!.feed).map((s) => s.label);
      console.log(
        'Stale feed %s, window %o, syncing stages %o',
        found!.feed,
        found!.window,
        syncing,
      );

      await recruitmentFunnelPage.setCustomGlobalDateRange(
        found!.window.startDate,
        found!.window.endDate,
      );
      await widgetRequests.waitForWindow(FUNNEL, found!.window);
      const { funnel } = recruitmentFunnelPage;
      const expected = expectedFunnelTable(stages);
      try {
        await expect
          .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      } catch (error) {
        // WP23-602: the window ends before today, and the ribbon counts ATS stages as reached
        // today. Labelled only when the table is exactly that (any other difference is new).
        const countedToToday = expectedFunnelTable(
          (await loadExpectedFunnel(recruitmentFunnelRepository, found!.window, localTodayIso()))
            .stages,
        );
        if (
          JSON.stringify(countedToToday) !== JSON.stringify(expected) &&
          JSON.stringify(await funnel.readTable()) === JSON.stringify(countedToToday)
        ) {
          markKnownDefect(KNOWN_DEFECTS.funnelStagesCountedToToday);
        }
        throw error;
      }
      await expect(funnel.banner).toContainText(FUNNEL_COPY.syncingBannerTitle);
      for (const label of syncing) await expect(funnel.banner).toContainText(label);
    },
  );

  test(
    'S-85-08 every application is counted once, at one stage',
    details({
      ac: ['WP23-85 AC 5'],
      title: 'Each candidate is counted at one stage only',
      what: 'On the last 12 months, adds up the recruitment stages (Application Submitted to Hired) and checks the total equals the number of applications in the database, so nobody is counted twice.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      await recruitmentFunnelPage.selectGlobalDatePreset('Last 12 months');
      const window = resolveGlobalPreset('Last 12 months');
      await widgetRequests.waitForWindow(FUNNEL, window);
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));

      const staged = applications.filter(
        (row) => atsStageAsOf(row, window.endDate) !== null,
      ).length;
      const atsLabels = FUNNEL_STAGES.filter((s) => s.feed === 'ats').map((s) => s.label);
      const shown = (await funnel.readTable()).rows
        .filter((row) => atsLabels.includes(row.stage))
        .reduce((n, row) => n + parseLocaleCount(row.total.split(' ')[0]), 0);
      console.log('ATS stages sum %d, applications with a stage %d', shown, staged);
      expect(shown).toBe(staged);
    },
  );

  test(
    'S-85-09 a past month counts each candidate at the furthest stage reached by its end',
    details({
      ac: ['WP23-85 AC 5'],
      title: 'Each candidate is counted at one stage only',
      what: 'Picks a past calendar month and checks each recruitment stage counts the candidates who applied that month at the furthest stage they had reached by the end of the month.',
      variant: 'Past month',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const today = localTodayIso();
      const year = await recruitmentFunnelRepository.getApplications({
        startDate: nthDayDate(today, -400),
        endDate: today,
      });
      const { window, differs } = pastMonthWindow(today, 12, (w) =>
        stagesMovedOnSince(year, w, today),
      );
      if (!differs) {
        markLimitedByData(
          'No month in the last year has candidates who moved on after the month ended, so counting to the month’s end and to today agree.',
        );
      }
      const expected = expectedFunnelTable(
        (await loadExpectedFunnel(recruitmentFunnelRepository, window)).stages,
      );
      const countedToToday = expectedFunnelTable(
        (await loadExpectedFunnel(recruitmentFunnelRepository, window, today)).stages,
      );
      console.log('Past month %o, stages differ by end date: %s', window, differs);

      await recruitmentFunnelPage.setCustomGlobalDateRange(window.startDate, window.endDate);
      await widgetRequests.waitForWindow(FUNNEL, window);
      const { funnel } = recruitmentFunnelPage;
      try {
        await expect
          .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      } catch (error) {
        if (
          differs &&
          JSON.stringify(await funnel.readTable()) === JSON.stringify(countedToToday)
        ) {
          markKnownDefect(KNOWN_DEFECTS.funnelStagesCountedToToday);
        }
        throw error;
      }
    },
  );
});
