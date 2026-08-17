/**
 * Centralized Algorithms Catalog & Taxonomy Data Module.
 * Single source of truth for /algorithms/, /teaching/, and homepage showcase.
 */

export interface AlgorithmCategory {
  slug: 'all' | 'alignment' | 'assembly' | 'indexing' | 'probabilistic' | 'deep-learning';
  label: string;
}

export interface AlgorithmEntry {
  id: string;
  title: string;
  shortTitle?: string;
  area: string;
  category: 'alignment' | 'assembly' | 'indexing' | 'probabilistic' | 'deep-learning';
  tag: string;
  summary: string;
  blurb?: string;
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
    href: '/algorithms/minimap2/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    featured: true,
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
    href: '/algorithms/fm-index/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
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
    href: '/posts/wgt/',
    badge: 'Deep Dive & Post',
    actionText: 'Read deep dive & interactive demo',
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
    href: '/algorithms/pairwise/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'align ACGTAGCTA ACGTCGCTA',
    featured: true,
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
    href: '/algorithms/duel/',
    badge: 'Benchmark & Duel',
    actionText: 'Enter benchmark arena',
    cliCommand: 'duel',
    featured: true,
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
    href: '/algorithms/debruijn/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'debruijn TAATGCCATGGGATGTT',
    featured: true,
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
    href: '/algorithms/string-graph/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'stringgraph',
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
    href: '/algorithms/phmm/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'phmm TATAAA',
    featured: true,
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
    href: '/algorithms/ism/',
    badge: 'Interactive Visualizer',
    actionText: 'Launch interactive visualizer',
    cliCommand: 'ism',
    featured: true,
  },
];
