import { test as base, type Page } from '@playwright/test';
import { wisersiteEnv } from '../config/wisersite.env';
import { TenantSqlClient } from '../db/wisersite-db-client';
import { SourceToHireRepository } from '../db/repositories/wisersite/source-to-hire.repository';
import { HiresTrendRepository } from '../db/repositories/wisersite/hires-trend.repository';
import { AdminLoginPage } from '../pages/wisersite/admin-login.page';
import { SourceToHirePage } from '../pages/wisersite/source-to-hire.page';

type WorkerFixtures = {
  tenantSql: TenantSqlClient;
  sourceToHireRepository: SourceToHireRepository;
  hiresTrendRepository: HiresTrendRepository;
};

type TestFixtures = {
  /** `page`, already authenticated against /admin as the seeded master user. */
  adminPage: Page;
  sourceToHirePage: SourceToHirePage;
};

/**
 * The wisersite-and-payload-plugin suite's own `test` — separate from src/fixtures/index.ts
 * (the bundled Employee Directory demo) so the two never share a DB connection, page object
 * set, or login flow.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  tenantSql: [
    async ({}, use) => {
      const client = new TenantSqlClient();
      await client.waitUntilReady();
      await use(client);
      await client.close();
    },
    { scope: 'worker' },
  ],

  sourceToHireRepository: [
    async ({ tenantSql }, use) => {
      await use(new SourceToHireRepository(tenantSql));
    },
    { scope: 'worker' },
  ],

  hiresTrendRepository: [
    async ({ tenantSql }, use) => {
      await use(new HiresTrendRepository(tenantSql));
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ page }, use) => {
    const login = new AdminLoginPage(page);
    await login.login(wisersiteEnv.ADMIN_EMAIL, wisersiteEnv.ADMIN_PASSWORD);
    await use(page);
  },

  sourceToHirePage: async ({ adminPage }, use) => {
    const sourceToHirePage = new SourceToHirePage(adminPage);
    await sourceToHirePage.goto();
    await use(sourceToHirePage);
  },
});

export { expect } from '@playwright/test';
