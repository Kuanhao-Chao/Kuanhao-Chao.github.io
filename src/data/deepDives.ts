/**
 * Centralized Computational Genomics Deep Dives Catalog & Taxonomy Data Module.
 * Single source of truth for /deep_dive/ hub and related cross-links.
 */

export interface DeepDiveCategory {
  slug: 'all' | 'statistical-genetics' | 'sequence-analysis' | 'gene-regulation' | 'epigenomics' | 'pangenomics' | 'deep-learning';
  label: string;
}

export interface DeepDiveEntry {
  id: string;
  title: string;
  shortTitle?: string;
  area: string;
  category: 'statistical-genetics' | 'sequence-analysis' | 'gene-regulation' | 'epigenomics' | 'pangenomics' | 'deep-learning';
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
  { slug: 'sequence-analysis', label: 'Sequence Analysis & Alignment' },
  { slug: 'gene-regulation', label: 'Gene Regulation & Splicing' },
  { slug: 'epigenomics', label: 'Epigenomics & Functional Genomics' },
  { slug: 'pangenomics', label: 'Pangenomics & Graphs' },
  { slug: 'deep-learning', label: 'Deep Learning & Foundation Models' },
];

export const DEEP_DIVES: DeepDiveEntry[] = [
  {
    id: 'gwas',
    title: 'Genome-Wide Association Studies (GWAS): The Mathematical Engine of Trait Mapping',
    shortTitle: 'GWAS & Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Polygenic Architecture & Trait Mapping',
    level: 'Foundational to Advanced',
    readingTime: '18 min read',
    summary:
      'A first-principles, rigorous journey through Genome-Wide Association Studies (GWAS) — from genotype dosage matrices and OLS regression to ancestry PCA confounding ("the chopsticks problem"), Linkage Disequilibrium (LD), Manhattan skyscraper plots, and Polygenic Risk Scores (PRS).',
    highlights: [
      'Additive genotype dosage matrix G ∈ {0,1,2}^(N×M) and OLS/LMM Wald test derivations',
      'The chopsticks problem: ancestry confounding, EIGENSTRAT PCA & λ_GC inflation factor',
      'Linkage Disequilibrium blocks (r², D\'), recombination hotspots & statistical fine-mapping',
      'Bonferroni threshold derivation (p < 5×10⁻⁸), Fisher’s infinitesimal vs Boyle-Li-Pritchard omnigenic models & PRS',
    ],
    equations: [
      'y = α + x_j · β_j + Z · γ + ε',
      't_j = β̂_j / SE(β̂_j)',
      'λ_GC = median(χ²_obs) / 0.456',
      'PRS_i = Σ β̂_j · G_ij',
    ],
    href: '/deep_dive/gwas/',
    badge: 'Deep Dive Post',
    actionText: 'Read technical deep dive',
    featured: true,
    icon: 'gwas',
    status: 'published',
  },
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
      'Attention(Q, K, V) = softmax(QKᵀ / √d_k) V',
      'LLR(v) = log P(alt | context) - log P(ref | context)',
    ],
    href: '/deep_dive/dna-foundation-models/',
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
      'ΔScore = P_mut(Splice) - P_ref(Splice)',
      'ISM(p, b) = P(Mut_{p→b}) - P(WT)',
    ],
    href: '/deep_dive/splice-neural-mechanisms/',
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
      'u < v ∧ label(u, u\') < label(v, v\') ⇒ u\' < v\'',
      'Query Time: O(P · log Σ)',
    ],
    href: '/deep_dive/wheeler-pangenome-graphs/',
    badge: 'Coming Soon',
    actionText: 'Preview outline & roadmap',
    featured: false,
    icon: 'wgt',
    status: 'coming-soon',
  },
];
