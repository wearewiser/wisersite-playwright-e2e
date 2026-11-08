import type { RecruitmentFunnelRepository } from '../../db/repositories/wisersite/recruitment-funnel.repository';
import type { AtsApplicationRow } from '../../db/repositories/wisersite/recruitment-funnel.repository.types';
import { expectedStages } from '../../expectations/wisersite/recruitment-funnel.expectations';
import type { ExpectedStage } from '../../types/wisersite/recruitment-funnel.types';
import type { DateWindow } from '../../types/wisersite/source-to-hire.types';

/**
 * Loads the warehouse rows behind the funnel for one window and turns them into the expected
 * stages (WP23-85 AC 1 / 5). `asOf` is the day ATS stages are counted to: the window's end by
 * default (NOTE 2.2). The raw applications come back too, for sub-sources and the weekly chart.
 */
export async function loadExpectedFunnel(
  repository: RecruitmentFunnelRepository,
  window: DateWindow,
  asOf: string = window.endDate,
): Promise<{ stages: ExpectedStage[]; applications: AtsApplicationRow[] }> {
  const [traffic, applyStarts, applications, spans] = await Promise.all([
    repository.getTrafficBySource(window),
    repository.getApplyStartsBySource(window),
    repository.getApplications(window),
    repository.getFeedSpans(),
  ]);
  return {
    stages: expectedStages({ window, traffic, applyStarts, applications, spans, asOf }),
    applications,
  };
}
