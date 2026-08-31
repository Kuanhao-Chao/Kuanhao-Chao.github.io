/**
 * Centralized Algorithms Catalog & Taxonomy Data Module.
 * Single source of truth for /algorithms/, /teaching/, and homepage showcase.
 */

export interface AlgorithmCategory {
  slug: 'all' | 'alignment' | 'assembly' | 'indexing' | 'probabilistic' | 'deep-learning' | 'statistical-genetics';
  label: string;
}

export interface AlgorithmEntry {
  id: string;
  title: string;
  shortTitle?: string;
  area: string;
  category: 'alignment' | 'assembly' | 'indexing' | 'probabilistic' | 'deep-learning' | 'statistical-genetics';
  tag: string;
  summary: string;
  blurb?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  keyMechanism?: string;
  highlights?: string[];
  href: string;
  badge?: string;
  actionText: string;
  cliCommand?: string;
  featured?: boolean;
}

export const ALGORITHM_CATEGORIES: AlgorithmCategory[] = [
  { slug: 'all', label: 'All' },
  { slug: 'alignment', label: 'Sequence Alignment' },
  { slug: 'assembly', label: 'Genome Assembly' },
  { slug: 'indexing', label: 'Indexing & Matching' },
  { slug: 'probabilistic', label: 'Probabilistic & Gene Finding' },
  { slug: 'deep-learning', label: 'Deep Learning' },
  { slug: 'statistical-genetics', label: 'Statistical Genetics' },
];

export const ALGORITHMS: AlgorithmEntry[] = [
  {
    id: 'minimap2',
    title: 'Minimizer Sampling & Collinear DP Chaining',
    shortTitle: 'Minimap2 Chaining',
    area: 'Long-Read Alignment & Indexing',
    category: 'indexing',
    tag: 'Minimap2 Core',
    summary:
      'High-throughput long-read alignment indexing using (w, k)-minimizers. Explore sliding hash windows, 2D anchor dot-plot matching, and dynamic programming collinear chaining.',
    blurb: '(w, k)-minimizer DP anchor chaining for long-read alignment.',
    timeComplexity: 'O(N + M + K log K)',
    spaceComplexity: 'O(N)',
    keyMechanism: '(w, k)-Minimizer Sampling & Collinear DP',
    highlights: [
      'Sliding window minimizers reduce genomic index footprint by ~10–20×',
      'Exact 2D anchor dot-plot matching with non-linear gap penalties',
      'Collinear dynamic programming chains anchor seeds into high-confidence alignments',
    ],
    href: '/algorithms/minimap2/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'minimap2',
    featured: true, // 1/4 Featured Homepage Selection
  },
  {
    id: 'fm-index',
    title: 'FM-Index & BWT Backward Search',
    shortTitle: 'FM-Index / BWT',
    area: 'Indexing & Exact Matching',
    category: 'indexing',
    tag: 'Bowtie / BWA Core',
    summary:
      'Burrows-Wheeler Transform with Last-to-First (LF) mapping and occurrence counting for sub-linear query matching across gigabase reference genomes.',
    blurb: 'Burrows-Wheeler transform with LF-mapping for sublinear search.',
    timeComplexity: 'O(P + occ)',
    spaceComplexity: 'O(T · log Σ)',
    keyMechanism: 'BWT & Last-to-First (LF) Mapping',
    highlights: [
      'Permutes text with BWT to compress repetitive genomic sequence',
      'LF-mapping backward search resolves exact pattern queries without text scanning',
      'Sampled occurrence rank tables achieve sub-linear O(P) query time',
    ],
    href: '/algorithms/fm-index/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'fmindex AGCTA',
    featured: true, // 2/4 Featured Homepage Selection
  },
  {
    id: 'gwas',
    title: 'Genome-Wide Association Studies & Statistical Genetics (GWAS)',
    shortTitle: 'GWAS & Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'PLINK / BOLT-LMM Core',
    summary:
      'Identify genotype-phenotype associations across millions of genetic variants. Explore single-variant OLS regression, population stratification PCA correction, Manhattan & Q-Q plots, Linkage Disequilibrium (LD) fine-mapping, and Polygenic Risk Scores (PRS).',
    blurb: 'Genome-wide association scans, OLS regression, PCA confounding & LD fine-mapping.',
    timeComplexity: 'O(N · M)',
    spaceComplexity: 'O(N + M)',
    keyMechanism: 'Single-Variant OLS/LMM Regression & LD Fine-Mapping',
    highlights: [
      'Additive dosage OLS regression y = α + x·β + Z·γ with Wald test statistics',
      'Population stratification correction using Ancestry PCA covariates or Linear Mixed Models (LMM)',
      'Interactive Manhattan plot (p < 5 × 10⁻⁸ threshold), Q-Q plot (λ_GC), and LocusZoom LD r² fine-mapping',
    ],
    href: '/algorithms/gwas/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'gwas t2d',
  },
  {
    id: 'pairwise',
    title: 'Needleman-Wunsch & Smith-Waterman Alignment',
    shortTitle: 'Pairwise Alignment',
    area: 'Sequence Alignment & Dynamic Programming',
    category: 'alignment',
    tag: 'Global & Local DP',
    summary:
      'Exact 2D dynamic programming pairwise sequence alignment supporting global (Needleman-Wunsch), local (Smith-Waterman), and Gotoh affine gap penalties.',
    blurb: 'Global (NW) and local (SW) exact 2D dynamic programming with affine gap scoring.',
    timeComplexity: 'O(MN)',
    spaceComplexity: 'O(MN)',
    keyMechanism: '2D Dynamic Programming & Traceback',
    highlights: [
      'Exact global (Needleman-Wunsch) and local (Smith-Waterman) alignment',
      'Gotoh 3-state affine gap scoring (gap open + gap extend penalties)',
      'Optimal back-pointer matrix traversal for unambiguous alignment reconstruction',
    ],
    href: '/algorithms/pairwise/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'align ACGTAGCTA ACGTCGCTA',
    featured: true, // 3/4 Featured Homepage Selection
  },
  {
    id: 'phmm',
    title: 'Profile Hidden Markov Models (pHMMs)',
    shortTitle: 'Profile HMMs',
    area: 'Probabilistic Models & Gene Finding',
    category: 'probabilistic',
    tag: 'Plan 7 Architecture',
    summary:
      'Model conserved biological domains and sequence families with insertion/deletion tolerance. Explore Viterbi optimal decoding, Forward-Backward posteriors, and Plan 7 topology.',
    blurb: 'Plan 7 domain modeling, Viterbi decoding & posterior state probabilities.',
    timeComplexity: 'O(N · M)',
    spaceComplexity: 'O(N · M)',
    keyMechanism: 'Plan 7 Topology & Probabilistic Decoding',
    highlights: [
      'Match (M), Insert (I), and Delete (D) states model conserved protein & DNA motifs',
      'Viterbi dynamic programming decoding recovers optimal hidden state paths',
      'Forward-Backward algorithm computes exact residue-by-residue posterior probabilities',
    ],
    href: '/algorithms/phmm/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'phmm TATAAA',
    featured: true, // 4/4 Featured Homepage Selection
  },
  {
    id: 'wgt',
    title: 'Wheeler Graph Ordering & Recognition (Wheelie)',
    shortTitle: 'Wheeler Graphs',
    area: 'Pangenomics & Graph Indexing',
    category: 'indexing',
    tag: 'Graph Indexing',
    summary:
      'Algorithms for recognizing and sorting Wheeler graph topologies, generalizing BWT-style index search to pangenomic reference variation graphs.',
    blurb: 'Sorting and recognition algorithms for pangenome graph indexes.',
    timeComplexity: 'O(|V| + |E|)',
    spaceComplexity: 'O(|V| + |E|)',
    keyMechanism: 'Co-Lexicographic Node Ordering',
    highlights: [
      'Total ordering of graph vertices enabling BWT-style indexed search on graphs',
      'Polynomial-time Wheeler graph recognition and co-lexicographic sorting',
      'Foundational data structure for indexing complex pangenome variation graphs',
    ],
    href: '/posts/wgt/',
    badge: 'Deep Dive & Post',
    actionText: 'Read deep dive & interactive demo',
  },
  {
    id: 'wfa',
    title: 'Wavefront Alignment Algorithm (WFA)',
    shortTitle: 'Wavefront Alignment',
    area: 'Ultra-Fast Sequence Alignment',
    category: 'alignment',
    tag: 'O(s · d) Exact Alignment',
    summary:
      'Exact gap-affine pairwise alignment running in O(s · d) time. Explore diagonal wavefront frontier expansion, free Longest Common Prefix (LCP) extensions, and matrix pruning.',
    blurb: 'Exact gap-affine alignment running in O(s · d) time via diagonal wavefronts.',
    timeComplexity: 'O(s · d)',
    spaceComplexity: 'O(s²)',
    keyMechanism: 'Diagonal Wavefronts & Free LCP Extensions',
    highlights: [
      'Computes only reachable alignment wavefront diagonals instead of full O(MN) matrices',
      'Free Longest Common Prefix (LCP) extensions skip identical nucleotide stretches',
      'Achieves 10–100× speedups on high-identity long-read alignments',
    ],
    href: '/algorithms/wfa/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'wfa ACGTAGCTA ACGTCGCTA',
  },
  {
    id: 'duel',
    title: 'Algorithm Duel: Needleman-Wunsch DP vs Wavefront Alignment (WFA)',
    shortTitle: 'Algorithm Duel (NW vs WFA)',
    area: 'Comparative Benchmark & Stepper',
    category: 'alignment',
    tag: 'O(N²) DP vs O(s·d) WFA',
    summary:
      'Head-to-head performance duel and synchronized pseudocode debugger comparing classical O(N²) dynamic programming against diagonal Wavefront Alignment (WFA).',
    blurb: 'Head-to-head performance race and pseudocode debugger comparing DP vs WFA.',
    timeComplexity: 'O(s · d) vs O(MN)',
    spaceComplexity: 'O(s²) vs O(MN)',
    keyMechanism: 'Synchronized Stepper & Telemetry Racing',
    highlights: [
      'Live cell computation counter tracking exact work reduction in real time',
      'Synchronized side-by-side pseudocode line-by-line stepping',
      'Inspect DP recurrence variables (i, j) vs WFA wavefronts (s, k, LCP)',
    ],
    href: '/algorithms/duel/',
    badge: 'Benchmark & Duel',
    actionText: 'Enter benchmark arena',
    cliCommand: 'duel',
  },
  {
    id: 'debruijn',
    title: 'De Bruijn Graph (Eulerian Path Genome Assembly)',
    shortTitle: 'De Bruijn Assembly',
    area: 'Genome Assembly & Graph Traversals',
    category: 'assembly',
    tag: 'Hierholzer Traversal',
    summary:
      'Deconstruct sequencing reads into (k-1)-mer nodes and directed k-mer edges. Explore O(E) Eulerian path assembly, tip clipping, bubble popping, and unitig compaction.',
    blurb: 'Eulerian path de novo genome assembly and graph cleaning heuristics.',
    timeComplexity: 'O(E)',
    spaceComplexity: 'O(N)',
    keyMechanism: 'Hierholzer Eulerian Path & Graph Pruning',
    highlights: [
      'Deconstructs reads into (k-1)-mer nodes with directed k-mer overlap edges',
      'Hierholzer algorithm finds Eulerian paths in linear O(E) time for de novo assembly',
      'Automated heuristics: dead-end tip clipping, heterozygous bubble popping, and unitig compaction',
    ],
    href: '/algorithms/debruijn/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'debruijn TAATGCCATGGGATGTT',
  },
  {
    id: 'string-graph',
    title: 'String Graphs & Overlap-Layout-Consensus (OLC)',
    shortTitle: 'String Graphs & OLC',
    area: 'Long-Read Genome Assembly',
    category: 'assembly',
    tag: 'Myers Transitive Reduction',
    summary:
      'Long-read exact prefix-suffix overlap graphs without k-mer chopping. Explore Myers’ O(V+E) transitive reduction, contained read pruning, and read tiling layout.',
    blurb: "Myers' O(V+E) transitive reduction and layout for long-read assembly.",
    timeComplexity: 'O(V + E)',
    spaceComplexity: 'O(V + E)',
    keyMechanism: "Myers' Transitive Reduction & Layout",
    highlights: [
      'Prefix-suffix overlap graphs preserve full read context without k-mer chopping',
      "Myers' O(V+E) algorithm strips all transitively redundant graph edges",
      'Identifies unambiguous read tiling paths and prunes contained sequencing reads',
    ],
    href: '/algorithms/string-graph/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'stringgraph',
  },
  {
    id: 'ghmm',
    title: 'Generalized Hidden Markov Models (GHMMs)',
    shortTitle: 'GHMM Gene Finding',
    area: 'Ab Initio Gene Finding',
    category: 'probabilistic',
    tag: 'Semi-Markov Gene Finding',
    summary:
      'Predict exon-intron structures, splice junctions, and protein-coding CDS using explicit duration distributions f(d) and semi-Markov dynamic programming (GENSCAN / AUGUSTUS).',
    blurb: 'Semi-Markov dynamic programming with explicit biological length models f(d).',
    timeComplexity: 'O(L · D · |S|)',
    spaceComplexity: 'O(L · |S|)',
    keyMechanism: 'Semi-Markov DP with Duration Curves f(d)',
    highlights: [
      'Explicit duration probability distributions f(d) model real biological exon and intron lengths',
      "Integrated 5' donor, 3' acceptor, and Start/Stop codon signal sensors",
      'Ab initio eukaryotic gene structure prediction (GENSCAN / AUGUSTUS core)',
    ],
    href: '/algorithms/ghmm/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'gene',
  },
  {
    id: 'ism',
    title: 'In Silico Mutagenesis & Splice Deep Learning (ISM)',
    shortTitle: 'In Silico Mutagenesis (ISM)',
    area: 'Deep Learning & Variant Interpretation',
    category: 'deep-learning',
    tag: 'OpenSpliceAI / Splam Core',
    summary:
      'Interpret neural splice models (OpenSpliceAI / Splam) with 4×L in silico single-nucleotide mutation matrices, ΔScore predictions, and position-wise importance sequence logos.',
    blurb: 'Neural 4×L mutation heatmaps, ΔScore variant effects & importance logos.',
    timeComplexity: 'O(4 · L · W)',
    spaceComplexity: 'O(4 · L)',
    keyMechanism: 'In Silico Mutagenesis & Neural ΔScore Evaluation',
    highlights: [
      'Systematic 4×L single-nucleotide substitutions calculate ΔScore = P_mut - P_ref',
      'Dynamic importance sequence logo highlights critical spliceosome binding motifs',
      'Interprets neural deep learning architectures (OpenSpliceAI & Splam)',
    ],
    href: '/algorithms/ism/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'ism',
  },
  {
    id: 'shorkie-lab',
    title: 'Shorkie & Shorkie_LM In-Browser Neural Interpretability Lab',
    shortTitle: 'Shorkie Lab',
    area: 'Fungal Regulatory Genomics & DNA Language Models',
    category: 'deep-learning',
    tag: 'Shorkie / Shorkie_LM',
    summary:
      'Interactive in-browser neural interpretability for Shorkie (fine-tuned expression model: 16,384 bp → 896 bins × 5,215 tracks) and Shorkie_LM (masked DNA language model on 165 genomes). Compare feature attributions, layer activations, occlusions, and zero-shot sequence constraint in real-time.',
    blurb: 'In-browser attribution, occlusion, layer traceback & zero-shot constraint.',
    keyMechanism: 'Multi-Method Feature Attribution & Sequence Constraint',
    highlights: [
      'Five attribution methods (Saliency, Input × Gradient, SmoothGrad, Integrated Gradients, ISM)',
      'Layer traceback and occlusion mapping across the Shorkie convolutional-transformer trunk',
      'Zero-shot sequence constraint and information content from 165-genome masked DNA LM',
    ],
    href: '/shorkie-lab/',
    badge: 'Interactive Lab',
    actionText: 'Launch Shorkie Lab',
    cliCommand: 'shorkielab',
  },
];
