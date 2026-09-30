import type { Page } from '@playwright/test';
import { BasePage } from '../base.page';

/** Payload's admin login screen — served at /admin when there's no active session. */
export class AdminLoginPage extends BasePage {
  protected readonly path = '/admin';

  constructor(page: Page) {
    super(page);
  }

  async login(email: string, password: string): Promise<void> {
    await this.goto();
    // Next.js dev mode compiles /admin on demand; the first hit after a while can take well
    // past the default action timeout before the login form actually renders.
    await this.page.locator('#field-email').waitFor({ state: 'visible', timeout: 45_000 });
    await this.page.fill('#field-email', email);
    await this.page.fill('#field-password', password);
    await this.page.click('.form-submit button');
    await this.page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 15_000 });
  }
}
