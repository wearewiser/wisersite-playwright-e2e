import { devices } from '@playwright/test';
import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  KNOWN_DEFECTS,
  SUSPECTED_DEFECTS,
} from '../../../src/constants/wisersite/known-defects.constants';
import {
  CHARTED_SOURCES,
  FUNNEL_COPY,
  FUNNEL_STAGES,
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import { GLOBAL_PRESETS } from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  arrivalExceedsWholeCohort,
  expectedFunnelTable,
  expectedSourcePerformance,
  expectedStageFlows,
  expectedStageHovers,
  flowMismatches,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import {
  details,
  markKnownDefect,
  markSuspectedDefect,
} from '../../../src/utils/playwright/test-annotations';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';
import { loadExpectedFunnel } from '../../../src/utils/wisersite/funnel-oracle';

/**
 * WP23-86 — Recruitment funnel widget: show detail on hover / click (test plan
 * docs/test-plans/WP23-61.md, S-86-*).
 *
 * AC 1: hovering a stage (nothing pinned) shows only that stage's category, name, candidates,
 * % arrived from the previous stage ("–" for Reach), source breakdown (count and share per
 * source) and stage flow (lost, % drop, cumulative drop, whole numbers). AC 2: clicking pins the
 * stage and its full detail until another stage is clicked; closing the detail returns to the
 * hover view. AC 3: source categories expand into individual sources and collapse again. AC 4.1:
 * touch devices tap instead of hovering. AC 6: a stage with no candidates says "No data for this
 * period". AC 4.2 (keyboard), AC 5 (timing) and AC 7 (permissions) aren't tested (plan D-11).
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;
const ATS_STAGE_LABELS = FUNNEL_STAGES.filter((s) => s.feed === 'ats').map((s) => s.label);

test.describe('WP23-86 stage hover and pin', () => {
  // Every test starts on the last 12 months, with the funnel showing the warehouse's figures
  // (the panels read a stage's state, so they must not run against the previous range's answer).
  test.beforeEach(
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const window = resolveGlobalPreset('Last 12 months');
      await recruitmentFunnelPage.selectGlobalDatePreset('Last 12 months');
      await widgetRequests.waitForWindow(FUNNEL, window);
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      await expect
        .poll(() => recruitmentFunnelPage.funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));
    },
  );

  test(
    'S-86-01 hovering each stage shows its category and name',
    details({
      ac: ['WP23-86 AC 1.1', 'WP23-86 AC 1.2'],
      title: 'Hovering a stage shows its category and name',
      what: 'Hovers each of the eight stages and checks the summary names the stage and its category (Awareness, Consideration, Evaluation or Decision).',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      const readings: { category: string; stage: string }[] = [];
      for (const stage of FUNNEL_STAGES) {
        await funnel.hoverStage(stage.label);
        await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
        const { category, stage: name } = await funnel.hoverPanel.read();
        readings.push({ category, stage: name });
      }
      expect(readings).toEqual(
        FUNNEL_STAGES.map((s) => ({ category: s.category, stage: s.label })),
      );
    },
  );

  test(
    "S-86-02 hovering each stage shows its candidates and each source's count and share",
    details({
      ac: ['WP23-86 AC 1', 'WP23-86 AC 1.3', 'WP23-86 AC 1.5'],
      title: 'Hovering a stage shows its candidates and the split by source',
      what: 'On the last 12 months, hovers each stage and compares the number of candidates and each source’s count and share with the database.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      const expected = expectedStageHovers(stages);

      const readings: unknown[] = [];
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        if (!expected[index]) continue;
        await funnel.hoverStage(stage.label);
        await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
        const { candidates, sources } = await funnel.hoverPanel.read();
        readings.push({ stage: stage.label, candidates, sources });
      }
      expect(readings).toEqual(expected.filter((e) => e !== null));
    },
  );

  test(
    'S-86-03 hovering a second stage replaces the first',
    details({
      ac: ['WP23-86 AC 1'],
      title: 'Only one stage summary is open at a time',
      what: 'Hovers one stage then another, and checks only the second stage’s summary is shown.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.hoverStage('Reach');
      await expect(funnel.hoverPanel.heading).toHaveText('Reach');
      await funnel.hoverStage('Interviewed');
      await expect(funnel.hoverPanel.heading).toHaveText('Interviewed');
      await expect(funnel.hoverPanel.root).toHaveCount(1);
    },
  );

  test(
    'S-86-04 the % arrived from the previous stage is a whole number, "–" for Reach, never over 100%',
    details({
      ac: ['WP23-86 AC 1.4'],
      title: 'Hovering a stage shows the % arrived from the previous stage',
      what: 'On the last 12 months, hovers each stage and checks the % of the previous stage that arrived here against the database: none for Reach, whole numbers, and never more than 100% between recruitment stages.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      const flows = expectedStageFlows(stages);

      const expected: { stage: string; arrival: string | null }[] = [];
      const readings: { stage: string; arrival: string | null }[] = [];
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        const flow = flows[index];
        if (!flow) continue;
        await funnel.hoverStage(stage.label);
        await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
        const { arrival } = await funnel.hoverPanel.read();
        if (index === 0) {
          // AC 1.4: no % for Reach, shown as a dash (D-8: the line reads "Top of funnel — entry point").
          expect(arrival).not.toMatch(/%/);
          expect(arrival).toContain(FUNNEL_COPY.noValue);
          continue;
        }
        const previous = FUNNEL_STAGES[index - 1]!.label;
        readings.push({ stage: stage.label, arrival });
        expected.push({
          stage: stage.label,
          arrival:
            flow.arrived === FUNNEL_COPY.noValue
              ? FUNNEL_COPY.noValue
              : `${flow.arrived} arrived from ${previous}`,
        });
      }
      console.log('Arrival lines: %o', readings);

      // Labels only when every difference is one a defect explains (else it's a new failure).
      const mismatches = flowMismatches(readings, expected);
      const explained = !mismatches.has('other');
      if (explained && mismatches.has('careerSiteViewsDash')) {
        markSuspectedDefect(SUSPECTED_DEFECTS.funnelCareerSiteViewsFlowDashed);
      }
      if (explained && mismatches.has('decimalUnderTen'))
        markKnownDefect(KNOWN_DEFECTS.funnelHoverDecimals);
      expect.soft(readings).toEqual(expected);

      // AC 1.4 "% arriving from previous stage" can't pass 100% where both stages count the
      // same applicants (D-4): ATS → ATS steps only.
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        const reading = readings.find((r) => r.stage === stage.label);
        if (!reading || !ATS_STAGE_LABELS.includes(stage.label)) continue;
        if (!ATS_STAGE_LABELS.includes(FUNNEL_STAGES[index - 1]!.label)) continue;
        const shown = Number.parseFloat(reading.arrival ?? '');
        if (shown > 100 && arrivalExceedsWholeCohort(stages, index)) {
          markKnownDefect(KNOWN_DEFECTS.funnelArrivalOver100);
        }
        expect
          .soft(shown, `${stage.label}: % arrived from the previous stage`)
          .toBeLessThanOrEqual(100);
      }
    },
  );

  test(
    'S-86-05 stage flow shows lost candidates, % drop and cumulative drop as whole numbers',
    details({
      ac: ['WP23-86 AC 1.6'],
      title: 'Hovering a stage shows how many were lost since the previous stage',
      what: 'On the last 12 months, hovers each stage and compares the number lost from the previous stage, the % drop and the cumulative drop since Reach with the database, as whole numbers.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      const flows = expectedStageFlows(stages);

      const expected: Record<string, string>[] = [];
      const readings: Record<string, string>[] = [];
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        const flow = flows[index];
        if (!flow) continue;
        await funnel.hoverStage(stage.label);
        await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
        readings.push({ stage: stage.label, ...(await funnel.hoverPanel.read()).flow });
        expected.push({
          stage: flow.stage,
          fromPrevious: flow.fromPrevious,
          cumulative: flow.cumulative,
          drop: flow.drop,
        });
      }
      console.log('Stage flow: %o', readings);

      // Labels only when every difference is one a defect explains (else it's a new failure).
      const mismatches = flowMismatches(readings, expected);
      if (!mismatches.has('other') && mismatches.has('careerSiteViewsDash')) {
        markSuspectedDefect(SUSPECTED_DEFECTS.funnelCareerSiteViewsFlowDashed);
      }
      if (!mismatches.has('other') && mismatches.has('decimalUnderTen')) {
        markKnownDefect(KNOWN_DEFECTS.funnelHoverDecimals);
      }
      expect(readings).toEqual(expected);
    },
  );

  test(
    'S-86-06 clicking a stage pins it and its full detail until another stage is clicked',
    details({
      ac: ['WP23-86 AC 2', 'WP23-86 AC 2.1', 'WP23-86 AC 2.2'],
      title: 'Clicking a stage pins it',
      what: 'Clicks a stage, checks it is marked as pinned with its full detail open, that hovering another stage keeps it, and that clicking another stage moves the pin there.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.takeOverClock();
      await funnel.pinStage('Interviewed');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.pinnedMarker).toBeVisible();
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Interviewed');

      // Hovering another stage must not replace the pin: checked once its hover would have shown.
      await funnel.hoverStageAndLetIntentElapse('Reach');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Interviewed');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.hoverPanel.root).toHaveCount(0);

      await funnel.pinStage('Offer Extended');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Offer Extended');
      await expect(funnel.stageButton('Offer Extended')).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'false');
    },
  );

  test(
    "S-86-07 closing the full detail with the mouse goes back to the stage's hover view",
    details({
      ac: ['WP23-86 AC 2.2.1'],
      title: 'Closing the full detail goes back to the stage summary',
      what: 'Pins a stage, closes its full detail with the Close button, and checks the stage’s hover summary is shown.',
      variant: 'Mouse',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.pinStage('Passed Screening');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Passed Screening');
      await funnel.detail.closeButton.click();
      await expect(funnel.detail.root).toHaveCount(0);
      try {
        await expect(funnel.hoverPanel.heading).toHaveText('Passed Screening');
      } catch (error) {
        if ((await funnel.hoverPanel.root.count()) === 0) {
          markSuspectedDefect(SUSPECTED_DEFECTS.funnelMouseCloseNoHover);
        }
        throw error;
      }
    },
  );

  test(
    "S-86-08 closing the full detail from the keyboard goes back to the stage's hover view",
    details({
      ac: ['WP23-86 AC 2.2.1'],
      title: 'Closing the full detail goes back to the stage summary',
      what: 'Pins a stage from the keyboard, closes its full detail with Escape, and checks the stage’s hover summary is shown.',
      variant: 'Keyboard',
    }),
    async ({ recruitmentFunnelPage, page }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.stageButton('Passed Screening').focus();
      await page.keyboard.press('Enter');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Passed Screening');
      await page.keyboard.press('Escape');
      await expect(funnel.detail.root).toHaveCount(0);
      await expect(funnel.hoverPanel.heading).toHaveText('Passed Screening');
    },
  );

  test(
    'S-86-09 a source category with several sources can be expanded to show each source',
    details({
      ac: ['WP23-86 AC 3', 'WP23-86 AC 1.5.1'],
      title: 'A source can be expanded into its individual sources',
      what: 'Opens a stage whose source has several individual sources, expands that source, and checks each individual source and its count against the database.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const target = FUNNEL_STAGES.flatMap((stage, index) =>
        expectedSourcePerformance({ stages, index, applications, asOf: window.endDate })
          .filter((row) => row.subSources.length >= 2)
          .map((row) => ({ stage: stage.label, row })),
      )[0];
      test.skip(
        !target,
        'No source has two or more individual sources at any stage in the last 12 months.',
      );
      console.log(
        'Expanding %s under %s: %o',
        target!.row.source,
        target!.stage,
        target!.row.subSources,
      );

      await funnel.pinStage(target!.stage);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${target!.stage}`);
      const expand = funnel.detail.expandControl(target!.row.source);
      try {
        await expect(expand).toBeVisible();
      } catch (error) {
        if ((await expand.count()) === 0)
          markSuspectedDefect(SUSPECTED_DEFECTS.funnelNoSourceExpand);
        throw error;
      }
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      const categories = CHARTED_SOURCES.map((s) => s.label);
      const shown = (await funnel.detail.readSourcePerformance(categories)).find(
        (r) => r.source === target!.row.source,
      );
      expect(shown?.subSources).toEqual(target!.row.subSources);
    },
  );

  test(
    'S-86-10 an expanded source collapses again when its expand control is clicked again',
    details({
      ac: ['WP23-86 AC 3.1'],
      title: 'An expanded source can be collapsed again',
      what: 'Expands a source into its individual sources, clicks the control again, and checks the individual sources are hidden.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const target = FUNNEL_STAGES.flatMap((stage, index) =>
        expectedSourcePerformance({ stages, index, applications, asOf: window.endDate })
          .filter((row) => row.subSources.length >= 2)
          .map((row) => ({ stage: stage.label, row })),
      )[0];
      test.skip(
        !target,
        'No source has two or more individual sources at any stage in the last 12 months.',
      );

      await funnel.pinStage(target!.stage);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${target!.stage}`);
      const expand = funnel.detail.expandControl(target!.row.source);
      try {
        await expect(expand).toBeVisible();
      } catch (error) {
        if ((await expand.count()) === 0)
          markSuspectedDefect(SUSPECTED_DEFECTS.funnelNoSourceExpand);
        throw error;
      }
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      for (const sub of target!.row.subSources) {
        await expect(funnel.detail.sourceRow(sub.source)).toBeHidden();
      }
    },
  );

  test(
    'S-86-12 a stage with no candidates says "No data for this period" on hover and when pinned',
    details({
      ac: ['WP23-86 AC 6'],
      title: 'A stage nobody reached says there is no data for the period',
      what: 'Finds a date preset where a recruitment stage has nobody, hovers and then clicks that stage, and checks its name, category and “No data for this period” are shown instead of figures.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      let found: { preset: (typeof GLOBAL_PRESETS)[number]; index: number } | null = null;
      for (const preset of GLOBAL_PRESETS) {
        const { stages } = await loadExpectedFunnel(
          recruitmentFunnelRepository,
          resolveGlobalPreset(preset),
        );
        const index = stages.findIndex((s) => s.state === 'available' && s.total === 0);
        if (index >= 0 && stages.some((s) => s.state === 'available' && s.total > 0)) {
          found = { preset, index };
          break;
        }
      }
      test.skip(!found, 'Every stage has candidates in every date preset.');
      const stage = FUNNEL_STAGES[found!.index]!;
      console.log('Zero stage %s on %s', stage.label, found!.preset);

      await recruitmentFunnelPage.selectGlobalDatePreset(found!.preset);
      await widgetRequests.waitForWindow(FUNNEL, resolveGlobalPreset(found!.preset));
      await expect(funnel.stageButton(stage.label)).toHaveAccessibleName(`${stage.label}: 0`, {
        timeout: FUNNEL_WIDGET_TIMEOUT_MS,
      });

      await funnel.hoverStage(stage.label);
      await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
      const hover = await funnel.hoverPanel.read();
      expect(hover.category).toBe(stage.category);
      expect(hover.candidates).toBeNull();

      await funnel.pinStage(stage.label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
      expect(await funnel.detail.readPhaseLine()).toBe(
        `${stage.category} · Stage ${found!.index + 1} of ${FUNNEL_STAGES.length}`,
      );
      const pinnedNote = ((await funnel.detail.note.textContent()) ?? '').trim();

      // AC 6 wording ("No data for this period", the app adds a full stop). Labelled only when
      // every wrong note is the app's real-zero copy (QA-WP23-61-4), not for any other text.
      const notes = [hover.note ?? '', pinnedNote];
      const wrong = notes.filter((note) => !note.startsWith(FUNNEL_COPY.noDataForPeriod));
      if (wrong.length > 0 && wrong.every((note) => note === FUNNEL_COPY.zeroDetail)) {
        markSuspectedDefect(SUSPECTED_DEFECTS.funnelZeroStageCopy);
      }
      expect(notes, 'hover note, then pinned note').toEqual([
        expect.stringMatching(new RegExp(`^${FUNNEL_COPY.noDataForPeriod}\\.?$`)),
        expect.stringMatching(new RegExp(`^${FUNNEL_COPY.noDataForPeriod}\\.?$`)),
      ]);
    },
  );
});

test.describe('WP23-86 touch devices', () => {
  // A tablet: no hover, touch input (`(hover: hover) and (pointer: fine)` is false).
  const ipad = devices['iPad Pro 11'];
  test.use({
    viewport: ipad.viewport,
    userAgent: ipad.userAgent,
    deviceScaleFactor: ipad.deviceScaleFactor,
    isMobile: ipad.isMobile,
    hasTouch: ipad.hasTouch,
  });

  test(
    'S-86-11 on a touch device hovering shows nothing and tapping a stage pins it',
    details({
      ac: ['WP23-86 AC 4', 'WP23-86 AC 4.1', 'WP23-295 AC 7.3'],
      title: 'On a tablet, tapping a stage opens its detail',
      what: 'On an iPad, checks that moving over a stage shows no summary, and that tapping the stage pins it and opens its full detail.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      // Checked once a hover would have shown its panel (break-it: on a desktop this fails).
      await funnel.takeOverClock();
      await funnel.hoverStageAndLetIntentElapse('Passed Screening');
      await expect(funnel.hoverPanel.root).toHaveCount(0);
      await funnel.stageButton('Passed Screening').tap();
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Passed Screening');
      await expect(funnel.stageButton('Passed Screening')).toHaveAttribute('aria-pressed', 'true');
    },
  );
});
