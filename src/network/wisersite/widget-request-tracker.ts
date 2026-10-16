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
  private readonly requests: { key: string; params: WidgetRequestParams; request: Request }[] = [];
  private readonly settled = new Set<Request>();
  private lastActivityAt = Date.now();

  constructor(page: Page) {
    page.on('request', (request: Request) => this.record(request));
    page.on('requestfinished', (request: Request) => this.settle(request));
    page.on('requestfailed', (request: Request) => this.settle(request));
  }

  private record(request: Request): void {
    const url = new URL(request.url());
    const key = /\/api\/widgets\/([^/?]+)/.exec(url.pathname)?.[1];
    if (!key) return;
    this.lastActivityAt = Date.now();
    this.requests.push({
      key,
      params: Object.fromEntries(url.searchParams.entries()) as WidgetRequestParams,
      request,
    });
  }

  private settle(request: Request): void {
    if (!this.requests.some((entry) => entry.request === request)) return;
    this.settled.add(request);
    this.lastActivityAt = Date.now();
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

  /** A bookmark in the request log, for `keysSince()` and `waitForQuiet()`. */
  mark(): number {
    return this.requests.length;
  }

  /** The widget keys fetched since `mark`, in order. */
  keysSince(mark: number): string[] {
    return this.requests.slice(mark).map((entry) => entry.key);
  }

  /**
   * Waits until every widget request since `mark` has finished and none has started or finished
   * for `quietMs` — long enough for a React effect set off by the last interaction to have
   * fired its fetch. Requests before `mark` don't count: a page left mid-fetch (the admin home
   * after login) never reports its requests as finished.
   */
  async waitForQuiet(mark: number, quietMs = 1_500, timeout = 15_000): Promise<void> {
    await expect
      .poll(
        () =>
          this.requests.slice(mark).every((entry) => this.settled.has(entry.request)) &&
          Date.now() - this.lastActivityAt >= quietMs,
        { timeout, intervals: [250] },
      )
      .toBe(true);
  }
}
