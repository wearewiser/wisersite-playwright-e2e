import { expect, test } from '../../../src/fixtures/wisersite.fixtures';
import { SourceToHirePage } from '../../../src/pages/wisersite/source-to-hire.page';

test.describe('Source to Hire summary', () => {
  test('summary tiles match the tenant warehouse for the last 12 months', async ({
    adminPage,
    sourceToHireRepository,
  }) => {
    // Navigate through the admin sidebar rather than the `sourceToHirePage` fixture's direct goto.
    const sourceToHirePage = new SourceToHirePage(adminPage);
    await sourceToHirePage.openFromSidebar();

    // Wait for the real data to replace the "—" loading placeholders before reading anything.
    await expect(sourceToHirePage.applicationsValue).not.toHaveText('—', { timeout: 15_000 });

    await sourceToHirePage.selectLast12MonthsPreset();

    // Applying the new range re-triggers the fetch, so wait for the placeholders again.
    await expect(sourceToHirePage.applicationsValue).not.toHaveText('—', { timeout: 15_000 });

    const { startDate, endDate } = await sourceToHirePage.getActiveDateRange();
    const expected = await sourceToHireRepository.getSummary(startDate, endDate);

    const actual = {
      applications: await sourceToHirePage.applicationsValue.textContent(),
      screened: await sourceToHirePage.screenedValue.textContent(),
      hires: await sourceToHirePage.hiresValue.textContent(),
      avgHirePeriod: await sourceToHirePage.avgHirePeriodValue.textContent(),
    };
    console.log('Source to Hire summary — UI vs SQL (%s to %s)', startDate, endDate);
    console.log('  UI (seen):', actual);
    console.log('  SQL (expected):', expected);

    await expect(sourceToHirePage.applicationsValue).toHaveText(
      expected.applications.toLocaleString('en-GB'),
    );
    await expect(sourceToHirePage.screenedValue).toHaveText(
      expected.screened.toLocaleString('en-GB'),
    );
    await expect(sourceToHirePage.hiresValue).toHaveText(expected.hires.toLocaleString('en-GB'));

    if (expected.avgHirePeriodDays == null) {
      await expect(sourceToHirePage.avgHirePeriodValue).toHaveText('—');
    } else {
      const rounded = Math.round(expected.avgHirePeriodDays);
      await expect(sourceToHirePage.avgHirePeriodValue).toHaveText(
        `${rounded} day${rounded === 1 ? '' : 's'}`,
      );
    }
  });
  
});
