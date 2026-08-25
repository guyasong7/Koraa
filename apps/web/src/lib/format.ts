/**
 * Formatting helpers shared across the dashboard and the storefront.
 *
 * Kept out of a component file so a storefront page can use one without pulling
 * a dashboard panel — and its icon set, and its API client — into the public
 * bundle.
 */

/** A byte count a person can read. `—` for zero, because "0 B" reads as an error. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
