/**
 * The heights the analytics charts occupy.
 *
 * Its own module, with no recharts in it, because both sides need the number:
 * `_charts.tsx` to size the chart, and `page.tsx` to reserve the same box while
 * that chunk is still in flight. Importing it from `_charts.tsx` would pull
 * recharts back into the page's static graph and undo the split it pays for.
 *
 * A shared constant rather than two matching literals and a comment asking
 * whoever changes one to remember the other.
 */
export const CHART_HEIGHT = 260;
export const BAR_CHART_HEIGHT = 220;
