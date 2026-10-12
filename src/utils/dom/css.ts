/** Reads one CSS custom property out of an inline `style` attribute (`--bar-width` -> `"40%"`). */
export function readCssVariable(style: string, name: string): string | null {
  const match = new RegExp(`${name}:\\s*([^;]+)`).exec(style);
  return match?.[1]?.trim() ?? null;
}

/** The first `var(--token)` in a colour expression, e.g. inside a `color-mix(...)`. */
export function colourToken(colour: string | null | undefined): string | null {
  return /var\(--[^)]+\)/.exec(colour ?? '')?.[0] ?? null;
}

/**
 * Finds which of `names` appears as a modifier in a (possibly CSS-module-hashed) class list —
 * `"Pill-module__x1__pill Pill-module__x1__positive"` with `['positive', 'negative']` ->
 * `"positive"`.
 */
export function classModifier<T extends string>(classList: string, names: readonly T[]): T | null {
  const pattern = new RegExp(`(?:^|[_\\s-])(${names.join('|')})(?=\\s|$)`);
  return (pattern.exec(classList)?.[1] as T | undefined) ?? null;
}
