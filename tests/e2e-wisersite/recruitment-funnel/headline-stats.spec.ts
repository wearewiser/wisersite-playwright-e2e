import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  FUNNEL_WIDGET_KEYS,
  FUNNEL_WIDGET_TIMEOUT_MS,
  HEADLINE_TILE_LABELS,
  WINDOW_SEARCH_DAYS,
} from '../../../src/constants/wisersite/recruitment-funnel.constants';
import { GLOBAL_PRESETS } from '../../../src/constants/wisersite/source-to-hire.constants';
import { expectedHeadlineTiles } from '../../../src/expectations/wisersite/funnel-headline.expectations';
import type { HeadlineTileLabel } from '../../../src/types/wisersite/recruitment-funnel.types';
import { details } from '../../../src/utils/playwright/test-annotations';
import {
  localTodayIso,
  nthDayDate,
  resolveGlobalPreset,
} from '../../../src/utils/wisersite/date-window';
import { partialTilesWindow } from '../../../src/utils/wisersite/funnel-windows';

/**
 * WP23-132 — Headline funnel stats widget (test plan docs/test-plans/WP23-61.md, S-132-*).
 *
 * AC 1.1: the board shows Overall Conversion (total hires ÷ applications × 100, per the ticket's
 * SQL; the AC text says "Brand Views", plan D-2), Biggest Drop-off stage transition (largest %
 * loss) and Best Conversion Source (highest % from source to hire). AC 1.2: a tile with no data
 * isn't shown.
 */

const TILE_AC: Record<HeadlineTileLabel, string[]> = {
  'Overall Conversion': ['WP23-132 AC 1', 'WP23-132 AC 1.1', 'WP23-132 AC 1.1.1'],
  'Biggest Drop-off': ['WP23-132 AC 1.1.2'],
  'Best Conversion Source': ['WP23-132 AC 1.1.3'],
};
const TILE_KEY: Record<HeadlineTileLabel, string> = {
  'Overall Conversion': FUNNEL_WIDGET_KEYS.overallConversion,
  'Biggest Drop-off': FUNNEL_WIDGET_KEYS.biggestDropOff,
  'Best Conversion Source': FUNNEL_WIDGET_KEYS.bestConversionSource,
};
const TILE_ID: Record<HeadlineTileLabel, string> = {
  'Overall Conversion': 'S-132-01',
  'Biggest Drop-off': 'S-132-02',
  'Best Conversion Source': 'S-132-03',
};

test.describe('WP23-132 headline funnel stats', () => {
  for (const [tileIndex, label] of HEADLINE_TILE_LABELS.entries()) {
    for (const preset of GLOBAL_PRESETS) {
      test(
        `${TILE_ID[label]} "${preset}": ${label} matches the warehouse`,
        details({
          ac: TILE_AC[label],
          title: `${label} shows the right figure for each date preset`,
          what:
            label === 'Overall Conversion'
              ? 'Picks the date preset and compares the hires ÷ applications rate, and the hire and application counts under it, with the database.'
              : label === 'Biggest Drop-off'
                ? 'Picks the date preset and compares the stage step that loses the largest share of candidates, its % lost and the number lost, with the database.'
                : 'Picks the date preset and compares the source whose applications most often end in a hire, with its hires and rate, with the database.',
          variant: preset,
        }),
        async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
          const window = resolveGlobalPreset(preset);
          const mark = widgetRequests.mark();
          await recruitmentFunnelPage.selectGlobalDatePreset(preset);
          await widgetRequests.waitForWindow(TILE_KEY[label], window);
          await widgetRequests.waitForQuiet(mark);

          const expected = expectedHeadlineTiles(
            await recruitmentFunnelRepository.getApplications(window),
            window,
            await recruitmentFunnelRepository.getAtsStages(),
          )[tileIndex]!;
          console.log('%s %o: %o', label, window, expected);
          await expect
            .poll(() => recruitmentFunnelPage.headline.readTile(label), {
              timeout: FUNNEL_WIDGET_TIMEOUT_MS,
            })
            .toEqual(expected);
        },
      );
    }
  }

  test(
    'S-132-04 a tile with no data for the range is not shown while the others are',
    details({
      ac: ['WP23-132 AC 1.2'],
      title: 'A headline tile with nothing to show is hidden',
      what: 'Finds a recent week too small for some tiles (for example too few candidates for a drop-off) and checks those tiles are hidden while the others show their figures.',
    }),
    async ({ recruitmentFunnelPage, widgetRequests, recruitmentFunnelRepository }) => {
      const today = localTodayIso();
      const earliestEnd = nthDayDate(today, -WINDOW_SEARCH_DAYS);
      const applications = await recruitmentFunnelRepository.getApplications({
        startDate: nthDayDate(earliestEnd, -7),
        endDate: today,
      });
      const stages = await recruitmentFunnelRepository.getAtsStages();
      const window = partialTilesWindow({ applications, stages, latestEnd: today, earliestEnd });
      test.skip(
        !window,
        `No week in the last ${WINDOW_SEARCH_DAYS} days has data for some headline tiles but not others.`,
      );
      const expected = expectedHeadlineTiles(applications, window!, stages);
      console.log('Partial tiles %o: %o', window, expected);

      const mark = widgetRequests.mark();
      await recruitmentFunnelPage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      for (const key of Object.values(TILE_KEY)) await widgetRequests.waitForWindow(key, window!);
      await widgetRequests.waitForQuiet(mark);
      await expect
        .poll(() => recruitmentFunnelPage.headline.readTiles(HEADLINE_TILE_LABELS), {
          timeout: FUNNEL_WIDGET_TIMEOUT_MS,
        })
        .toEqual(expected);
      expect(expected.some((tile) => tile === null)).toBe(true);
    },
  );
});
