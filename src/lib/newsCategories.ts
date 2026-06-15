/**
 * Curated categories for the News page filter pills and item badges.
 *
 * The `news` collection's `category` enum (src/content.config.ts) is the single
 * source of truth for the values; this file fixes their display order and labels
 * so the filter pills (NewsList.astro) and the badge (NewsEntry.astro) stay in
 * sync. `misc` shows as "Other" — clearer than "News" on the News page itself.
 *
 * To add a category, extend the schema enum AND append an entry here.
 */
export interface NewsCategory {
  value: string;
  label: string;
}

export const NEWS_CATEGORIES: NewsCategory[] = [
  { value: 'publication', label: 'Publication' },
  { value: 'talk', label: 'Talk' },
  { value: 'award', label: 'Award' },
  { value: 'release', label: 'Release' },
  { value: 'join', label: 'Milestone' },
  { value: 'misc', label: 'Other' },
];

/** category value → display label, for the per-item badge. */
export const NEWS_LABELS: Record<string, string> = Object.fromEntries(
  NEWS_CATEGORIES.map((c) => [c.value, c.label])
);
