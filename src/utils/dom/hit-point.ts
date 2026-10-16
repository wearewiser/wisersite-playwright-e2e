import type { Locator } from '@playwright/test';

/**
 * A point, relative to `element`'s bounding box, where the element itself is what the mouse
 * would hit — for shapes like donut arcs whose box centre is empty or covered by a neighbour.
 * Samples a grid over the box and returns the hit closest to the middle of all hits, so it
 * stays clear of the edges. `null` when no point of the element is hittable.
 */
export async function ownHitPoint(
  element: Locator,
  steps = 24,
): Promise<{ x: number; y: number } | null> {
  return element.evaluate((el, gridSteps) => {
    const box = el.getBoundingClientRect();
    const hits: { x: number; y: number }[] = [];
    for (let i = 1; i < gridSteps; i += 1) {
      for (let j = 1; j < gridSteps; j += 1) {
        const x = box.left + (box.width * i) / gridSteps;
        const y = box.top + (box.height * j) / gridSteps;
        if (document.elementFromPoint(x, y) === el) hits.push({ x, y });
      }
    }
    if (hits.length === 0) return null;
    const mean = {
      x: hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length,
      y: hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length,
    };
    const best = hits.reduce((a, b) =>
      Math.hypot(a.x - mean.x, a.y - mean.y) <= Math.hypot(b.x - mean.x, b.y - mean.y) ? a : b,
    );
    return { x: best.x - box.left, y: best.y - box.top };
  }, steps);
}
