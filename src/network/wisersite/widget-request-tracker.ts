import { expect, type Page, type Request } from '@playwright/test';

/** The query string of a `/api/widgets/:key` request — what a widget asked the server for. */
export type WidgetRequestParams = {
  startDate?: string;
  endDate?: string;
  minDate?: string;
  maxDate?: string;
};

/**
 * Records every `/api/widgets/:key` request a page makes. Each wisersite dashboard widget fetches
 * its own data with the date window (and, for the summary row, the tenant's data range) in the
 * query string, so this is how a test learns exactly what a widget asked for — e.g. which
 * `minDate`/`maxDate` the summary comparison was gated on.
 *
 * Attach it before navigating, or the first fetches are missed.
 */
export class WidgetRequestTracker {
  private readonly requests: { key: string; params: WidgetRequestParams }[] = [];

  constructor(page: Page) {
    page.on('request', (request: Request) => this.record(request));
  }

  private record(request: Request): void {
    const url = new URL(request.url());
    const key = /\/api\/widgets\/([^/?]+)/.exec(url.pathname)?.[1];
    if (!key) return;
    this.requests.push({
      key,
      params: Object.fromEntries(url.searchParams.entries()) as WidgetRequestParams,
    });
  }

  /** The most recent query string `key` was fetched with, if it has fetched at all. */
  last(key: string): WidgetRequestParams | undefined {
    return [...this.requests].reverse().find((request) => request.key === key)?.params;
  }

  /** Waits for `key` to have fetched at least once, then returns its latest query string. */
  async waitForLast(key: string, timeout = 15_000): Promise<WidgetRequestParams> {
    await expect.poll(() => this.last(key), { timeout }).toBeDefined();
    return this.last(key)!;
  }
}
