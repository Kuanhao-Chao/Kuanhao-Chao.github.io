/**
 * Centralized Computational Genomics Deep Dives Catalog & Taxonomy Data Module.
 * Single source of truth for /deep_dives/ hub and related cross-links.
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
    id: 'statistical-genetics',
    title: 'Statistical Genetics: The Mathematical Machinery of Quantitative Traits, Heritability & Causal Mapping',
    shortTitle: 'Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Quantitative Genetics & Mathematical Genomics',
    level: 'Foundational to Advanced',
    readingTime: '34 min read',
    summary:
      'A definitive, first-principles exploration of statistical genetics — bridging population genetics (HWE, Wright-Fisher drift, coalescent), Fisher infinitesimal models, Linkage Disequilibrium, GREML/GCTA heritability, LD Score Regression (LDSC/S-LDSC), Linear Mixed Models (BOLT-LMM/Regenie), Bayesian fine-mapping (SuSiE), rare-variant testing (SKAT/DeepRVAT), Mendelian Randomization (MR), and deep learning sequence models.',
    highlights: [
      'Population genetics foundations: Hardy-Weinberg equilibrium, Wright-Fisher genetic drift, and Kingman coalescent TMRCA',
      'Infinitesimal model, variance decomposition (V_P = V_A + V_D + V_I + V_{GxE} + V_E), and narrow-sense heritability (h²)',
      'Linkage Disequilibrium (D, D\', r²), recombination hotspots (PRDM9), and haplotype blocks',
      'Genomic Relatedness Matrix (GRM) & GREML variance-component estimation (GCTA)',
      'LD Score Regression (LDSC & S-LDSC) mathematical proof, genetic correlation (r_g), and tissue enrichment (τ*)',
      'Linear Mixed Models (LMM): from GEMMA to BOLT-LMM, fastGWA, and Regenie',
      'Bayesian fine-mapping: SuSiE 95% credible sets, PIPs, and functional priors (PolyFun, Sniff)',
      'Rare variant tests: Burden, SKAT, SKAT-O, and DeepRVAT neural aggregation',
      'Mendelian Randomization (IVW, MR-Egger, Weighted Median) and causal inference in epidemiological genetics',
      'The modern synthesis: sequence models (Borzoi, AlphaGenome) and language models (GPN-Star) in statistical genetics',
    ],
    equations: [
      'V_P = V_A + V_D + V_I + V_{G \\times E} + V_E',
      '\\mathbb{E}[\\chi^2_j] = 1 + \\frac{N h^2}{M} \\ell_j + N a',
      'A_{ik} = \\frac{1}{M} \\sum \\frac{(X_{ij}-2p_j)(X_{kj}-2p_j)}{2p_j(1-p_j)}',
      '\\hat{\\beta}_{\\text{MR}} = \\frac{\\sum w_j \\hat{\\beta}_{Xj} \\hat{\\beta}_{Yj}}{\\sum w_j \\hat{\\beta}_{Xj}^2}',
    ],
    href: '/deep_dives/statistical-genetics/',
    badge: 'Deep Dive Post',
    actionText: 'Read technical deep dive',
    featured: true,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas',
    title: 'Genome-Wide Association Studies (GWAS): The Mathematical Engine of Trait Mapping',
    shortTitle: 'GWAS & Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Polygenic Architecture & Trait Mapping',
    level: 'Foundational to Advanced',
    readingTime: '24 min read',
    summary:
      'A comprehensive first-principles guide to Genome-Wide Association Studies (GWAS) — from biological variation, genotyping arrays, and step-by-step QC protocols to OLS/LMM regression, ancestry PCA confounding, Linkage Disequilibrium, and clinical Polygenic Risk Scores (PRS).',
    highlights: [
      'Biological foundations: common disease–common variant (CDCV) hypothesis & HMM imputation',
      'Rigorous QC protocols: sample call rate (>98%), sex checks, heterozygosity & IBD relatedness',
      'Additive OLS & LMM regression derivations with Wald test statistics and power scaling',
      'The chopsticks problem: ancestry confounding, EIGENSTRAT PCA, λ_GC inflation & LDSC',
      'Linkage Disequilibrium blocks (r², D\'), SuSiE 95% credible sets & deep learning splicing',
      'Bonferroni derivation (p < 5×10⁻⁸), omnigenic architecture & clinical PRS risk stratification',
    ],
    equations: [
      'y = \\alpha + x_j \\beta_j + Z\\gamma + \\epsilon',
      't_j = \\hat{\\beta}_j / \\text{SE}(\\hat{\\beta}_j)',
      '\\lambda_{GC} = \\text{median}(\\chi^2_{\\text{obs}}) / 0.456',
      '\\text{PRS}_i = \\sum \\hat{\\beta}_j G_{ij}',
    ],
    href: '/deep_dives/gwas/',
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
      'u < v \\implies u\' < v\'',
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
