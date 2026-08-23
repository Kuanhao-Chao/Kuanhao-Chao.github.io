import mlInterviewCurriculum from './mlInterviewCurriculum.json';

/**
 * The /deep_dives/ index catalog: display order, category taxonomy, and cards for the
 * pages that have no content file yet.
 *
 * It is *not* the source of truth for a migrated lesson. `DEEP_DIVES` once held a
 * second copy of every lesson's title, level, summary and reading time, and that copy
 * drifted — the index shipped 7 min for lessons that compute 18 and 15. Anything with
 * an entry in the `deepDives` collection is derived from it instead, and migrating a
 * lesson means deleting its entry here rather than editing it.
 */

export interface DeepDiveCategory {
  slug:
    | 'all'
    | 'statistical-genetics'
    | 'genomic-data'
    | 'machine-learning'
    | 'sequence-analysis'
    | 'gene-regulation'
    | 'epigenomics'
    | 'pangenomics'
    | 'deep-learning';
  label: string;
}

export interface DeepDiveEntry {
  id: string;
  title: string;
  shortTitle?: string;
  area: string;
  category:
    | 'statistical-genetics'
    | 'genomic-data'
    | 'machine-learning'
    | 'sequence-analysis'
    | 'gene-regulation'
    | 'epigenomics'
    | 'pangenomics'
    | 'deep-learning';
  tag: string;
  level: string; // e.g. "Foundational to Advanced"
  readingTime: string; // e.g. "18 min read"
  summary: string;
  highlights?: string[];
  equations?: string[];
  href: string;
  badge?: string;
  actionText: string;
  featured?: boolean;
  icon?: string;
  status: 'published' | 'coming-soon';
}

export const DEEP_DIVE_CATEGORIES: DeepDiveCategory[] = [
  { slug: 'all', label: 'All Concepts' },
  { slug: 'statistical-genetics', label: 'Statistical & Population Genetics' },
  { slug: 'genomic-data', label: 'Genomic Data & Resources' },
  { slug: 'machine-learning', label: 'Machine Learning, Deep Learning & AI' },
  { slug: 'sequence-analysis', label: 'Sequence Analysis & Alignment' },
  { slug: 'gene-regulation', label: 'Gene Regulation & Splicing' },
  { slug: 'epigenomics', label: 'Epigenomics & Functional Genomics' },
  { slug: 'pangenomics', label: 'Pangenomics & Graphs' },
  { slug: 'deep-learning', label: 'Deep Learning & Foundation Models' },
];

/**
 * The curated order the index lists cards in — the one fact about a lesson that the
 * content collection genuinely cannot supply, since it is a presentation choice about
 * the catalog rather than a property of the lesson.
 *
 * Everything else a card shows (title, level, reading time, summary, objectives, key
 * equations) is derived from the collection by `deepDiveEntriesFromCollection`, so a
 * migrated lesson *deletes* its entry from `DEEP_DIVES` below and keeps only its id
 * here. `deepDives.test.ts` asserts the two stay in step: every id here resolves, and
 * every entry is ordered.
 */
export const DEEP_DIVE_ORDER: string[] = [
  // Statistical Genetics — curriculum order, matching the hub's module map.
  'statistical-genetics',
  'statgen-mathematical-foundations',
  'statgen-population-infinitesimal',
  'statgen-linkage-disequilibrium',
  'statgen-pedigrees-linkage-qtl',
  'statgen-quantitative-genetics-selection',
  'statgen-heritability-greml',
  'statgen-blup-genomic-selection',
  'statgen-multivariate-genetics-gxe',
  'statgen-association-linear-mixed-models',
  'statgen-ldsc-sldsc',
  'statgen-rare-variant-association',
  'statgen-meta-analysis-replication',
  'statgen-bayesian-fine-mapping',
  'statgen-polygenic-risk-scores',
  'statgen-mendelian-randomization',
  'statgen-deep-learning-synthesis',
  // GWAS — the applied workflow track.
  'gwas',
  'gwas-study-design',
  'gwas-arrays-imputation',
  'gwas-quality-control',
  'gwas-running-the-scan',
  'gwas-population-structure',
  'gwas-reading-the-output',
  'gwas-ld-reference-panels',
  'gwas-fine-mapping-practice',
  'gwas-prs-practice',
  // Genomic Data & Resources.
  'genomic-data',
  'data-reference-annotation',
  'data-population-frequency',
  'data-constraint-intolerance',
  'data-variant-effect-scores',
  'data-mave-assays',
  'data-expression-qtl',
  'data-regulatory-maps',
  'data-gwas-summary-stats',
  'data-germline-clinical',
  'data-somatic-oncology',
  'data-protein-benchmarks',
  'data-variant-benchmarks',
  // Machine Learning & Deep Learning Interview Guide — complete course order.
  mlInterviewCurriculum.hub,
  ...mlInterviewCurriculum.lessons.map(({ id }) => id),
  // Outlined but not written.
  'dna-foundation-models',
  'splice-neural-mechanisms',
  'wheeler-pangenome-graphs',
];

export const DEEP_DIVES: DeepDiveEntry[] = [
  {
    id: 'dna-foundation-models',
    title: 'DNA Language Models & Genomic Foundation Architectures',
    shortTitle: 'DNA Foundation Models',
    area: 'Deep Learning in Genomics',
    category: 'deep-learning',
    tag: 'Transformers & State Space Models',
    level: 'Advanced',
    readingTime: '16 min read',
    summary:
      'Understanding self-attention, Hyena/Mamba state-space architectures, and masked nucleotide modeling across gigabase mammalian genomes. How tokenization (k-mers vs BPE vs single-base) impacts variant effect prediction.',
    highlights: [
      'Context scaling: from BERT 512-nt windows to 1M-nt long-range chromosomal models',
      'Zero-shot variant pathogenicity scoring via masked token log-likelihood ratios',
      'Comparing Enformer, Nucleotide Transformer, HyenaDNA, and Caduceus',
    ],
    equations: [
      '\\text{Attention}(Q, K, V) = \\text{softmax}(QK^T / \\sqrt{d_k}) V',
      '\\text{LLR}(v) = \\log P(\\text{alt} \\mid c) - \\log P(\\text{ref} \\mid c)',
    ],
    href: '/deep_dives/dna-foundation-models/',
    badge: 'Coming Soon',
    actionText: 'Preview outline & roadmap',
    featured: false,
    icon: 'ism',
    status: 'coming-soon',
  },
  {
    id: 'splice-neural-mechanisms',
    title: 'The Neural Splicing Code: Spliceosome Biophysics & Deep Splicing Predictors',
    shortTitle: 'Neural Splicing Code',
    area: 'Gene Regulation & RNA Biology',
    category: 'gene-regulation',
    tag: 'Splice Junction Recognition',
    level: 'Intermediate to Advanced',
    readingTime: '15 min read',
    summary:
      'How deep convolutional and dilated residual networks decode 5’ donor (GT), 3’ acceptor (AG), and branchpoint consensus sequences. Exploring OpenSpliceAI, Splam, and in silico mutagenesis (ISM) perturbation matrices.',
    highlights: [
      'Biophysical splicing signals: U1/U2 snRNA base-pairing & polypyrimidine tracts',
      'Dilated convolutions capturing 10,000-bp flanking intronic splicing enhancers/silencers',
      'Evaluating non-coding cryptic splice activation and exon skipping mutations',
    ],
    equations: [
      '\\Delta\\text{Score} = P_{\\text{mut}}(\\text{Splice}) - P_{\\text{ref}}(\\text{Splice})',
      '\\text{ISM}(p, b) = P(\\text{Mut}_{p \\to b}) - P(\\text{WT})',
    ],
    href: '/deep_dives/splice-neural-mechanisms/',
    badge: 'Coming Soon',
    actionText: 'Preview outline & roadmap',
    featured: false,
    icon: 'ism',
    status: 'coming-soon',
  },
  {
    id: 'wheeler-pangenome-graphs',
    title: 'Pangenomics, Variation Graphs & Wheeler Coordinate Systems',
    shortTitle: 'Wheeler Pangenome Graphs',
    area: 'Pangenomics & Graph Indexing',
    category: 'pangenomics',
    tag: 'Graph Indexing & BWT',
    level: 'Advanced',
    readingTime: '17 min read',
    summary:
      'Generalizing linear Burrows-Wheeler Transforms to pangenome variation graphs. Exploring Wheeler graph conditions, co-lexicographic node orderings, and sublinear path search across polymorphic genomes.',
    highlights: [
      'Overcoming reference bias: moving from single GRCh38/CHM13 coordinates to rGFA topologies',
      'Formal Wheeler graph axioms: co-lexicographic ordering preserving incoming edge labels',
      'GBZ, r-index, and PanVC pangenome index querying complexity',
    ],
    equations: [
      "u < v \\implies u' < v'",
      '\\text{Query Time: } \\mathcal{O}(P \\cdot \\log \\Sigma)',
    ],
    href: '/deep_dives/wheeler-pangenome-graphs/',
    badge: 'Coming Soon',
    actionText: 'Preview outline & roadmap',
    featured: false,
    icon: 'wgt',
    status: 'coming-soon',
  },
];
