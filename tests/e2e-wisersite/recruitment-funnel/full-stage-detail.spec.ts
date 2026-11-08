import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  KNOWN_DEFECTS,
  SUSPECTED_DEFECTS,
} from '../../../src/constants/wisersite/known-defects.constants';
import {
  CHARTED_SOURCES,
  FUNNEL_STAGES,
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import {
  arrivalExceedsWholeCohort,
  categoryRows,
  conversionChartWeeks,
  expectedFunnelTable,
  expectedSourcePerformance,
  expectedStageSummary,
  expectedWeeklyConversion,
  firstStageLosingOverHalf,
  flowMismatches,
  subSourceRows,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import type { StageSummaryReading } from '../../../src/types/wisersite/recruitment-funnel.types';
import {
  details,
  markKnownDefect,
  markLimitedByData,
  markSuspectedDefect,
} from '../../../src/utils/playwright/test-annotations';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';
import { loadExpectedFunnel } from '../../../src/utils/wisersite/funnel-oracle';

/**
 * WP23-295 — Recruitment funnel widget: view full stage detail (test plan
 * docs/test-plans/WP23-61.md, S-295-*).
 *
 * AC 1: a pinned stage shows its full detail, arrows step to the previous / next stage, and it can
 * be closed. AC 2: candidates at stage, % arrived from the previous stage ("–" for the first), %
 * lost (neutral styling). AC 3: per source, by category: candidates, share of the stage, % to the
 * next stage. AC 4 / 5: device split and leave reasons only when data exists (none in the
 * warehouse yet, so only the hidden path, 4.2 / 5.2). AC 6: an 8-week "conversion to next stage"
 * chart, absent on the last stage. AC 7 (timing) isn't tested.
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;
const WINDOW = () => resolveGlobalPreset('Last 12 months');
const CATEGORY_LABELS = CHARTED_SOURCES.map((s) => s.label);
const ATS_LABELS = FUNNEL_STAGES.filter((s) => s.feed === 'ats').map((s) => s.label);

test.describe('WP23-295 full stage detail', () => {
  // Every test starts on the last 12 months with the funnel showing the warehouse's figures.
  test.beforeEach(
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const window = WINDOW();
      await recruitmentFunnelPage.selectGlobalDatePreset('Last 12 months');
      await widgetRequests.waitForWindow(FUNNEL, window);
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      await expect
        .poll(() => recruitmentFunnelPage.funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));
    },
  );

  test(
    'S-295-01 the full detail opens for the pinned stage, arrows step through every stage, and it closes',
    details({
      ac: ['WP23-295 AC 1', 'WP23-295 AC 1.1', 'WP23-295 AC 1.2', 'WP23-295 AC 1.3'],
      title: 'The full stage detail opens, steps between stages and closes',
      what: 'Pins Reach, steps forward with the arrow to Hired and back to Reach checking each stage’s detail, then closes it.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      const { detail } = funnel;
      await funnel.pinStage('Reach');
      const total = FUNNEL_STAGES.length;
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        await expect(detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
        await expect(detail.title).toHaveText(stage.label);
        expect(await detail.readPhaseLine()).toBe(
          `${stage.category} · Stage ${index + 1} of ${total}`,
        );
        await expect(detail.previousButton).toBeEnabled({ enabled: index > 0 });
        await expect(detail.nextButton).toBeEnabled({ enabled: index < total - 1 });
        if (index < total - 1) await detail.nextButton.click();
      }
      for (const stage of [...FUNNEL_STAGES].reverse().slice(1)) {
        await detail.previousButton.click();
        await expect(detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
      }
      await detail.closeButton.click();
      await expect(detail.root).toHaveCount(0);
    },
  );

  test(
    'S-295-02 each stage shows candidates at stage, % arrived from the previous stage and % lost',
    details({
      ac: [
        'WP23-295 AC 2',
        'WP23-295 AC 2.1',
        'WP23-295 AC 2.2',
        'WP23-295 AC 2.2.1',
        'WP23-295 AC 2.3',
      ],
      title: 'The full detail shows the stage’s summary figures',
      what: 'On the last 12 months, steps through every stage’s full detail and compares candidates at stage, % arrived from the previous stage (none for the first) and % lost with the database; arrivals between recruitment stages can’t exceed 100%.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, WINDOW());
      const expected = FUNNEL_STAGES.map((_, index) => expectedStageSummary(stages, index));
      const readings: StageSummaryReading[] = [];
      await funnel.pinStage(FUNNEL_STAGES[0]!.label);
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
        readings.push(await funnel.detail.readSummary());
        if (index < FUNNEL_STAGES.length - 1) await funnel.detail.nextButton.click();
      }
      console.log('Summaries: %o', readings);

      // Labels only when every difference is one a defect explains (else it's a new failure).
      const mismatches = flowMismatches(
        readings.map((r, i) => ({ stage: FUNNEL_STAGES[i]!.label, ...r })),
        expected.map((e, i) => ({ stage: FUNNEL_STAGES[i]!.label, ...e })),
      );
      const explained = !mismatches.has('other');
      if (explained && mismatches.has('careerSiteViewsDash')) {
        markSuspectedDefect(SUSPECTED_DEFECTS.funnelCareerSiteViewsFlowDashed);
      }
      expect.soft(readings).toEqual(expected);

      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        if (index === 0 || !ATS_LABELS.includes(stage.label)) continue;
        if (!ATS_LABELS.includes(FUNNEL_STAGES[index - 1]!.label)) continue;
        const shown = Number.parseFloat(readings[index]!.arrived);
        if (explained && shown > 100 && arrivalExceedsWholeCohort(stages, index)) {
          markKnownDefect(KNOWN_DEFECTS.funnelArrivalOver100);
        }
        expect.soft(shown, `${stage.label}: arrived from previous`).toBeLessThanOrEqual(100);
      }
    },
  );

  test(
    "S-295-03 '% lost at this stage' is shown in the same neutral colour as the other figures",
    details({
      ac: ['WP23-295 AC 2.3.1'],
      title: 'The “lost at this stage” figure uses neutral styling',
      what: 'Opens a stage that lost more than half of the previous stage and checks “Lost at this stage” is drawn in the same colour as “Candidates at stage”, not as a warning.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, WINDOW());
      const index = firstStageLosingOverHalf(stages);
      if (index < 0) {
        markLimitedByData(
          'No stage lost more than half of the previous stage, so the styling was only checked below that.',
        );
      }
      const target =
        FUNNEL_STAGES[index >= 0 ? index : FUNNEL_STAGES.findIndex((s) => s.feed === 'ats') + 1]!;
      console.log('Lost-styling stage: %s', target.label);
      await funnel.pinStage(target.label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${target.label}`);

      const neutral = await funnel.detail.readSummaryColour('Candidates at stage');
      const lost = await funnel.detail.readSummaryColour('Lost at this stage');
      if (lost !== neutral && (await funnel.detail.summaryShowsWarningTone('Lost at this stage'))) {
        markSuspectedDefect(SUSPECTED_DEFECTS.funnelLostNotNeutral);
      }
      expect(lost).toBe(neutral);
    },
  );

  test(
    'S-295-04 each stage lists every source category with candidates, share of the stage and % to the next stage',
    details({
      ac: ['WP23-295 AC 3', 'WP23-295 AC 3.1', 'WP23-295 AC 3.2', 'WP23-295 AC 3.3'],
      title: 'The full detail breaks each stage down by source',
      what: 'On the last 12 months, steps through every stage and compares each source’s candidates, share of the stage and % going on to the next stage with the database (“—” where the next stage counts different people).',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = WINDOW();
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const expected = FUNNEL_STAGES.map((stage, index) => ({
        stage: stage.label,
        rows: categoryRows(
          expectedSourcePerformance({ stages, index, applications, asOf: window.endDate }),
        ),
      }));
      const readings: unknown[] = [];
      await funnel.pinStage(FUNNEL_STAGES[0]!.label);
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
        readings.push({
          stage: stage.label,
          rows: categoryRows(await funnel.detail.readSourcePerformance(CATEGORY_LABELS)),
        });
        if (index < FUNNEL_STAGES.length - 1) await funnel.detail.nextButton.click();
      }
      expect(readings).toEqual(expected);
    },
  );

  test(
    'S-295-05 the individual sources under each category match the warehouse',
    details({
      ac: ['WP23-295 AC 3'],
      title: 'The full detail breaks each stage down by source',
      what: 'On the last 12 months, opens each recruitment stage (Application Submitted to Hired) and compares the individual sources listed under each source category, with their counts and shares, with the database.',
      variant: 'Individual sources',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = WINDOW();
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const atsStages = FUNNEL_STAGES.map((s, index) => ({ ...s, index })).filter(
        (s) => s.feed === 'ats',
      );
      const expected = atsStages.map(({ label, index }) => ({
        stage: label,
        rows: subSourceRows(
          expectedSourcePerformance({ stages, index, applications, asOf: window.endDate }),
        ),
      }));
      const readings: unknown[] = [];
      await funnel.pinStage(atsStages[0]!.label);
      for (const [n, stage] of atsStages.entries()) {
        await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
        readings.push({
          stage: stage.label,
          rows: subSourceRows(await funnel.detail.readSourcePerformance(CATEGORY_LABELS)),
        });
        if (n < atsStages.length - 1) await funnel.detail.nextButton.click();
      }
      expect(readings).toEqual(expected);
    },
  );

  test(
    'S-295-06 with no device or leave-reason data, neither chart is shown on any stage',
    details({
      ac: ['WP23-295 AC 4', 'WP23-295 AC 4.2', 'WP23-295 AC 5', 'WP23-295 AC 5.2'],
      title: 'Device split and “why candidates leave” stay hidden without data',
      what: 'Steps through every stage’s full detail and checks no device split or leave-reason chart is shown, since there is no such data per stage yet.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests }) => {
      const { funnel } = recruitmentFunnelPage;
      const mark = widgetRequests.mark();
      await funnel.pinStage(FUNNEL_STAGES[0]!.label);
      await widgetRequests.waitForQuiet(mark);
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
        await expect(funnel.detail.summary).toBeVisible();
        await expect(funnel.detail.deviceSplit).toHaveCount(0);
        await expect(funnel.detail.leaveReasons).toHaveCount(0);
        if (index < FUNNEL_STAGES.length - 1) await funnel.detail.nextButton.click();
      }
    },
  );

  test(
    'S-295-07 the conversion chart shows the % moving on to the next stage for each of the last eight weeks',
    details({
      ac: ['WP23-295 AC 6', 'WP23-295 AC 6.1'],
      title: 'The full detail charts weekly conversion to the next stage',
      what: 'Opens Passed Screening on the last 12 months and compares the “Conversion to Interviewed” chart’s eight weeks with the database.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = WINDOW();
      const from = FUNNEL_STAGES.findIndex((s) => s.key === 'passedScreening');
      const stage = FUNNEL_STAGES[from]!;
      const next = FUNNEL_STAGES[from + 1]!;
      const weeks = conversionChartWeeks(window.endDate);
      const ats = (await recruitmentFunnelRepository.getFeedSpans()).find((s) => s.feed === 'ats');
      const expected = {
        heading: `Conversion to ${next.label}`,
        weeks: expectedWeeklyConversion({
          applications: await recruitmentFunnelRepository.getApplications(weeks.window),
          fromOrder: stage.atsOrder!,
          endDate: window.endDate,
          atsFirstDay: ats?.firstDay ?? null,
        }),
      };
      console.log('Weekly conversion %s → %s: %o', stage.label, next.label, expected.weeks);

      await funnel.pinStage(stage.label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
      await expect
        .poll(() => widgetRequests.last(FUNNEL))
        .toMatchObject({ ...window, weekly: '1' });
      await expect
        .poll(() => funnel.detail.readConversionChart(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expected);
    },
  );

  test(
    'S-295-08 the last stage has no conversion chart',
    details({
      ac: ['WP23-295 AC 6.2'],
      title: 'The last stage has no conversion chart',
      what: 'Opens Hired, the last stage, waits for its detail to load, and checks no “conversion to next stage” chart is shown.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests }) => {
      const { funnel } = recruitmentFunnelPage;
      const last = FUNNEL_STAGES.at(-1)!;
      const mark = widgetRequests.mark();
      await funnel.pinStage(last.label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${last.label}`);
      await widgetRequests.waitForQuiet(mark);
      await expect(funnel.detail.summary).toBeVisible();
      await expect(funnel.detail.conversionChart).toHaveCount(0);
    },
  );
});
