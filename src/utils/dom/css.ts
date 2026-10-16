import type { Locator } from '@playwright/test';

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
 * Which of `tokens` (name -> CSS custom property, e.g. `{ positive: '--tone-positive' }`) the
 * element's rendered text colour resolves to — the colour the user sees, not a class name.
 * Each token is resolved in the element's own scope; an undefined token never matches.
 */
export async function matchTextColourToken<T extends string>(
  element: Locator,
  tokens: Readonly<Record<T, string>>,
): Promise<T | null> {
  const match = await element.evaluate(
    (el, entries) => {
      const scope = el.parentElement ?? el;
      const resolve = (property: string): string => {
        const probe = document.createElement('span');
        probe.style.color = `var(${property}, transparent)`;
        scope.appendChild(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      };
      const actual = getComputedStyle(el).color;
      return entries.find(([, property]) => resolve(property) === actual)?.[0] ?? null;
    },
    Object.entries(tokens) as [string, string][],
  );
  return match as T | null;
}
