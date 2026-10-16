import { expect, type Locator, type Page } from '@playwright/test';
import type { DateWindow, GlobalPresetLabel } from '../../../types/wisersite/source-to-hire.types';
import {
  formatDisplayDate,
  formatLongDate,
  formatLongMonthYear,
  parseDisplayDateRange,
  parseLongMonthYear,
} from '../../../utils/wisersite/date-format';

/** Upper bound on month-paging clicks, so a bad target date fails instead of looping forever. */
const MAX_MONTH_PAGES = 48;

/**
 * The analytics boards' global date filter: a trigger button showing the applied range, opening
 * a "Select date range" popover with preset buttons and a two-month react-datepicker calendar.
 */
export class DateRangePicker {
  readonly trigger: Locator;
  readonly popover: Locator;
  readonly applyButton: Locator;
  readonly previousMonthButton: Locator;
  readonly nextMonthButton: Locator;
  /** The first (left-hand) month panel currently shown. */
  readonly firstMonthPanel: Locator;

  constructor(page: Page) {
    this.trigger = page
      .locator('button', { hasText: /\d{1,2} \w{3} \d{4}\s*[–-]\s*\d{1,2} \w{3} \d{4}/ })
      .first();
    this.popover = page.getByRole('dialog', { name: 'Select date range' });
    this.applyButton = this.popover.getByRole('button', { name: 'Apply', exact: true });
    this.previousMonthButton = this.popover.getByRole('button', { name: 'Previous month' });
    this.nextMonthButton = this.popover.getByRole('button', { name: 'Next month' });
    this.firstMonthPanel = this.popover.getByRole('listbox').first();
  }

  presetButton(preset: GlobalPresetLabel): Locator {
    return this.popover.getByRole('button', { name: preset, exact: true });
  }

  /** A month's day grid, accessibly named e.g. "Month July, 2026". */
  monthPanel(isoDate: string): Locator {
    return this.popover.getByRole('listbox', {
      name: `Month ${formatLongMonthYear(isoDate)}`,
      exact: true,
    });
  }

  /**
   * A day option, taken from its own month's panel. Each panel also lists the neighbouring
   * months' spill-over days ("July 31st" appears greyed-out in August's), so scoping matters.
   */
  dayOption(isoDate: string): Locator {
    return this.monthPanel(isoDate).getByRole('option', {
      name: new RegExp(`${formatLongDate(isoDate)}$`),
    });
  }

  async open(): Promise<void> {
    await this.trigger.click();
    await expect(this.popover).toBeVisible();
  }

  async apply(): Promise<void> {
    await this.applyButton.click();
    await this.popover.waitFor({ state: 'hidden' });
  }

  async selectPreset(preset: GlobalPresetLabel): Promise<void> {
    await this.open();
    await this.presetButton(preset).click();
    await this.apply();
  }

  /** Picks an arbitrary range (`YYYY-MM-DD`, both inclusive) on the calendar and applies it. */
  async selectRange(startDate: string, endDate: string): Promise<void> {
    await this.open();
    await this.pickDay(startDate);
    await this.pickDay(endDate);
    await expect(this.popover).toContainText(
      `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`,
    );
    await this.apply();
  }

  /** Reads the applied range off the trigger button. */
  async getActiveRange(): Promise<DateWindow> {
    return parseDisplayDateRange((await this.trigger.textContent()) ?? '');
  }

  /** Pages the calendar until `isoDate`'s month is shown, then clicks that day. */
  private async pickDay(isoDate: string): Promise<void> {
    const targetMonth = isoDate.slice(0, 7);
    for (let page = 0; page < MAX_MONTH_PAGES; page += 1) {
      if (await this.monthPanel(isoDate).isVisible()) break;
      const shownLabel = (await this.firstMonthPanel.getAttribute('aria-label')) ?? '';
      const shownMonth = parseLongMonthYear(shownLabel) ?? '';
      await (shownMonth > targetMonth ? this.previousMonthButton : this.nextMonthButton).click();
    }
    await this.dayOption(isoDate).click();
  }
}
