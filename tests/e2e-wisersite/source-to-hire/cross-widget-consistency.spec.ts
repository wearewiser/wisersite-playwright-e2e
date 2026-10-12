import { expect, test } from '../../../src/fixtures/wisersite.fixtures';

test.describe('WP23-156 / WP23-159 cross-widget consistency', () => {
  test('Applications-by-Source "Hire Rate" and Source-Performance "Conversion Rate" agree for the same source, and both agree with Postgres', async ({
    sourceToHirePage,
    sourceToHireRepository,
  }) => {
    const { applicationsBySource, sourcePerformance } = sourceToHirePage;
    await sourceToHirePage.summary.waitForLoaded();
    await sourceToHirePage.selectGlobalDatePreset('Last 12 months');
    await applicationsBySource.waitForRows();
    await sourcePerformance.waitForRows();

    const { startDate, endDate } = await sourceToHirePage.dateRange.getActiveRange();
    const expectedRateBySource = Object.fromEntries(
      (await sourceToHireRepository.getBySource(startDate, endDate)).map((row) => [
        row.sourceChannel,
        row.hireRateLabel,
      ]),
    );
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
  });
});
