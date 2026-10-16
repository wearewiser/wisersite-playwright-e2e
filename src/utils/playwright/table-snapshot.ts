import type { Locator } from '@playwright/test';

/** One `<tbody>` row: its `<th>` (row header), its `<td>` texts, and any bar-fill inline styles. */
export type TableRowSnapshot = {
  rowHeader: string | null;
  cells: string[];
  fillStyles: string[];
};

/**
 * Reads every body row of `table` in one in-page pass. Walking rows one Playwright call at a
 * time races a table re-rendering mid-read (e.g. a new date range dropping rows) — a snapshot
 * can't tear, and an `expect.poll` around it simply retries until the table has settled.
 */
export async function snapshotTableBodyRows(table: Locator): Promise<TableRowSnapshot[]> {
  return table.evaluate((element) =>
    Array.from((element as HTMLTableElement).tBodies)
      .flatMap((body) => Array.from(body.rows))
      .map((row) => ({
        rowHeader: row.querySelector('th')?.textContent?.trim() ?? null,
        cells: Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
        fillStyles: Array.from(row.querySelectorAll('td [style*="--bar-width"]')).map(
          (fill) => fill.getAttribute('style') ?? '',
        ),
      })),
  );
}
