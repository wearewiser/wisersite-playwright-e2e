import type { Page } from '@playwright/test';

/**
 * Common behaviour shared by every page object. Concrete pages extend this
 * and expose their own locators/actions; nothing UI-specific lives here.
 */
export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  /** Path relative to baseURL that this page renders at, e.g. "/employees". */
  protected abstract readonly path: string;

  async goto(queryString = ''): Promise<void> {
    await this.page.goto(`${this.path}${queryString}`);
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
