import {
  ALL_SOURCE_GROUPS,
  CHARTED_SOURCES,
  FEED_DATA_NAME,
  FUNNEL_COPY,
  FUNNEL_STAGES,
  MAX_SUB_SOURCES,
  OTHER_SUB_SOURCES_LABEL,
  STALE_FEED_HOURS,
} from '../../constants/wisersite/recruitment-funnel.constants';
import type {
  ApplyStartSourceRow,
  AtsApplicationRow,
  FeedSpan,
  TrafficSourceRow,
} from '../../db/repositories/wisersite/recruitment-funnel.repository.types';
import type {
  ExpectedStage,
  ExpectedStageFlow,
  ExpectedStagePanel,
  FeedState,
  FunnelFeed,
  FunnelSourceGroup,
  FunnelTable,
  SourceCounts,
  SourcePerformanceRow,
  StageSummaryReading,
} from '../../types/wisersite/recruitment-funnel.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';
import { formatLocaleCount } from '../../utils/format/locale-number';
import { formatIntlDisplayDate } from '../../utils/wisersite/date-format';

/**
 * What the Recruitment Funnel (epic WP23-61) should show, from warehouse rows and the tickets'
 * rules. Where a ticket is silent the rule cites the app file it follows; nothing here imports
 * app code.
 */

const emptyCounts = (): SourceCounts => ({
  jobBoards: 0,
  social: 0,
  referral: 0,
  organic: 0,
  other: 0,
});
const sum = (counts: SourceCounts): number => ALL_SOURCE_GROUPS.reduce((n, g) => n + counts[g], 0);

/**
 * WP23-85 AC 1.2: ATS `source_type` → job boards / social / referral / organic, everything else
 * "other" (D-15). AC silent on the mapping: per app `src/widgets/RecruitmentFunnel/stages.ts`
 * `classifyAtsSource`.
 */
export function classifyAtsSourceType(sourceType: string | null): FunnelSourceGroup {
  const value = (sourceType ?? '').trim().toLowerCase();
  if (/job ?boards?/.test(value)) return 'jobBoards';
  if (/social/.test(value)) return 'social';
  if (/referr/.test(value)) return 'referral';
  if (/organic|career (?:site|page)/.test(value)) return 'organic';
  return 'other';
}

const JOB_BOARD_SOURCES =
  /indeed|totaljobs|\breed\b|glassdoor|monster|cv-?library|ziprecruiter|jobsite|adzuna|jooble|simplyhired|careerbuilder|caterer|guardianjobs/;
const SOCIAL_SOURCES =
  /facebook|instagram|linkedin|lnkd|tiktok|twitter|^t\.co$|^x\.com$|youtube|reddit|snapchat|pinterest|threads/;
const ORGANIC_GROUPS = new Set(['organic search', 'direct', 'organic video', 'organic shopping']);
const SOCIAL_GROUPS = new Set(['organic social', 'paid social', 'social']);

/**
 * WP23-85 AC 1.2: GA4 channel group + source → source group. AC silent on the mapping (the
 * ticket's sheet isn't readable): per app `stages.ts` `classifyTrafficSource`.
 */
export function classifyTrafficSource(
  channelGroup: string | null,
  source: string | null,
): FunnelSourceGroup {
  const group = (channelGroup ?? '').trim().toLowerCase();
  const origin = (source ?? '').trim().toLowerCase();
  if (JOB_BOARD_SOURCES.test(origin)) return 'jobBoards';
  if (SOCIAL_GROUPS.has(group) || SOCIAL_SOURCES.test(origin)) return 'social';
  if (group === 'referral') return 'referral';
  if (ORGANIC_GROUPS.has(group)) return 'organic';
  return 'other';
}

/**
 * WP23-85 AC 5 + NOTE 2.2: the furthest ATS stage (1 Applied … 5 Hired) an application had
 * reached by `asOf`; null when it has no known stage. A stage reached after `asOf` doesn't
 * count yet. Offer's reach date is `confirmed_observed_date` (AC silent: per app
 * `src/widgets/funnel/atsApplications.ts` `stageAsOfSql`).
 */
export function atsStageAsOf(row: AtsApplicationRow, asOf: string): number | null {
  const furthest = row.furthestStageOrder;
  if (furthest === null || furthest < 1) return null;
  const reached = (date: string | null) => date !== null && date <= asOf;
  if (furthest >= 5 && reached(row.reachedHiredDate)) return 5;
  if (furthest >= 4 && reached(row.confirmedObservedDate)) return 4;
  if (furthest >= 3 && reached(row.reachedInterviewDate)) return 3;
  if (furthest >= 2 && reached(row.reachedInReviewDate)) return 2;
  return 1;
}

/**
 * WP23-85 AC 2.3 / WP23-358: whether a feed can answer for `window`. Never loaded → awaiting
 * data; window ends before the feed's first day → no data for these dates; stale (no load for
 * `STALE_FEED_HOURS`) with nothing in the window → re-syncing; otherwise it answers, zeros
 * included (AC 2.2). AC silent on the thresholds: per app `getRecruitmentFunnel.ts` `feedStatus`.
 */
export function feedState(span: FeedSpan, window: DateWindow, windowRows: number): FeedState {
  if (span.totalRows === 0) return 'awaitingData';
  if (span.firstDay && window.endDate < span.firstDay) return 'beforeDataStart';
  const stale = span.hoursSinceLoad === null || span.hoursSinceLoad > STALE_FEED_HOURS;
  return stale && windowRows === 0 ? 'syncing' : 'available';
}

/** WP23-85 AC 1.2 / NOTE 2.1: an application's source group (blank → other). */
const atsGroupOf = (row: AtsApplicationRow) => classifyAtsSourceType(row.sourceType);

/**
 * WP23-85 AC 1.1 / 1.2 / 5: each stage's volume by source over `window`, ATS applications counted
 * once at the furthest stage reached by `asOf` (default the window's end, NOTE 2.2), plus each
 * feed's state (AC 2.3). Reach = GA4 users, Career Site Views = pageviews, Application Started =
 * `apply_start` events (AC silent on measures: per app `getRecruitmentFunnel.ts`).
 */
export function expectedStages({
  window,
  traffic,
  applyStarts,
  applications,
  spans,
  asOf = window.endDate,
}: {
  window: DateWindow;
  traffic: TrafficSourceRow[];
  applyStarts: ApplyStartSourceRow[];
  applications: AtsApplicationRow[];
  spans: FeedSpan[];
  asOf?: string;
}): ExpectedStage[] {
  const counts = new Map(FUNNEL_STAGES.map((stage) => [stage.key, emptyCounts()]));
  for (const row of traffic) {
    const group = classifyTrafficSource(row.channelGroup, row.source);
    counts.get('reach')![group] += row.users;
    counts.get('careerSiteViews')![group] += row.pageviews;
  }
  for (const row of applyStarts) {
    counts.get('applicationStarted')![classifyTrafficSource(row.channelGroup, row.source)] +=
      row.events;
  }
  for (const row of applications) {
    const order = atsStageAsOf(row, asOf);
    const stage = FUNNEL_STAGES.find((s) => s.atsOrder !== null && s.atsOrder === order);
    if (stage) counts.get(stage.key)![atsGroupOf(row)] += 1;
  }

  const feedRows: Record<FunnelFeed, number> = { traffic: 0, conversions: 0, ats: 0 };
  for (const stage of FUNNEL_STAGES) feedRows[stage.feed] += sum(counts.get(stage.key)!);
  const stateOf = (feed: FunnelFeed): { state: FeedState; span: FeedSpan | undefined } => {
    const span = spans.find((s) => s.feed === feed);
    return { state: span ? feedState(span, window, feedRows[feed]) : 'available', span };
  };

  return FUNNEL_STAGES.map((stage) => {
    const { state, span } = stateOf(stage.feed);
    const stageCounts = state === 'available' ? counts.get(stage.key)! : emptyCounts();
    return {
      key: stage.key,
      label: stage.label,
      category: stage.category,
      state,
      counts: stageCounts,
      total: sum(stageCounts),
      ...(state === 'beforeDataStart' && span?.firstDay ? { dataFrom: span.firstDay } : {}),
    };
  });
}

/**
 * WP23-307 AC 1.1: the funnel narrowed to one source group: each stage keeps only that group's
 * count. `null` returns the stages unchanged.
 */
export function filterStages(
  stages: ExpectedStage[],
  group: FunnelSourceGroup | null,
): ExpectedStage[] {
  if (!group) return stages;
  return stages.map((stage) => {
    const counts = { ...emptyCounts(), [group]: stage.counts[group] };
    return { ...stage, counts, total: counts[group] };
  });
}

/**
 * WP23-85 AC 1.1 "percentages" per stage: the stage as a share of Reach (D-14). AC silent on base
 * and precision: per app `shapeRecruitmentFunnel.ts` `formatShareOfFirst` (whole % from 10% and
 * at 0, one decimal from 1%, two below).
 */
export function shareOfFirst(count: number, first: number | null): string {
  if (!first || first <= 0) return FUNNEL_COPY.noValue;
  const percent = (count / first) * 100;
  if (percent >= 10 || percent === 0) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(2)}%`;
}

const stageHasData = (stage: ExpectedStage) => stage.state === 'available' && stage.total > 0;

/** What each column shows: a value with data, "0" for a real zero, "—" for no data (WP23-358). */
type ColumnState = 'ok' | 'zero' | 'unavailable';

function columnStates(stages: ExpectedStage[]): ColumnState[] {
  const anyData = stages.some(stageHasData);
  return stages.map((stage) => {
    if (!anyData || stage.state !== 'available') return 'unavailable';
    return stage.total === 0 ? 'zero' : 'ok';
  });
}

/**
 * The "Total" cell text of a stage that shows no figure (WP23-85 AC 2.1–2.3, WP23-358): the
 * "—" dash plus the stage's note and reason. Copy is the app's (AC silent), see `FUNNEL_COPY`.
 */
function noFigureTotal(stage: ExpectedStage, anyData: boolean): string {
  const feed = FUNNEL_STAGES.find((s) => s.key === stage.key)!.feed;
  if (stage.state === 'beforeDataStart') {
    const from = stage.dataFrom ? formatIntlDisplayDate(stage.dataFrom) : '';
    return `${FUNNEL_COPY.noValue} (${FUNNEL_COPY.noDataNote}) ${FEED_DATA_NAME[feed]} data starts on ${from}.`;
  }
  if (!anyData) return `${FUNNEL_COPY.noValue} (${FUNNEL_COPY.noDataNote})`;
  return `${FUNNEL_COPY.noValue} (${FUNNEL_COPY.noDataNote}) ${FUNNEL_COPY.syncingDetail}`;
}

/**
 * WP23-85 AC 1.1, 1.2, 2.1–2.3 (and WP23-307 AC 1.1 when `group` is set): the funnel's
 * screen-reader table. Per stage: Total (count, "0 (None at stage) …" for a real zero, "—" with
 * the reason when the feed can't answer), share of the first stage, then each visible source's
 * count.
 */
export function expectedFunnelTable(
  stages: ExpectedStage[],
  group: Exclude<FunnelSourceGroup, 'other'> | null = null,
): FunnelTable {
  const shown = filterStages(stages, group);
  const states = columnStates(shown);
  const anyData = shown.some(stageHasData);
  const first = states[0] === 'ok' ? shown[0]!.total : null;
  const visible = group ? CHARTED_SOURCES.filter((s) => s.group === group) : CHARTED_SOURCES;
  return {
    sourceColumns: visible.map((s) => s.label),
    rows: shown.map((stage, index) => {
      const state = states[index]!;
      const total =
        state === 'ok'
          ? formatLocaleCount(stage.total)
          : state === 'zero'
            ? `0 (${FUNNEL_COPY.zeroNote}) ${FUNNEL_COPY.zeroDetail}`
            : noFigureTotal(stage, anyData);
      return {
        stage: stage.label,
        total,
        shareOfFirst: state === 'ok' ? shareOfFirst(stage.total, first) : FUNNEL_COPY.noValue,
        sources: visible.map(({ group: g }) =>
          state === 'ok' ? formatLocaleCount(stage.counts[g]) : FUNNEL_COPY.noValue,
        ),
      };
    }),
  };
}

/**
 * Whole-percent shares that add up to 100 (largest remainder). AC silent on rounding: per app
 * `components/molecules/charts/primitives.ts` `roundShares`.
 */
function roundShares(values: number[]): number[] {
  const total = values.reduce((n, v) => n + v, 0);
  if (total === 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((n, v) => n + v, 0);
  const order = exact
    .map((v, index) => ({ index, fraction: v - floors[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index]! += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * WP23-85 AC 1.2 "percentage breakdown at each stage … for each source", and WP23-307 AC 1.2
 * (triage on WP23-376: the band % keeps the source's share of the whole, unfiltered stage).
 * One label per visible source per stage with data, in stage then key order: the source's
 * share of the stage total (Other included, D-15), "<1%" when it rounds to 0.
 */
export function expectedBandLabels(
  stages: ExpectedStage[],
  group: Exclude<FunnelSourceGroup, 'other'> | null = null,
): string[] {
  const states = columnStates(filterStages(stages, group));
  const visible = group ? CHARTED_SOURCES.filter((s) => s.group === group) : CHARTED_SOURCES;
  return stages.flatMap((stage, index) => {
    if (states[index] !== 'ok') return [];
    const charted = CHARTED_SOURCES.map(({ group: g }) => stage.counts[g]);
    const rest = stage.total - charted.reduce((n, v) => n + v, 0);
    const shares = rest > 0 ? roundShares([...charted, rest]) : roundShares(charted);
    return visible.map(({ group: g }) => {
      const share = shares[CHARTED_SOURCES.findIndex((s) => s.group === g)]!;
      return share === 0 ? '<1%' : `${share}%`;
    });
  });
}

/**
 * Summary-panel percentages: whole from 10% up, one decimal below. AC silent on source-share
 * precision (WP23-86 AC 1.5): per app `stageFlowFormat.tsx` `formatStagePercent`.
 */
function sourceSharePercent(value: number): string {
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
}

/**
 * WP23-86 AC 1.3 / 1.5 (and WP23-307 AC 2.1 when filtered): the summary panel of each stage with
 * data: candidates at stage, then each visible source's count and share of the stage (of the
 * filtered source's own total when a filter is on).
 */
export function expectedStagePanels(
  stages: ExpectedStage[],
  group: Exclude<FunnelSourceGroup, 'other'> | null = null,
): (ExpectedStagePanel | null)[] {
  const shown = filterStages(stages, group);
  const states = columnStates(shown);
  const visible = group ? CHARTED_SOURCES.filter((s) => s.group === group) : CHARTED_SOURCES;
  return shown.map((stage, index) => {
    if (states[index] !== 'ok') return null;
    const visibleCount = visible.reduce((n, { group: g }) => n + stage.counts[g], 0);
    const total = group ? visibleCount : stage.total;
    return {
      stage: stage.label,
      candidates: formatLocaleCount(stage.total),
      sources: visible.map(({ group: g, label }) => ({
        source: label,
        count: formatLocaleCount(stage.counts[g]),
        share: sourceSharePercent(total > 0 ? (stage.counts[g] / total) * 100 : 0),
      })),
    };
  });
}

/** A signed change, from the candidate's side: a loss "−n", a gain "+n" (AC silent: per app WP23-460). */
function signed(value: number, format: (n: number) => string): string {
  if (value === 0) return format(0);
  return `${value > 0 ? '−' : '+'}${format(Math.abs(value))}`;
}

const wholePercent = (value: number) => `${Math.round(value)}%`;

/**
 * WP23-86 AC 1.4 and 1.6: each stage's flow. % arrived = this ÷ previous, exact (AC 1.4 sets no
 * rounding; D-4: it can pass 100%, PO WP23-357; none on Reach); lost = previous − this, % drop =
 * lost ÷ previous and cumulative drop = drop from Reach to this stage (never below 0), whole
 * numbers (AC 1.6). Where the previous stage is a real zero, 0 → 0 is 0% and anything above it
 * "—" (D-6, WP23-358 triage). Null for stages without data.
 */
export function expectedStageFlows(stages: ExpectedStage[]): (ExpectedStageFlow | null)[] {
  const states = columnStates(stages);
  const first = stages[0]!;
  return stages.map((stage, index) => {
    if (states[index] !== 'ok') return null;
    if (index === 0) {
      const dash = FUNNEL_COPY.noValue;
      return {
        stage: stage.label,
        arrivedPercent: null,
        fromPrevious: dash,
        drop: dash,
        cumulative: dash,
      };
    }
    const previous = stages[index - 1]!;
    const dash = FUNNEL_COPY.noValue;
    const prevOk = previous.state === 'available';
    const cur = stage.total;
    const prev = previous.total;
    const arrivedPercent = !prevOk ? null : prev > 0 ? (cur / prev) * 100 : cur === 0 ? 0 : null;
    const drop = !prevOk ? null : prev > 0 ? ((prev - cur) / prev) * 100 : cur === 0 ? 0 : null;
    const cumulative =
      first.state !== 'available'
        ? null
        : first.total > 0
          ? Math.max(0, ((first.total - cur) / first.total) * 100)
          : cur === 0
            ? 0
            : null;
    return {
      stage: stage.label,
      arrivedPercent,
      fromPrevious: prevOk ? signed(prev - cur, (n) => formatLocaleCount(Math.round(n))) : dash,
      drop: drop === null ? dash : signed(drop, (n) => wholePercent(n)),
      cumulative: cumulative === null ? dash : wholePercent(cumulative),
    };
  });
}

/**
 * Whether a percentage reading shows a decimal under 10% (e.g. "6.7%", "−0.7%") where WP23-86
 * AC 1.6 asks for whole numbers: the WP23-86 D-5 symptom.
 */
export function showsDecimalPercent(text: string | null | undefined): boolean {
  return /\d\.\d%/.test(text ?? '');
}

/**
 * WP23-295 AC 2.1–2.3: the full detail's summary figures for the stage at `index`: candidates at
 * stage, % arrived from the previous stage ("—" for the first, AC 2.2.1) and % lost (never below
 * 0). Whole numbers (AC silent: per app `StageSummaryStats.tsx`). 0 → 0 is 0% (D-6).
 */
export function expectedStageSummary(stages: ExpectedStage[], index: number): StageSummaryReading {
  const states = columnStates(stages);
  const stage = stages[index]!;
  const dash = FUNNEL_COPY.noValue;
  const candidates = states[index] === 'unavailable' ? dash : formatLocaleCount(stage.total);
  if (index === 0 || states[index] === 'unavailable')
    return { candidates, arrived: dash, lost: dash };
  const previous = stages[index - 1]!;
  if (previous.state !== 'available') return { candidates, arrived: dash, lost: dash };
  const cur = stage.total;
  const prev = previous.total;
  if (prev === 0) {
    const zero = cur === 0 ? '0%' : dash;
    return { candidates, arrived: zero, lost: zero };
  }
  return {
    candidates,
    arrived: wholePercent((cur / prev) * 100),
    lost: wholePercent(Math.max(0, ((prev - cur) / prev) * 100)),
  };
}

const atsKeys = FUNNEL_STAGES.filter((s) => s.feed === 'ats').map((s) => s.key);

/**
 * Applicants of `group` who reached the stage at `index` or beyond: ATS counts are exclusive
 * (WP23-85 AC 5), so "reached" is this stage plus every later ATS stage (WP23-357 PO comment).
 */
function reachedFrom(stages: ExpectedStage[], index: number, group: FunnelSourceGroup): number {
  return stages
    .slice(index)
    .filter((s) => atsKeys.includes(s.key))
    .reduce((n, s) => n + s.counts[group], 0);
}

/**
 * WP23-86 AC 3 / WP23-295 AC 3: an ATS sub-source's display name. AC silent: per app
 * `sourceDisplayName.ts` (career page / site spellings → "Career Site", mixed case kept, lower
 * case title-cased), applied to ATS channels only; a blank channel falls back to the source type.
 */
export function atsSubSourceLabel(channel: string | null, sourceType: string | null): string {
  const raw = [channel, sourceType].find((v) => typeof v === 'string' && v.trim())?.trim();
  if (!raw) return 'Unknown source';
  const lower = raw.toLowerCase();
  const placeholder = /^\((.+)\)$/.exec(lower);
  if (placeholder) return placeholder[1]!.charAt(0).toUpperCase() + placeholder[1]!.slice(1);
  const parts = lower.split(/[.\-_\s]+/).filter(Boolean);
  const candidates = [...parts, ...parts.slice(1).map((part, i) => parts[i] + part)];
  if (candidates.some((c) => ['careerspage', 'careersite', 'careerpage'].includes(c))) {
    return 'Career Site';
  }
  if (raw !== lower) return raw;
  return raw.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * WP23-86 AC 3 / WP23-295 AC 3: the individual sources behind one source group at an ATS stage
 * with their counts, largest first (then by name), the tail past `MAX_SUB_SOURCES` folded into
 * "Other sources" (AC silent on the cap: per app `getRecruitmentFunnel.ts`). Applications whose
 * source the ATS didn't classify aren't listed (WP23-520).
 */
function subSourceCounts(
  applications: AtsApplicationRow[],
  asOf: string,
  stageOrder: number,
  group: FunnelSourceGroup,
): { source: string; count: number }[] {
  const byLabel = new Map<string, number>();
  for (const row of applications) {
    if (row.isSourceUnclassified) continue;
    if (atsStageAsOf(row, asOf) !== stageOrder || atsGroupOf(row) !== group) continue;
    const label = atsSubSourceLabel(row.sourceChannel, row.sourceType);
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }
  const ranked = [...byLabel]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const top = ranked.slice(0, MAX_SUB_SOURCES);
  const rest = ranked.slice(MAX_SUB_SOURCES).reduce((n, r) => n + r.count, 0);
  return rest > 0 ? [...top, { source: OTHER_SUB_SOURCES_LABEL, count: rest }] : top;
}

/**
 * WP23-86 AC 3 / WP23-295 AC 3: the sub-source rows of one source group at an ATS stage. Share
 * is of the LISTED sources, so the sub-rows of every listed group add up to 100%: `listedTotal`
 * is the stage's applications in the groups shown, less those flagged
 * `is_source_unclassified` (PO decision WP23-520 Q4, 4 Nov, confirmed by the developer 5 Nov;
 * replaces WP23-368 option B, share of the stage. WP23-601, which asked for the stage base, was
 * closed as expected behaviour). E.g. Last 12 months, Application Submitted: Career Site 403 /
 * 434 = 92.9%. One decimal (AC silent: per app `StageSourcePerformance.tsx`).
 */
export function expectedSubSources(
  applications: AtsApplicationRow[],
  asOf: string,
  stageOrder: number,
  group: FunnelSourceGroup,
  listedTotal: number,
): { source: string; candidates: string; share: string }[] {
  return subSourceCounts(applications, asOf, stageOrder, group).map(({ source, count }) => ({
    source,
    candidates: formatLocaleCount(count),
    share: `${(listedTotal > 0 ? (count / listedTotal) * 100 : 0).toFixed(1)}%`,
  }));
}

/**
 * WP23-295 AC 3.1–3.3 (WP23-307 AC 2.1 when filtered): the source performance rows of the stage
 * at `index`, one per visible category: candidates; share of the stage (Other included, D-15;
 * of the source's own total when filtered); to next = applicants of the source reaching the next
 * stage ÷ reaching this one (WP23-357 PO formula), "—" where the two stages don't count the same
 * applicants (anything but ATS → ATS, and the last stage) or a side has no data (WP23-357
 * "or – when the two stages can't be compared"). Whole numbers (AC silent: per app).
 * `subSources` is filled for ATS stages from `applications` (share of the listed sources,
 * WP23-520 Q4: see `expectedSubSources`); empty elsewhere.
 */
export function expectedSourcePerformance({
  stages,
  index,
  applications,
  asOf,
  group = null,
}: {
  stages: ExpectedStage[];
  index: number;
  applications: AtsApplicationRow[];
  asOf: string;
  group?: Exclude<FunnelSourceGroup, 'other'> | null;
}): SourcePerformanceRow[] {
  const shown = filterStages(stages, group);
  const states = columnStates(shown);
  const stage = shown[index]!;
  const next = shown[index + 1];
  const definition = FUNNEL_STAGES[index]!;
  const visible = group ? CHARTED_SOURCES.filter((s) => s.group === group) : CHARTED_SOURCES;
  const drawsData = states[index] !== 'unavailable';
  const charted = visible.reduce((n, { group: g }) => n + stage.counts[g], 0);
  const total = drawsData ? (group ? charted : stage.total) : 0;
  const comparable =
    drawsData &&
    !!next &&
    stage.state === 'available' &&
    next.state === 'available' &&
    atsKeys.includes(stage.key) &&
    atsKeys.includes(next.key);
  const dash = FUNNEL_COPY.noValue;
  const atsOrder = definition.atsOrder;
  const listedTotal =
    drawsData && atsOrder !== null
      ? visible.reduce(
          (n, { group: g }) =>
            n + subSourceCounts(applications, asOf, atsOrder, g).reduce((m, r) => m + r.count, 0),
          0,
        )
      : 0;
  return visible.map(({ group: g, label }) => {
    const count = stage.counts[g];
    const reached = comparable ? reachedFrom(shown, index, g) : 0;
    return {
      source: label,
      candidates: drawsData ? formatLocaleCount(count) : dash,
      share: drawsData ? wholePercent(total > 0 ? (count / total) * 100 : 0) : dash,
      toNext: !comparable
        ? dash
        : wholePercent(reached > 0 ? (reachedFrom(shown, index + 1, g) / reached) * 100 : 0),
      subSources:
        drawsData && atsOrder !== null && count > 0
          ? expectedSubSources(applications, asOf, atsOrder, g, listedTotal)
          : [],
    };
  });
}

/**
 * WP23-86 AC 3: the first stage and source category with two or more individual sources, none
 * named like a category (so a list can be read by name), or undefined when no stage has one.
 */
export function firstExpandableSource({
  stages,
  applications,
  asOf,
}: {
  stages: ExpectedStage[];
  applications: AtsApplicationRow[];
  asOf: string;
}): { stage: string; index: number; row: SourcePerformanceRow } | undefined {
  const categories: readonly string[] = CHARTED_SOURCES.map((s) => s.label);
  return FUNNEL_STAGES.flatMap((stage, index) =>
    expectedSourcePerformance({ stages, index, applications, asOf })
      .filter(
        (row) =>
          row.subSources.length >= 2 &&
          row.subSources.every((sub) => !categories.includes(sub.source)),
      )
      .map((row) => ({ stage: stage.label, index, row })),
  )[0];
}

/** WP23-295 AC 3.1–3.3: the category rows of a source performance table, without sub-sources. */
export function categoryRows(
  rows: SourcePerformanceRow[],
): Omit<SourcePerformanceRow, 'subSources'>[] {
  return rows.map(({ source, candidates, share, toNext }) => ({
    source,
    candidates,
    share,
    toNext,
  }));
}

/** WP23-295 AC 3 / WP23-86 AC 3: each category with only its individual sources. */
export function subSourceRows(
  rows: SourcePerformanceRow[],
): Pick<SourcePerformanceRow, 'source' | 'subSources'>[] {
  return rows.map(({ source, subSources }) => ({ source, subSources }));
}

/**
 * WP23-295 AC 2.3.1: the first stage that lost more than half of the previous stage (where a
 * warning tone would show instead of neutral styling); -1 when none did.
 */
export function firstStageLosingOverHalf(stages: ExpectedStage[]): number {
  return stages.findIndex((stage, i) => {
    const previous = stages[i - 1];
    return (
      !!previous &&
      stage.state === 'available' &&
      previous.state === 'available' &&
      previous.total > 0 &&
      (previous.total - stage.total) / previous.total > 0.5
    );
  });
}

/**
 * WP23-85 AC 1.1 / WP23-307 AC 1.2 ("the numbers above the graph are recalculated"): each stage's
 * headline figure, as its column button names it: the (filtered) count, "0" for a real zero,
 * "—" without data.
 */
export function stageButtonValues(
  stages: ExpectedStage[],
  group: Exclude<FunnelSourceGroup, 'other'> | null = null,
): string[] {
  const shown = filterStages(stages, group);
  return columnStates(shown).map((state, index) =>
    state === 'ok'
      ? formatLocaleCount(shown[index]!.total)
      : state === 'zero'
        ? '0'
        : FUNNEL_COPY.noValue,
  );
}

/** Why a stage-flow reading differs from the AC value (for scoping defect labels). */
export type FlowMismatch = 'careerSiteViewsDash' | 'decimalUnderTen' | 'other';

const firstNumber = (text: string | null | undefined): number | null => {
  const match = /[−+-]?\d[\d,]*(?:\.\d+)?/.exec(text ?? '');
  return match ? Number(match[0].replace(/,/g, '').replace('−', '-')) : null;
};

/**
 * WP23-86 AC 1.4 / 1.6, WP23-295 AC 2.2 / 2.3: every way `readings` differ from `expected`
 * (rows matched by index, compared field by field): Career Site Views showing "—" where the AC
 * wants a value (WP23-605), a one-decimal percentage that rounds to the AC's whole number
 * (WP23-86 D-5), or anything else. A test labels a defect only when nothing is "other".
 */
export function flowMismatches(
  readings: Record<string, string | null | undefined>[],
  expected: Record<string, string | null | undefined>[],
): Set<FlowMismatch> {
  const found = new Set<FlowMismatch>();
  if (readings.length !== expected.length) found.add('other');
  readings.forEach((reading, index) => {
    const want = expected[index] ?? {};
    for (const field of new Set([...Object.keys(reading), ...Object.keys(want)])) {
      const actual = reading[field];
      const target = want[field];
      if (actual === target) continue;
      if (reading.stage === 'Career Site Views' && actual === FUNNEL_COPY.noValue) {
        found.add('careerSiteViewsDash');
      } else if (
        showsDecimalPercent(actual) &&
        firstNumber(actual) !== null &&
        Math.round(Math.abs(firstNumber(actual)!)) === Math.abs(firstNumber(target) ?? NaN) &&
        actual?.replace(/[−+-]?\d[\d,]*(?:\.\d+)?/, '') ===
          target?.replace(/[−+-]?\d[\d,]*(?:\.\d+)?/, '')
      ) {
        found.add('decimalUnderTen');
      } else {
        found.add('other');
      }
    }
  });
  return found;
}

/** WP23-86 AC 1.4: how far the summary's "% arrived" may sit from the exact SQL ratio (display rounding). */
export const ARRIVAL_TOLERANCE_PERCENT = 0.5;

/**
 * WP23-86 AC 1.4: why the summary's "% arrived" line differs from the AC value, or null when it
 * matches. With a % expected the line must read "<n>% arrived from <previous>" with n within
 * ±0.5 of `percent` (AC 1.4 sets no rounding: whole or one decimal both pass); with none
 * expected (null) it must be "—". Career Site Views showing "—" where a % is due is
 * WP23-605; anything else is "other".
 */
export function arrivalMismatch(
  stage: string,
  line: string | null,
  percent: number | null,
  previous: string,
): FlowMismatch | null {
  if (percent === null) return line === FUNNEL_COPY.noValue ? null : 'other';
  const match = /^([\d,]+(?:\.\d+)?)% arrived from (.+)$/.exec(line ?? '');
  if (
    match &&
    match[2] === previous &&
    Math.abs(Number(match[1]!.replace(/,/g, '')) - percent) <= ARRIVAL_TOLERANCE_PERCENT
  ) {
    return null;
  }
  return stage === 'Career Site Views' && line === FUNNEL_COPY.noValue
    ? 'careerSiteViewsDash'
    : 'other';
}
