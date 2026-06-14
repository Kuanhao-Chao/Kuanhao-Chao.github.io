import { getCollection } from 'astro:content';

export interface RelatedPostLink {
  href: string;
  label: string;
  title: string;
}

/**
 * Resolve post slugs into link descriptors for the cross-link "Blog" chips shown
 * on publication / research / software entries. Missing or draft posts are dropped.
 *
 * A single related post gets the generic label "Blog" — the entry itself already
 * names the subject. When an entry maps to several posts (e.g. the RNA-splicing
 * research area → Splam + OpenSpliceAI), each chip uses the post's `linkLabel`
 * (falling back to its full title) so the chips stay distinguishable. `title` is
 * always the full post title, for `title=`/`aria-label`.
 */
export async function resolveRelatedPosts(slugs: string[]): Promise<RelatedPostLink[]> {
  if (!slugs?.length) return [];
  const byId = new Map((await getCollection('posts')).map((p) => [p.id, p]));
  const posts = slugs
    .map((slug) => byId.get(slug))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.data.draft);
  const single = posts.length === 1;
  return posts.map((p) => ({
    href: `/posts/${p.id}/`,
    label: single ? 'Blog' : (p.data.linkLabel ?? p.data.title),
    title: p.data.title,
  }));
}
