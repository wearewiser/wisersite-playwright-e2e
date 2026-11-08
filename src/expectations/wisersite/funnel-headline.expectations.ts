import { HEADLINE_MIN_COHORT } from '../../constants/wisersite/recruitment-funnel.constants';
import type {
  AtsApplicationRow,
  AtsStageRow,
} from '../../db/repositories/wisersite/recruitment-funnel.repository.types';
import type { HeadlineTileReading } from '../../types/wisersite/recruitment-funnel.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { formatLocaleCount } from '../../utils/format/locale-number';
import { atsStageAsOf } from './recruitment-funnel.expectations';

/**
 * The three WP23-132 headline tiles, from the window's applications and the ticket's SQL rules.
 * Rates have two decimals and counts carry their noun (AC silent on format: per app
 * `src/widgets/funnel/format.ts`).
 */

type CohortRow = {
  sourceSystem: string | null;
  sourceChannel: string | null;
  stage: number | null;
  hired: boolean;
};

/**
 * WP23-132 AC 1.1: the applications the tiles measure: created in the window and known by its
 * end, each at the stage it had reached by the window's end and hired only if hired by then.
 * AC silent on the cohort: per app `src/widgets/funnel/atsApplications.ts` `APPLICATIONS_CTE`.
 */
export function headlineCohort(applications: AtsApplicationRow[], window: DateWindow): CohortRow[] {
  return applications
    .filter((row) => row.createdDate >= window.startDate && row.createdDate <= window.endDate)
    .filter((row) => row.firstObservedDate !== null && row.firstObservedDate <= window.endDate)
    .map((row) => ({
      sourceSystem: row.sourceSystem,
      sourceChannel: row.sourceChannel,
      stage: atsStageAsOf(row, window.endDate),
      hired: row.isHired && row.reachedHiredDate !== null && row.reachedHiredDate <= window.endDate,
    }));
}

const percent2 = (value: number) => `${value.toFixed(2)}%`;
const plural = (count: number, noun: string) =>
  `${formatLocaleCount(count)} ${noun}${count === 1 ? '' : 's'}`;

/**
 * WP23-132 AC 1.1.1: Overall Conversion = total hires ÷ applications × 100 (the ticket's SQL;
 * the AC text says "Brand Views", D-2). Hidden (null) with no applications (AC 1.2).
 */
export function expectedOverallConversion(cohort: CohortRow[]): HeadlineTileReading {
  if (cohort.length === 0) return null;
  const hires = cohort.filter((row) => row.hired).length;
  return {
    label: 'Overall Conversion',
    value: percent2((hires / cohort.length) * 100),
    caption: `${plural(hires, 'hire')} · ${plural(cohort.length, 'application')}`,
  };
}

/**
 * WP23-132 AC 1.1.2: the stage transition losing the largest share of the candidates who reached
 * it ("reached" = at that stage or beyond, the ticket SQL's `reached_stage`). Only transitions
 * from at least `HEADLINE_MIN_COHORT` candidates qualify, a tie goes to the earlier stage, and
 * the stages are named as in the ATS stage table (AC silent on all three: per app
 * `shapeFunnelBiggestDropOff.ts`, D-16). Hidden when nothing qualifies (AC 1.2).
 */
export function expectedBiggestDropOff(
  cohort: CohortRow[],
  stages: AtsStageRow[],
): HeadlineTileReading {
  const ordered = [...stages].sort((a, b) => a.displayOrder - b.displayOrder);
  const reached = ordered.map(
    (stage) => cohort.filter((row) => row.stage !== null && row.stage >= stage.stageOrder).length,
  );
  let best: { index: number; pct: number } | null = null;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const from = reached[i]!;
    if (from < HEADLINE_MIN_COHORT) continue;
    const pct = (1 - reached[i + 1]! / from) * 100;
    if (!best || pct > best.pct) best = { index: i, pct };
  }
  if (!best) return null;
  const lost = reached[best.index]! - reached[best.index + 1]!;
  return {
    label: 'Biggest Drop-off',
    value: `${ordered[best.index]!.stageLabel} → ${ordered[best.index + 1]!.stageLabel}`,
    caption: `${percent2(best.pct)} lost · ${plural(lost, 'candidate')}`,
  };
}

/**
 * WP23-132 AC 1.1.3: the source with the highest % of its applications hired. Only sources with
 * at least `HEADLINE_MIN_COHORT` applications and a hire qualify, a tie goes to the source with
 * more applications, a blank channel is left out (AC silent on all three: per app
 * `shapeFunnelBestConversionSource.ts`, `getFunnelBestConversionSource.ts`). Sources are
 * channel within source system, as in the ticket's SQL. Hidden when none qualifies (AC 1.2).
 */
export function expectedBestConversionSource(cohort: CohortRow[]): HeadlineTileReading {
  const bySource = new Map<string, { channel: string; applications: number; hires: number }>();
  for (const row of cohort) {
    const channel = row.sourceChannel ?? '';
    if (!channel) continue;
    const key = `${row.sourceSystem ?? ''}\u0000${channel}`;
    const entry = bySource.get(key) ?? { channel, applications: 0, hires: 0 };
    entry.applications += 1;
    if (row.hired) entry.hires += 1;
    bySource.set(key, entry);
  }
  const eligible = [...bySource.values()]
    .filter((s) => s.applications >= HEADLINE_MIN_COHORT && s.hires > 0)
    .map((s) => ({ ...s, rate: (s.hires / s.applications) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.applications - a.applications);
  const winner = eligible[0];
  if (!winner) return null;
  return {
    label: 'Best Conversion Source',
    value: winner.channel,
    caption: `${plural(winner.hires, 'hire')} · ${percent2(winner.rate)} source-to-hire`,
  };
}

/** WP23-132 AC 1.1.1–1.1.3, in tile order, for one window. */
export function expectedHeadlineTiles(
  applications: AtsApplicationRow[],
  window: DateWindow,
  stages: AtsStageRow[],
): HeadlineTileReading[] {
  const cohort = headlineCohort(applications, window);
  return [
    expectedOverallConversion(cohort),
    expectedBiggestDropOff(cohort, stages),
    expectedBestConversionSource(cohort),
  ];
}
