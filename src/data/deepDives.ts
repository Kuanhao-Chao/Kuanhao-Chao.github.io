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
  'statgen-heritability-greml',
  'statgen-association-linear-mixed-models',
  'statgen-ldsc-sldsc',
  'statgen-rare-variant-association',
  'statgen-bayesian-fine-mapping',
  'statgen-polygenic-risk-scores',
  'statgen-mendelian-randomization',
  'statgen-deep-learning-synthesis',
  // GWAS — the applied workflow track.
  'gwas',
  'gwas-biological-variation-cdcv',
  'gwas-genotyping-imputation',
  'gwas-quality-control',
  'gwas-association-statistics',
  'gwas-population-stratification',
  'gwas-multiple-testing-manhattan',
  'gwas-linkage-disequilibrium-ldsc',
  'gwas-fine-mapping-functional-genomics',
  'gwas-polygenic-risk-scores-prs',
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
    id: 'statistical-genetics',
    title:
      'Statistical Genetics: The Mathematical Machinery of Quantitative Traits, Heritability & Causal Mapping',
    shortTitle: 'Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Quantitative Genetics & Mathematical Genomics',
    level: 'Comprehensive Curriculum Hub',
    readingTime: '23 min read',
    summary:
      'A definitive, first-principles exploration of statistical genetics — bridging population genetics (HWE, Wright-Fisher drift, coalescent), Fisher infinitesimal models, Linkage Disequilibrium, GREML/GCTA heritability, LD Score Regression (LDSC/S-LDSC), Linear Mixed Models (BOLT-LMM/Regenie), Bayesian fine-mapping (SuSiE), rare-variant testing (SKAT/DeepRVAT), Mendelian Randomization (MR), and deep learning sequence models.',
    highlights: [
      'Population genetics foundations: Hardy-Weinberg equilibrium, Wright-Fisher genetic drift, and Kingman coalescent TMRCA',
      'Infinitesimal model, variance decomposition (V_P = V_A + V_D + V_I + V_{GxE} + V_E), and narrow-sense heritability (h²)',
      "Linkage Disequilibrium (D, D', r²), exact half-life decay, recombination hotspots (PRDM9), and haplotype blocks",
      'Genomic Relatedness Matrix (GRM) & GREML variance-component estimation (GCTA / AI-REML)',
      'LD Score Regression (LDSC & S-LDSC) mathematical proof, genetic correlation (r_g), and tissue enrichment (τ*)',
      'Linear Mixed Models (LMM): from GEMMA to BOLT-LMM, fastGWA, and Regenie stacked ridge regression',
      'Bayesian fine-mapping: SuSiE 95% credible sets, PIPs, and functional priors (PolyFun)',
      'Rare variant tests: Burden, SKAT, SKAT-O, and DeepRVAT neural aggregation',
      'Mendelian Randomization (IVW, MR-Egger, Weighted Median, MVMR) and causal inference in epidemiology',
      'The modern synthesis: regulatory sequence models (Borzoi, AlphaGenome) and language models (GPN-Star) in genetics',
    ],
    equations: [
      'V_P = V_A + V_D + V_I + V_{G \\times E} + 2\\text{Cov}(G, E) + V_E',
      '\\mathbb{E}[\\chi^2_j] = 1 + N a + \\frac{N h^2}{M} \\ell_j',
      '\\mathbf{A} = \\frac{1}{M}\\mathbf{W}\\mathbf{W}^T',
      '\\text{PIP}_j = \\frac{\\pi_j / \\text{ABF}_j}{\\pi_0 + \\sum \\pi_k / \\text{ABF}_k}',
    ],
    href: '/deep_dives/statistical-genetics/',
    badge: 'Deep Dive Post',
    actionText: 'Read technical deep dive',
    featured: true,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-population-infinitesimal',
    title: 'Population Genetics Foundations, Coalescent Theory & The Infinitesimal Model',
    shortTitle: 'Population Genetics & Infinitesimal Model',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 1',
    level: 'Foundational to Advanced',
    readingTime: '12 min read',
    summary:
      "First-principles exploration of Hardy-Weinberg equilibrium, Wright-Fisher genetic drift, Kingman's coalescent TMRCA genealogy, Tajima's D neutrality metric, Fisher's 1918 infinitesimal synthesis, and complete phenotypic variance decomposition.",
    highlights: [
      'Hardy-Weinberg equilibrium mathematical derivation and Chi-square testing',
      'Wright-Fisher transition probabilities and rate of heterozygosity decay (H_t = H_0(1 - 1/(2N_e))^t)',
      "Kingman's coalescent genealogy and expected TMRCA derivation (4Ne generations)",
      "Tajima's D neutrality test comparing pairwise diversity against segregating sites",
      "Ronald A. Fisher's 1918 infinitesimal synthesis and Central Limit Theorem convergence",
      "Master variance decomposition (V_P = V_A + V_D + V_I + V_{GxE} + 2Cov(G,E) + V_E) & Breeder's equation",
    ],
    equations: [
      'p^2 + 2pq + q^2 = 1',
      '\\mathbb{E}[T_{\\text{MRCA}}] = 4N_e(1 - 1/n)',
      'D = \\frac{\\hat{\\theta}_\\pi - \\hat{\\theta}_S}{\\sqrt{\\widehat{\\operatorname{Var}}(\\hat{\\theta}_\\pi - \\hat{\\theta}_S)}}',
      'V_P = V_A + V_D + V_I + V_{G \\times E} + 2\\operatorname{Cov}(G, E) + V_E',
    ],
    href: '/deep_dives/statgen-population-infinitesimal/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-ldsc-sldsc',
    title: 'Summary-Statistics Heritability: LD Score Regression (LDSC & S-LDSC)',
    shortTitle: 'LD Score Regression (LDSC & S-LDSC)',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 4',
    level: 'Advanced & Mathematical',
    readingTime: '8 min read',
    summary:
      'Complete mathematical derivation and first-principles proof of LD Score Regression (LDSC) — estimating SNP heritability, separating polygenicity from stratification, cross-trait genetic correlation (r_g), and functional partitioning with Stratified LDSC (S-LDSC).',
    highlights: [
      'Single-variant LD score definition (ℓ_j = ∑ r_jk²) from reference panels',
      'Bulik-Sullivan et al. (2015) Fundamental LDSC Theorem & step-by-step mathematical proof',
      'Separating true polygenicity from population stratification confounding via the intercept',
      'Bivariate cross-trait genetic correlation (r_g) without individual-level sample overlap',
      'Stratified LDSC (S-LDSC) partitioned heritability and standardized functional effect (τ*)',
    ],
    equations: [
      '\\ell_j = \\sum_{k=1}^M r_{jk}^2',
      '\\mathbb{E}[\\chi^2_j] = 1 + N a + \\frac{N h^2}{M} \\ell_j',
      'r_g = \\frac{\\rho_g}{\\sqrt{h_1^2 h_2^2}}',
      '\\tau_c^* = \\frac{M \\tau_c \\operatorname{sd}(c)}{h^2_{\\text{total}}}',
    ],
    href: '/deep_dives/statgen-ldsc-sldsc/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-association-linear-mixed-models',
    title: 'Single-Marker Association Testing & Linear Mixed Models (LMM)',
    shortTitle: 'Association Testing & Linear Mixed Models',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 5',
    level: 'Advanced & Computational',
    readingTime: '7 min read',
    summary:
      'A comprehensive guide to single-marker GWAS testing (OLS, Logistic, Score tests), statistical power NCP scaling, confounding diagnostics (λ_GC), and the computational evolution of Linear Mixed Models from GEMMA to BOLT-LMM, fastGWA, and REGENIE.',
    highlights: [
      'Single-marker ordinary least squares regression and score test statistics',
      'Statistical power scaling and noncentrality parameter (NCP) derivations',
      'Confounding diagnostics: ancestry stratification, cryptic relatedness, and genomic inflation (λ_GC)',
      'Linear Mixed Model framework: modeling polygenic background variance via GRM',
      'Leave-One-Chromosome-Out (LOCO) scheme eliminating proximal contamination',
      'REGENIE deep dive: stacked ridge regression with cross-validation and Firth logistic fallback',
    ],
    equations: [
      'z_j = \\hat{\\beta}_j / \\text{SE}(\\hat{\\beta}_j)',
      '\\lambda = \\frac{2N p(1 - p)\\beta^2}{\\sigma^2}',
      '\\mathbf{y} = \\mathbf{Z}\\boldsymbol{\\gamma} + \\beta_j \\mathbf{x}_j + \\mathbf{g} + \\boldsymbol{\\epsilon}',
      '\\lambda_{\\text{GC}} = \\frac{\\text{median}(\\chi_1^2, \\dots, \\chi_M^2)}{0.454936}',
    ],
    href: '/deep_dives/statgen-association-linear-mixed-models/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-bayesian-fine-mapping',
    title: 'Bayesian Fine-Mapping, SuSiE & Statistical Colocalization',
    shortTitle: 'Bayesian Fine-Mapping (SuSiE)',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 6',
    level: 'Advanced & Mathematical',
    readingTime: '7 min read',
    summary:
      "A mathematical and algorithmic guide to Bayesian fine-mapping — from Wakefield's Approximate Bayes Factor (ABF) with null normalization to the Sum of Single Effects (SuSiE) model, coordinate ascent variational inference (IBSS), 95% credible sets, and statistical colocalization (coloc).",
    highlights: [
      'The fundamental LD confounding matrix equation (E[β̂] = R β_true)',
      "Wakefield's Approximate Bayes Factor (ABF) and null-normalized PIP calculation",
      'Sum of Single Effects (SuSiE, Wang & Stephens 2020) generative multivariate formulation',
      'Iterative Bayesian Stepwise Selection (IBSS / CAVI) variational optimization',
      'Posterior Inclusion Probabilities (PIP) and construction of 95% Credible Sets with purity checks',
      'Statistical colocalization (coloc H0-H4) and TWAS methodological caveats',
    ],
    equations: [
      '\\mathbb{E}[\\hat{\\boldsymbol{\\beta}}] = \\mathbf{R} \\boldsymbol{\\beta}_{\\text{true}}',
      '\\text{PIP}_j = \\frac{\\pi_j / \\text{ABF}_j}{\\pi_0 + \\sum \\pi_k / \\text{ABF}_k}',
      '\\mathbf{y} = \\sum_{l=1}^L \\mathbf{X} \\boldsymbol{\\gamma}_l b_l + \\boldsymbol{\\epsilon}',
      '\\text{Purity}(\\text{CS}_l) = \\min_{j, k \\in \\text{CS}_l} |r_{jk}| \\ge 0.50',
    ],
    href: '/deep_dives/statgen-bayesian-fine-mapping/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-rare-variant-association',
    title: 'Rare Variant Association Testing: Burden Tests, SKAT, SKAT-O & DeepRVAT',
    shortTitle: 'Rare Variant Association (SKAT)',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 7',
    level: 'Advanced & Methodological',
    readingTime: '7 min read',
    summary:
      'First-principles guide to rare variant association testing in whole-exome and whole-genome sequencing — from collapsing burden tests and the Sequence Kernel Association Test (SKAT/SKAT-O) to deep neural aggregation with DeepRVAT.',
    highlights: [
      'The single-variant statistical power cliff for ultra-rare alleles (MAF < 0.1%)',
      'Collapsing and burden tests (CAST / CMC) and the fatal flaw of directional cancellation',
      'Sequence Kernel Association Test (SKAT) variance-component score test',
      'SKAT-O data-adaptive optimal convex combination searching over ρ ∈ [0, 1]',
      'SAIGE-GENE+ with Saddlepoint Approximation for extreme case-control imbalance',
      'DeepRVAT: replacing heuristic weights with foundation model deleteriousness embeddings (AlphaMissense, SpliceAI)',
    ],
    equations: [
      '\\lambda \\approx 20\\beta^2 \\implies |\\beta| \\ge 1.41\\text{ SD}',
      '\\mathcal{Q}_{\\text{SKAT}} = (\\mathbf{y}-\\hat{\\boldsymbol{\\mu}}_0)^T \\mathbf{K} (\\mathbf{y}-\\hat{\\boldsymbol{\\mu}}_0) = \\sum w_j^2 S_j^2',
      '\\mathcal{Q}_\\rho = \\rho \\mathcal{Q}_{\\text{Burden}} + (1-\\rho) \\mathcal{Q}_{\\text{SKAT}}',
    ],
    href: '/deep_dives/statgen-rare-variant-association/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-mendelian-randomization',
    title: 'Causal Inference in Statistical Genetics: Mendelian Randomization (MR)',
    shortTitle: 'Mendelian Randomization (MR)',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 9',
    level: 'Advanced & Causal Inference',
    readingTime: '7 min read',
    summary:
      'A mathematical and epidemiological guide to Mendelian Randomization (MR) — evaluating the 3 core instrumental variable assumptions, the Inverse-Variance Weighted (IVW) estimator, MR-Egger directional pleiotropy tests, Weighted Median, MVMR, and within-family sibling models.',
    highlights: [
      "Nature's Randomized Controlled Trial: meiotic assortment and instrumental variables (IVs)",
      'The 3 core IV assumptions: Relevance (F > 10), Independence (Z ⟂ U), and Exclusion Restriction',
      'Inverse-Variance Weighted (IVW) master fixed- and random-effects causal estimators',
      'MR-Egger regression: testing directional horizontal pleiotropy under the InSIDE assumption',
      'Robust non-parametric estimators: Weighted Median (50% breakdown point) and MR-PRESSO outlier filtering',
      'Multivariable MR (MVMR) and within-family sibling MR eliminating dynastic genetic nurture',
    ],
    equations: [
      '\\hat{\\beta}_{\\text{Wald}, j} = \\frac{\\hat{\\Gamma}_j}{\\hat{\\gamma}_j}',
      '\\hat{\\beta}_{\\text{IVW}} = \\frac{\\sum w_j \\hat{\\beta}_{\\text{Wald}, j}}{\\sum w_j}',
      '\\hat{\\Gamma}_j = \\beta_0 + \\beta_{\\text{Egger}} \\hat{\\gamma}_j + \\epsilon_j',
      'F = \\frac{\\hat{\\gamma}_j^2}{\\operatorname{Var}(\\hat{\\gamma}_j)} > 10',
    ],
    href: '/deep_dives/statgen-mendelian-randomization/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'statgen-deep-learning-synthesis',
    title: 'The Modern Synthesis: Statistical Genetics Meets Deep Learning & Foundation Models',
    shortTitle: 'AI Genomic Foundation Models',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Statistical Genetics · Part 10',
    level: 'Frontier Synthesis',
    readingTime: '5 min read',
    summary:
      'A visionary synthesis of statistical genetics and AI genomics — integrating sequence models (Borzoi, AlphaGenome) and genomic language models (GPN-Star) with fine-mapping priors, Stratified LDSC, neural rare variant testing, and experimental validation (MPRA/CRISPR).',
    highlights: [
      'The non-coding challenge: moving from linear additive categorical alleles to 1Mb sequence models',
      'Foundation model architectures: Borzoi (7,611 coverage tracks), AlphaGenome (1Mb context), GPN-Star',
      'In silico mutagenesis (ISM) and continuous molecular phenotyping (Δscore = f(s_alt) - f(s_ref))',
      'Functionally informed Bayesian fine-mapping with deep regulatory priors (PolyFun)',
      'Stratified LDSC with continuous neural annotations and DeepRVAT rare-variant scoring in UK Biobank',
      'Methodological pitfalls, feature attributions (Integrated Gradients), and high-throughput experimental assays (MPRA/CRISPR)',
    ],
    equations: [
      '\\Delta \\hat{\\mathbf{y}}_j = f_\\theta(\\mathbf{s}_{\\text{alt}, j}) - f_\\theta(\\mathbf{s}_{\\text{ref}, j})',
      '\\pi_j \\propto \\exp(\\boldsymbol{\\tau}^T \\Delta \\hat{\\mathbf{y}}_j)',
      "\\text{IG}_i(x) = (x_i - x_i') \\times \\int_0^1 \\frac{\\partial f_\\theta(x' + \\alpha(x-x'))}{\\partial x_i} d\\alpha",
    ],
    href: '/deep_dives/statgen-deep-learning-synthesis/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
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
    readingTime: '18 min read',
    summary:
      'A comprehensive first-principles guide to Genome-Wide Association Studies (GWAS) — from biological variation, genotyping arrays, and step-by-step QC protocols to OLS/LMM regression, ancestry PCA confounding, Linkage Disequilibrium, and clinical Polygenic Risk Scores (PRS).',
    highlights: [
      'Biological foundations: common disease–common variant (CDCV) hypothesis & HMM imputation',
      'Rigorous QC protocols: sample call rate (>98%), sex checks, heterozygosity & IBD relatedness',
      'Additive OLS & LMM regression derivations with Wald test statistics and power scaling',
      'The chopsticks problem: ancestry confounding, EIGENSTRAT PCA, λ_GC inflation & LDSC',
      "Linkage Disequilibrium blocks (r², D'), SuSiE 95% credible sets & deep learning splicing",
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
    id: 'gwas-biological-variation-cdcv',
    title:
      'The Spectrum of Genetic Variation: From Mendelian Linkage to the Common Disease–Common Variant (CDCV) Paradigm',
    shortTitle: 'Biological Variation & CDCV',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 1',
    level: 'Foundational to Advanced',
    readingTime: '8 min read',
    summary:
      'First-principles exploration of human genetic variation, the biophysics of mutation (transitions vs. transversions), Hardy-Weinberg Equilibrium derivations, and the historical paradigm shift from pedigree linkage to population-scale association.',
    highlights: [
      '3.2 Gb diploid genome variation and the 0.1% diversity landscape',
      'Biophysics of the 2:1 transition/transversion mutation bias via CpG methylation',
      'Hardy-Weinberg equilibrium derivation and Chi-square goodness-of-fit testing',
      'Logarithm of Odds (LOD) score mathematics and the failure of linkage in complex traits',
      'Common Disease–Common Variant (CDCV) hypothesis & Pritchard Omnigenic Model',
    ],
    equations: [
      'p^2 + 2pq + q^2 = 1',
      'Z(\\theta) = \\log_{10}\\left(\\frac{L(\\theta)}{L(0.5)}\\right)',
      '\\chi^2 = \\sum \\frac{(O-E)^2}{E}',
    ],
    href: '/deep_dives/gwas-biological-variation-cdcv/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-genotyping-imputation',
    title:
      'SNP Microarrays & Statistical Genotype Imputation: Hidden Markov Models and Population Reference Panels',
    shortTitle: 'Microarrays & Imputation',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 2',
    level: 'Advanced & Mathematical',
    readingTime: '7 min read',
    summary:
      'A technological and mathematical deep dive into genotyping microarrays, the tag SNP paradigm, Li & Stephens genealogical copying models, PBWT scaling, and HMM imputation across 30 million variants.',
    highlights: [
      'Infinium BeadChip hybridization chemistry and dual-wavelength fluorescence',
      'The Tag SNP paradigm capturing 90%+ genome variation via Linkage Disequilibrium',
      'Li & Stephens (2003) genealogical copying Hidden Markov Model (HMM)',
      'Positional Burrows-Wheeler Transform (PBWT) linear scaling (IMPUTE5, Beagle 5)',
      'Imputation dosage calculation and INFO score (R²_info) quality filtering',
    ],
    equations: [
      "P(S_m = k' \\mid S_{m-1} = k) = (1 - \\rho_m) + \\frac{\\rho_m}{K}",
      'G_{ij} = p_1 + 2 p_2 \\in [0.0, 2.0]',
      'R^2_{\\text{info}} = \\frac{\\text{Var}(G_j)}{2 \\hat{p}_j (1 - \\hat{p}_j)}',
    ],
    href: '/deep_dives/gwas-genotyping-imputation/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-quality-control',
    title:
      'Rigorous Quality Control (QC) Protocols in GWAS: Sample- and Variant-Level Filtering Pipelines',
    shortTitle: 'GWAS Quality Control',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 3',
    level: 'Practical & Methodological',
    readingTime: '5 min read',
    summary:
      'A step-by-step mathematical guide to quality control in genome-wide association studies: call rate thresholds, sex chromosome inbreeding metrics, heterozygosity outlier tests, cryptic relatedness via IBD, and differential missingness.',
    highlights: [
      'Two-tier sample- and variant-level filtering pipeline to eliminate batch artifacts',
      'X-chromosome inbreeding coefficient (F_inbreeding) for sex discrepancy checks',
      'Autosomal heterozygosity outlier detection (|F_het| > 3 SD) for contamination',
      'Identity-By-Descent (IBD) kinship coefficients (π̂ > 0.20) for cryptic relatedness',
      'Case-control differential missingness Fisher exact tests (p < 10⁻⁵)',
    ],
    equations: [
      'F_{\\text{inbreeding}} = \\frac{O(\\text{Hom}) - E(\\text{Hom})}{N - E(\\text{Hom})}',
      '\\hat{\\pi} = Z_2 + 0.5 Z_1',
      'F_{\\text{het}} = \\frac{N_{\\text{total}} - N_{\\text{hom}} - \\mathbb{E}[N_{\\text{het}}]}{N_{\\text{total}}}',
    ],
    href: '/deep_dives/gwas-quality-control/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-association-statistics',
    title:
      'The Mathematical Association Engine: OLS, Logistic Regression, Wald Statistics, and Statistical Power',
    shortTitle: 'Association Statistics & Power',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 4',
    level: 'Advanced & Mathematical',
    readingTime: '9 min read',
    summary:
      'A rigorous mathematical derivation of single-variant association testing: additive dosage models, the Frisch-Waugh-Lovell theorem, analytical standard errors, logistic regression MLE via IRLS, and statistical power equations.',
    highlights: [
      'Additive, dominant, recessive, and genotypic dosage encoding models',
      'Frisch-Waugh-Lovell projection matrix M_Z orthogonalizing non-genetic covariates',
      'Exact analytical standard error SE(β̂) = σ / √(2N p(1-p)) under HWE',
      'Newton-Raphson / IRLS parameter estimation for logistic regression & Odds Ratios',
      "Non-centrality parameter (NCP) power scaling and Winner's Curse correction",
    ],
    equations: [
      '\\hat{\\beta}_j = \\frac{\\text{Cov}(x_j^*, y^*)}{\\text{Var}(x_j^*)}',
      '\\text{SE}(\\hat{\\beta}_j) = \\frac{\\sigma}{\\sqrt{2 N p_j (1 - p_j)}}',
      '\\lambda = N \\cdot \\frac{2 p (1-p) \\beta^2}{\\sigma^2}',
    ],
    href: '/deep_dives/gwas-association-statistics/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-population-stratification',
    title:
      'Population Stratification Confounding: The Chopsticks Problem, Ancestry PCA, and Linear Mixed Models (LMM)',
    shortTitle: 'Population Stratification & LMMs',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 5',
    level: 'Advanced & Mathematical',
    readingTime: '7 min read',
    summary:
      'A mathematical masterclass on population stratification in GWAS: the Lander-Schork chopsticks paradox, algebraic derivation of omitted variable bias, EIGENSTRAT PCA SVD, and Linear Mixed Models (EMMAX, BOLT-LMM, Regenie).',
    highlights: [
      'Lander-Schork chopsticks paradox and algebraic proof of omitted ancestry bias',
      'EIGENSTRAT SVD decomposition of standardized genotype matrix G*',
      'Linear Mixed Model (LMM) formulation with empirical Genetic Relationship Matrix (GRM)',
      'Algorithmic scaling: from EMMAX and GEMMA to BOLT-LMM and Regenie',
      'Quantile-Quantile (Q-Q) plots and genomic inflation factor (λ_GC) diagnostics',
    ],
    equations: [
      '\\mathbb{E}[\\hat{\\beta}_{\\text{naive}}] = \\beta_j + \\gamma_A \\cdot \\frac{\\text{Cov}(X_j, A)}{\\text{Var}(X_j)}',
      '\\mathbf{G}^* = \\mathbf{U} \\mathbf{\\Sigma} \\mathbf{V}^T',
      '\\mathbf{y} = \\mathbf{X}\\boldsymbol{\\beta} + \\mathbf{u} + \\boldsymbol{\\epsilon}, \\; \\mathbf{u} \\sim \\mathcal{N}(0, \\sigma_g^2 \\mathbf{K})',
    ],
    href: '/deep_dives/gwas-population-stratification/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-multiple-testing-manhattan',
    title:
      'Multiple Hypothesis Testing, Family-Wise Error Rate, and the Genome-Wide Significance Threshold',
    shortTitle: 'Multiple Testing & Manhattan Plot',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 6',
    level: 'Advanced & Mathematical',
    readingTime: '6 min read',
    summary:
      'A mathematical derivation of the universal genome-wide significance threshold (p < 5e-8): spectral decomposition of LD correlation matrices, effective test counts (M_eff), Bonferroni bounds, and Manhattan plot geometry.',
    highlights: [
      'The multiple testing crisis: testing 10⁶ nulls produces 50,000 false positives',
      'Bonferroni inequality and Family-Wise Error Rate (FWER) control',
      'Spectral decomposition of LD matrix yielding M_eff ≈ 10⁶ independent blocks',
      'Exact derivation: α_GWAS = 0.05 / 10⁶ = 5 × 10⁻⁸ (-log₁₀ P = 7.301)',
      'Multi-ancestry thresholds (African cohorts requiring p < 2.5 × 10⁻⁸)',
    ],
    equations: [
      '\\alpha_{\\text{GWAS}} = \\frac{0.05}{M_{\\text{eff}}} = 5 \\times 10^{-8}',
      'M_{\\text{eff}} = 1 + (M-1)\\left(1 - \\frac{\\text{Var}(\\boldsymbol{\\lambda})}{M}\\right)',
      'k = \\max\\{ i : p_{(i)} \\le \\frac{i}{M} q^* \\}',
    ],
    href: '/deep_dives/gwas-multiple-testing-manhattan/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-linkage-disequilibrium-ldsc',
    title: 'Linkage Disequilibrium (LD), Haplotype Architecture, and LD Score Regression (LDSC)',
    shortTitle: 'Linkage Disequilibrium & LDSC',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 7',
    level: 'Advanced & Mathematical',
    readingTime: '7 min read',
    summary:
      "A mathematical and population-genetics masterclass on Linkage Disequilibrium: D, D', r² formulas, PRDM9 recombination hotspots, and the complete mathematical proof of LD Score Regression (LDSC & S-LDSC).",
    highlights: [
      'Biological crossing over, PRDM9 13-mer hotspots, and meiotic LD decay',
      "Mathematical formulas for D, Lewontin's D', and Pearson r²",
      'Why λ_GC fails to separate polygenicity from confounding in biobanks',
      'Full mathematical proof of LD Score Regression expectation E[χ²_j]',
      'Cross-trait bivariate LDSC (genetic correlation r_g) and Stratified LDSC (τ*)',
    ],
    equations: [
      'r^2 = \\frac{D^2}{p_A (1-p_A) p_B (1-p_B)}',
      '\\mathbb{E}[\\chi^2_j \\mid \\ell_j] = 1 + \\frac{N h^2}{M} \\ell_j + N a',
      '\\ell_j = \\sum_{k=1}^M r^2_{jk}',
    ],
    href: '/deep_dives/gwas-linkage-disequilibrium-ldsc/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-fine-mapping-functional-genomics',
    title: 'Post-GWAS Fine-Mapping: 95% Credible Sets, Bayesian Priors, and Epigenomic Annotations',
    shortTitle: 'Fine-Mapping & Functional Biology',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 8',
    level: 'Advanced & Mathematical',
    readingTime: '5 min read',
    summary:
      'An advanced guide to statistical fine-mapping: Wakefield Approximate Bayes Factors, Posterior Inclusion Probabilities (PIPs), SuSiE Sum of Single Effects, PolyFun/Sniff functional priors, and eQTL colocalization.',
    highlights: [
      'Post-GWAS attribution problem across non-coding LD blocks',
      'Wakefield Approximate Bayes Factor (ABF) and Posterior Inclusion Probability (PIP)',
      'SuSiE Sum of Single Effects via Iterative Bayesian Stepwise Selection (IBSS)',
      '95% Credible Sets (CS_95%) guaranteeing single-nucleotide causal capture',
      'Functionally informed priors (PolyFun, Sniff) & eQTL colocalization (coloc PP_4)',
    ],
    equations: [
      '\\text{ABF}_j = \\sqrt{\\frac{V_j}{V_j + W}} \\exp\\left( \\frac{z_j^2}{2} \\frac{W}{V_j + W} \\right)',
      '\\text{PIP}_j = \\frac{\\text{ABF}_j \\pi_j}{\\sum \\text{ABF}_k \\pi_k}',
      '\\mathbf{y} = \\sum_{l=1}^L \\mathbf{X} \\mathbf{b}_l + \\boldsymbol{\\epsilon}',
    ],
    href: '/deep_dives/gwas-fine-mapping-functional-genomics/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'gwas-polygenic-risk-scores-prs',
    title:
      'Polygenic Risk Scores (PRS): Methodology, Clinical Liability Thresholds, and Cross-Ancestry Portability',
    shortTitle: 'Polygenic Risk Scores (PRS)',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'GWAS Foundations · Part 9',
    level: 'Translational & Clinical',
    readingTime: '6 min read',
    summary:
      "A clinical and mathematical masterclass on Polygenic Risk Scores (PRS): Bayesian shrinkage models (LDpred2, PRS-CS), Falconer's liability threshold model, monogenic risk equivalence, and multi-ancestry PRS-CSx.",
    highlights: [
      'PRS formulation aggregating thousands of marginal effect weights',
      'Clumping & Thresholding (C+T) vs. Bayesian shrinkage (LDpred2, PRS-CS, SBayesR)',
      "Falconer's continuous liability threshold model & heritability conversion",
      'Clinical risk stratification: top 5% PRS conferring monogenic-equivalent risk',
      'Cross-ancestry portability crisis and multi-ancestry solutions (PRS-CSx)',
    ],
    equations: [
      '\\text{PRS}_i = \\sum_{j=1}^M \\hat{w}_j G_{ij}',
      'T = \\Phi^{-1}(1 - K)',
      'h^2_L = h^2_{\\text{obs}} \\cdot \\frac{K^2 (1-K)^2}{z^2 P (1-P)}',
    ],
    href: '/deep_dives/gwas-polygenic-risk-scores-prs/',
    badge: 'Deep Dive Post',
    actionText: 'Read concept deep dive',
    featured: false,
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
