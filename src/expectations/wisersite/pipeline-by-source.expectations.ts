import {
  PIPELINE_TOP_N,
  TOTAL_ROW_LABEL,
} from '../../constants/wisersite/candidate-pipeline.constants';
import { GLOBAL_PRESETS } from '../../constants/wisersite/source-to-hire.constants';
import type { CandidatePipelineRepository } from '../../db/repositories/wisersite/candidate-pipeline.repository';
import type { PipelineSourceCounts } from '../../db/repositories/wisersite/candidate-pipeline.repository.types';
import type { DateWindow, GlobalPresetLabel } from '../../types/wisersite/source-to-hire.types';
import { resolveGlobalPreset } from '../../utils/wisersite/date-window';
import type {
  PipelineBySourceColumn,
  PipelineBySourceDisplayRow,
  PipelineBySourceReading,
} from '../../types/wisersite/candidate-pipeline.types';
import { formatLocaleCount } from '../../utils/format/locale-number';

type Counts = Omit<PipelineSourceCounts, 'source'>;

/** WP23-198 AC 2.1.8: confirmed / total applied, as a 0–100 percentage (0 when nothing applied). */
function conversionRate({ confirmed, applications }: Counts): number {
  return applications > 0 ? (confirmed / applications) * 100 : 0;
}

/**
 * WP23-198 AC 2.1.1–2.1.3, 2.1.5–2.1.8: one row as displayed. Counts in en-GB grouping, the
 * conversion rate to one decimal place with "%" (AC silent on rounding: per app
 * `PipelineBySource.tsx:23`).
 */
function displayRow(label: string, counts: Counts): PipelineBySourceDisplayRow {
  return [
    label,
    formatLocaleCount(counts.applications),
    formatLocaleCount(counts.screened),
    formatLocaleCount(counts.stage1Interview),
    formatLocaleCount(counts.offered),
    formatLocaleCount(counts.confirmed),
    formatLocaleCount(counts.rejected),
    `${conversionRate(counts).toFixed(1)}%`,
  ];
}

/**
 * WP23-198 AC 2.1 "and in total": the sum of the rows shown, conversion = summed confirmed /
 * summed applications (D-10: rows shown, as decided in WP23-327).
 */
function totalRow(rows: PipelineSourceCounts[]): PipelineBySourceDisplayRow | null {
  if (rows.length === 0) return null;
  const sum = (key: keyof Counts) => rows.reduce((total, row) => total + row[key], 0);
  return displayRow(TOTAL_ROW_LABEL, {
    applications: sum('applications'),
    screened: sum('screened'),
    stage1Interview: sum('stage1Interview'),
    offered: sum('offered'),
    confirmed: sum('confirmed'),
    rejected: sum('rejected'),
  });
}

/** WP23-198 AC 2.1: the displayed table for `rows`, in the order given, with its Total row. */
export function pipelineBySourceReading(rows: PipelineSourceCounts[]): PipelineBySourceReading {
  return { rows: rows.map((row) => displayRow(row.source, row)), total: totalRow(rows) };
}

/**
 * WP23-198 AC 2.1 / 2.2: the top 6 sources by applications, high to low (the default sort),
 * ties by source name (AC silent: per app `shapePipelineBySource.ts:82`). Sources with no
 * applications are left out.
 */
export function topPipelineSources(rows: PipelineSourceCounts[]): PipelineSourceCounts[] {
  return rows
    .filter((row) => row.applications > 0)
    .sort((a, b) => b.applications - a.applications || a.source.localeCompare(b.source))
    .slice(0, PIPELINE_TOP_N);
}

const SORT_VALUE: Record<PipelineBySourceColumn, (row: PipelineSourceCounts) => number | string> = {
  Source: (row) => row.source,
  Applied: (row) => row.applications,
  Screening: (row) => row.screened,
  'Stage 1 interview': (row) => row.stage1Interview,
  Offered: (row) => row.offered,
  Confirmed: (row) => row.confirmed,
  Rejected: (row) => row.rejected,
  'Conv. rate': (row) => conversionRate(row),
};

/**
 * WP23-198 AC 2.2: `rows` (in default order) sorted by `column`. Numbers compare numerically,
 * text with en-GB collation; ties keep their default order in both directions (AC silent on
 * ties and collation: per app `DataTable.tsx:190-194, 323-324`).
 */
export function sortPipelineSources(
  rows: PipelineSourceCounts[],
  column: PipelineBySourceColumn,
  direction: 'asc' | 'desc',
): PipelineSourceCounts[] {
  const value = SORT_VALUE[column];
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const cmp =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'en-GB', { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });
}

/** WP23-198 AC 2.3: the filter's source options — every source shown, alphabetically (AC silent on order: per app `DataTable.tsx:279`). */
export function pipelineSourceFilterOptions(rows: PipelineSourceCounts[]): string[] {
  return rows
    .map((row) => row.source)
    .sort((a, b) => a.localeCompare(b, 'en-GB', { numeric: true }));
}

/**
 * WP23-198 AC 2.3: what the table should show while the filter shows `selectedLabel` — just
 * that source's row (and a Total equal to it), or every row for "All Sources".
 */
export function expectedFilteredReading(
  rows: PipelineSourceCounts[],
  selectedLabel: string,
  allLabel: string,
): PipelineBySourceReading {
  return pipelineBySourceReading(
    selectedLabel === allLabel ? rows : rows.filter((row) => row.source === selectedLabel),
  );
}

/**
 * Picks the global preset to exercise WP23-198 AC 2.2 / 2.3 on: the one whose table shows the
 * most sources, with its window and those rows. `null` when no preset has any source (the board
 * leaves the table off), so a test can skip instead of waiting for a table that never comes.
 */
export async function presetWithMostSources(
  repository: Pick<CandidatePipelineRepository, 'getPipelineBySource'>,
): Promise<{ preset: GlobalPresetLabel; window: DateWindow; top: PipelineSourceCounts[] } | null> {
  const candidates = await Promise.all(
    GLOBAL_PRESETS.map(async (preset) => {
      const window = resolveGlobalPreset(preset);
      const top = topPipelineSources(
        await repository.getPipelineBySource(window.startDate, window.endDate),
      );
      return { preset, window, top };
    }),
  );
  const best = [...candidates].sort((a, b) => b.top.length - a.top.length)[0];
  return best && best.top.length > 0 ? best : null;
}

/**
 * WP23-198 AC 2.2: the columns whose value is the same on every row, so sorting them can't
 * change the order and proves nothing on this data (reported as limited by data).
 */
export function columnsWithoutVariation(rows: PipelineSourceCounts[]): PipelineBySourceColumn[] {
  return (Object.keys(SORT_VALUE) as PipelineBySourceColumn[]).filter(
    (column) => new Set(rows.map((row) => SORT_VALUE[column](row))).size < 2,
  );
}

/** WP23-198 AC 2.3: the table's screen-reader status for how many source rows are shown. */
export function rowsShownStatus(count: number): string {
  return `${count} ${count === 1 ? 'row' : 'rows'} shown`;
}
