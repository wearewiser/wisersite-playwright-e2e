import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Payload admin sidebar (the app's custom Nav override) — shared by every admin page, so
 * page objects compose it rather than each re-implementing the rail and group handling.
 *
 * Both the rail's open/closed state and each group's collapsed state are stored user
 * preferences, so nothing here assumes a starting state: it opens/expands only when needed.
 */
export class AdminSidebar {
  private readonly openMenuButton: Locator;
  private readonly closeMenuButton: Locator;

  constructor(private readonly page: Page) {
    this.openMenuButton = page.getByRole('button', { name: 'Open Menu', exact: true });
    this.closeMenuButton = page.getByRole('button', { name: 'Close Menu', exact: true });
  }

  /** A nav group by its label, e.g. "Analytics" — the app renders it as `#nav-group-<label>`. */
  group(label: string): Locator {
    return this.page.locator(`#nav-group-${label}`);
  }

  /**
   * Opens the rail if it's collapsed to icons only — in that state the group labels sit
   * underneath the page content and can't be clicked.
   */
  async open(): Promise<void> {
    if (await this.openMenuButton.isVisible()) {
      await this.openMenuButton.click();
      await expect(this.closeMenuButton).toBeVisible();
    }
  }

  /**
   * Expands a nav group if `linkLabel` isn't showing, the way a user would: click the group's
   * toggle and wait for the link to appear. A collapsed group removes its links, so the link
   * itself is the signal — no class names or stored state. The toggle is named "<label>" when
   * the group has no landing page, or "Expand <label>" (beside a "<label>" link) when it does.
   */
  async expandGroup(label: string, linkLabel: string): Promise<void> {
    const link = this.groupLink(label, linkLabel);
    if (await link.isVisible()) return;
    await this.group(label)
      .getByRole('button', { name: new RegExp(`^(Expand )?${label}$`) })
      .click();
    await expect(link).toBeVisible();
  }

  /** Opens the rail, expands `groupLabel`, and clicks its `linkLabel` entry. */
  async navigateTo(groupLabel: string, linkLabel: string): Promise<void> {
    await this.open();
    await this.expandGroup(groupLabel, linkLabel);
    await this.groupLink(groupLabel, linkLabel).click();
  }

  private groupLink(groupLabel: string, linkLabel: string): Locator {
    return this.group(groupLabel).getByRole('link', { name: linkLabel, exact: true });
  }
}
