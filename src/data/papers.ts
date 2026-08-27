/**
 * Centralized Computational Genomics & ML Paper Summaries Catalog.
 * Single source of truth for /papers/ hub and related navigation.
 * All pages under /papers/ are non-indexable (noindex, nofollow).
 */

export interface PaperCategory {
  slug: 'all' | 'fine-mapping' | 'peft' | 'gene-regulation' | 'evolutionary-models' | 'deep-learning';
  label: string;
}

export interface PaperEntry {
  id: string;
  title: string;
  shortTitle?: string;
  authors: string[];
  affiliation: string;
  venue: string;
  year: number;
  doi: string;
  doiUrl: string;
  area: string;
  category: 'fine-mapping' | 'peft' | 'gene-regulation' | 'evolutionary-models' | 'deep-learning';
  tag: string;
  readingTime: string;
  summary: string;
  highlights: string[];
  equations: string[];
  href: string;
  actionText: string;
  featured: boolean;
  icon?: string;
  status: 'published' | 'coming-soon';
}

export const PAPER_CATEGORIES: PaperCategory[] = [
  { slug: 'all', label: 'All Papers' },
  { slug: 'deep-learning', label: 'Deep Learning & Foundation Models' },
  { slug: 'gene-regulation', label: 'Regulatory Genomics' },
  { slug: 'evolutionary-models', label: 'Evolutionary & Language Models' },
  { slug: 'fine-mapping', label: 'Fine-Mapping & GWAS' },
  { slug: 'peft', label: 'PEFT & Adaptation' },
];

export const PAPERS: PaperEntry[] = [
  {
    id: 'encode',
    title: 'The Encyclopedia of DNA Elements',
    shortTitle: 'ENCODE 4 (Consortium)',
    authors: ['The ENCODE Project Consortium'],
    affiliation: 'The ENCODE Project Consortium',
    venue: 'bioRxiv',
    year: 2026,
    doi: '10.64898/2026.07.06.731365',
    doiUrl: 'https://doi.org/10.64898/2026.07.06.731365',
    area: 'Regulatory Genomics & Epigenomics',
    category: 'gene-regulation',
    tag: 'ENCODE Consortium · bioRxiv 2026',
    readingTime: '26 min read',
    summary:
      'The culmination of over two decades of systematic exploration of human and mouse genome function encompassing >16,000 genome-wide experiments. Maps three foundational layers: 5.3M human DHSs (2.3M cCREs v4), an expanded transcriptome (~18k novel lncRNAs, ~150k novel isoforms), and high-resolution 3D chromatin topology up to 10 bp resolution (Intact Hi-C, ~150B contacts), introducing the cV2F variant scoring framework and ENCODE-rE2G enhancer wiring model.',
    highlights: [
      'Integrates >16,000 genome-wide experiments across 1,489 biosamples in human and mouse',
      'Delineates 5.3 million human DNase I hypersensitive sites (DHSs) and 2.3 million candidate cis-regulatory elements (cCREs v4)',
      'Trains deep-learning models (BPNet, ChromBPNet) across 3,857 experiments to decode base-resolution cis-regulatory grammar',
      'Introduces cV2F (calibrated Variant-to-Function), boosting high-confidence UK Biobank fine-mapped variants by +14% (PIP > 0.95)',
      'Discovers nearly 18,000 novel lncRNA genes and ~150,000 novel transcript isoforms via long-read RNA-seq',
      'Maps ~150 billion Intact Hi-C physical contacts resolving 3D loop interactions at motif-level (<10 bp) resolution',
      'Dissects loop mechanics via targeted auxin degrons (RAD21, CTCF, RNA Pol II) and builds the predictive ENCODE-rE2G enhancer wiring model',
      'Releases native Model Context Protocol (MCP) servers enabling autonomous AI agent exploration of the ENCODE ecosystem',
    ],
    equations: [
      '\\text{cV2F}(v, c) = \\sigma\\left( \\mathbf{w}^T \\mathbf{x}_{v, c} + b \\right)',
      '\\text{rE2G}(e, g) = f_{\\text{GBM}}\\left( \\text{Activity}(e), \\text{Contact}(e, g), \\text{Distance}(e, g) \\right)',
      '\\mathbf{s}_g = \\left( \\frac{U_{\\text{TSS}}}{N_{\\text{tx}}}, \\frac{U_{\\text{EC}}}{N_{\\text{tx}}}, \\frac{U_{\\text{TES}}}{N_{\\text{tx}}} \\right) \\in \\Delta^2',
    ],
    href: '/papers/encode/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
  {
    id: 'borzoi',
    title: 'Predicting RNA-seq Coverage from DNA Sequence as a Unifying Model of Gene Regulation',
    shortTitle: 'Borzoi (Calico)',
    authors: ['Johannes Linder', 'Divyanshi Srivastava', 'Han Yuan', 'Vikram Agarwal', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC & Stanford University',
    venue: 'Nature Genetics',
    year: 2025,
    doi: '10.1038/s41588-024-02053-6',
    doiUrl: 'https://doi.org/10.1038/s41588-024-02053-6',
    area: 'Regulatory Genomics & Deep Learning',
    category: 'gene-regulation',
    tag: 'Calico · Nature Genetics 2025',
    readingTime: '22 min read',
    summary:
      'Borzoi predicts strand-specific RNA-seq coverage from 524 kb DNA sequences at 32 bp resolution across thousands of human and mouse tracks. Unifies transcription initiation, alternative splicing, and polyadenylation, setting new state-of-the-art accuracy across GTEx eQTLs, sQTLs, 3\' paQTLs, and CRISPR-QTL screens.',
    highlights: [
      'Predicts strand-specific RNA-seq coverage from raw 524 kb sequence at 32 bp resolution across 7,611 tracks',
      'Unifies multiple regulatory layers: transcription initiation (TSS), alternative splicing, and polyadenylation (APA)',
      'Accurately classifies GTEx eQTLs, sQTLs, and 3\' paQTLs, matching or outperforming specialized single-task tools',
      'Captures long-range distal enhancer effects validated against CRISPRi-FlowFISH screens (MYC, GATA1)',
      'Uncovers tissue-specific cis-regulatory syntax through in silico mutagenesis and gradient saliency',
    ],
    equations: [
      '\\mathcal{L}_{\\text{Poisson}} = \\sum_{b, t} \\left( \\hat{y}_{b, t} - y_{b, t} \\log \\hat{y}_{b, t} \\right)',
      '\\Delta \\text{Gene} = \\log\\left( \\sum_{b \\in \\text{exons}} \\hat{y}_{\\text{alt}, b} + 1 \\right) - \\log\\left( \\sum_{b \\in \\text{exons}} \\hat{y}_{\\text{ref}, b} + 1 \\right)',
      '\\Delta \\text{APA} = \\log\\left( \\frac{\\hat{y}_{\\text{distal}}}{\\hat{y}_{\\text{proximal}}} \\right)_{\\text{alt}} - \\log\\left( \\frac{\\hat{y}_{\\text{distal}}}{\\hat{y}_{\\text{proximal}}} \\right)_{\\text{ref}}',
    ],
    href: '/papers/borzoi/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
  {
    id: 'borzoi-prime',
    title: 'Predicting Cell Type-Specific Coverage Profiles from DNA Sequence',
    shortTitle: 'Borzoi Prime (Calico)',
    authors: ['Johannes Linder', 'Han Yuan', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.06.10.658961',
    doiUrl: 'https://doi.org/10.1101/2025.06.10.658961',
    area: 'Single-Cell Genomics & Deep Learning',
    category: 'gene-regulation',
    tag: 'Calico · bioRxiv 2025',
    readingTime: '18 min read',
    summary:
      'Borzoi Prime extends Borzoi to cell type-resolved gene regulation by training on 851 single-cell 3\'-seq clusters (1,702 stranded pseudo-bulk tracks) from Tabula Sapiens, Tabula Muris, and the Adult Brain Atlas at 16 bp resolution. Enables accurate cell-type-specific variant effect prediction (microglia, neurons, PBMCs) and reveals coupling between 3\'-most splice acceptors and alternative polyadenylation.',
    highlights: [
      'Trained on 851 single-cell 3\'-seq clusters (1,702 pseudo-bulk coverage tracks) from Tabula Sapiens, Tabula Muris, and Adult Brain Atlas',
      'Enhanced spatial resolution: outputs continuous coverage at 16 bp bins (upgraded from 32 bp) via an extra U-Net upsampler',
      'Noise-injected Integrated Gradients overcomes gradient saturation on hyper-expressed genes',
      'Accurately predicts cell-type-resolved eQTLs in microglia, cultured neurons, and 6 PBMC immune subsets (matching/exceeding scooby)',
      'Uncovers cell-type-specific Alternative Polyadenylation (APA): 3\' UTR lengthening in neurons vs shortening in blood/erythrocytes',
      'Mechanistic discovery: 3\'-most splice acceptor strength and polypyrimidine tracts govern proximal vs distal PAS selection',
    ],
    equations: [
      'y_{\\text{squashed}} = -1 + (y + 1)^{3/4}',
      'y_{\\text{clipped}} = c - 1 + \\sqrt{y_{\\text{squashed}} - c + 1} \\quad (c = 64)',
      '\\text{logSED} = \\log\\left(\\frac{\\sum_{b \\in \\text{exons}} \\hat{y}_{\\text{alt}, b} + c_{\\text{pseudo}}}{\\sum_{b \\in \\text{exons}} \\hat{y}_{\\text{ref}, b} + c_{\\text{pseudo}}}\\right)',
    ],
    href: '/papers/borzoi-prime/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
  {
    id: 'decima',
    title: 'Decoding Sequence Determinants of Gene Expression in Diverse Cellular and Disease States',
    shortTitle: 'Decima (Genentech)',
    authors: ['Avantika Lal', 'Alexander Karollus', 'Laura Gunsalus', 'David Garfield', 'Surag Nair', 'Alex M. Tseng', 'M. Grace Gordon', 'Jenna L. Collier', 'Nathaniel Diamant', 'Tommaso Biancalani', 'Hector Corrada Bravo', 'Gabriele Scalia', 'Gokcen Eraslan'],
    affiliation: 'Genentech & Technical University of Munich (TUM)',
    venue: 'bioRxiv',
    year: 2024,
    doi: '10.1101/2024.10.09.617507',
    doiUrl: 'https://doi.org/10.1101/2024.10.09.617507',
    area: 'Single-Cell Genomics & Disease Biology',
    category: 'gene-regulation',
    tag: 'Genentech · bioRxiv 2024',
    readingTime: '20 min read',
    summary:
      'Decima predicts cell type- and disease-condition-specific gene expression from surrounding promoter sequence across 22.8 million single cells (2,668 pseudobulk tracks). Accurately prioritizes single-cell eQTLs in OneK1K (87% directional sign accuracy), dissects disease transcriptional reprogramming (colitis, fibrosis, Alzheimer\'s), and enables de novo synthetic CRE design via directed evolution.',
    highlights: [
      'Trained across 22.8 million cells (372 studies, 1,446 donors, 2,668 cell-type × condition pseudobulks)',
      'Predicts cell-type-resolved gene expression scalars from 100 kb sequence around TSS',
      'Accurately predicts sc-eQTLs in OneK1K with 87% directional accuracy and r = 0.58',
      'Uncovers disease-state transcriptional drivers in ulcerative colitis, IPF, and Alzheimer\'s',
      'Directed evolution de novo design of cell type- and disease-activated synthetic promoters',
    ],
    equations: [
      '\\hat{y}_{g, c} = f_{\\theta}(X_g)_c',
      '\\Delta \\text{eQTL} = \\log_2\\left(\\frac{\\hat{y}_{\\text{alt}} + 1}{\\hat{y}_{\\text{ref}} + 1}\\right)',
      '\\text{Fitness}(S) = \\hat{y}_{S, \\text{target}} - \\lambda \\sum_{k \\neq \\text{target}} \\hat{y}_{S, k}',
    ],
    href: '/papers/decima/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
  {
    id: 'scooby',
    title: 'Modeling Multimodal Genomic Profiles from DNA Sequence at Single-Cell Resolution',
    shortTitle: 'scooby (TUM / Nature Methods)',
    authors: ['Johannes C. Hingerl', 'Laura D. Martens', 'Alexander Karollus', 'Trevor Manz', 'Jason D. Buenrostro', 'Fabian J. Theis', 'Julien Gagneur'],
    affiliation: 'Technical University of Munich (TUM) & Broad Institute / Harvard',
    venue: 'Nature Methods',
    year: 2025,
    doi: '10.1038/s41592-025-02854-5',
    doiUrl: 'https://doi.org/10.1038/s41592-025-02854-5',
    area: 'Single-Cell Multimodal Genomics',
    category: 'gene-regulation',
    tag: 'Nature Methods 2025',
    readingTime: '18 min read',
    summary:
      'Scooby models single-cell multimodal genomic profiles (scRNA-seq coverage and scATAC-seq Tn5 insertions) directly from DNA sequence by equipping a pretrained Borzoi trunk with a cell-specific decoder. Resolves cell-type-specific eQTLs in PBMCs and brain motor cortex, decouples chromatin accessibility from transcription initiation (caQTL vs eQTL), and maps lineage master regulators.',
    highlights: [
      'Equips pretrained Borzoi trunk with a cell-specific decoder to model multimodal profiles at single-cell resolution',
      'Simultaneously predicts scRNA-seq coverage and scATAC-seq Tn5 insertion profiles',
      'Outperforms track-matched Borzoi and seq2cells across OneK1K PBMC immune subsets',
      'Decouples chromatin accessibility from transcription initiation for fine-mapped GWAS risk variants',
      'In silico motif mutation reveals lineage-specific master regulators (GATA1, SPI1, PAX6)',
    ],
    equations: [
      '\\hat{Y}_{i, m} = g_{\\phi}\\left( Z_{\\text{seq}}(X), e_{\\text{cell}}(i) \\right)_m',
      '\\Delta \\text{Score} = \\log\\left(\\frac{\\sum_b \\hat{y}_{\\text{alt}, b} + 1}{\\sum_b \\hat{y}_{\\text{ref}, b} + 1}\\right)',
      '\\text{Effect}_{\\text{motif}} = \\mathbb{E}_{c}[\\hat{Y}_c(X) - \\hat{Y}_c(X_{\\text{mut}})]',
    ],
    href: '/papers/scooby/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
  {
    id: 'alphagenome',
    title: 'Advancing Regulatory Variant Effect Prediction with AlphaGenome',
    shortTitle: 'AlphaGenome (DeepMind)',
    authors: [
      'Žiga Avsec',
      'Natasha Latysheva',
      'Jun Cheng',
      'Guido Novati',
      'Kyle R. Taylor',
      'Tom Ward',
      'Clare Bycroft',
      'Lauren Nicolaisen',
      'Demis Hassabis',
      'Pushmeet Kohli',
    ],
    affiliation: 'Google DeepMind',
    venue: 'Nature',
    year: 2026,
    doi: '10.1038/s41586-025-10014-0',
    doiUrl: 'https://doi.org/10.1038/s41586-025-10014-0',
    area: 'Deep Learning & Foundation Models',
    category: 'deep-learning',
    tag: 'Google DeepMind · Nature 2026',
    readingTime: '24 min read',
    summary:
      'AlphaGenome breaks the resolution-vs-length tradeoff in regulatory genomics by combining a 1 Megabase input window with 1 bp single-nucleotide output resolution across 8 modalities (RNA, CAGE, DNase/ATAC, ChIP, 3D Hi-C/Micro-C, and unannotated splice junction graphs), matching or exceeding SOTA across 25 of 26 benchmarks.',
    highlights: [
      '1 Megabase (1,048,576 bp) sequence context with single-nucleotide (1 bp) output resolution',
      'Unified multi-modal prediction across 8 layers: RNA, CAGE, DNase/ATAC, ChIP histones/TFs, 3D contact maps, splice sites & graphs',
      'Matches or exceeds state-of-the-art external models in 25 out of 26 variant effect evaluations',
      'Recapitulates multi-modal oncogenic mechanisms at the TAL1 super-enhancer locus in T-ALL',
      'Distillation from an ensemble of teachers into an efficient student model for rapid inference',
    ],
    equations: [
      '\\mathcal{L}_{\\text{total}} = \\sum_{m=1}^8 \\lambda_m \\mathcal{L}_m(\\hat{\\mathbf{Y}}_m, \\mathbf{Y}_m)',
      '\\Delta \\text{Expression} = \\log_2\\left( \\frac{\\sum_{b} \\hat{y}_{\\text{alt}, b} + \\epsilon}{\\sum_{b} \\hat{y}_{\\text{ref}, b} + \\epsilon} \\right)',
      '\\Delta \\text{Splice} = \\max_{j} |\\hat{P}_{\\text{alt}}(j) - \\hat{P}_{\\text{ref}}(j)|',
    ],
    href: '/papers/alphagenome/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'phmm',
    status: 'published',
  },
  {
    id: 'gpnstar',
    title: 'Predicting Functional Constraints Across Evolutionary Timescales with Phylogeny-Informed Genomic Language Models',
    shortTitle: 'GPN-Star (Song Lab)',
    authors: ['Chengzhong Ye', 'Gonzalo Benegas', 'Carlos Albors', 'Jianan Canal Li', 'Sebastian Prillo', 'Peter D. Fields', 'Brian Clarke', 'Yun S. Song'],
    affiliation: 'University of California, Berkeley',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.09.21.677619',
    doiUrl: 'https://doi.org/10.1101/2025.09.21.677619',
    area: 'Evolutionary Genomics & Language Models',
    category: 'evolutionary-models',
    tag: 'UC Berkeley · GPN-Star',
    readingTime: '22 min read',
    summary:
      'GPN-Star integrates Whole-Genome Alignments and phylogenetic species trees into genomic language models via clade attention pooling and FIRE evolutionary distance biases. Outperforms classical conservation scores (phyloP, phastCons, CADD) and billion-parameter unaligned gLMs across coding and non-coding variant effect prediction, complex trait heritability (S-LDSC), and rare variant association testing (DeepRVAT).',
    highlights: [
      'Phylogeny-aware transformer architecture incorporates Whole-Genome Multi-Species Alignments (WGA) and species trees',
      'Clade Attention Pooling condenses related species to eliminate phylogenetic skew without information loss',
      'FIRE (Functional Interpolation for Relative Positional Encoding) injects continuous species tree branch length distances',
      'Trained across three evolutionary timescales: Vertebrate (~450 Mya), Mammalian (241-way Zoonomia), and Primate (44-way)',
      'Unprecedented complex trait heritability enrichment and conditional contribution (S-LDSC τ* across 106 UK Biobank traits)',
      'DeepRVAT integration boosts whole-exome rare variant association gene discovery from 383 to 402 genes',
      'Direct nucleotide dependency maps uncover epistatic syntax across TH, LDLR, and Drosophila even-skipped MSE enhancers',
      'Cross-species generalization across M. musculus, D. melanogaster, C. elegans, A. thaliana, and G. gallus',
    ],
    equations: [
      'b(\\phi) = f_{\\theta}\\left(\\frac{\\log(c\\phi + 1)}{\\log(c\\phi_{\\max} + 1)}\\right)',
      '\\text{Attn}_{\\text{phy}} = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{D}} + b(\\Phi)\\right) V',
      '\\text{LLR}(v) = \\log\\frac{p(\\text{alt})}{p(\\text{ref})}',
    ],
    href: '/papers/gpnstar/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'phmm',
    status: 'published',
  },
  {
    id: 'borzoi-finemapped',
    title: 'Borzoi-Informed Fine Mapping Improves Causal Variant Prioritization in Complex Trait GWAS',
    shortTitle: 'Borzoi Fine-Mapping (Sniff)',
    authors: ['Divyanshi Srivastava', 'Anya Korsakova', 'Qingbo Wang', 'Luong Ruiz', 'Han Yuan', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.07.09.663162',
    doiUrl: 'https://doi.org/10.1101/2025.07.09.663162',
    area: 'Statistical Genetics & Deep Learning',
    category: 'fine-mapping',
    tag: 'Calico Life Sciences · Sniff',
    readingTime: '15 min read',
    summary:
      'Replacing coarse annotation overlap (PolyFun baseline-LF) with sequence-to-function predictions from Borzoi (7,611 tracks). Resolves single-nucleotide motif disruptions, overcomes indel shift artifacts, and yields a +9.45% increase in high-confidence causal variants across 15 UK Biobank traits.',
    highlights: [
      'Sniff framework replaces uniform 1kb peak overlap with single-nucleotide motif disruption scores',
      'Indel "stitch" strategy eliminates artificial convolutional receptive field shift discrepancies',
      'Multi-category iterative PCA across 6 assay types generates the Borzoi-102 annotation set',
      'Validated via MPRA (2.4× emVar enrichment, p=7.15e-10) and FinnGen R12 replication (78.4%)',
      'In silico mutagenesis (ISM) uncovers de novo motif creation in PKN2, DEGS1, and LAPTM5',
    ],
    equations: [
      'L_2(t) = \\sqrt{\\sum_{b=1}^{B} \\left(\\log(1 + \\hat{Y}_{\\text{alt}, b, t}) - \\log(1 + \\hat{Y}_{\\text{ref}, b, t})\\right)^2}',
      '\\mathbb{E}[\\chi^2_j] = 1 + N \\sum_c \\tau_c \\ell_{j,c}',
      '\\text{PIP}_j = P(\\gamma_j = 1 \\mid \\text{Data})',
    ],
    href: '/papers/borzoi-finemapped/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'gwas',
    status: 'published',
  },
  {
    id: 'borzoi-peft',
    title: 'Parameter-Efficient Fine-Tuning of a Supervised Regulatory Sequence Model',
    shortTitle: 'Borzoi PEFT (Locon4)',
    authors: ['Han Yuan', 'Johannes Linder', 'David R. Kelley'],
    affiliation: 'Calico Life Sciences LLC',
    venue: 'bioRxiv',
    year: 2025,
    doi: '10.1101/2025.05.26.656171',
    doiUrl: 'https://doi.org/10.1101/2025.05.26.656171',
    area: 'Deep Learning & Transfer Learning',
    category: 'peft',
    tag: 'Calico Life Sciences · Locon4',
    readingTime: '14 min read',
    summary:
      'Democratizing adaptation of massive 524kb sequence models like Borzoi. Demonstrates that feature map activation memory is the GPU bottleneck, and introduces Locon4 (LoRA in transformer blocks + LoCon in the final 4 conv layers) running comfortably within 24 GB VRAM on a single consumer RTX 4090.',
    highlights: [
      'Identifies intermediate feature map activation memory as the primary GPU bottleneck in genomic CNNs',
      'Locon4 updates ~1-3% of parameters, training 5× faster in <24 GB VRAM with zero inference overhead',
      'Matches full fine-tuning on GTEx eQTL classification (auROC 0.748) and Variant-FlowFISH MPRA',
      'Uncovers master regulators of replicative senescence in WI-38 fibroblasts via Normalized Differential Saliency (NDSS)',
      'Achieves 89.3% accuracy in identifying targeted TFs across 28 ENCODE knockdown screens',
    ],
    equations: [
      'W = W_0 + \\frac{\\alpha}{r} (W_{\\text{pw}} * W_{\\text{dw}})',
      'W_{\\text{merged}} = W_0 + \\frac{\\alpha}{r} B A',
      '\\text{NDSS}_i = \\frac{\\text{DSS}_i - \\mu_{\\text{local}}}{\\sigma_{\\text{local}}}',
    ],
    href: '/papers/borzoi-peft/',
    actionText: 'Read full technical paper summary',
    featured: true,
    icon: 'ism',
    status: 'published',
  },
];
