/** Strip a leading "YYYY-MM-" date prefix from a publication file id to form a
 *  clean, stable URL slug, e.g. "2024-08-splam" -> "splam". Shared by the
 *  publications list (link target) and the detail route (getStaticPaths) so the
 *  two never drift. */
export const pubSlug = (id: string): string => id.replace(/^\d{4}-\d{2}-/, '');
