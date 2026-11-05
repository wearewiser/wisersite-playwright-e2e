import type { Locator } from '@playwright/test';

/**
 * A dashboard widget's card, from its heading: the outermost ancestor that holds only this one
 * `<h3>`. The board around it holds every widget's heading, so the card can't be mistaken for it,
 * whether the widget shows its data, its empty state, or is still loading (an "ancestor with a
 * table" rule could climb to the board while the widget had none yet).
 */
export function widgetCard(heading: Locator): Locator {
  return heading.locator('xpath=ancestor::*[count(.//h3) = 1][last()]');
}
