import { expect, type Locator, type Page } from '@playwright/test';
import {
  CANDIDATE_PIPELINE_HEADING,
  CANDIDATE_PIPELINE_NAV,
  CANDIDATE_PIPELINE_PATH,
} from '../../constants/wisersite/candidate-pipeline.constants';
import { FIRST_LOAD_TIMEOUT_MS } from '../../constants/wisersite/source-to-hire.constants';
import type { GlobalPresetLabel } from '../../types/wisersite/source-to-hire.types';
import { BasePage } from '../base.page';
import { AdminSidebar } from './components/admin-sidebar.component';
import { PipelineBySourceWidget } from './components/candidate-pipeline/pipeline-by-source.component';
import { PipelineTrendWidget } from './components/candidate-pipeline/pipeline-trend.component';
import { RejectionReasonsWidget } from './components/candidate-pipeline/rejection-reasons.component';
import { DateRangePicker } from './components/date-range-picker.component';

/**
 * The Candidate Pipeline board (/analytics/candidate-pipeline, epic WP23-65). Owns the route,
 * the heading, getting here, and the global date filter; one component per widget.
 */
export class CandidatePipelinePage extends BasePage {
  protected readonly path = CANDIDATE_PIPELINE_PATH;

  readonly heading: Locator;
  readonly sidebar: AdminSidebar;
  readonly dateRange: DateRangePicker;
  readonly pipelineTrend: PipelineTrendWidget;
  readonly rejectionReasons: RejectionReasonsWidget;
  readonly pipelineBySource: PipelineBySourceWidget;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', {
      level: 1,
      name: CANDIDATE_PIPELINE_HEADING,
      exact: true,
    });
    this.sidebar = new AdminSidebar(page);
    this.dateRange = new DateRangePicker(page);
    this.pipelineTrend = new PipelineTrendWidget(page);
    this.rejectionReasons = new RejectionReasonsWidget(page);
    this.pipelineBySource = new PipelineBySourceWidget(page);
  }

  /** Waits for the heading: Next.js dev mode compiles the route on its first hit. */
  override async goto(queryString = ''): Promise<void> {
    await super.goto(queryString);
    await expect(this.heading).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT_MS });
  }

  /** Reaches the board the way a user would: Analytics → Pipeline in the sidebar. */
  async openFromSidebar(): Promise<void> {
    await this.revealSidebarEntry();
    await this.selectSidebarEntry();
  }

  /** Opens the sidebar until the Pipeline entry is showing, without clicking it. */
  async revealSidebarEntry(): Promise<void> {
    await this.sidebar.revealLink(CANDIDATE_PIPELINE_NAV.group, CANDIDATE_PIPELINE_NAV.link);
  }

  /** Clicks the (revealed) Pipeline entry: "the page being selected". */
  async selectSidebarEntry(): Promise<void> {
    await this.sidebar.clickLink(CANDIDATE_PIPELINE_NAV.group, CANDIDATE_PIPELINE_NAV.link);
    await expect(this.page).toHaveURL(new RegExp(`${CANDIDATE_PIPELINE_PATH}$`), {
      timeout: FIRST_LOAD_TIMEOUT_MS,
    });
  }

  /** Waits until both charts have rendered something (data or their empty state). */
  async waitForCharts(): Promise<void> {
    await expect(this.pipelineTrend.content).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT_MS });
    await expect(this.rejectionReasons.content).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT_MS });
  }

  /** Applies a global preset. Widgets refetch afterwards; read them with a poll. */
  async selectGlobalDatePreset(preset: GlobalPresetLabel): Promise<void> {
    await this.dateRange.selectPreset(preset);
  }

  /** Applies a custom global range (`YYYY-MM-DD`, inclusive). Widgets refetch afterwards. */
  async setCustomGlobalDateRange(startDate: string, endDate: string): Promise<void> {
    await this.dateRange.selectRange(startDate, endDate);
  }
}
