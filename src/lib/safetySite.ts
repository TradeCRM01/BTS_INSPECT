/** Site / location text on JHA and Take 5 — trim so a leading space cannot become the site name. */
export function trimSafetySite(value: string): string {
  return value.trim();
}
