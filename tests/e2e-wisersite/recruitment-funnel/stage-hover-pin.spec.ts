import { devices } from '@playwright/test';
import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  CHARTED_SOURCES,
  FUNNEL_COPY,
  FUNNEL_STAGES,
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import { GLOBAL_PRESETS } from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  ARRIVAL_TOLERANCE_PERCENT,
  arrivalMismatch,
  expectedFunnelTable,
  expectedSourcePerformance,
  expectedStageFlows,
  expectedStageHovers,
  expectedStageSummary,
  firstExpandableSource,
  flowMismatches,
  subSourceRows,
  type FlowMismatch,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import type { StageHoverPanel } from '../../../src/pages/wisersite/components/recruitment-funnel/stage-hover-panel.component';
import { details, markKnownDefect } from '../../../src/utils/playwright/test-annotations';
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
 * hover view. AC 3: in the hover preview, source categories expand into individual sources and
 * collapse again; the pinned full detail always lists every individual source, with no control
 * (by design, WP23-591). AC 4.1: touch devices tap instead of hovering. AC 6: a stage with no
 * candidates says "Nobody reached this stage in these dates." (accepted by the QA lead on
 * 2026-11-12 in place of "No data for this period"). AC 4.2 (keyboard), AC 5 (timing) and AC 7 (permissions) aren't tested (plan D-11).
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;
const CATEGORY_LABELS: readonly string[] = CHARTED_SOURCES.map((s) => s.label);

/**
 * WP23-86 AC 3: the hover preview of `stage` offers an expand control on `category`. Labelled
 * WP23-591 only when the symptom is that defect's: the panel is open on that stage with the
 * category listed, and it has no expand control of any kind (a missing panel, or a control in an
 * unexpected place, fails unlabelled).
 */
async function expectHoverExpandControl(
  panel: StageHoverPanel,
  category: string,
  stage: string,
): Promise<void> {
  try {
    await expect(panel.expandControl(category)).toBeVisible();
  } catch (error) {
    const panelOpen =
      (await panel.root.isVisible()) &&
      ((await panel.heading.textContent()) ?? '').trim() === stage;
    if (
      panelOpen &&
      (await panel.sourceItem(category).count()) > 0 &&
      (await panel.expandControls.count()) === 0
    ) {
      markKnownDefect(KNOWN_DEFECTS.funnelHoverNoSourceExpand);
    }
    throw error;
  }
}

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
    'S-86-04 the % arrived from the previous stage matches the database, "–" for Reach',
    details({
      ac: ['WP23-86 AC 1.4'],
      title: 'Hovering a stage shows the % arrived from the previous stage',
      what: 'On the last 12 months, hovers each stage and checks the % of the previous stage that arrived here against the database (within half a point, as the hover rounds it): none for Reach. It can be over 100% (PO, WP23-357).',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      const flows = expectedStageFlows(stages);

      const readings: { stage: string; shown: string | null; sql: string }[] = [];
      const mismatches = new Set<FlowMismatch>();
      const wrong: typeof readings = [];
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
        const { arrivedPercent } = flow;
        const reading = {
          stage: stage.label,
          shown: arrival,
          sql: arrivedPercent === null ? FUNNEL_COPY.noValue : `${arrivedPercent.toFixed(2)}%`,
        };
        readings.push(reading);
        const issue = arrivalMismatch(
          stage.label,
          arrival,
          arrivedPercent,
          FUNNEL_STAGES[index - 1]!.label,
        );
        if (issue) {
          mismatches.add(issue);
          wrong.push(reading);
        }
      }
      console.log('Arrival lines: %o', readings);

      // Labels only when every difference is one a defect explains (else it's a new failure).
      if (!mismatches.has('other') && mismatches.has('careerSiteViewsDash')) {
        markKnownDefect(KNOWN_DEFECTS.funnelCareerSiteViewsFlowDashed);
      }
      expect(
        wrong,
        `stages whose "% arrived" isn't "<SQL % ± ${ARRIVAL_TOLERANCE_PERCENT}> arrived from <previous stage>"`,
      ).toEqual([]);
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
        markKnownDefect(KNOWN_DEFECTS.funnelCareerSiteViewsFlowDashed);
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
          markKnownDefect(KNOWN_DEFECTS.funnelMouseCloseNoHover);
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
    'S-86-09 in the hover preview, a source category with several sources expands to show each source',
    details({
      ac: ['WP23-86 AC 3', 'WP23-86 AC 1.5.1'],
      title: 'A source can be expanded into its individual sources',
      what: 'Hovers a stage whose source has several individual sources, checks they are hidden at first, expands that source in the hover preview, and checks exactly those individual sources appear with their counts from the database.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const target = firstExpandableSource({ stages, applications, asOf: window.endDate });
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

      await funnel.hoverStage(target!.stage);
      await expect(funnel.hoverPanel.heading).toHaveText(target!.stage);
      const expand = funnel.hoverPanel.expandControl(target!.row.source);
      await expectHoverExpandControl(funnel.hoverPanel, target!.row.source, target!.stage);
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      for (const sub of target!.row.subSources) {
        await expect(funnel.hoverPanel.sourceItem(sub.source), `${sub.source} before`).toBeHidden();
      }

      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      for (const sub of target!.row.subSources) {
        await expect(funnel.hoverPanel.sourceItem(sub.source), sub.source).toBeVisible();
        await expect(
          funnel.hoverPanel.sourceCount(sub.source, sub.candidates),
          `${sub.source}: ${sub.candidates}`,
        ).toBeVisible();
      }
      // Exactly these individual sources, in order: none missing, none extra.
      const listed = (await funnel.hoverPanel.read()).sources
        .map((item) => item.source)
        .filter((name) => !CATEGORY_LABELS.includes(name));
      expect(listed).toEqual(target!.row.subSources.map((sub) => sub.source));
    },
  );

  test(
    'S-86-10 in the hover preview, an expanded source collapses again when its control is clicked again',
    details({
      ac: ['WP23-86 AC 3.1'],
      title: 'An expanded source can be collapsed again',
      what: 'Hovers a stage, expands a source into its individual sources in the hover preview, clicks the control again, and checks the individual sources are hidden.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const target = firstExpandableSource({ stages, applications, asOf: window.endDate });
      test.skip(
        !target,
        'No source has two or more individual sources at any stage in the last 12 months.',
      );

      await funnel.hoverStage(target!.stage);
      await expect(funnel.hoverPanel.heading).toHaveText(target!.stage);
      const expand = funnel.hoverPanel.expandControl(target!.row.source);
      await expectHoverExpandControl(funnel.hoverPanel, target!.row.source, target!.stage);
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      for (const sub of target!.row.subSources) {
        await expect(
          funnel.hoverPanel.sourceItem(sub.source),
          `${sub.source} expanded`,
        ).toBeVisible();
      }
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      for (const sub of target!.row.subSources) {
        await expect(funnel.hoverPanel.sourceItem(sub.source), sub.source).toBeHidden();
      }
    },
  );

  test(
    'S-86-13 the pinned full detail lists every individual source, with no expand or collapse control',
    details({
      ac: ['WP23-295 AC 3'],
      title: 'The full detail always lists every individual source',
      what: 'Pins a stage whose source has several individual sources and checks its full detail lists every individual source under each category, with the database’s counts and shares, and offers no expand or collapse control (by design: only the hover preview expands, WP23-591).',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const target = firstExpandableSource({ stages, applications, asOf: window.endDate });
      test.skip(
        !target,
        'No source has two or more individual sources at any stage in the last 12 months.',
      );

      await funnel.pinStage(target!.stage);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${target!.stage}`);
      expect(subSourceRows(await funnel.detail.readSourcePerformance(CATEGORY_LABELS))).toEqual(
        subSourceRows(
          expectedSourcePerformance({
            stages,
            index: target!.index,
            applications,
            asOf: window.endDate,
          }),
        ),
      );
      await expect(funnel.detail.sourceTableExpandControls).toHaveCount(0);
    },
  );

  test(
    'S-86-12 a stage with no candidates says "Nobody reached this stage in these dates." on hover and when pinned',
    details({
      ac: ['WP23-86 AC 6'],
      title: 'A stage nobody reached says so instead of showing figures',
      what: 'Finds a date preset where a recruitment stage has nobody, hovers and then clicks that stage, and checks its name, category and “Nobody reached this stage in these dates.” are shown (wording accepted by the QA lead on 12 Nov in place of the AC’s “No data for this period”), and that the pinned summary shows the zero figures from the database.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      let found: {
        preset: (typeof GLOBAL_PRESETS)[number];
        index: number;
        stages: Awaited<ReturnType<typeof loadExpectedFunnel>>['stages'];
      } | null = null;
      for (const preset of GLOBAL_PRESETS) {
        const { stages } = await loadExpectedFunnel(
          recruitmentFunnelRepository,
          resolveGlobalPreset(preset),
        );
        const index = stages.findIndex((s) => s.state === 'available' && s.total === 0);
        if (index >= 0 && stages.some((s) => s.state === 'available' && s.total > 0)) {
          found = { preset, index, stages };
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

      // AC 6's "No data for this period" was replaced by this wording (QA lead, 2026-11-12).
      // The pinned summary shows the zero figures as they are (accepted with the wording):
      // 0 candidates, and arrived / lost from the previous stage per the database.
      expect(await funnel.detail.readSummary(), 'pinned summary figures').toEqual(
        expectedStageSummary(found!.stages, found!.index),
      );
      expect([hover.note, pinnedNote], 'hover note, then pinned note').toEqual([
        FUNNEL_COPY.zeroDetail,
        FUNNEL_COPY.zeroDetail,
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
