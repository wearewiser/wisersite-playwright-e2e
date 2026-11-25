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
  expectedStagePanels,
  firstExpandableSource,
  flowMismatches,
  subSourceRows,
  type FlowMismatch,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import { details, markKnownDefect } from '../../../src/utils/playwright/test-annotations';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';
import { loadExpectedFunnel } from '../../../src/utils/wisersite/funnel-oracle';

/**
 * WP23-86 — Recruitment funnel widget: stage summary and pin (test plan
 * docs/test-plans/WP23-61.md, S-86-*), as redesigned by WP23-591 (R.Funnel CR design):
 * hovering a stage only magnifies it and opens nothing; clicking pins the stage and opens its
 * short summary under the chart; the summary's "Full stage detail" button opens the full
 * detail, whose Close (or Escape) returns to the summary with the pin kept; clicking the pinned
 * stage again (or Escape from the summary) unpins it.
 *
 * AC 1: the summary shows the stage's category, name, candidates, % arrived from the previous
 * stage ("–" for Reach), source breakdown (count and share) and stage flow (whole numbers).
 * AC 2: pin, move the pin, full detail and back. AC 3: in the summary, a source expands into
 * its individual sources and collapses again; the full detail always lists every individual
 * source with no control (S-86-13). AC 4.1: touch devices tap. AC 6: a stage with no candidates
 * says "Nobody reached this stage in these dates." (accepted by the QA lead, 2026-11-12). AC 5
 * (timing) and AC 7 (permissions) aren't tested (plan D-11).
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;
const CATEGORY_LABELS: readonly string[] = CHARTED_SOURCES.map((s) => s.label);

test.describe('WP23-86 stage summary and pin', () => {
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
    'S-86-01 clicking each stage opens a summary with its category and name',
    details({
      ac: ['WP23-86 AC 1.1', 'WP23-86 AC 1.2'],
      title: 'Clicking a stage shows its category and name',
      what: 'Clicks each of the eight stages and checks the summary under the chart names the stage and its category (Awareness, Consideration, Evaluation or Decision).',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      const readings: { category: string; stage: string }[] = [];
      for (const stage of FUNNEL_STAGES) {
        await funnel.pinStage(stage.label);
        await expect(funnel.summary.heading).toHaveText(stage.label);
        const { category, stage: name } = await funnel.summary.read();
        readings.push({ category, stage: name });
      }
      expect(readings).toEqual(
        FUNNEL_STAGES.map((s) => ({ category: s.category, stage: s.label })),
      );
    },
  );

  test(
    "S-86-02 each stage's summary shows its candidates and each source's count and share",
    details({
      ac: ['WP23-86 AC 1', 'WP23-86 AC 1.3', 'WP23-86 AC 1.5'],
      title: 'A stage’s summary shows its candidates and the split by source',
      what: 'On the last 12 months, clicks each stage and compares the number of candidates and each source’s count and share in its summary with the database.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages } = await loadExpectedFunnel(recruitmentFunnelRepository, window);
      const expected = expectedStagePanels(stages);

      const readings: unknown[] = [];
      for (const [index, stage] of FUNNEL_STAGES.entries()) {
        if (!expected[index]) continue;
        await funnel.pinStage(stage.label);
        await expect(funnel.summary.heading).toHaveText(stage.label);
        const { candidates, sources } = await funnel.summary.read();
        readings.push({ stage: stage.label, candidates, sources });
      }
      expect(readings).toEqual(expected.filter((e) => e !== null));
    },
  );

  test(
    'S-86-03 hovering a stage opens nothing',
    details({
      ac: ['WP23-86 AC 1'],
      title: 'Hovering a stage only highlights it',
      what: 'Hovers a stage, waits until a summary would have appeared, and checks nothing opens under the chart and the stage is not pinned (new design: hover only magnifies the stage).',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      // Checked once a hover-opened panel would have shown (the page clock steps past it).
      await funnel.takeOverClock();
      await funnel.hoverStageAndLetIntentElapse('Interviewed');
      await expect(funnel.summary.root).toHaveCount(0);
      await expect(funnel.detail.root).toHaveCount(0);
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'false');
    },
  );

  test(
    'S-86-04 the summary\'s % arrived from the previous stage matches the database, "–" for Reach',
    details({
      ac: ['WP23-86 AC 1.4'],
      title: 'A stage’s summary shows the % arrived from the previous stage',
      what: 'On the last 12 months, clicks each stage and checks the % of the previous stage that arrived here against the database (within half a point, as the summary rounds it): none for Reach. It can be over 100% (PO, WP23-357).',
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
        await funnel.pinStage(stage.label);
        await expect(funnel.summary.heading).toHaveText(stage.label);
        const { arrival } = await funnel.summary.read();
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
    "S-86-05 the summary's stage flow shows lost candidates, % drop and cumulative drop as whole numbers",
    details({
      ac: ['WP23-86 AC 1.6'],
      title: 'A stage’s summary shows how many were lost since the previous stage',
      what: 'On the last 12 months, clicks each stage and compares the number lost from the previous stage, the % drop and the cumulative drop since Reach with the database, as whole numbers.',
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
        await funnel.pinStage(stage.label);
        await expect(funnel.summary.heading).toHaveText(stage.label);
        readings.push({ stage: stage.label, ...(await funnel.summary.read()).flow });
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
    'S-86-06 clicking a stage pins it and opens its summary until it, or another stage, is clicked',
    details({
      ac: ['WP23-86 AC 2', 'WP23-86 AC 2.1', 'WP23-86 AC 2.2'],
      title: 'Clicking a stage pins it and opens its summary',
      what: 'Clicks a stage and checks it is marked as pinned with its summary (not the full detail) open, that hovering another stage keeps it, that clicking another stage moves the pin and the summary there, and that clicking the pinned stage again unpins it and leaves nothing under the chart.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.takeOverClock();
      await funnel.pinStage('Interviewed');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.pinnedMarker).toBeVisible();
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Interviewed');
      await expect(funnel.detail.root).toHaveCount(0);

      // Hovering another stage must not replace the pin: checked once a hover would have acted.
      await funnel.hoverStageAndLetIntentElapse('Reach');
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Interviewed');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'true');

      await funnel.pinStage('Offer Extended');
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Offer Extended');
      await expect(funnel.summary.root).toHaveCount(1);
      await expect(funnel.stageButton('Offer Extended')).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.stageButton('Interviewed')).toHaveAttribute('aria-pressed', 'false');

      await funnel.pinStage('Offer Extended');
      await expect(funnel.stageButton('Offer Extended')).toHaveAttribute('aria-pressed', 'false');
      await expect(funnel.summary.root).toHaveCount(0);
      await expect(funnel.detail.root).toHaveCount(0);
    },
  );

  test(
    "S-86-07 the summary's Full stage detail button opens the full detail, and Close goes back to the summary",
    details({
      ac: ['WP23-86 AC 2.2.1', 'WP23-295 AC 1'],
      title: 'The full detail opens from the summary and closes back to it',
      what: 'Clicks a stage, clicks “Full stage detail” in its summary and checks the full detail replaces the summary; then clicks Close and checks the stage’s summary is back and the stage is still pinned.',
      variant: 'Mouse',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.openFullDetail('Passed Screening');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Passed Screening');
      await expect(funnel.summary.root).toHaveCount(0);

      await funnel.detail.closeButton.click();
      await expect(funnel.detail.root).toHaveCount(0);
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Passed Screening');
      await expect(funnel.stageButton('Passed Screening')).toHaveAttribute('aria-pressed', 'true');
    },
  );

  test(
    'S-86-08 from the keyboard, Escape steps back from the full detail to the summary, then unpins',
    details({
      ac: ['WP23-86 AC 2.2.1'],
      title: 'The full detail opens from the summary and closes back to it',
      what: 'Pins a stage with Enter, opens its full detail from the summary with the keyboard, presses Escape and checks the summary is back with the stage pinned, then presses Escape again and checks the stage is unpinned with focus back on it.',
      variant: 'Keyboard',
    }),
    async ({ recruitmentFunnelPage, page }) => {
      const { funnel } = recruitmentFunnelPage;
      const stage = funnel.stageButton('Passed Screening');
      await stage.focus();
      await page.keyboard.press('Enter');
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Passed Screening');
      await expect(funnel.summary.root).toBeFocused();

      await funnel.summary.fullDetailButton.focus();
      await page.keyboard.press('Enter');
      await expect(funnel.detail.root).toHaveAccessibleName('Full stage detail: Passed Screening');
      await funnel.detail.closeButton.focus();
      await page.keyboard.press('Escape');
      await expect(funnel.detail.root).toHaveCount(0);
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Passed Screening');
      await expect(funnel.summary.root).toBeFocused();
      await expect(stage).toHaveAttribute('aria-pressed', 'true');

      await page.keyboard.press('Escape');
      await expect(funnel.summary.root).toHaveCount(0);
      await expect(stage).toHaveAttribute('aria-pressed', 'false');
      await expect(stage).toBeFocused();
    },
  );

  test(
    'S-86-09 in the summary, a source with several individual sources expands to show each one',
    details({
      ac: ['WP23-86 AC 3', 'WP23-86 AC 1.5.1'],
      title: 'A source can be expanded into its individual sources',
      what: 'Clicks a stage whose source has several individual sources, checks they are hidden at first, expands that source in the summary, and checks exactly those individual sources appear with their counts from the database.',
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
      const { stage, row } = target!;
      console.log('Expanding %s under %s: %o', row.source, stage, row.subSources);

      await funnel.pinStage(stage);
      await expect(funnel.summary.heading).toHaveText(stage);
      const expand = funnel.summary.expandControl(row.source);
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      for (const sub of row.subSources) {
        await expect(funnel.summary.sourceItem(sub.source), `${sub.source} before`).toBeHidden();
      }

      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      for (const sub of row.subSources) {
        await expect(
          funnel.summary.sourceCount(sub.source, sub.candidates),
          `${sub.source}: ${sub.candidates}`,
        ).toBeVisible();
      }
      // Exactly these individual sources, in order, with their counts: none missing or extra.
      // Shares aren't compared: the summary shares a sub-source of the whole stage, the full
      // detail of the listed sources (WP23-520 Q4, asserted in S-295-05).
      const listed = (await funnel.summary.read()).subSources.map(({ source, count }) => ({
        source,
        count,
      }));
      expect(listed).toEqual(
        row.subSources.map((sub) => ({ source: sub.source, count: sub.candidates })),
      );
    },
  );

  test(
    'S-86-10 in the summary, an expanded source collapses again when it is clicked again',
    details({
      ac: ['WP23-86 AC 3.1'],
      title: 'An expanded source can be collapsed again',
      what: 'Clicks a stage, expands a source into its individual sources in the summary, clicks the source again, and checks the individual sources are hidden.',
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
      const { stage, row } = target!;

      await funnel.pinStage(stage);
      await expect(funnel.summary.heading).toHaveText(stage);
      const expand = funnel.summary.expandControl(row.source);
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'true');
      for (const sub of row.subSources) {
        await expect(funnel.summary.sourceItem(sub.source), `${sub.source} expanded`).toBeVisible();
      }
      await expand.click();
      await expect(expand).toHaveAttribute('aria-expanded', 'false');
      for (const sub of row.subSources) {
        await expect(funnel.summary.sourceItem(sub.source), sub.source).toBeHidden();
      }
    },
  );

  test(
    'S-86-13 the full detail lists every individual source, with no expand or collapse control',
    details({
      ac: ['WP23-295 AC 3'],
      title: 'The full detail always lists every individual source',
      what: 'Opens the full detail of a stage whose source has several individual sources and checks it lists every individual source under each category, with the database’s counts and shares, and offers no expand or collapse control (by design: only the summary expands).',
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

      await funnel.openFullDetail(target!.stage);
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
    'S-86-12 a stage with no candidates says "Nobody reached this stage in these dates." in its summary',
    details({
      ac: ['WP23-86 AC 6'],
      title: 'A stage nobody reached says so instead of showing figures',
      what: 'Finds a date preset where a recruitment stage has nobody, clicks that stage, and checks its summary shows its name, category and “Nobody reached this stage in these dates.” (wording accepted by the QA lead on 12 Nov in place of the AC’s “No data for this period”) with no figures and no full-detail button.',
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

      await funnel.pinStage(stage.label);
      await expect(funnel.summary.heading).toHaveText(stage.label);
      const summary = await funnel.summary.read();
      // AC 6's "No data for this period" was replaced by this wording (QA lead, 2026-11-12).
      expect({
        category: summary.category,
        candidates: summary.candidates,
        note: summary.note,
        sources: summary.sources,
      }).toEqual({
        category: stage.category,
        candidates: null,
        note: FUNNEL_COPY.zeroDetail,
        sources: [],
      });
      await expect(funnel.summary.fullDetailButton).toHaveCount(0);
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
    'S-86-11 on a touch device, tapping a stage pins it and opens its summary',
    details({
      ac: ['WP23-86 AC 4', 'WP23-86 AC 4.1', 'WP23-295 AC 7.3'],
      title: 'On a tablet, tapping a stage opens its summary',
      what: 'On an iPad, checks that moving over a stage opens nothing, and that tapping the stage pins it and opens its summary.',
    }),
    async ({ recruitmentFunnelPage }) => {
      const { funnel } = recruitmentFunnelPage;
      await funnel.takeOverClock();
      await funnel.hoverStageAndLetIntentElapse('Passed Screening');
      await expect(funnel.summary.root).toHaveCount(0);
      await funnel.stageButton('Passed Screening').tap();
      await expect(funnel.summary.root).toHaveAccessibleName('Stage summary: Passed Screening');
      await expect(funnel.stageButton('Passed Screening')).toHaveAttribute('aria-pressed', 'true');
    },
  );
});
