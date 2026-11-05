import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import {
  ALL_SOURCES_LABEL,
  PIPELINE_BY_SOURCE_COLUMNS,
  PIPELINE_WIDGET_KEYS,
} from '../../../src/constants/wisersite/candidate-pipeline.constants';
import { KNOWN_DEFECTS } from '../../../src/constants/wisersite/known-defects.constants';
import {
  GLOBAL_PRESETS,
  WIDGET_TIMEOUT_MS,
} from '../../../src/constants/wisersite/source-to-hire.constants';
import {
  columnsWithoutVariation,
  expectedFilteredReading,
  pipelineBySourceReading,
  pipelineSourceFilterOptions,
  presetWithMostSources,
  rowsShownStatus,
  sortPipelineSources,
  topPipelineSources,
} from '../../../src/expectations/wisersite/pipeline-by-source.expectations';
import { pastMonthWhereRejectionCapMatters } from '../../../src/expectations/wisersite/rejection-reasons.expectations';
import { CandidatePipelinePage } from '../../../src/pages/wisersite/candidate-pipeline.page';
import {
  details,
  markKnownDefect,
  markLimitedByData,
} from '../../../src/utils/playwright/test-annotations';
import { localTodayIso, resolveGlobalPreset } from '../../../src/utils/wisersite/date-window';

/**
 * WP23-198 — Candidate Pipeline > Pipeline by Source.
 *
 * AC 1 on the Pipeline page; AC 2.1 for the global date filter's dates, per source (top 6) and
 * in total: applications (2.1.1), screened (2.1.2), stage 1 interview (2.1.3), stage 2
 * interview (2.1.4), offered (2.1.5), confirmed (2.1.6), rejected (2.1.7) and conversion
 * confirmed / applied (2.1.8); AC 2.2 sortable by any column, default applications high to low;
 * AC 2.3 filterable to one source.
 *
 * Test plan S-198-*; D-7 (confirmed = hired), D-8 (one interview stage), D-10 (Total = rows
 * shown). D-9 (unknown-stage applications left out of Applied) was fixed as WP23-502.
 */

test.describe('WP23-198 Pipeline by Source', () => {
  test(
    'S-198-00: the Pipeline page reached from the sidebar shows the Pipeline by Source table',
    details({
      ac: ['WP23-198 AC 1'],
      title: 'The table is on the Pipeline page',
      what: 'Opens Analytics → Pipeline from the menu and finds the Pipeline by Source table.',
    }),
    async ({ adminPage, candidatePipelineRepository, widgetRequests }) => {
      const board = new CandidatePipelinePage(adminPage);
      await board.openFromSidebar();
      // oracle-ok: the board's own default window only picks which branch to check here.
      const { startDate, endDate } = await widgetRequests.waitForLast(
        PIPELINE_WIDGET_KEYS.pipelineBySource,
      );
      const range = { startDate: startDate!, endDate: endDate! };
      const rows = await candidatePipelineRepository.getPipelineBySource(
        range.startDate,
        range.endDate,
      );
      if (topPipelineSources(rows).length === 0) {
        markLimitedByData(
          'No applications in the default date range: the table is left off the page.',
        );
        await expect
          .poll(() => widgetRequests.last(PIPELINE_WIDGET_KEYS.pipelineBySource))
          .toEqual(range);
        await board.waitForCharts();
        await expect(board.pipelineBySource.heading).toHaveCount(0);
        return;
      }
      await expect(board.pipelineBySource.table).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
    },
  );

  for (const preset of GLOBAL_PRESETS) {
    test(
      `S-198-01: "${preset}": every source's counts, conversion rate and the total match the warehouse, applications high to low`,
      details({
        ac: [
          'WP23-198 AC 2.1',
          'WP23-198 AC 2.1.1',
          'WP23-198 AC 2.1.2',
          'WP23-198 AC 2.1.3',
          'WP23-198 AC 2.1.5',
          'WP23-198 AC 2.1.6',
          'WP23-198 AC 2.1.7',
          'WP23-198 AC 2.1.8',
          'WP23-198 AC 2.2',
        ],
        title: 'The table shows the right figures for the top 6 sources and the total',
        what: 'For each date range at the top of the page, compares every figure in the table and its total row with the database, sorted by applications.',
        variant: preset,
      }),
      async ({ candidatePipelinePage, candidatePipelineRepository, widgetRequests }) => {
        const { pipelineBySource } = candidatePipelinePage;
        await candidatePipelinePage.waitForCharts();
        await candidatePipelinePage.selectGlobalDatePreset(preset);
        // The preset's dates on the user's calendar, not the date button's text (WP23-419 D-3).
        const range = resolveGlobalPreset(preset);
        const rows = await candidatePipelineRepository.getPipelineBySource(
          range.startDate,
          range.endDate,
        );
        const top = topPipelineSources(rows);
        const expected = pipelineBySourceReading(top);
        console.log('Pipeline by Source %s %o — SQL-derived: %o', preset, range, expected);
        await expect
          .poll(() => widgetRequests.last(PIPELINE_WIDGET_KEYS.pipelineBySource))
          .toEqual(range);

        if (top.length > 0 && top.every((row) => row.confirmed === 0)) {
          markLimitedByData(
            'No source has a hire in this period: Confirmed and Conv. rate could only be checked at 0 and 0.0%.',
          );
        }
        if (top.length === 0) {
          markLimitedByData(
            'No applications in this period: only "the table is left off" was checked.',
          );
          await expect(pipelineBySource.heading).toHaveCount(0, { timeout: WIDGET_TIMEOUT_MS });
          return;
        }
        await expect
          .poll(() => pipelineBySource.readReading(), { timeout: WIDGET_TIMEOUT_MS })
          .toEqual(expected);
        // AC 2.2 default: Applied high to low, no other column sorted.
        const sortState = await pipelineBySource.readSortState();
        expect(sortState).toEqual(
          Object.fromEntries(
            PIPELINE_BY_SOURCE_COLUMNS.map((column) => [
              column,
              column === 'Applied' ? 'descending' : 'none',
            ]),
          ),
        );
      },
    );
  }

  test(
    'S-198-06: for each preset, the date button shows the same dates the table is fetched for',
    details({
      ac: ['WP23-198 AC 2.1'],
      title: 'The dates shown at the top of the page are the dates the table uses',
      what: 'Picks each date range and checks the dates printed on the date button match the period the table shows figures for.',
    }),
    async ({ candidatePipelinePage, widgetRequests }) => {
      await candidatePipelinePage.waitForCharts();
      for (const preset of GLOBAL_PRESETS) {
        await test.step(preset, async () => {
          await candidatePipelinePage.selectGlobalDatePreset(preset);
          const expected = resolveGlobalPreset(preset);
          await expect
            .poll(() => widgetRequests.last(PIPELINE_WIDGET_KEYS.pipelineBySource))
            .toEqual(expected);
          const shown = await candidatePipelinePage.dateRange.getActiveRange();
          console.log('%s: button shows %o, table fetched %o', preset, shown, expected);
          if (JSON.stringify(shown) !== JSON.stringify(expected)) {
            // The table's window is right (checked above); only the button's text is off.
            markKnownDefect(KNOWN_DEFECTS.dateButtonServerDate);
          }
          expect(shown, 'dates printed on the date button').toEqual(expected);
        });
      }
    },
  );

  test(
    'S-198-03: every column sorts high to low on the first click and low to high on the second',
    details({
      ac: ['WP23-198 AC 2.2'],
      title: 'The table can be sorted by any column',
      what: 'Clicks each column title twice and checks the order of the sources each time, with the total kept at the bottom.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository }) => {
      const { pipelineBySource } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      // The preset whose table shows the most sources (null when no preset has any).
      const pick = await presetWithMostSources(candidatePipelineRepository);
      test.skip(
        !pick || pick.top.length < 2,
        'No date preset has two or more sources: nothing to sort.',
      );
      await candidatePipelinePage.selectGlobalDatePreset(pick!.preset);
      const { window: range, top } = pick!;
      console.log('Sorting on %s %o: %d sources', pick!.preset, range, top.length);
      const flatColumns = columnsWithoutVariation(top);
      if (flatColumns.length > 0) {
        markLimitedByData(
          `Every source has the same value in ${flatColumns.join(', ')}, so sorting those columns can't change the order.`,
        );
      }
      await expect
        .poll(() => pipelineBySource.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(pipelineBySourceReading(top));

      for (const column of PIPELINE_BY_SOURCE_COLUMNS) {
        for (const direction of ['desc', 'asc'] as const) {
          await test.step(`${column} ${direction}`, async () => {
            await pipelineBySource.sortBy(column);
            await expect(pipelineBySource.columnHeader(column)).toHaveAttribute(
              'aria-sort',
              direction === 'desc' ? 'descending' : 'ascending',
            );
            await expect
              .poll(() => pipelineBySource.readReading())
              .toEqual(pipelineBySourceReading(sortPipelineSources(top, column, direction)));
          });
        }
      }
    },
  );

  test(
    'S-198-04: filtering by each source shows just that source, with a total equal to it',
    details({
      ac: ['WP23-198 AC 2.3'],
      title: 'The table can be filtered to one source',
      what: 'Picks each source in the filter, checks only its row (and a matching total) is shown, then goes back to all sources.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository }) => {
      const { pipelineBySource } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      // The preset whose table shows the most sources (null when no preset has any).
      const pick = await presetWithMostSources(candidatePipelineRepository);
      test.skip(!pick, 'No date preset has any source in Pipeline by Source: nothing to filter.');
      await candidatePipelinePage.selectGlobalDatePreset(pick!.preset);
      const { window: range, top } = pick!;
      console.log('Filtering on %s %o: %d sources', pick!.preset, range, top.length);
      await expect
        .poll(() => pipelineBySource.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(pipelineBySourceReading(top));
      await expect(pipelineBySource.sourceFilter.locator('option')).toHaveText([
        ALL_SOURCES_LABEL,
        ...pipelineSourceFilterOptions(top),
      ]);

      for (const { source } of top) {
        await test.step(`filter "${source}"`, async () => {
          await pipelineBySource.filterBySource(source);
          await expect
            .poll(() => pipelineBySource.readReading())
            .toEqual(expectedFilteredReading(top, source, ALL_SOURCES_LABEL));
          await expect(pipelineBySource.rowCountStatus).toHaveText(rowsShownStatus(1));
        });
      }
      await pipelineBySource.filterBySource(ALL_SOURCES_LABEL);
      await expect.poll(() => pipelineBySource.readReading()).toEqual(pipelineBySourceReading(top));
      await expect(pipelineBySource.rowCountStatus).toHaveText(rowsShownStatus(top.length));
    },
  );

  test(
    'S-198-05: after the dates change, the source filter and the rows shown still agree',
    details({
      ac: ['WP23-198 AC 2.3'],
      title: 'The source filter stays consistent when the dates change',
      what: 'Filters to a source, switches to dates in which that source has no applications, and checks the filter and the table agree.',
    }),
    async ({ candidatePipelinePage, candidatePipelineRepository, widgetRequests }) => {
      const { pipelineBySource } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      const tops = await Promise.all(
        GLOBAL_PRESETS.map(async (preset) => {
          const window = resolveGlobalPreset(preset);
          const top = topPipelineSources(
            await candidatePipelineRepository.getPipelineBySource(window.startDate, window.endDate),
          );
          return { preset, sources: top.map((row) => row.source) };
        }),
      );
      // A source shown in preset `from` but not in preset `to`, where `to` still has rows.
      const pair = tops
        .flatMap((from) =>
          tops.map((to) => ({
            from: from.preset,
            to: to.preset,
            source: from.sources.find((source) => !to.sources.includes(source)),
            toHasRows: to.sources.length > 0,
          })),
        )
        .find((candidate) => candidate.source && candidate.toHasRows);
      test.skip(
        !pair,
        'No source appears in one date preset and not another: nothing to switch away from.',
      );
      console.log('Stale-filter check: %o', pair);

      await candidatePipelinePage.selectGlobalDatePreset(pair!.from);
      await expect(pipelineBySource.table).toBeVisible({ timeout: WIDGET_TIMEOUT_MS });
      await pipelineBySource.filterBySource(pair!.source!);
      await expect(pipelineBySource.rowCountStatus).toHaveText(rowsShownStatus(1));

      const beforeSwitch = widgetRequests.mark();
      await candidatePipelinePage.selectGlobalDatePreset(pair!.to);
      const range = resolveGlobalPreset(pair!.to);
      await expect
        .poll(() => widgetRequests.last(PIPELINE_WIDGET_KEYS.pipelineBySource))
        .toEqual(range);
      await widgetRequests.waitForQuiet(beforeSwitch);
      const top = topPipelineSources(
        await candidatePipelineRepository.getPipelineBySource(range.startDate, range.endDate),
      );
      const selected = await pipelineBySource.readSelectedFilter();
      console.log('After switching to %s the filter shows "%s"', pair!.to, selected);
      await expect
        .poll(() => pipelineBySource.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expectedFilteredReading(top, selected, ALL_SOURCES_LABEL));
    },
  );

  test(
    'S-198-07: a past date range counts every application as it stood at the end of the range',
    details({
      ac: [
        'WP23-198 AC 2.1.1',
        'WP23-198 AC 2.1.2',
        'WP23-198 AC 2.1.3',
        'WP23-198 AC 2.1.5',
        'WP23-198 AC 2.1.6',
        'WP23-198 AC 2.1.7',
        'WP23-198 AC 2.1.8',
      ],
      title: 'A past period counts each applicant as they stood at the end of it',
      what: 'Picks a past month where some of its applicants were only rejected after the month ended, and checks every column leaves out what happened after the month (WP23-328, WP23-521).',
    }),
    async ({ candidatePipelinePage, widgetRequests, candidatePipelineRepository }) => {
      const { pipelineBySource } = candidatePipelinePage;
      await candidatePipelinePage.waitForCharts();
      const window = pastMonthWhereRejectionCapMatters(
        await candidatePipelineRepository.getMonthlyRejectionCap(localTodayIso()),
      );
      test.skip(
        window === null,
        'No past month has applicants rejected after the month ended, so "rejected by the end of the period" changes nothing on this data.',
      );
      const expected = pipelineBySourceReading(
        topPipelineSources(
          await candidatePipelineRepository.getPipelineBySource(window!.startDate, window!.endDate),
        ),
      );
      console.log('Pipeline by Source past window %o — SQL-derived: %o', window, expected);

      await candidatePipelinePage.setCustomGlobalDateRange(window!.startDate, window!.endDate);
      await widgetRequests.waitForWindow(PIPELINE_WIDGET_KEYS.pipelineBySource, window!);
      await expect
        .poll(() => pipelineBySource.readReading(), { timeout: WIDGET_TIMEOUT_MS })
        .toEqual(expected);
    },
  );
});
