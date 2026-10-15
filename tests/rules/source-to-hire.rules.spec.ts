import { expect, test } from '@playwright/test';
import { hireRateLabel } from '../../src/expectations/wisersite/source-breakdown.expectations';
import {
  expectedSummaryTiles,
  isComparisonAvailable,
  trendStateFor,
  type TrendState,
} from '../../src/expectations/wisersite/summary-tiles.expectations';
import { details } from '../../src/utils/playwright/test-annotations';

/**
 * The ticket rules the Source to Hire oracles encode, checked at their boundaries without a
 * browser or a database (`npm run test:rules`). Today's data (0 hires, few windows with a
 * comparison) can't reach most of these cases in the UI; this proves the expected values the UI
 * tests will compute once it can. The dates below are synthetic inputs to pure functions, not
 * tenant data, so they never drift.
 */

test.describe('WP23-87 AC 3 colour bands', () => {
  // Higher is better (Total Applications / Screened / Hires): < 0% red, 0–10% neutral, > 10% green.
  const higherIsBetter: [number | null, TrendState][] = [
    [-0.1, 'negative'],
    [0, 'neutral'],
    [10, 'neutral'],
    [10.1, 'positive'],
    [null, 'neutral'],
  ];
  for (const [pct, state] of higherIsBetter) {
    test(
      `higher is better: ${pct}% is ${state}`,
      details({
        ac: ['WP23-87 AC 3.1'],
        title: 'Colour rule for applications, screened and hires, at its edges',
        what: 'Below 0% is red, 0–10% is white, above 10% is green.',
        variant: `${pct}%`,
      }),
      () => {
        expect(trendStateFor(pct, true)).toBe(state);
      },
    );
  }

  // Lower is better (Average Hire Period): > 5% red, -5% to +5% neutral, < -5% green.
  const lowerIsBetter: [number, TrendState][] = [
    [5.1, 'falsePositive'],
    [5, 'neutral'],
    [-5, 'neutral'],
    [-5.1, 'falseNegative'],
  ];
  for (const [pct, state] of lowerIsBetter) {
    test(
      `lower is better: ${pct}% is ${state}`,
      details({
        ac: ['WP23-87 AC 3.1'],
        title: 'Colour rule for Average Hire Period, at its edges',
        what: 'Above +5% is red, −5% to +5% is white, below −5% is green.',
        variant: `${pct}%`,
      }),
      () => {
        expect(trendStateFor(pct, false)).toBe(state);
      },
    );
  }
});

test.describe('WP23-87 AC 5 comparisons', () => {
  const span = { minDate: '2026-01-01', maxDate: '2026-03-31' };
  const ruleTitle = 'When a % change may be shown';
  const ruleWhat = 'Only when both the chosen period and the one before it have data.';

  test(
    'both windows inside the data: comparison shown',
    details({ ac: ['WP23-87 AC 5'], title: ruleTitle, what: ruleWhat, variant: 'Both have data' }),
    () => {
      expect(
        isComparisonAvailable(
          { startDate: '2026-02-01', endDate: '2026-02-10' },
          { startDate: '2026-01-22', endDate: '2026-01-31' },
          span,
        ),
      ).toBe(true);
    },
  );

  test(
    'AC 5.1: the selected window runs past the data: no comparison',
    details({
      ac: ['WP23-87 AC 5.1'],
      title: ruleTitle,
      what: ruleWhat,
      variant: 'Runs past the data',
    }),
    () => {
      expect(
        isComparisonAvailable(
          { startDate: '2026-03-25', endDate: '2026-04-03' },
          { startDate: '2026-03-15', endDate: '2026-03-24' },
          span,
        ),
      ).toBe(false);
    },
  );

  test(
    'AC 5.2: the previous window starts before the data: no comparison',
    details({
      ac: ['WP23-87 AC 5.2'],
      title: ruleTitle,
      what: ruleWhat,
      variant: 'Previous period before the data',
    }),
    () => {
      expect(
        isComparisonAvailable(
          { startDate: '2026-01-05', endDate: '2026-01-14' },
          { startDate: '2025-12-26', endDate: '2026-01-04' },
          span,
        ),
      ).toBe(false);
    },
  );

  test(
    'no data at all: no comparison',
    details({ ac: ['WP23-87 AC 5'], title: ruleTitle, what: ruleWhat, variant: 'No data at all' }),
    () => {
      expect(
        isComparisonAvailable(
          { startDate: '2026-02-01', endDate: '2026-02-10' },
          { startDate: '2026-01-22', endDate: '2026-01-31' },
          null,
        ),
      ).toBe(false);
    },
  );

  test(
    'AC 5.3: no change reads "0%" and is neutral',
    details({
      ac: ['WP23-87 AC 5.3'],
      title: '“No change” reads 0% and is white',
      what: 'Equal figures in both periods give 0% and the neutral colour on every panel.',
    }),
    () => {
      const counts = { applications: 4, screened: 2, hires: 1, avgHirePeriodDays: 12 };
      for (const tile of expectedSummaryTiles({
        current: counts,
        previous: counts,
        comparisonPreset: 'custom',
      })) {
        expect(tile.delta, tile.label).toEqual({ direction: 'No change', value: '0%' });
        expect(tile.trendState, tile.label).toBe('neutral');
      }
    },
  );
});

test.describe('WP23-156 AC 1.1.3 / WP23-159 AC 2.4 hire and conversion rate', () => {
  const cases: [number, number, string][] = [
    [1, 3, '33.3%'],
    [2, 3, '66.7%'],
    [1, 8, '12.5%'],
    [3, 3, '100.0%'],
    [0, 5, '0.0%'],
  ];
  for (const [hires, applications, label] of cases) {
    test(
      `${hires} hires of ${applications} applications reads ${label}`,
      details({
        ac: ['WP23-156 AC 1.1.3', 'WP23-159 AC 2.4'],
        title: 'Hire rate and conversion rate are worked out and rounded correctly',
        what: 'Hires ÷ applications, shown to one decimal place.',
        variant: `${hires} of ${applications}`,
      }),
      () => {
        expect(hireRateLabel(hires, applications)).toBe(label);
      },
    );
  }
});
