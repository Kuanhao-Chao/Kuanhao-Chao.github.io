/**
 * Centralized Algorithms Catalog & Taxonomy Data Module.
 * Single source of truth for /algorithms/, /teaching/, and homepage showcase.
 */

export interface AlgorithmCategory {
  slug:
    | 'all'
    | 'alignment'
    | 'assembly'
    | 'indexing'
    | 'probabilistic'
    | 'deep-learning'
    | 'statistical-genetics';
  label: string;
}

export interface AlgorithmEntry {
  id: string;
  title: string;
  shortTitle?: string;
  area: string;
  category:
    | 'alignment'
    | 'assembly'
    | 'indexing'
    | 'probabilistic'
    | 'deep-learning'
    | 'statistical-genetics';
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

export const ALGORITHM_LEARNING_PATHS = [
  {
    title: 'Align and map',
    foundation:
      'Start with prefix dynamic programming, then compare sparse work and seed-based mapping.',
    ids: ['pairwise', 'wfa', 'duel', 'minimap2'],
  },
  {
    title: 'Index and assemble',
    foundation:
      'Distinguish exact search from graph reconstruction, and preserve uncertainty at repeats.',
    ids: ['fm-index', 'debruijn', 'string-graph'],
  },
  {
    title: 'Model sequence structure',
    foundation:
      'Learn emitting/silent states before explicit durations, coding context and perturbation.',
    ids: ['phmm', 'ghmm', 'ism'],
  },
  {
    title: 'Associate and predict',
    foundation:
      'Regression and uncertainty connect cohort association, LD and independent validation.',
    ids: ['gwas'],
  },
] as const;

export const ALGORITHMS: AlgorithmEntry[] = [
  {
    id: 'minimap2',
    title: 'Minimizer Sampling & Collinear DP Chaining',
    shortTitle: 'Minimizers & Chaining',
    area: 'Seed Sampling & Long-Read Mapping',
    category: 'indexing',
    tag: 'Minimap2-inspired teaching core',
    summary:
      'Inspect every k-mer window, exact shared seed and predecessor candidate; understand overlap-aware reward and chain traceback before base-level alignment.',
    blurb: 'Window minimizers, repeat anchors and overlap-aware chaining.',
    timeComplexity: 'O(Lw + UₜUᵩ + A²)',
    spaceComplexity: 'O(L + A²) with trace',
    keyMechanism: 'Sampling → anchoring → exhaustive chaining',
    highlights: [
      'Every window winner and rejected predecessor is explained',
      'Seeds use a disclosed forward-strand teaching hash',
      'A chain is not a base alignment or a mapping-quality estimate',
    ],
    cliCommand: 'minimap2',
    featured: true,
    href: '/algorithms/minimap2/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'fm-index',
    title: 'FM-Index & BWT Backward Search',
    shortTitle: 'FM-Index / BWT',
    area: 'Indexing & Exact Matching',
    category: 'indexing',
    tag: 'Count before locate',
    summary:
      'Construct the suffix/BWT teaching table, count exact matches with rank, and locate coordinates through LF walks to suffix-position samples.',
    blurb: 'BWT construction, interval counting and sampled LF locating.',
    timeComplexity: 'Count O(P); locate O(occ·d)',
    spaceComplexity: 'Dense teaching tables O(N² + N|Σ|)',
    keyMechanism: 'Inclusive intervals & suffix-position samples',
    highlights: [
      'Character-by-character backward-search interval updates',
      'Actual LF hops reach sampled suffix positions',
      'Dense construction is distinguished from compressed production indexing',
    ],
    cliCommand: 'fmindex AGCTA',
    featured: true,
    href: '/algorithms/fm-index/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'gwas',
    title: 'GWAS: Cohort-Derived Association, PCA & LD',
    shortTitle: 'GWAS & Statistical Genetics',
    area: 'Statistical & Population Genetics',
    category: 'statistical-genetics',
    tag: 'Seeded quantitative cohort',
    summary:
      'Fit every association on actual seeded individuals, jointly adjust genotype PCs, recompute measured lead LD, and evaluate a training-only score on independent samples.',
    blurb: 'Actual cohort OLS, genotype PCA, measured LD and independent prediction.',
    timeComplexity: 'OLS O(MNC²); PCA O(N²M)',
    spaceComplexity: 'O(NM + N²)',
    keyMechanism: 'Joint QR regression & genotype-derived diagnostics',
    highlights: [
      'Student-t tests use actual N and design rank',
      'Lead selection recomputes sample dosage r², not fine-mapping',
      'Independent prediction tests keep outcomes outside training',
    ],
    cliCommand: 'gwas',
    href: '/algorithms/gwas/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'pairwise',
    title: 'Global, Local & Fitting Pairwise Alignment',
    shortTitle: 'Pairwise Alignment',
    area: 'Sequence Alignment & Dynamic Programming',
    category: 'alignment',
    tag: 'Boundary rules & affine states',
    summary:
      'Learn how boundaries and endpoints define the task, compare linear and affine gaps, and inspect state-aware traceback and reconstructed score contributions.',
    blurb: 'Global/local/fitting DP, affine gap states and score verification.',
    timeComplexity: 'O(mn)',
    spaceComplexity: 'O(mn) full tables',
    keyMechanism: 'Prefix DP & state-aware traceback',
    highlights: [
      'Explicit global, local and fitting boundary conventions',
      'Separate gap-open and gap-extension states',
      'Ties may yield multiple optima; traceback is rescored',
    ],
    cliCommand: 'align ACGTAGCTA ACGTCGCTA',
    featured: true,
    href: '/algorithms/pairwise/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'phmm',
    title: 'Profile HMMs: Viterbi & Forward–Backward',
    shortTitle: 'Profile HMMs',
    area: 'Probabilistic Sequence Models',
    category: 'probabilistic',
    tag: 'Normalized global M/I/D core',
    summary:
      'Estimate profile emissions, follow silent deletions and emitting insertions, and compare one best path with all-path probability and conditional occupancy.',
    blurb: 'A disclosed global profile core, not full HMMER Plan7.',
    timeComplexity: 'O(NK)',
    spaceComplexity: 'O(NK) full inference tables',
    keyMechanism: 'Max versus log-sum-exp on the same model',
    highlights: [
      'Fixed transition priors and terminal probabilities are disclosed',
      'Forward and Backward agree at Begin',
      'Match plus insertion posteriors normalize per query residue',
    ],
    cliCommand: 'phmm TATAAA',
    featured: true,
    href: '/algorithms/phmm/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
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
    area: 'Exact Affine Sequence Alignment',
    category: 'alignment',
    tag: 'Furthest-reaching diagonals',
    summary:
      'Follow real gap/mismatch frontier updates, zero-penalty match extensions and state-aware traceback; count letter comparisons separately from stored updates.',
    blurb: 'Exact affine wavefronts; free score extension still costs comparisons.',
    timeComplexity: 'Original WFA O(n·s); identity O(n)',
    spaceComplexity: 'O(s²) frontier + teaching trace',
    keyMechanism: 'Penalty-indexed M/I/D wavefronts',
    highlights: [
      'Every frontier-journal row is an actual engine event',
      'Mismatch and gap candidates respect valid sequence coordinates',
      'No manufactured wall-clock speedups or silently incomplete traceback',
    ],
    cliCommand: 'wfa ACGTAGCTA ACGTCGCTA',
    href: '/algorithms/wfa/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'duel',
    title: 'Affine DP vs WFA: Compare the Same Objective',
    shortTitle: 'DP vs WFA',
    area: 'Alignment Methods & Work Accounting',
    category: 'alignment',
    tag: 'Operation comparison, not a benchmark',
    summary:
      'Compare affine DP and WFA using equivalent scoring and endpoints, synchronize actual computation events, and distinguish cells, state updates and character comparisons.',
    blurb: 'Same-objective comparison with honest operation units.',
    timeComplexity: 'DP O(mn); WFA O(n·s)',
    spaceComplexity: 'DP O(mn); WFA O(s²)',
    keyMechanism: 'Equivalent objective & separate counters',
    highlights: [
      'Both methods minimize the same affine penalty',
      'Partial counters follow actual computation prefixes',
      'Browser animation duration does not measure algorithm runtime',
    ],
    cliCommand: 'duel',
    href: '/algorithms/duel/',
    badge: 'Interactive Comparison',
    actionText: 'Explore lesson',
  },
  {
    id: 'debruijn',
    title: 'De Bruijn Graphs: Multiplicity, Coverage & Unitigs',
    shortTitle: 'De Bruijn Graphs',
    area: 'Assembly Graphs & Traversals',
    category: 'assembly',
    tag: 'Ideal multiset versus observed reads',
    summary:
      'Build k-mer edges, trace Hierholzer’s real stack, preserve ambiguous unitigs, and preview conservative cleaning without confusing read support with genome copies.',
    blurb: 'Real Euler traversal, observed support and reversible cleaning.',
    timeComplexity: 'Traversal O(V + E_copies)',
    spaceComplexity: 'Graph O(V+E), plus trace',
    keyMechanism: 'Edge-centric spelling & conservative topology',
    highlights: [
      'Ideal edge copies are separated from read coverage',
      'Disconnected cycles and equal-support bubbles are retained',
      'Cleaning is reversible and cannot certify an error or resolve an allele',
    ],
    cliCommand: 'debruijn TAATGCCATGGGATGTT',
    href: '/algorithms/debruijn/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'string-graph',
    title: 'Exact String Graphs & Read Layout',
    shortTitle: 'String Graphs & Layout',
    area: 'Read Overlap & Assembly',
    category: 'assembly',
    tag: 'Label-aware teaching reduction',
    summary:
      'Keep whole reads, retain duplicate representatives, compare direct and indirect edge spellings, and place reads exactly within nonbranching unitigs.',
    blurb: 'Exact overlaps, equivalent shortcut witnesses and read placements.',
    timeComplexity: 'Toy O(R²L² + R³L)',
    spaceComplexity: 'O(RL + E), plus witnesses',
    keyMechanism: 'Equivalent shift and extension, then exact layout',
    highlights: [
      'A triangle alone does not justify deleting a shortcut',
      'Cycles, isolated reads and contained-read records remain inspectable',
      'Exact path spelling is not noisy-read consensus or full Myers reduction',
    ],
    cliCommand: 'stringgraph',
    href: '/algorithms/string-graph/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'ghmm',
    title: 'Semi-Markov Gene Grammar & Coding Frame',
    shortTitle: 'GHMM Gene Finding',
    area: 'Gene-Finding Concepts',
    category: 'probabilistic',
    tag: 'Restricted complete-gene scorer',
    summary:
      'Inspect bounded duration candidates, canonical intronic GT–AG boundaries, partial codons across exon junctions, and complete start-to-stop traceback.',
    blurb: 'Explicit durations, splice boundaries and inherited coding context.',
    timeComplexity: 'Toy O(LD²|E|)',
    spaceComplexity: 'O(L|Q| + candidate trace)',
    keyMechanism: 'Semi-Markov segments with partial-codon context',
    highlights: [
      'Normalized bounded duration and transition terms',
      'Actual pending bases survive introns; internal stops are rejected',
      'Handcrafted rewards are not calibrated sequence likelihoods',
    ],
    cliCommand: 'gene',
    href: '/algorithms/ghmm/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'ism',
    title: 'Synthetic In Silico Mutagenesis (ISM)',
    shortTitle: 'In Silico Mutagenesis',
    area: 'Model Perturbation & Splice Motifs',
    category: 'deep-learning',
    tag: 'Transparent synthetic scorer',
    summary:
      'Inspect every handwritten model weight, calculate signed single-base score changes, and preview, apply, undo or reset mutations explicitly.',
    blurb: 'Synthetic score sensitivity; no neural checkpoint or clinical inference.',
    timeComplexity: '(3L+1) model calls; O(LC)',
    spaceComplexity: 'O(L) results',
    keyMechanism: 'Fixed target, signed Δ and reversible reference changes',
    highlights: [
      'Reference cells are zero and not recomputed',
      'Mean absolute Δ includes both loss and gain',
      'No pretrained inference, calibrated pathogenicity or causal claim',
    ],
    cliCommand: 'ism',
    href: '/algorithms/ism/',
    badge: 'Educational Lesson',
    actionText: 'Explore lesson',
  },
  {
    id: 'shorkie-lab',
    title: 'Shorkie & Shorkie_LM In-Browser Neural Interpretability Lab',
    shortTitle: 'Shorkie Lab',
    area: 'Fungal Regulatory Genomics & DNA Language Models',
    category: 'deep-learning',
    tag: 'Shorkie / Shorkie_LM',
    summary:
      'Interactive in-browser neural interpretability for Shorkie (fine-tuned expression model: 16,384 bp → 896 bins × 5,215 tracks) and Shorkie_LM (masked DNA language model on 165 genomes). Compare feature attributions, layer activations, occlusions, and zero-shot sequence constraint.',
    blurb: 'In-browser attribution, occlusion, layer traceback & zero-shot constraint.',
    timeComplexity: 'O(3 · L · d)',
    spaceComplexity: 'O(4 · L)',
    keyMechanism: 'Multi-Method Feature Attribution & Sequence Constraint',
    highlights: [
      'Five attribution methods (mutagenesis/ISM, gradient × input, integrated gradients, attention rollout, occlusion)',
      'Layer traceback and occlusion mapping across the Shorkie convolutional-transformer trunk',
      'Zero-shot sequence constraint and information content from 165-genome masked DNA LM',
    ],
    href: '/shorkie-lab/',
    badge: 'Interactive Lab',
    actionText: 'Launch Shorkie Lab',
    cliCommand: 'shorkielab',
  },
];
