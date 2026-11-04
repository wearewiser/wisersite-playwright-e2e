import type { Locator } from '@playwright/test';

/**
 * A point, relative to `element`'s bounding box, where the element itself is what the mouse
 * would hit — for shapes like donut arcs whose box centre is empty or covered by a neighbour.
 * Samples a grid over the box and returns the hit farthest from any miss (the deepest point
 * inside the shape). For an arc that is mid-band and mid-sweep, so the point stays on the arc
 * when hovering lifts it a few pixels; the mean of the hits can fall in the ring's hole, which
 * left the nearest hit on the inner edge. `null` when no point of the element is hittable.
 */
export async function ownHitPoint(
  element: Locator,
  steps = 32,
): Promise<{ x: number; y: number } | null> {
  return element.evaluate((el, gridSteps) => {
    const box = el.getBoundingClientRect();
    const hits: { x: number; y: number }[] = [];
    // The box border counts as a miss, so a shape that fills its box still aims at the middle.
    const misses: { x: number; y: number }[] = [];
    for (let i = 0; i <= gridSteps; i += 1) {
      for (let j = 0; j <= gridSteps; j += 1) {
        const x = box.left + (box.width * i) / gridSteps;
        const y = box.top + (box.height * j) / gridSteps;
        const onBorder = i === 0 || j === 0 || i === gridSteps || j === gridSteps;
        if (!onBorder && document.elementFromPoint(x, y) === el) hits.push({ x, y });
        else misses.push({ x, y });
      }
    }
    if (hits.length === 0) return null;
    const clearance = (hit: { x: number; y: number }) =>
      Math.min(...misses.map((miss) => Math.hypot(hit.x - miss.x, hit.y - miss.y)));
    const best = hits
      .map((hit) => ({ hit, clearance: clearance(hit) }))
      .reduce((a, b) => (b.clearance > a.clearance ? b : a)).hit;
    return { x: best.x - box.left, y: best.y - box.top };
  }, steps);
}
