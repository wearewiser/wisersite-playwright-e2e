import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { hireRateLabel } from '../../../src/expectations/wisersite/source-breakdown.expectations';
import { details, markLimitedByData } from '../../../src/utils/playwright/test-annotations';

/**
 * WP23-156 AC 1.1.3 ("% hired" per source) and WP23-159 AC 2.4 ("conversion rate") describe the
 * same figure, hires / applications, so the two widgets must agree for every source.
 *
 * On data with 0 hires every rate is "0.0%", so this only proves the widgets agree on zero.
 */
test.describe('WP23-156 AC 1.1.3 / WP23-159 AC 2.4 cross-widget consistency', () => {
  test(
    'Applications-by-Source "Hire Rate" and Source-Performance "Conversion Rate" agree for the same source, and both agree with Postgres',
    details({
      ac: ['WP23-156 AC 1.1.3', 'WP23-159 AC 2.4'],
      title: 'Hire rate matches the conversion rate in the breakdown table',
      what: 'The same source shows the same percentage in both widgets, and it matches the database.',
    }),
    async ({ sourceToHirePage, sourceToHireRepository }) => {
      const { applicationsBySource, sourcePerformance } = sourceToHirePage;
      await sourceToHirePage.summary.waitForLoaded();
      await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
      await applicationsBySource.waitForRows();
      await sourcePerformance.waitForRows();

      const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
      const expectedRateBySource = Object.fromEntries(
        (await sourceToHireRepository.getBySource(startDate, endDate)).map((row) => [
          row.sourceChannel,
          hireRateLabel(row.hires, row.applications),
        ]),
      );
      if (Object.values(expectedRateBySource).every((rate) => rate === hireRateLabel(0, 1))) {
        markLimitedByData('No hires in the last 12 months: every rate was only checked at 0.0%.');
      }
      const applicationsBySourceRows = await applicationsBySource.readRows();
      const sourcePerformanceRows = await sourcePerformance.readRows();

      console.log('Cross-widget rate consistency (%s to %s)', startDate, endDate);
      console.log(
        '  Applications by Source (Hire Rate):',
        Object.fromEntries(applicationsBySourceRows.map((row) => [row.source, row.rateLabel])),
      );
      console.log(
        '  Source Performance Breakdown (Conversion Rate):',
        Object.fromEntries(sourcePerformanceRows.map((row) => [row.source, row.rateLabel])),
      );
      console.log('  SQL (expected, hires / applications * 100):', expectedRateBySource);

      for (const row of applicationsBySourceRows) {
        const performanceRow = sourcePerformanceRows.find((r) => r.source === row.source);
        expect(
          performanceRow,
          `no Source Performance Breakdown row for "${row.source}"`,
        ).toBeDefined();
        expect(row.rateLabel).toBe(performanceRow!.rateLabel);
        expect(row.rateLabel).toBe(expectedRateBySource[row.source]);
      }
    },
  );
});
