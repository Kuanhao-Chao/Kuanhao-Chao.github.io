/**
 * Curated research-area topics for the Posts and Reports page filter pills.
 *
 * An entry belongs to a topic if it carries ANY of that topic's mapped tags.
 * Raw content tags are too granular for pills (mostly singletons), so we group
 * them into a handful of research areas here. Entries whose tags map to nothing
 * still appear under "All" and stay searchable; "Open source" is deliberately
 * not a topic (it's tooling, not a research area — find it via search).
 *
 * To add a topic, append an entry; to fold a new tag into an existing topic,
 * add it to that topic's `tags` array.
 */
export interface PostTopic {
  slug: string;
  label: string;
  tags: string[];
}

export const POST_TOPICS: PostTopic[] = [
  {
    slug: 'ml',
    label: 'Machine learning',
    tags: ['Deep learning', 'DNA language models', 'Gene expression', 'Variant effect prediction'],
  },
  {
    slug: 'splicing',
    label: 'RNA splicing',
    tags: ['RNA splicing', 'RNA-seq', 'Splice prediction'],
  },
  {
    slug: 'genomes',
    label: 'Genome assembly & annotation',
    tags: [
      'Genome assembly',
      'Genome annotation',
      'Human genome',
      'Comparative genomics',
      'Lift-over',
    ],
  },
  {
    slug: 'pangenome',
    label: 'Pangenomics & algorithms',
    tags: ['Pangenomics', 'Algorithms', 'Wheeler graphs', 'Formal methods', 'SMT'],
  },
  {
    slug: 'sequencing',
    label: 'Sequencing tools',
    tags: ['Sanger sequencing', 'R / Bioconductor'],
  },
];

/** The topic slugs an entry belongs to, derived from its tags (may be empty). */
export function topicSlugs(tags: string[]): string[] {
  return POST_TOPICS.filter((t) => t.tags.some((tag) => tags.includes(tag))).map((t) => t.slug);
}
