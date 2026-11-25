import { expect, type Locator, type Page } from '@playwright/test';
import {
  RECRUITMENT_FUNNEL_HEADING,
  RECRUITMENT_FUNNEL_PATH,
} from '../../constants/wisersite/recruitment-funnel.constants';
import { FIRST_LOAD_TIMEOUT_MS } from '../../constants/wisersite/source-to-hire.constants';
import type { GlobalPresetLabel } from '../../types/wisersite/source-to-hire.types';
import { BasePage } from '../base.page';
import { DateRangePicker } from './components/date-range-picker.component';
import { HeadlineStatsRow } from './components/recruitment-funnel/headline-stats.component';
import { RecruitmentFunnelWidget } from './components/recruitment-funnel/recruitment-funnel.component';

/**
 * The Recruitment Funnel board (/analytics/recruitment-funnel, `<h1>` "Funnel Data", epic
 * WP23-61): the global date filter, the headline stats row (WP23-132) and the funnel widget
 * (WP23-85 / 86 / 295 / 307).
 */
export class RecruitmentFunnelPage extends BasePage {
  protected readonly path = RECRUITMENT_FUNNEL_PATH;

  readonly heading: Locator;
  readonly dateRange: DateRangePicker;
  readonly headline: HeadlineStatsRow;
  readonly funnel: RecruitmentFunnelWidget;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', {
      level: 1,
      name: RECRUITMENT_FUNNEL_HEADING,
      exact: true,
    });
    this.dateRange = new DateRangePicker(page);
    this.headline = new HeadlineStatsRow(page);
    this.funnel = new RecruitmentFunnelWidget(page);
  }

  /** Opens the board and waits for the funnel's stage buttons (dev mode compiles on first hit). */
  override async goto(queryString = ''): Promise<void> {
    await super.goto(queryString);
    await expect(this.heading).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT_MS });
    await expect(this.funnel.stageButtons).toHaveCount(8, { timeout: FIRST_LOAD_TIMEOUT_MS });
  }

  /** Applies a global preset through the date picker. Callers wait for the refetch they need. */
  async selectGlobalDatePreset(preset: GlobalPresetLabel): Promise<void> {
    await this.dateRange.selectPreset(preset);
  }

  /** Applies a custom global range (`YYYY-MM-DD`, inclusive) through the calendar. */
  async setCustomGlobalDateRange(startDate: string, endDate: string): Promise<void> {
    await this.dateRange.selectRange(startDate, endDate);
  }
}
