import { expect, type Locator, type Page } from '@playwright/test';
import {
  FIRST_LOAD_TIMEOUT_MS,
  SOURCE_TO_HIRE_PATH,
} from '../../constants/wisersite/source-to-hire.constants';
import type { GlobalPresetLabel } from '../../types/wisersite/source-to-hire.types';
import { BasePage } from '../base.page';
import { AdminSidebar } from './components/admin-sidebar.component';
import { DateRangePicker } from './components/date-range-picker.component';
import { ApplicationsBySourceWidget } from './components/source-to-hire/applications-by-source.component';
import { HireDistributionWidget } from './components/source-to-hire/hire-distribution.component';
import { HiresTrendBySourceWidget } from './components/source-to-hire/hires-trend-by-source.component';
import { SourcePerformanceBreakdownWidget } from './components/source-to-hire/source-performance-breakdown.component';
import { SummaryKpiRow } from './components/source-to-hire/summary-kpi-row.component';

/**
 * The Source to Hire board (/analytics/source-to-hire, epic WP23-62). Composes one component
 * per region; this class only owns what is page-level — the route, the heading, getting here,
 * and flows that span the whole board (the global date filter re-scoping every widget).
 */
export class SourceToHirePage extends BasePage {
  protected readonly path = SOURCE_TO_HIRE_PATH;

  readonly heading: Locator;
  readonly sidebar: AdminSidebar;
  readonly dateRange: DateRangePicker;
  readonly summary: SummaryKpiRow;
  readonly applicationsBySource: ApplicationsBySourceWidget;
  readonly hireDistribution: HireDistributionWidget;
  readonly hiresTrend: HiresTrendBySourceWidget;
  readonly sourcePerformance: SourcePerformanceBreakdownWidget;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1, name: 'Source to Hire', exact: true });
    this.sidebar = new AdminSidebar(page);
    this.dateRange = new DateRangePicker(page);
    this.summary = new SummaryKpiRow(page);
    this.applicationsBySource = new ApplicationsBySourceWidget(page);
    this.hireDistribution = new HireDistributionWidget(page);
    this.hiresTrend = new HiresTrendBySourceWidget(page);
    this.sourcePerformance = new SourcePerformanceBreakdownWidget(page);
  }

  /** Waits for the board's heading — Next.js dev mode compiles the route on its first hit. */
  override async goto(queryString = ''): Promise<void> {
    await super.goto(queryString);
    await expect(this.heading).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT_MS });
  }

  /** Reaches the board the way a user would: Analytics → Source to Hire in the sidebar. */
  async openFromSidebar(): Promise<void> {
    await this.sidebar.navigateTo('Analytics', 'Source to Hire');
    await expect(this.page).toHaveURL(new RegExp(`${SOURCE_TO_HIRE_PATH}$`), {
      timeout: FIRST_LOAD_TIMEOUT_MS,
    });
  }

  /** Applies a global preset and waits for the board to finish re-fetching its summary. */
  async selectGlobalDatePreset(preset: GlobalPresetLabel): Promise<void> {
    await this.dateRange.selectPreset(preset);
    await this.summary.waitForLoaded();
  }

  /** Applies a custom global range (`YYYY-MM-DD`, inclusive) and waits for the board to refresh. */
  async setCustomGlobalDateRange(startDate: string, endDate: string): Promise<void> {
    await this.dateRange.selectRange(startDate, endDate);
    await this.summary.waitForLoaded();
  }
}
