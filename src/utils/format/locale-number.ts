/** Parses a `toLocaleString('en-GB')` count back to a number: `"1,234"` -> `1234`. */
export function parseLocaleCount(text: string | undefined): number {
  return Number((text ?? '').trim().replace(/,/g, ''));
}

/** Formats a count the way the wisersite UI does: `1234` -> `"1,234"`. */
export function formatLocaleCount(value: number): string {
  return value.toLocaleString('en-GB');
}
