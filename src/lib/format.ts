const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Mar 2021" — the academic default for news/talks. */
export function monthYear(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Feb 12, 2026" */
export function fullDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Rough reading time in minutes from a raw markdown/MDX body (~200 wpm, min 1). */
export function readingTime(body: string): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** "Mar–Apr 2025" or "Mar 2025" for a date range. */
export function dateRange(start: Date, end?: Date): string {
  if (!end) return monthYear(start);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return monthYear(start);
  if (sameYear) {
    return `${MONTHS[start.getUTCMonth()]}–${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  }
  return `${monthYear(start)} – ${monthYear(end)}`;
}
