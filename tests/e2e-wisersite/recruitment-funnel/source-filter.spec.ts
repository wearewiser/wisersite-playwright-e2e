import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  CHARTED_SOURCES,
  FUNNEL_COPY,
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import {
  categoryRows,
  expectedBandLabels,
  expectedFunnelTable,
  expectedSourcePerformance,
  expectedStageHovers,
  stageButtonValues,
} from '../../../src/expectations/wisersite/recruitment-funnel.expectations';
import {
  details,
  markKnownDefect,
  markLimitedByData,
} from '../../../src/utils/playwright/test-annotations';
import { resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';
import { loadExpectedFunnel } from '../../../src/utils/wisersite/funnel-oracle';

/**
 * WP23-307 — Recruitment funnel widget: filter by source category (test plan
 * docs/test-plans/WP23-61.md, S-307-*).
 *
 * AC 1: picking a source category narrows the graph to applicants from that category; the
 * numbers above the graph are recalculated for it, while the band % keeps the source's share of
 * the whole stage (triage on WP23-376: the top % changes, the band % doesn't). AC 2: hover / pinned
 * detail then shows that source and stage only, whichever was chosen first. AC 3: picking the same
 * category again clears the filter; picking another switches to it. One category at a time.
 */

const FUNNEL = FUNNEL_WIDGET_KEYS.funnel;
const ORGANIC = CHARTED_SOURCES.find((s) => s.group === 'organic')!;
const REFERRAL = CHARTED_SOURCES.find((s) => s.group === 'referral')!;
const CATEGORY_LABELS = CHARTED_SOURCES.map((s) => s.label);

test.describe('WP23-307 filter by source', () => {
  // Every test starts on the last 12 months with the unfiltered funnel showing the warehouse's figures.
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

  for (const source of CHARTED_SOURCES) {
    test(
      `S-307-01 "${source.label}": the funnel narrows to that source's applicants`,
      details({
        ac: ['WP23-307 AC 1', 'WP23-307 AC 1.1'],
        title: 'Filtering by a source shows only that source’s candidates',
        what: 'On the last 12 months, clicks the source in the key and compares every stage’s count for that source with the database.',
        variant: source.label,
      }),
      async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
        const { funnel } = recruitmentFunnelPage;
        const { stages } = await loadExpectedFunnel(
          recruitmentFunnelRepository,
          resolveGlobalPreset('Last 12 months'),
        );
        const expected = expectedFunnelTable(stages, source.group);
        if (stages.every((s) => s.counts[source.group] === 0)) {
          markLimitedByData(
            `No ${source.label} candidates at any stage: only the empty funnel was checked.`,
          );
        }
        await funnel.clickSource(source.label);
        await expect(funnel.chip(source.label)).toHaveAttribute('aria-pressed', 'true');
        await expect
          .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
          .toEqual(expected);
      },
    );
  }

  test(
    "S-307-02 filtering recalculates each stage's figure while the band % keeps the source's share of the whole stage",
    details({
      ac: ['WP23-307 AC 1.2'],
      title: 'Filtering recalculates the numbers above the graph but keeps the band percentages',
      what: 'Clicks Organic and checks each stage’s headline figure becomes Organic’s count while the percentage on each band stays Organic’s share of the whole (unfiltered) stage.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const { stages } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        resolveGlobalPreset('Last 12 months'),
      );
      await funnel.clickSource(ORGANIC.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages, ORGANIC.group));
      expect(await funnel.readStageValues()).toEqual(stageButtonValues(stages, ORGANIC.group));
      await expect
        .poll(() => funnel.readBandLabels(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedBandLabels(stages, ORGANIC.group));
    },
  );

  test(
    'S-307-03 with a filter on, hovering and pinning a stage show that source only',
    details({
      ac: ['WP23-307 AC 2', 'WP23-307 AC 2.1'],
      title: 'With a filter on, stage details show only that source',
      what: 'Clicks Organic, then hovers and clicks Passed Screening, and checks the summary and the full detail list Organic only, with its figures from the database.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const index = stages.findIndex((s) => s.key === 'passedScreening');
      const stage = stages[index]!;
      await funnel.clickSource(ORGANIC.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages, ORGANIC.group));

      const hover = expectedStageHovers(stages, ORGANIC.group)[index];
      test.skip(!hover, `No ${ORGANIC.label} candidates at ${stage.label} in the last 12 months.`);
      await funnel.hoverStage(stage.label);
      await expect(funnel.hoverPanel.heading).toHaveText(stage.label);
      const reading = await funnel.hoverPanel.read();
      expect({
        stage: reading.stage,
        candidates: reading.candidates,
        sources: reading.sources,
      }).toEqual(hover);

      await funnel.pinStage(stage.label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${stage.label}`);
      await expect
        .poll(() =>
          funnel.detail.readSourcePerformance(CATEGORY_LABELS.filter((l) => l === ORGANIC.label)),
        )
        .toEqual(
          expectedSourcePerformance({
            stages,
            index,
            applications,
            asOf: window.endDate,
            group: ORGANIC.group,
          }),
        );
    },
  );

  test(
    'S-307-04 with a stage pinned, picking a source keeps the detail open and narrows it to that source',
    details({
      ac: ['WP23-307 AC 2.2'],
      title: 'Filtering while a stage is pinned narrows its detail to that source',
      what: 'Clicks Passed Screening to pin it, then clicks Organic in the key, and checks the full detail stays open and lists Organic only.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const window = resolveGlobalPreset('Last 12 months');
      const { stages, applications } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        window,
      );
      const index = stages.findIndex((s) => s.key === 'passedScreening');
      const label = stages[index]!.label;
      await funnel.pinStage(label);
      await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${label}`);

      await funnel.clickSource(ORGANIC.label);
      await expect(funnel.chip(ORGANIC.label)).toHaveAttribute('aria-pressed', 'true');
      try {
        await expect(funnel.detail.root).toHaveAccessibleName(`Full stage detail: ${label}`);
      } catch (error) {
        if ((await funnel.detail.root.count()) === 0)
          markKnownDefect(KNOWN_DEFECTS.funnelChipUnpins);
        throw error;
      }
      await expect
        .poll(async () => categoryRows(await funnel.detail.readSourcePerformance([ORGANIC.label])))
        .toEqual(
          categoryRows(
            expectedSourcePerformance({
              stages,
              index,
              applications,
              asOf: window.endDate,
              group: ORGANIC.group,
            }),
          ),
        );
    },
  );

  test(
    'S-307-05 picking the active source again clears the filter',
    details({
      ac: ['WP23-307 AC 3', 'WP23-307 AC 3.1'],
      title: 'Clicking the same source again shows all sources',
      what: 'Clicks Organic, then clicks it again, and checks the full unfiltered funnel is back with no source selected.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const { stages } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        resolveGlobalPreset('Last 12 months'),
      );
      await funnel.clickSource(ORGANIC.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages, ORGANIC.group));

      await funnel.clickSource(ORGANIC.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages));
      for (const source of CHARTED_SOURCES) {
        await expect(funnel.chip(source.label)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(funnel.caption).toHaveText(FUNNEL_COPY.defaultCaption);
    },
  );

  test(
    'S-307-06 picking a different source switches the funnel to it',
    details({
      ac: ['WP23-307 AC 3.2'],
      title: 'Clicking another source switches the filter',
      what: 'Clicks Organic, then Referral, and checks the funnel and the figures above it now show Referral only.',
    }),
    async ({ recruitmentFunnelPage, recruitmentFunnelRepository }) => {
      const { funnel } = recruitmentFunnelPage;
      const { stages } = await loadExpectedFunnel(
        recruitmentFunnelRepository,
        resolveGlobalPreset('Last 12 months'),
      );
      await funnel.clickSource(ORGANIC.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages, ORGANIC.group));

      await funnel.clickSource(REFERRAL.label);
      await expect
        .poll(() => funnel.readTable(), { timeout: FUNNEL_WIDGET_TIMEOUT_MS })
        .toEqual(expectedFunnelTable(stages, REFERRAL.group));
      expect(await funnel.readStageValues()).toEqual(stageButtonValues(stages, REFERRAL.group));
      await expect(funnel.chip(REFERRAL.label)).toHaveAttribute('aria-pressed', 'true');
      await expect(funnel.chip(ORGANIC.label)).toHaveAttribute('aria-pressed', 'false');
    },
  );
});
