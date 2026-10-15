import type { SourceBreakdown } from '../../db/repositories/wisersite/source-to-hire.repository.types';
import type {
  HireDistributionSegment,
  SourcePerformanceColumn,
  SourceRow,
} from '../../types/wisersite/source-to-hire.types';
import { formatLocaleCount } from '../../utils/format/locale-number';

/**
 * Expectations for the three widgets built on the per-source breakdown — Applications by Source
 * (WP23-156), Hire Distribution (WP23-157) and Source Performance Breakdown (WP23-159) — derived
 * from the warehouse rows `SourceToHireRepository.getBySource` returns.
 */

/** Rank by a count, high to low, with an alphabetical tie-break so the order is deterministic. */
function rankBy(
  rows: SourceBreakdown[],
  count: (row: SourceBreakdown) => number,
): SourceBreakdown[] {
  return [...rows].sort(
    (a, b) => count(b) - count(a) || a.sourceChannel.localeCompare(b.sourceChannel),
  );
}

/**
 * WP23-156 AC 1.1.3 "% hired" and WP23-159 AC 2.4 "conversion rate": hires / applications, one
 * decimal place + "%". A source with no applications reads "0.0%" (never shown: AC 4.3).
 */
export function hireRateLabel(hires: number, applications: number): string {
  const rate = applications > 0 ? (hires / applications) * 100 : 0;
  return `${rate.toFixed(1)}%`;
}

/** WP23-156 AC 1.1.2: the top `limit` sources by application volume. */
export function topSourcesByApplications(rows: SourceBreakdown[], limit = 6): SourceBreakdown[] {
  return rankBy(rows, (row) => row.applications).slice(0, limit);
}

/** WP23-156 AC 1.1.2 / 1.1.3: the rows Applications by Source lists — source, applications, hire rate. */
export function expectedApplicationsBySourceRows(rows: SourceBreakdown[]): SourceRow[] {
  return topSourcesByApplications(rows).map((row) => ({
    source: row.sourceChannel,
    applications: row.applications,
    rateLabel: hireRateLabel(row.hires, row.applications),
  }));
}

/** WP23-157 AC 1.2: every source with at least one hire, by hires — no top-N cap. */
export function sourcesWithHires(rows: SourceBreakdown[]): SourceBreakdown[] {
  return rankBy(
    rows.filter((row) => row.hires > 0),
    (row) => row.hires,
  );
}

/** WP23-157 Func 1.2: total hires, the donut's resting centre value and share denominator. */
export function totalHires(rows: SourceBreakdown[]): number {
  return rows.reduce((sum, row) => sum + row.hires, 0);
}

/**
 * WP23-157 Func 1.2.2 "% of source total" (source hires / total hires). AC silent on rounding:
 * per app `DonutGraph` one decimal place with a trailing ".0" dropped, and never a bare "0%" for
 * a share that is really there.
 */
export function hireShareLabel(hires: number, total: number): string {
  const share = (hires / total) * 100;
  return share > 0 && share < 0.1 ? '<0.1%' : `${Number(share.toFixed(1))}%`;
}

/** WP23-157 AC 1.2: the donut's segments, as its accessible table lists them. */
export function expectedHireDistributionSegments(
  rows: SourceBreakdown[],
): HireDistributionSegment[] {
  const withHires = sourcesWithHires(rows);
  const total = totalHires(withHires);
  return withHires.map((row) => ({
    source: row.sourceChannel,
    share: hireShareLabel(row.hires, total),
    hires: row.hires,
  }));
}

/** WP23-157 AC 2: what the donut's centre shows while a source's segment is hovered. */
export function expectedHireDistributionReadout(
  row: SourceBreakdown,
  total: number,
): { value: string; caption: string } {
  return {
    value: formatLocaleCount(row.hires),
    caption: `${hireShareLabel(row.hires, total)} · ${row.sourceChannel}`,
  };
}

/** WP23-159 AC 2: every source with applications, as Source Performance Breakdown rows. */
export function expectedSourcePerformanceRows(rows: SourceBreakdown[]): SourceRow[] {
  return rows.map((row) => ({
    source: row.sourceChannel,
    applications: row.applications,
    screened: row.screened,
    hires: row.hires,
    rateLabel: hireRateLabel(row.hires, row.applications),
  }));
}

/**
 * Rows keyed by source, so comparisons don't depend on how equal values happened to order.
 * oracle-ok: comparison helper, encodes no ticket rule.
 */
export function rowsBySource(rows: SourceRow[]): Record<string, SourceRow> {
  return Object.fromEntries(rows.map((row) => [row.source, row]));
}

/** The value each Source Performance Breakdown column sorts rows by (WP23-159 AC 3.2). */
export const SOURCE_PERFORMANCE_SORT_VALUE: Record<
  SourcePerformanceColumn,
  (row: SourceRow) => number | string
> = {
  Source: (row) => row.source,
  'Application total': (row) => row.applications,
  'Screened applications': (row) => row.screened ?? 0,
  'Total hires': (row) => row.hires ?? 0,
  'Conversion rate': (row) => Number.parseFloat(row.rateLabel),
};
