/**
 * Whether `values` are in `direction` order. Ties are allowed (their relative order is
 * unspecified); strings compare with `en-GB` numeric collation, like the app's tables.
 */
export function isSorted(values: readonly (number | string)[], direction: 'asc' | 'desc'): boolean {
  return values.every((value, index) => {
    if (index === 0) return true;
    const previous = values[index - 1]!;
    const cmp =
      typeof value === 'number' && typeof previous === 'number'
        ? previous - value
        : String(previous).localeCompare(String(value), 'en-GB', { numeric: true });
    return direction === 'desc' ? cmp >= 0 : cmp <= 0;
  });
}
